/**
 * Frontend call extraction (per file). Finds the HTTP requests client code makes — `fetch`,
 * axios (and `axios.create()` instances), ky, ofetch/`$fetch`, SWR keys, RTK Query, Angular
 * `HttpClient` — plus GraphQL documents and dev-server proxy rules.
 *
 * Real apps usually call a wrapper (`api.get('/users')`, `request('/x', { method: 'POST' })`),
 * so each request is recorded as a *template*: when its URL/method/body depend on the
 * enclosing function's parameters, that function becomes a wrapper, and calls to it are
 * recorded as `FnCall`s. `link.ts` instantiates wrappers across files.
 */
import ts from 'typescript'
import type { HttpMethod } from '../../../../types/api-studio'
import { collectImportBindings, isFunctionNode, lineOf, objectProps, propertyName, skipOuter, type FunctionNode } from '../ts-utils'

// ── Shapes ──────────────────────────────────────────────────────────────────

/** Where the leading, dynamic part of a URL comes from. */
export type BaseRef =
  | { kind: 'env'; name: string; fallback?: string }
  | { kind: 'import'; file: string | null; exportName: string; member?: string }
  | { kind: 'unknown'; text: string }

/** A URL: optional dynamic base + literal path (with `:params`) + query parameter names. */
export interface UrlShape {
  base: BaseRef | null
  path: string
  query: string[]
  /** The absolute URL at the start of `path` came from a constant (`API_ROOT`), i.e. the app's own API. */
  configured?: boolean
}

/** URL of a request template: fixed, or taken from a parameter of the enclosing function. */
export type UrlTemplate = (
  | { kind: 'fixed'; shape: UrlShape }
  | { kind: 'param'; index: number; prefix: UrlShape; suffix: string }
) & {
  /** `slug ? `${resource}/${slug}` : resource` — the URL used when the caller passes argument `when`. */
  alt?: { when: number; url: UrlTemplate }
}

export type Source<T> = { kind: 'value'; value: T } | { kind: 'param'; index: number } | { kind: 'none' }

export interface ClientRef {
  kind: 'local' | 'import'
  file: string | null
  name: string
}

export interface RequestTemplate {
  url: UrlTemplate
  method: Source<HttpMethod>
  /** Body field names (value) or a parameter holding the body. */
  body: Source<string[]>
  /** Parameter whose object literal (at the call site) supplies method/body/headers/query. */
  optionsParam?: number
  headers: string[]
  query: string[]
  auth: boolean
  /** Base URL comes from this client's `baseURL`. */
  client?: ClientRef
  library: string
  line: number
}

/** Summary of one argument at a call site. */
export type ArgSummary =
  | { kind: 'url'; shape: UrlShape; alt?: UrlTemplate['alt'] }
  | { kind: 'param'; index: number; prefix: UrlShape; suffix: string; alt?: UrlTemplate['alt'] }
  | { kind: 'literal'; text: string }
  | { kind: 'object'; options: CallOptions }
  | { kind: 'other' }

/** Request options found in an object literal (`{ method, body, headers, params }`). */
export interface CallOptions {
  method: Source<HttpMethod>
  body: Source<string[]>
  headers: string[]
  query: string[]
  auth: boolean
  /** `{ ...options }` spreads the enclosing function's parameter. */
  spreadParam?: number
  url?: UrlTemplate
  /** Every property name, for when the object itself is a request body (`api.post('/x', { name })`). */
  keys: string[]
}

export type FnRef =
  | { kind: 'local'; file: string; key: string }
  | { kind: 'import'; file: string | null; exportName: string; member?: string }

export interface FnCall {
  callee: FnRef
  args: ArgSummary[]
  line: number
  /** Key of the named function this call sits in (so wrappers of wrappers compose). */
  owner?: string
}

export interface ClientSpec {
  name: string
  base?: UrlShape
  auth: boolean
  headers: string[]
  library: string
}

export interface GraphQLOperation {
  query: string
  operationName?: string
  line: number
}

/** Dev-server rewrite: requests under `prefix` go to `origin` + `targetPrefix` + rest. */
export interface ProxyRule {
  prefix: string
  origin: string
  targetPrefix: string
}

export interface FrontendFileFacts {
  file: string
  /** Templates owned by a named function (wrappers) or by the module (`owner` undefined). */
  templates: Array<{ owner?: string; template: RequestTemplate }>
  fnCalls: FnCall[]
  clients: Map<string, ClientSpec>
  /** Exported name → local name (`export default api`, `export { request as fetcher }`). */
  exportAliases: Map<string, string>
  /** URL-valued constants others may import (`export const API_URL = …`), including object members. */
  constShapes: Map<string, UrlShape>
  graphql: GraphQLOperation[]
  graphqlUris: UrlShape[]
  proxies: ProxyRule[]
  /** Angular interceptor prefix: `req.clone({ url: `${API}${req.url}` })`. */
  interceptorBase?: UrlShape
  /** Requests whose URL is only known at runtime (`fetch(url)`). */
  skippedDynamic: number
}

// ── Constants ───────────────────────────────────────────────────────────────

