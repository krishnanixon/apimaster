/**
 * Frontend linking: instantiates wrapper functions across files (`api.get('/users')` →
 * `request(url)` → `fetch(`${API_URL}${url}`)`), resolves base URLs from constants, `.env`
 * values, client `baseURL`s and dev-server proxies, and emits one endpoint per call.
 */
import type { HttpMethod } from '../../../../types/api-studio'
import type { DetectedEndpoint } from '../../../../types/code-scanner'
import { addInput, emptyInputs, makeEndpoint } from '../common'
import {
  httpMethod,
  joinPath,
  splitOrigin,
  type ArgSummary,
  type ClientRef,
  type ClientSpec,
  type FnCall,
  type FrontendFileFacts,
  type ProxyRule,
  type RequestTemplate,
  type Source,
  type UrlShape,
  type UrlTemplate
} from './collect'

const MAX_ROUNDS = 6
const MAX_TEMPLATES_PER_WRAPPER = 12
const DATA_METHODS = new Set(['post', 'put', 'patch'])
const CLIENT_METHODS: Record<string, HttpMethod> = {
  del: 'DELETE',
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  head: 'HEAD',
  options: 'OPTIONS'
}
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i

export interface FrontendLinkInput {
  facts: FrontendFileFacts[]
  /** URL-valued `.env` entries (only keys that look like API URLs are kept). */
  env: Map<string, string>
  /** `"proxy"` from a Create React App package.json. */
  packageProxy?: string
}

export interface FrontendLinkResult {
  endpoints: DetectedEndpoint[]
  /** Ids of endpoints whose base URL couldn't be resolved (their path may lack a prefix). */
  unresolved: Set<string>
  /** Origins the app's own API calls go to (env / client / proxy), for suggesting a base URL. */
  apiOrigins: string[]
  skippedDynamic: number
}

interface Located {
  template: RequestTemplate
  file: string
}

interface Resolved {
  origin?: string
  path: string
  resolved: boolean
  /** The origin came from configuration (env, constant, client, proxy) rather than a URL literal in the call. */
  configured: boolean
}