const FETCH_FUNCTIONS = new Set(['fetch', '$fetch', 'ofetch', 'useFetch', 'useLazyFetch', 'ky'])
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self'])
const METHODS: Record<string, HttpMethod> = {
  del: 'DELETE',
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  head: 'HEAD',
  options: 'OPTIONS'
}
const DATA_METHODS = new Set(['post', 'put', 'patch'])
const CLIENT_LIBRARIES: Record<string, string> = { axios: 'axios', ky: 'ky', ofetch: 'ofetch', superagent: 'superagent' }
const CLIENT_FACTORIES = new Set(['create', 'extend'])
const SWR_HOOKS = new Set(['useSWR', 'useSWRImmutable', 'useSWRInfinite'])
const GRAPHQL_TAGS = new Set(['gql', 'graphql'])
/** Parameter names that carry a whole path into a wrapper rather than one path segment. */
const PATH_PARAM_NAMES = /^(url|path|endpoint|route|uri|resource|input|pathname|href|api|p|u)$/i
const STATIC_ASSET = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|woff2?|ttf|md|txt|html|mp[34]|wasm)$/i
const BODY_KEYS = new Set(['body', 'data', 'json'])
const QUERY_KEYS = new Set(['params', 'query', 'searchParams'])

export function httpMethod(value: string | null | undefined): HttpMethod | null {
  if (!value) return null
  const upper = value.toUpperCase()
  return Object.values(METHODS).includes(upper as HttpMethod) ? (upper as HttpMethod) : null
}

function envName(expr: ts.Expression): string | null {
  const e = skipOuter(expr)
  const read = (obj: ts.Expression, key: string): string | null => {
    const text = skipOuter(obj).getText()
    return /^(process\.env|import\.meta\.env)$/.test(text) ? key : null
  }
  if (ts.isPropertyAccessExpression(e)) return read(e.expression, e.name.text)
  if (ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression)) return read(e.expression, e.argumentExpression.text)
  return null
}

function pieceName(expr: ts.Expression): string {
  const e = skipOuter(expr)
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return 'param'
}

type Piece = { text: string; fromConst?: boolean } | { dyn: ts.Expression }

export function collectFrontendFacts(sf: ts.SourceFile, resolveImport: (spec: string) => string | null): FrontendFileFacts {
  const file = sf.fileName
  const facts: FrontendFileFacts = {
    file,
    templates: [],
    fnCalls: [],
    clients: new Map(),
    exportAliases: new Map(),
    constShapes: new Map(),
    graphql: [],
    graphqlUris: [],
    proxies: [],
    skippedDynamic: 0
  }
  const imports = collectImportBindings(sf, resolveImport)
  const packageImports = new Map<string, string>() // local name → package
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.importClause) continue
    const pkg = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (clause.name) packageImports.set(clause.name.text, pkg)
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) packageImports.set(el.name.text, pkg)
    } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      packageImports.set(clause.namedBindings.name.text, pkg)
    }
  }
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      const init = decl.initializer && skipOuter(decl.initializer)
      if (!ts.isIdentifier(decl.name) || !init || !ts.isCallExpression(init)) continue
      const wrapped = init.arguments.map((a) => skipOuter(a)).find((a) => ts.isIdentifier(a) && CLIENT_LIBRARIES[packageImports.get(a.text) ?? ''])
      if (wrapped && ts.isIdentifier(wrapped)) packageImports.set(decl.name.text, packageImports.get(wrapped.text)!)
    }
  }
  const usesAngularHttp = [...packageImports.values()].includes('@angular/common/http')

  // Constants and `this.x = …` / class property initializers, for inlining URL pieces.
  const consts = new Map<string, ts.Expression>()
  const visitConsts = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) {
      if (!consts.has(node.name.text)) consts.set(node.name.text, node.initializer)
    } else if (ts.isPropertyDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      if (!consts.has(`this.${node.name.text}`)) consts.set(`this.${node.name.text}`, node.initializer)
    }
    ts.forEachChild(node, visitConsts)
  }
  visitConsts(sf)

  // ── URL pieces and shapes ──────────────────────────────────────────────

  const pieces = (expr: ts.Expression, depth = 0): Piece[] => {
    const e = skipOuter(expr)
    if (depth > 6 || paramIndex(e) >= 0) return [{ dyn: e }]
    if (ts.isStringLiteralLike(e)) return [{ text: e.text }]
    if (ts.isTemplateExpression(e)) {
      const out: Piece[] = [{ text: e.head.text }]
      for (const span of e.templateSpans) out.push(...pieces(span.expression, depth + 1), { text: span.literal.text })
      return out
    }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return [...pieces(e.left, depth + 1), ...pieces(e.right, depth + 1)]
    }
    // `'/articles' + (feed ? '/feed' : '')` — use the default (else) branch.
    if (ts.isConditionalExpression(e)) return pieces(e.whenFalse, depth + 1)
    const key = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) && e.expression.kind === ts.SyntaxKind.ThisKeyword ? `this.${e.name.text}` : null
    const value = key ? consts.get(key) : undefined
    const inner = value && skipOuter(value)
    const urlLike =
      inner &&
      (ts.isStringLiteralLike(inner) ||
        ts.isTemplateExpression(inner) ||
        ts.isBinaryExpression(inner) ||
        ts.isConditionalExpression(inner) ||
        ts.isIdentifier(inner) ||
        ts.isPropertyAccessExpression(inner) ||
        envName(inner))
    if (value && urlLike) {
      return pieces(value, depth + 1).map((p) => ('text' in p ? { ...p, fromConst: true } : p))
    }
    return [{ dyn: e }]
  }

  const baseRef = (expr: ts.Expression): BaseRef => {
    const e = skipOuter(expr)
    const env = envName(e)
    if (env) return { kind: 'env', name: env }
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) {
      const left = envName(e.left)
      const right = skipOuter(e.right)
      if (left) return { kind: 'env', name: left, fallback: ts.isStringLiteralLike(right) ? right.text : undefined }
    }
    if (ts.isIdentifier(e) && imports.has(e.text)) {
      const binding = imports.get(e.text)!
      return { kind: 'import', file: binding.file, exportName: binding.exportName }
    }
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && imports.has(e.expression.text)) {
      const binding = imports.get(e.expression.text)!
      return { kind: 'import', file: binding.file, exportName: binding.exportName, member: e.name.text }
    }
    return { kind: 'unknown', text: e.getText(sf).slice(0, 80) }
  }

  const shapeFromPieces = (all: Piece[]): UrlShape | null => {
    // Template heads are often empty (`${API}/users`); the base is the first real piece.
    const list = all.filter((p) => !('text' in p) || p.text !== '')
    let base: BaseRef | null = null
    let start = 0
    if (list[0] && 'dyn' in list[0]) {
      base = baseRef(list[0].dyn)
      start = 1
    }
    let text = ''
    for (const piece of list.slice(start)) {
      if ('text' in piece) text += piece.text
      else text += text.includes('?') ? '{value}' : `:${pieceName(piece.dyn)}`
    }
    if (!base && !text) return null
    if (base?.kind === 'unknown' && !text) return null
    const [path, query = ''] = text.split('?')
    const queryNames = [...query.matchAll(/(?:^|&)([\w.[\]-]+)=/g)].map((m) => m[1])
    const first = list[start]
    const configured = Boolean(!base && first && 'text' in first && first.fromConst && /^https?:\/\//i.test(first.text))
    return { base, path, query: queryNames, ...(configured ? { configured } : {}) }
  }

  // ── Function context (for wrappers) ────────────────────────────────────

  interface FnContext {
    key?: string
    params: string[]
    node: FunctionNode
  }
  const fnStack: FnContext[] = []
  const currentFn = (): FnContext | undefined => fnStack[fnStack.length - 1]
  const paramIndex = (expr: ts.Expression): number => {
    const e = skipOuter(expr)
    const fn = currentFn()
    return fn && ts.isIdentifier(e) ? fn.params.indexOf(e.text) : -1
  }

  /** Key a named function is callable by: `request`, `api.get`, `default`. */
  const functionKey = (fn: FunctionNode): string | undefined => {
    if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) return fn.name.text
    if (ts.isFunctionDeclaration(fn) && !fn.name) return 'default'
    const parent = fn.parent
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text
    if (ts.isCallExpression(parent) && ts.isVariableDeclaration(parent.parent) && ts.isIdentifier(parent.parent.name)) return parent.parent.name.text
    if (ts.isExportAssignment(parent)) return 'default'
    const objectMember = ts.isMethodDeclaration(fn) && ts.isObjectLiteralExpression(parent) ? { name: fn.name, object: parent } : ts.isPropertyAssignment(parent) && ts.isObjectLiteralExpression(parent.parent) ? { name: parent.name, object: parent.parent } : null
    if (objectMember) {
      const member = propertyName(objectMember.name)
      const holder = objectMember.object.parent
      const owner = ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name) ? holder.name.text : ts.isExportAssignment(holder) ? 'default' : null
      if (member && owner) return `${owner}.${member}`
    }
    return undefined
  }

  // ── Arguments ──────────────────────────────────────────────────────────

  /** A URL argument: fixed shape, or a parameter of the enclosing function carrying the path. */
  const urlTemplate = (expr: ts.Expression, depth = 0): UrlTemplate | null => {
    // Follow local constants to a conditional on a parameter, and keep both branches.
    let target = skipOuter(expr)
    for (let i = 0; i < 4 && ts.isIdentifier(target) && paramIndex(target) < 0 && consts.has(target.text); i++) {
      target = skipOuter(consts.get(target.text)!)
    }
    if (depth < 2 && ts.isConditionalExpression(target)) {
      const when = paramIndex(target.condition)
      const whenFalse = when >= 0 ? urlTemplate(target.whenFalse, depth + 1) : null
      const whenTrue = when >= 0 ? urlTemplate(target.whenTrue, depth + 1) : null
      if (whenFalse && whenTrue) return { ...whenFalse, alt: { when, url: whenTrue } }
    }
    const list = pieces(expr).filter((p) => !('text' in p) || p.text !== '')
    const fn = currentFn()
    if (fn?.key) {
      let pathSoFar = ''
      for (let i = 0; i < list.length; i++) {
        const piece = list[i]
        if ('text' in piece) {
          pathSoFar += piece.text
          continue
        }
        const index = paramIndex(piece.dyn)
        if (index === -1) continue
        const name = fn.params[index]
        // `${BASE}${endpoint}` carries a whole path; `/users/${id}` is one segment of a fixed path.
        const before = pathSoFar.replace(/^https?:\/\/[^/]+/, '')
        const wholePath = list.length === 1 || PATH_PARAM_NAMES.test(name) || (/^\/?$/.test(before) && !/id$/i.test(name))
        if (wholePath) {
          if (pathSoFar.includes('?')) break
          const prefix = shapeFromPieces(list.slice(0, i)) ?? { base: null, path: '', query: [] }
          const suffix = list
            .slice(i + 1)
            .map((p) => ('text' in p ? p.text : `:${pieceName(p.dyn)}`))
            .join('')
          return { kind: 'param', index, prefix, suffix }
        }
      }
    }
    const shape = shapeFromPieces(list)
    return shape ? { kind: 'fixed', shape } : null
  }

  const fieldsOf = (expr: ts.Expression): Source<string[]> => {
    const e = skipOuter(expr)
    if (ts.isCallExpression(e) && e.expression.getText(sf) === 'JSON.stringify' && e.arguments[0]) return fieldsOf(e.arguments[0])
    if (ts.isObjectLiteralExpression(e)) {
      const names = e.properties.flatMap((p) => {
        if (ts.isSpreadAssignment(p)) return []
        const name = p.name ? propertyName(p.name) : null
        return name ? [name] : []
      })
      return { kind: 'value', value: names }
    }
    const index = paramIndex(e)
    return index >= 0 ? { kind: 'param', index } : { kind: 'none' }
  }

  const keysOf = (expr: ts.Expression | undefined): string[] => {
    const e = expr ? skipOuter(expr) : undefined
    if (!e || !ts.isObjectLiteralExpression(e)) return []
    return e.properties.flatMap((p) => {
      if (ts.isSpreadAssignment(p)) return []
      const name = p.name ? propertyName(p.name) : null
      return name ? [name] : []
    })
  }

  const methodSource = (expr: ts.Expression | undefined): Source<HttpMethod> => {
    if (!expr) return { kind: 'none' }
    const e = skipOuter(expr)
    if (ts.isStringLiteralLike(e)) {
      const method = httpMethod(e.text)
      return method ? { kind: 'value', value: method } : { kind: 'none' }
    }
    const index = paramIndex(e)
    return index >= 0 ? { kind: 'param', index } : { kind: 'none' }
  }

  /**
   * `const options = { method, headers }; options.body = JSON.stringify(body); fetch(url, options)`:
   * the object literal plus properties assigned to it later in the same function.
   */
  const localOptions = (name: string): { object: ts.ObjectLiteralExpression; assigned: Map<string, ts.Expression> } | null => {
    const fn = currentFn()
    if (!fn?.node.body) return null
    let object: ts.ObjectLiteralExpression | null = null
    const assigned = new Map<string, ts.Expression>()
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && ts.isObjectLiteralExpression(skipOuter(node.initializer))) {
        object = skipOuter(node.initializer) as ts.ObjectLiteralExpression
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        ts.isIdentifier(node.left.expression) &&
        node.left.expression.text === name
      ) {
        assigned.set(node.left.name.text, node.right)
      }
      if (!isFunctionNode(node) || node === fn.node) ts.forEachChild(node, visit)
    }
    visit(fn.node.body)
    return object ? { object, assigned } : null
  }

  const optionsOf = (expr: ts.Expression | undefined): CallOptions => {
    const options: CallOptions = { method: { kind: 'none' }, body: { kind: 'none' }, headers: [], query: [], auth: false, keys: [] }
    if (!expr) return options
    const e = skipOuter(expr)
    const index = paramIndex(e)
    if (index >= 0) return { ...options, spreadParam: index }
    if (ts.isIdentifier(e)) {
      const local = localOptions(e.text)
      if (!local) return options
      const merged = optionsOf(local.object)
      const method = local.assigned.get('method')
      if (method) merged.method = methodSource(method)
      const body = local.assigned.get('body') ?? local.assigned.get('data')
      if (body) merged.body = fieldsOf(body)
      return merged
    }
    if (!ts.isObjectLiteralExpression(e)) return options
    const props = objectProps(e)
    options.keys = keysOf(e)
    options.method = methodSource(props.get('method'))
    for (const key of BODY_KEYS) {
      const body = props.get(key)
      if (body) options.body = fieldsOf(body)
    }
    for (const key of QUERY_KEYS) options.query.push(...keysOf(props.get(key)))
    options.headers = keysOf(props.get('headers'))
    // Generated SDKs mark protected operations: `security: [{ scheme: 'bearer', type: 'http' }]`.
    options.auth = options.headers.some((h) => /^authorization$/i.test(h)) || props.has('security')
    const url = props.get('url')
    if (url) options.url = urlTemplate(url) ?? undefined
    for (const p of e.properties) {
      if (ts.isSpreadAssignment(p)) {
        const spread = paramIndex(p.expression)
        if (spread >= 0) options.spreadParam = spread
      }
    }
    return options
  }

  const summarize = (expr: ts.Expression): ArgSummary => {
    const e = skipOuter(expr)
    if (ts.isObjectLiteralExpression(e)) return { kind: 'object', options: optionsOf(e) }
    if (ts.isStringLiteralLike(e) && httpMethod(e.text) && !e.text.includes('/')) return { kind: 'literal', text: e.text }
    const url = urlTemplate(e)
    if (url?.kind === 'param') return { kind: 'param', index: url.index, prefix: url.prefix, suffix: url.suffix, alt: url.alt }
    if (url?.kind === 'fixed' && (url.shape.base || /^[\w./:{}-]+$/.test(url.shape.path))) return { kind: 'url', shape: url.shape, alt: url.alt }
    const index = paramIndex(e)
    if (index >= 0) return { kind: 'param', index, prefix: { base: null, path: '', query: [] }, suffix: '' }
    return { kind: 'other' }
  }

  // ── Recording ──────────────────────────────────────────────────────────

  const record = (template: Omit<RequestTemplate, 'line'>, node: ts.Node) => {
    if (template.url.kind === 'fixed') {
      const { shape } = template.url
      if (STATIC_ASSET.test(shape.path)) return
    }
    const fn = currentFn()
    const parametric = template.url.kind === 'param' || template.method.kind === 'param' || template.body.kind === 'param' || template.optionsParam !== undefined
    // A wrapper that attaches `Authorization` itself (`headers['Authorization'] = …`) sends a token on every call.
    const setsAuth = Boolean(fn?.key && fn.node.body && /['"`]?authorization['"`]?\s*[\]:=]/i.test(fn.node.body.getText(sf)))
    facts.templates.push({
      owner: parametric ? fn?.key : undefined,
      template: { ...template, auth: template.auth || setsAuth, line: lineOf(sf, node) }
    })
  }

  const request = (
    library: string,
    urlExpr: ts.Expression | undefined,
    method: Source<HttpMethod>,
    options: CallOptions,
    node: ts.Node,
    extra: { body?: Source<string[]>; client?: ClientRef } = {}
  ) => {
    const url = urlExpr ? urlTemplate(urlExpr) : (options.url ?? null)
    if (!url) {
      facts.skippedDynamic++
      return
    }
    record(
      {
        url,
        method: options.method.kind !== 'none' ? options.method : method,
        body: extra.body && extra.body.kind !== 'none' ? extra.body : options.body,
        optionsParam: options.spreadParam,
        headers: options.headers,
        query: options.query,
        auth: options.auth,
        client: extra.client,
        library
      },
      node
    )
  }

  /** Name of an HTTP client library a receiver refers to, or a local client instance. */
  const clientOf = (expr: ts.Expression): { library: string; client?: ClientRef } | null => {
    const e = skipOuter(expr)
    if (ts.isIdentifier(e)) {
      const pkg = packageImports.get(e.text)
      if (pkg && CLIENT_LIBRARIES[pkg]) return { library: CLIENT_LIBRARIES[pkg] }
      if (facts.clients.has(e.text)) return { library: facts.clients.get(e.text)!.library, client: { kind: 'local', file, name: e.text } }
      if (e.text === 'axios' || e.text === '$fetch' || e.text === 'ofetch') return { library: e.text === 'axios' ? 'axios' : 'ofetch' }
    }
    if (usesAngularHttp && /(^|\.)(http|httpClient|_http)$/.test(e.getText(sf))) return { library: 'angular' }
    return null
  }

  const readClientCreation = (name: string, init: ts.Expression) => {
    const e = skipOuter(init)
    if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression) || !CLIENT_FACTORIES.has(e.expression.name.text)) return
    const owner = clientOf(e.expression.expression)
    if (!owner || owner.library === 'angular') return
    const options = e.arguments[0] && ts.isObjectLiteralExpression(skipOuter(e.arguments[0])) ? objectProps(skipOuter(e.arguments[0]) as ts.ObjectLiteralExpression) : new Map()
    const baseExpr = options.get('baseURL') ?? options.get('baseUrl') ?? options.get('prefixUrl')
    const list = baseExpr ? pieces(baseExpr) : []
    const headers = keysOf(options.get('headers'))
    facts.clients.set(name, {
      name,
      base: list.length ? (shapeFromPieces(list) ?? undefined) : undefined,
      auth: headers.some((h) => /^authorization$/i.test(h)),
      headers,
      library: owner.library
    })
  }

  /** Angular `req.clone({ url: `${API}${req.url}` })` prefixes every HttpClient request. */
  const readInterceptor = (call: ts.CallExpression, callee: ts.Expression): boolean => {
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'clone' || !call.arguments[0]) return false
    const arg = skipOuter(call.arguments[0])
    const url = ts.isObjectLiteralExpression(arg) ? objectProps(arg).get('url') : undefined
    if (!url) return false
    const receiver = skipOuter(callee.expression).getText(sf)
    const list = pieces(url).filter((p) => !('text' in p) || p.text !== '')
    const at = list.findIndex((p) => 'dyn' in p && skipOuter(p.dyn).getText(sf) === `${receiver}.url`)
    if (at <= 0) return false
    const prefix = list.slice(0, at).map((p) => ('text' in p ? { ...p, fromConst: true } : p))
    facts.interceptorBase = shapeFromPieces(prefix) ?? undefined
    return true
  }

  const handleCall = (call: ts.CallExpression) => {
    const callee = skipOuter(call.expression)
    const args = call.arguments
    if (usesAngularHttp && readInterceptor(call, callee)) return

    // fetch(url, init) / window.fetch / $fetch / ofetch / useFetch
    const fetchName = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee) && GLOBAL_OBJECTS.has(callee.expression.getText(sf))
        ? callee.name.text
        : null
    if (fetchName && FETCH_FUNCTIONS.has(fetchName) && (fetchName !== 'ky' || packageImports.get('ky') === 'ky')) {
      if (!args[0]) return
      request(fetchName === 'fetch' ? 'fetch' : fetchName === 'ky' ? 'ky' : fetchName.includes('Fetch') ? 'nuxt' : 'ofetch', args[0], { kind: 'value', value: 'GET' }, optionsOf(args[1]), call)
      return
    }

    // axios(config) / axios(url, config) / instance(config)
    if (ts.isIdentifier(callee)) {
      const client = clientOf(callee)
      if (client && client.library !== 'angular' && args[0]) {
        const first = skipOuter(args[0])
        if (ts.isObjectLiteralExpression(first)) request(client.library, undefined, { kind: 'value', value: 'GET' }, optionsOf(first), call, { client: client.client })
        else request(client.library, args[0], { kind: 'value', value: 'GET' }, optionsOf(args[1]), call, { client: client.client })
        return
      }
      if (SWR_HOOKS.has(callee.text) && args[0]) {
        const key = skipOuter(args[0])
        const urlExpr = ts.isArrayLiteralExpression(key) ? key.elements[0] : key
        if (urlExpr && !ts.isArrowFunction(urlExpr) && !ts.isIdentifier(skipOuter(urlExpr))) {
          request('swr', urlExpr, { kind: 'value', value: 'GET' }, optionsOf(undefined), call)
        }
        return
      }
    }

    if (ts.isPropertyAccessExpression(callee)) {
      const member = callee.name.text
      const client = clientOf(callee.expression)
      if (client && (member in METHODS || member === 'request')) {
        if (member === 'request') {
          request(client.library, undefined, { kind: 'value', value: 'GET' }, optionsOf(args[0]), call, { client: client.client })
        } else if (args[0]) {
          const hasData = DATA_METHODS.has(member)
          const options = optionsOf(hasData ? args[2] : args[1])
          // ky puts the body in options.json; axios/angular pass it as the second argument.
          const body = hasData && client.library !== 'ky' && args[1] ? fieldsOf(args[1]) : undefined
          request(client.library, args[0], { kind: 'value', value: METHODS[member] }, options, call, { body, client: client.client })
        }
        return
      }
    }

    // Generated SDKs: `client.post({ url: '/api/v1/items/', ...options })`,
    // `__request(OpenAPI, { method: 'GET', url: '/api/v1/items/{id}', body })`.
    const member = ts.isPropertyAccessExpression(callee) ? callee.name.text : null
    for (const arg of args) {
      const object = skipOuter(arg)
      if (!ts.isObjectLiteralExpression(object)) continue
      const url = objectProps(object).get('url')
      const urlText = url && ts.isStringLiteralLike(skipOuter(url)) ? (skipOuter(url) as ts.StringLiteralLike).text : null
      if (!urlText?.startsWith('/')) continue
      const options = optionsOf(object)
      const method = member && member in METHODS ? METHODS[member] : null
      if (!method && options.method.kind === 'none') continue
      request('sdk', undefined, method ? { kind: 'value', value: method } : { kind: 'value', value: 'GET' }, options, call)
      return
    }

    // Calls to (possibly wrapper) functions: request('/users'), api.get('/x'), imported helpers.
    const ref = fnRefOf(callee)
    if (!ref) return
    const summaries = args.map(summarize)
    const relevant = summaries.some((s) => s.kind === 'url' || s.kind === 'param')
    if (relevant) facts.fnCalls.push({ callee: ref, args: summaries, line: lineOf(sf, call), owner: currentFn()?.key })
  }

  const fnRefOf = (callee: ts.Expression): FnRef | null => {
    if (ts.isIdentifier(callee)) {
      const binding = imports.get(callee.text)
      if (binding && binding.exportName !== '*') return { kind: 'import', file: binding.file, exportName: binding.exportName }
      if (packageImports.has(callee.text)) return null
      return { kind: 'local', file, key: callee.text }
    }
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
      const objectName = callee.expression.text
      const binding = imports.get(objectName)
      if (binding) {
        return binding.exportName === '*'
          ? { kind: 'import', file: binding.file, exportName: callee.name.text }
          : { kind: 'import', file: binding.file, exportName: binding.exportName, member: callee.name.text }
      }
      if (packageImports.has(objectName) || GLOBAL_OBJECTS.has(objectName)) return null
      return { kind: 'local', file, key: `${objectName}.${callee.name.text}` }
    }
    return null
  }

  // ── RTK Query ──────────────────────────────────────────────────────────

  const readRtkApi = (call: ts.CallExpression) => {
    const options = call.arguments[0] && ts.isObjectLiteralExpression(skipOuter(call.arguments[0])) ? objectProps(skipOuter(call.arguments[0]) as ts.ObjectLiteralExpression) : null
    if (!options) return
    const baseQuery = options.get('baseQuery')
    const baseCall = baseQuery && skipOuter(baseQuery)
    const baseOptions = baseCall && ts.isCallExpression(baseCall) && baseCall.arguments[0] && ts.isObjectLiteralExpression(skipOuter(baseCall.arguments[0]))
      ? objectProps(skipOuter(baseCall.arguments[0]) as ts.ObjectLiteralExpression)
      : null
    const baseUrl = baseOptions?.get('baseUrl')
    const baseShape = baseUrl ? shapeFromPieces(pieces(baseUrl)) : null
    const auth = Boolean(baseOptions?.get('prepareHeaders')?.getText(sf).match(/authorization/i))

    const endpointsFn = options.get('endpoints')
    const fn = endpointsFn && skipOuter(endpointsFn)
    if (!fn || !ts.isArrowFunction(fn)) return
    let body: ts.Node = fn.body
    if (ts.isBlock(body)) {
      const ret = body.statements.find(ts.isReturnStatement)
      if (!ret?.expression) return
      body = ret.expression
    }
    const endpoints = skipOuter(body as ts.Expression)
    if (!ts.isObjectLiteralExpression(endpoints)) return
    for (const prop of endpoints.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const def = skipOuter(prop.initializer)
      if (!ts.isCallExpression(def) || !ts.isPropertyAccessExpression(def.expression)) continue
      const kind = def.expression.name.text
      if (kind !== 'query' && kind !== 'mutation') continue
      const defOptions = def.arguments[0] && ts.isObjectLiteralExpression(skipOuter(def.arguments[0])) ? objectProps(skipOuter(def.arguments[0]) as ts.ObjectLiteralExpression) : null
      const query = defOptions?.get('query')
      const queryFn = query && skipOuter(query)
      if (!queryFn || !(ts.isArrowFunction(queryFn) || ts.isFunctionExpression(queryFn))) continue
      let result: ts.Node = queryFn.body
      if (ts.isBlock(result)) {
        const ret = result.statements.find(ts.isReturnStatement)
        if (!ret?.expression) continue
        result = ret.expression
      }
      const value = skipOuter(result as ts.Expression)
      let urlExpr: ts.Expression | undefined = value
      let method: Source<HttpMethod> = { kind: 'value', value: 'GET' }
      let bodySource: Source<string[]> = { kind: 'none' }
      let query2: string[] = []
      if (ts.isObjectLiteralExpression(value)) {
        const props = objectProps(value)
        urlExpr = props.get('url')
        method = methodSource(props.get('method'))
        if (method.kind === 'none') method = { kind: 'value', value: 'GET' }
        const bodyExpr = props.get('body')
        bodySource = bodyExpr ? fieldsOf(bodyExpr) : { kind: 'none' }
        if (bodySource.kind === 'param') bodySource = { kind: 'none' }
        query2 = keysOf(props.get('params'))
      }
      if (!urlExpr) continue
      const shape = shapeFromPieces(pieces(urlExpr))
      if (!shape) continue
      const joined: UrlShape = baseShape
        ? { base: baseShape.base, path: joinPath(baseShape.path, shape.path), query: [...shape.query, ...query2] }
        : { ...shape, query: [...shape.query, ...query2] }
      facts.templates.push({
        template: {
          url: { kind: 'fixed', shape: joined },
          method,
          body: bodySource,
          headers: [],
          query: [],
          auth,
          library: 'rtk-query',
          line: lineOf(sf, prop)
        }
      })
    }
  }

  // ── GraphQL ────────────────────────────────────────────────────────────

  const graphqlText = (template: ts.TemplateLiteral): string => {
    if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text
    let out = template.head.text
    for (const span of template.templateSpans) {
      // `${USER_FRAGMENT}` — inline fragments defined in this file.
      const e = skipOuter(span.expression)
      const fragment = ts.isIdentifier(e) ? consts.get(e.text) : undefined
      const inner = fragment && ts.isTaggedTemplateExpression(skipOuter(fragment)) ? graphqlText((skipOuter(fragment) as ts.TaggedTemplateExpression).template) : ''
      out += `${inner}\n${span.literal.text}`
    }
    return out
  }

  const recordGraphql = (text: string, node: ts.Node) => {
    const op = text.match(/(?:^|\s|})\s*(query|mutation)\b\s*([A-Za-z_]\w*)?/)
    // `{ users { id } }` is an anonymous query; fragment-only documents aren't operations.
    if (!op && !text.trim().startsWith('{')) return
    facts.graphql.push({ query: text.trim().replace(/\n{3,}/g, '\n\n'), operationName: op?.[2], line: lineOf(sf, node) })
  }

  const readGraphqlClient = (node: ts.NewExpression | ts.CallExpression) => {
    const name = skipOuter(node.expression).getText(sf).split('.').pop() ?? ''
    const arg = node.arguments?.[0]
    if (!arg) return
    if (name === 'GraphQLClient') {
      const shape = shapeFromPieces(pieces(arg))
      if (shape) facts.graphqlUris.push(shape)
      return
    }
    if (!['ApolloClient', 'HttpLink', 'createHttpLink', 'createClient', 'BatchHttpLink', 'createUploadLink'].includes(name)) return
    const e = skipOuter(arg)
    if (!ts.isObjectLiteralExpression(e)) return
    const uri = objectProps(e).get('uri') ?? objectProps(e).get('url')
    const shape = uri ? shapeFromPieces(pieces(uri)) : null
    if (shape) facts.graphqlUris.push(shape)
  }

  // ── Proxy config (vite.config / next.config rewrites) ──────────────────

  const readProxyConfig = () => {
    const isVite = /(^|\/)vite\.config\.[cm]?[jt]s$/.test(file)
    const isNext = /(^|\/)next\.config\.[cm]?[jt]s$/.test(file)
    if (!isVite && !isNext) return
    const visit = (node: ts.Node): void => {
      if (isVite && ts.isPropertyAssignment(node) && propertyName(node.name) === 'proxy' && ts.isObjectLiteralExpression(skipOuter(node.initializer))) {
        for (const p of (skipOuter(node.initializer) as ts.ObjectLiteralExpression).properties) {
          if (!ts.isPropertyAssignment(p)) continue
          const prefix = propertyName(p.name)
          const value = skipOuter(p.initializer)
          const target = ts.isStringLiteralLike(value) ? value.text : ts.isObjectLiteralExpression(value) ? objectProps(value).get('target') : undefined
          const targetText = typeof target === 'string' ? target : target && ts.isStringLiteralLike(skipOuter(target)) ? (skipOuter(target) as ts.StringLiteralLike).text : null
          if (!prefix || !targetText || !prefix.startsWith('/')) continue
          const rewrite = ts.isObjectLiteralExpression(value) ? objectProps(value).get('rewrite')?.getText(sf) ?? '' : ''
          const strips = /replace\(\s*\/\^?\\?\//.test(rewrite) && /,\s*['"`]{2}\s*\)/.test(rewrite)
          const url = splitOrigin(targetText)
          facts.proxies.push({ prefix, origin: url.origin, targetPrefix: joinPath(url.path, strips ? '' : prefix) })
        }
      }
      if (isNext && ts.isObjectLiteralExpression(node)) {
        const props = objectProps(node)
        const source = props.get('source')
        const destination = props.get('destination')
        if (source && destination && ts.isStringLiteralLike(skipOuter(source)) && ts.isStringLiteralLike(skipOuter(destination))) {
          const from = (skipOuter(source) as ts.StringLiteralLike).text.replace(/\/:[\w]+[*+?]?$/, '')
          const to = splitOrigin((skipOuter(destination) as ts.StringLiteralLike).text.replace(/\/:[\w]+[*+?]?$/, ''))
          if (to.origin && from.startsWith('/')) facts.proxies.push({ prefix: from, origin: to.origin, targetPrefix: to.path })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }

  // ── Walk ───────────────────────────────────────────────────────────────

  const visit = (node: ts.Node): void => {
    if (isFunctionNode(node) && node.body) {
      fnStack.push({ key: functionKey(node), params: node.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : '')), node })
      ts.forEachChild(node, visit)
      fnStack.pop()
      return
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      readClientCreation(node.name.text, node.initializer)
    } else if (ts.isCallExpression(node)) {
      const calleeName = skipOuter(node.expression).getText(sf)
      if (/(^|\.)createApi$/.test(calleeName)) readRtkApi(node)
      else if (/(^|\.)(createHttpLink|createClient|createUploadLink)$/.test(calleeName)) readGraphqlClient(node)
      else if (GRAPHQL_TAGS.has(calleeName) && node.arguments[0] && ts.isNoSubstitutionTemplateLiteral(node.arguments[0])) {
        recordGraphql(node.arguments[0].text, node)
      } else handleCall(node)
    } else if (ts.isNewExpression(node)) {
      readGraphqlClient(node)
    } else if (
      ts.isTaggedTemplateExpression(node) &&
      GRAPHQL_TAGS.has(node.tag.getText(sf)) &&
      packageImports.get(node.tag.getText(sf)) !== 'gatsby' // Gatsby queries run at build time
    ) {
      recordGraphql(graphqlText(node.template), node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  readProxyConfig()

  // ── Exports ────────────────────────────────────────────────────────────
  for (const statement of sf.statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(skipOuter(statement.expression))) {
      facts.exportAliases.set('default', (skipOuter(statement.expression) as ts.Identifier).text)
    } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const el of statement.exportClause.elements) facts.exportAliases.set(el.name.text, (el.propertyName ?? el.name).text)
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
        const init = skipOuter(decl.initializer)
        if (ts.isObjectLiteralExpression(init)) {
          // `export const environment = { apiUrl: 'http://…' }`
          for (const [key, value] of objectProps(init)) {
            const shape = urlConst(value)
            if (shape) facts.constShapes.set(`${decl.name.text}.${key}`, shape)
          }
        } else {
          const shape = urlConst(decl.initializer)
          if (shape) facts.constShapes.set(decl.name.text, shape)
        }
      }
    }
  }
  return facts

  function urlConst(expr: ts.Expression): UrlShape | null {
    const e = skipOuter(expr)
    const simple = ts.isStringLiteralLike(e) || ts.isTemplateExpression(e) || ts.isBinaryExpression(e) || envName(e) !== null
    if (!simple) return null
    const shape = shapeFromPieces(pieces(e))
    if (!shape) return null
    // Only URL-ish values: an env base, an absolute URL or a path.
    return shape.base?.kind === 'env' || /^(https?:\/\/|\/)/.test(shape.path) ? shape : null
  }
}

export function splitOrigin(url: string): { origin: string; path: string } {
  const m = url.match(/^(https?:\/\/[^/?#]+)([^?#]*)/i)
  return m ? { origin: m[1], path: m[2] } : { origin: '', path: url }
}

/** Joins URL path pieces with single slashes; a relative second part is appended under the first. */
export function joinPath(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  return `${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`
}