function concatShapes(prefix: UrlShape, arg: UrlShape, suffix: string): UrlShape {
  // A caller passing a full URL (or its own base) overrides the wrapper's prefix.
  if (arg.base || /^https?:\/\//i.test(arg.path)) return { ...arg, path: arg.path + suffix, query: [...arg.query] }
  return {
    base: prefix.base,
    path: joinPath(prefix.path, arg.path) + suffix,
    query: [...prefix.query, ...arg.query],
    ...(prefix.configured ? { configured: true } : {})
  }
}

/** A URL-carrying argument as a template in the caller's parameters. */
function argUrl(arg: ArgSummary | undefined): UrlTemplate | null {
  if (arg?.kind === 'url') return { kind: 'fixed', shape: arg.shape, alt: arg.alt }
  if (arg?.kind === 'param') return { kind: 'param', index: arg.index, prefix: arg.prefix, suffix: arg.suffix, alt: arg.alt }
  return null
}

/** Puts the caller's URL into a wrapper's `prefix + <param> + suffix`, keeping the caller's alternatives. */
function compose(prefix: UrlShape, suffix: string, arg: UrlTemplate): UrlTemplate {
  const url: UrlTemplate =
    arg.kind === 'fixed'
      ? { kind: 'fixed', shape: concatShapes(prefix, arg.shape, suffix) }
      : { kind: 'param', index: arg.index, prefix: concatShapes(prefix, arg.prefix, ''), suffix: arg.suffix + suffix }
  return arg.alt ? { ...url, alt: { when: arg.alt.when, url: compose(prefix, suffix, arg.alt.url) } } : url
}

function isConcrete(t: RequestTemplate): boolean {
  return t.url.kind === 'fixed' && t.method.kind !== 'param' && t.body.kind !== 'param' && t.optionsParam === undefined
}

/** Drops parameters nobody supplies (the call isn't inside another wrapper). */
function finalize(t: RequestTemplate): RequestTemplate {
  return {
    ...t,
    method: t.method.kind === 'param' ? { kind: 'none' } : t.method,
    body: t.body.kind === 'param' ? { kind: 'none' } : t.body,
    optionsParam: undefined
  }
}

function templateKey(t: RequestTemplate): string {
  return JSON.stringify([t.url, t.method, t.body, t.optionsParam, t.client, t.library])
}

/** Fills a wrapper's parameters with the arguments of one call to it. */
function instantiate(t: RequestTemplate, args: ArgSummary[], line: number): RequestTemplate | null {
  const optionsArg = t.optionsParam !== undefined ? args[t.optionsParam] : undefined
  const options = optionsArg?.kind === 'object' ? optionsArg.options : undefined

  const source = t.url.alt && args[t.url.alt.when] ? t.url.alt.url : t.url
  let url: UrlTemplate
  if (source.kind === 'fixed') url = { kind: 'fixed', shape: source.shape }
  else {
    const arg = argUrl(args[source.index])
    if (!arg) return null
    url = compose(source.prefix, source.suffix, arg)
  }

  const methodFrom = (source: Source<HttpMethod>): Source<HttpMethod> => {
    if (source.kind !== 'param') return source
    const arg = args[source.index]
    if (arg?.kind === 'literal') {
      const method = httpMethod(arg.text)
      return method ? { kind: 'value', value: method } : { kind: 'none' }
    }
    if (arg?.kind === 'param') return { kind: 'param', index: arg.index }
    return { kind: 'none' }
  }
  // Options spread into the request (`fetch(url, { ...options })`) override the wrapper's defaults.
  let method = methodFrom(t.method)
  if (options && options.method.kind !== 'none') method = options.method

  let body: Source<string[]> = t.body
  if (t.body.kind === 'param') {
    const arg = args[t.body.index]
    body = arg?.kind === 'object' ? { kind: 'value', value: arg.options.keys } : arg?.kind === 'param' ? { kind: 'param', index: arg.index } : { kind: 'none' }
  }
  if (options && options.body.kind !== 'none') body = options.body

  return {
    ...t,
    url,
    method,
    body,
    optionsParam: optionsArg?.kind === 'param' ? optionsArg.index : options?.spreadParam,
    headers: [...t.headers, ...(options?.headers ?? [])],
    query: [...t.query, ...(options?.query ?? [])],
    auth: t.auth || Boolean(options?.auth),
    line
  }
}

export function linkFrontendCalls(input: FrontendLinkInput): FrontendLinkResult {
  const byFile = new Map(input.facts.map((f) => [f.file, f]))
  const aliasOf = (file: string, exportName: string) => byFile.get(file)?.exportAliases.get(exportName) ?? exportName

  const clientSpec = (ref: ClientRef): { spec: ClientSpec; file: string } | null => {
    if (!ref.file) return null
    const name = ref.kind === 'import' ? aliasOf(ref.file, ref.name) : ref.name
    const spec = byFile.get(ref.file)?.clients.get(name)
    return spec ? { spec, file: ref.file } : null
  }

  // ── Base URL resolution ────────────────────────────────────────────────
  const resolveShape = (shape: UrlShape, depth = 0): Resolved => {
    const literal = (text: string, configured: boolean): Resolved => {
      const { origin, path } = splitOrigin(text)
      return { origin: origin || undefined, path, resolved: true, configured: configured && Boolean(origin) }
    }
    if (!shape.base) return literal(shape.path, Boolean(shape.configured))
    const base = shape.base
    let prefix: Resolved | null = null
    if (base.kind === 'env') {
      const value = input.env.get(base.name) ?? base.fallback
      if (value !== undefined) prefix = literal(value, true)
    } else if (base.kind === 'import' && base.file && depth < 6) {
      const target = byFile.get(base.file)
      const name = aliasOf(base.file, base.exportName)
      const constShape = target?.constShapes.get(base.member ? `${name}.${base.member}` : name)
      if (constShape) {
        const inner = resolveShape(constShape, depth + 1)
        if (inner.resolved) prefix = { ...inner, configured: Boolean(inner.origin) }
      }
    }
    if (!prefix) return { path: shape.path, resolved: false, configured: false }
    if (/^https?:\/\//i.test(shape.path)) return literal(shape.path, false)
    return { ...prefix, path: joinPath(prefix.path, shape.path) }
  }

  const proxies: ProxyRule[] = input.facts.flatMap((f) => f.proxies)
  if (input.packageProxy) {
    const { origin } = splitOrigin(input.packageProxy)
    if (origin) proxies.push({ prefix: '/', origin, targetPrefix: '/' })
  }
  const applyProxy = (resolved: Resolved): Resolved => {
    if (resolved.origin || !resolved.path.startsWith('/')) return resolved
    const rule = proxies
      .filter((p) => p.prefix === '/' || resolved.path === p.prefix || resolved.path.startsWith(`${p.prefix.replace(/\/$/, '')}/`))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0]
    if (!rule) return resolved
    const rest = rule.prefix === '/' ? resolved.path : resolved.path.slice(rule.prefix.replace(/\/$/, '').length)
    return { ...resolved, origin: rule.origin, path: joinPath(rule.targetPrefix, rest) || '/', configured: true }
  }

  // ── Wrapper instantiation ──────────────────────────────────────────────
  const wrappers = new Map<string, RequestTemplate[]>()
  const addWrapper = (key: string, template: RequestTemplate) => {
    const list = wrappers.get(key) ?? []
    if (list.length >= MAX_TEMPLATES_PER_WRAPPER || list.some((t) => templateKey(t) === templateKey(template))) return false
    list.push(template)
    wrappers.set(key, list)
    return true
  }
  const concrete: Located[] = []
  for (const facts of input.facts) {
    for (const { owner, template } of facts.templates) {
      if (owner && !isConcrete(template)) addWrapper(`${facts.file}#${owner}`, template)
      // A fixed URL is an endpoint even if only its body/method come from the caller
      // (`save = (data) => axios.post('/users', data)`); callers may add detail later.
      if (template.url.kind === 'fixed') concrete.push({ template: finalize(template), file: facts.file })
    }
  }

  /** Template for `api.get('/x', data)` where `api` is an imported axios/ky/ofetch instance. */
  const clientCallTemplate = (client: ClientRef, member: string, args: ArgSummary[], line: number): RequestTemplate | null => {
    const found = clientSpec(client)
    const method = CLIENT_METHODS[member]
    if (!found || !method) return null
    const urlArg = args[0]
    const url: UrlTemplate | null =
      urlArg?.kind === 'url'
        ? { kind: 'fixed', shape: urlArg.shape }
        : urlArg?.kind === 'param'
          ? { kind: 'param', index: urlArg.index, prefix: urlArg.prefix, suffix: urlArg.suffix }
          : null
    if (!url) return null
    const dataArg = DATA_METHODS.has(member) ? args[1] : undefined
    const optionsArg = DATA_METHODS.has(member) ? args[2] : args[1]
    const options = optionsArg?.kind === 'object' ? optionsArg.options : undefined
    return {
      url,
      method: { kind: 'value', value: method },
      body: dataArg?.kind === 'object' ? { kind: 'value', value: dataArg.options.keys } : dataArg?.kind === 'param' ? { kind: 'param', index: dataArg.index } : { kind: 'none' },
      optionsParam: optionsArg?.kind === 'param' ? optionsArg.index : undefined,
      headers: options?.headers ?? [],
      query: options?.query ?? [],
      auth: Boolean(options?.auth),
      client,
      library: found.spec.library,
      line
    }
  }

  const templatesFor = (call: FnCall, file: string): RequestTemplate[] => {
    const callee = call.callee
    if (callee.kind === 'local') return (wrappers.get(`${file}#${callee.key}`) ?? []).map((t) => instantiate(t, call.args, call.line)).filter((t): t is RequestTemplate => Boolean(t))
    if (!callee.file) return []
    const name = aliasOf(callee.file, callee.exportName)
    if (callee.member && byFile.get(callee.file)?.clients.has(name)) {
      const t = clientCallTemplate({ kind: 'import', file: callee.file, name: callee.exportName }, callee.member, call.args, call.line)
      return t ? [t] : []
    }
    const key = `${callee.file}#${callee.member ? `${name}.${callee.member}` : name}`
    return (wrappers.get(key) ?? []).map((t) => instantiate(t, call.args, call.line)).filter((t): t is RequestTemplate => Boolean(t))
  }

  const done = new Set<FnCall>()
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let changed = false
    for (const facts of input.facts) {
      for (const call of facts.fnCalls) {
        if (done.has(call)) continue
        const templates = templatesFor(call, facts.file)
        if (templates.length === 0) continue
        done.add(call)
        for (const t of templates) {
          if (isConcrete(t) || !call.owner) concrete.push({ template: finalize(t), file: facts.file })
          else if (addWrapper(`${facts.file}#${call.owner}`, t)) changed = true
        }
      }
    }
    if (!changed) break
  }

  // ── Emit ───────────────────────────────────────────────────────────────
  const endpoints: DetectedEndpoint[] = []
  const unresolved = new Set<string>()
  const apiOrigins: string[] = []

  const interceptor = input.facts.find((f) => f.interceptorBase)?.interceptorBase

  for (const { template, file } of concrete) {
    if (template.url.kind !== 'fixed') continue
    let shape = template.url.shape
    if (interceptor && template.library === 'angular' && !shape.base && !/^https?:\/\//i.test(shape.path)) {
      const base = resolveShape(interceptor)
      shape = { base: null, path: `${base.origin ?? ''}${joinPath(base.path, shape.path)}`, query: shape.query, configured: true }
    }
    let resolved: Resolved
    const client = template.client ? clientSpec(template.client) : null
    if (!shape.base && !/^https?:\/\//i.test(shape.path) && client?.spec.base) {
      const base = resolveShape(client.spec.base)
      resolved = { ...base, path: joinPath(base.path, shape.path), configured: base.configured || Boolean(base.origin) }
    } else {
      resolved = resolveShape(shape)
    }
    resolved = applyProxy(resolved)
    const path = `/${resolved.path.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/')
    const method: HttpMethod = template.method.kind === 'value' ? template.method.value : 'GET'
    const inputs = emptyInputs()
    if (template.body.kind === 'value' && method !== 'GET' && method !== 'HEAD') template.body.value.forEach((f) => addInput(inputs, 'body', f))
    ;[...shape.query, ...template.query].forEach((q) => addInput(inputs, 'query', q))
    template.headers.forEach((h) => addInput(inputs, 'headers', h))
    const external = Boolean(resolved.origin && !resolved.configured && !LOCAL_ORIGIN.test(resolved.origin))

    const endpoint = makeEndpoint({
      method,
      path,
      file,
      line: template.line,
      framework: template.library,
      confidence: resolved.resolved ? 'high' : 'medium',
      auth: template.auth || Boolean(client?.spec.auth),
      inputs,
      origin: 'frontend'
    })
    endpoint.callers = [...endpoint.sources]
    if (external) endpoint.host = resolved.origin
    else if (resolved.origin) apiOrigins.push(resolved.origin)
    if (!resolved.resolved) unresolved.add(endpoint.id)
    endpoints.push(endpoint)
  }

  // GraphQL operations go to the client's endpoint (or the conventional /graphql).
  const uri = input.facts.flatMap((f) => f.graphqlUris)[0]
  const gqlTarget = uri ? applyProxy(resolveShape(uri)) : null
  const gqlPath = gqlTarget ? `/${gqlTarget.path.replace(/^\/+/, '')}` : '/graphql'
  for (const facts of input.facts) {
    for (const op of facts.graphql) {
      const endpoint = makeEndpoint({
        method: 'POST',
        path: gqlPath,
        file: facts.file,
        line: op.line,
        framework: 'graphql',
        confidence: 'high',
        auth: false,
        operationId: op.operationName,
        origin: 'frontend'
      })
      endpoint.graphql = { query: op.query, operationName: op.operationName }
      endpoint.callers = [...endpoint.sources]
      if (gqlTarget?.origin && !gqlTarget.configured && !LOCAL_ORIGIN.test(gqlTarget.origin)) endpoint.host = gqlTarget.origin
      endpoints.push(endpoint)
    }
  }

  return {
    endpoints,
    unresolved,
    apiOrigins,
    skippedDynamic: input.facts.reduce((n, f) => n + f.skippedDynamic, 0)
  }
}
