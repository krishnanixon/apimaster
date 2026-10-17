import yaml from 'js-yaml'
import type { ApiCollection, ApiFolder, ApiRequest, KeyValuePair, RequestAuth, RequestBody } from '../../types/api-studio'
import {
  NoteList,
  collection,
  environment,
  flattenVariables,
  folder,
  isJson,
  isRecord,
  kv,
  mergeVariables,
  pathParams,
  request,
  splitQuery,
  str,
  summarize,
  toMethod,
  urlEncodedBody,
  type ImportResult,
  type ImportedEnvironment
} from './common'

type Doc = Record<string, unknown>

/** Parses JSON or YAML (Insomnia can export either). */
function load(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  return yaml.load(trimmed)
}

export function isInsomniaExport(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value._type === 'export' && Array.isArray(value.resources)) return true
  return typeof value.type === 'string' && /\.insomnia\.rest\/5\./.test(value.type)
}

/** `{{ _.baseUrl }}` / `{{ baseUrl }}` → `{{baseUrl}}`. Template tags (`{% … %}`) stay and are reported. */
export function convertInsomniaTemplate(value: string, skipped?: NoteList): string {
  const converted = value.replace(/\{\{\s*(?:_\.)?([\w.-]+)\s*\}\}/g, '{{$1}}')
  if (skipped && /\{%.*?%\}/s.test(converted)) skipped.add('Insomnia template tags ({% … %}) kept as text — replace them with variables')
  return converted
}

/** Insomnia's script API mirrors `pm`; the object is just named `insomnia`. */
export function convertInsomniaScript(script: string): string {
  if (!script.trim()) return ''
  return script.replace(/\binsomnia\./g, 'pm.')
}

function pairs(list: unknown, skipped: NoteList): KeyValuePair[] {
  if (!Array.isArray(list)) return []
  return list
    .filter(isRecord)
    .filter((p) => str(p.name).trim() !== '')
    .map((p) => kv(convertInsomniaTemplate(str(p.name), skipped), convertInsomniaTemplate(str(p.value), skipped), p.disabled !== true, str(p.description) || undefined))
}

export function insomniaAuth(raw: unknown, skipped: NoteList, where: string): RequestAuth {
  // `{}` (or nothing) is Insomnia's "inherit from parent".
  if (!isRecord(raw) || !raw.type) return { type: 'inherit' }
  if (raw.disabled === true) return { type: 'none' }
  const t = (key: string) => convertInsomniaTemplate(str(raw[key]), skipped)
  switch (str(raw.type).toLowerCase()) {
    case 'none':
      return { type: 'none' }
    case 'inherit':
      return { type: 'inherit' }
    case 'basic':
      return { type: 'basic', basicUsername: t('username'), basicPassword: t('password') }
    case 'bearer': {
      const prefix = t('prefix')
      if (prefix && prefix.toLowerCase() !== 'bearer') {
        skipped.add(`Bearer prefix "${prefix}" dropped (Shurikly always sends "Bearer") — ${where}`)
      }
      return { type: 'bearer', bearerToken: t('token') }
    }
    case 'apikey': {
      const addTo = str(raw.addTo)
      if (addTo === 'cookie') skipped.add(`API key sent as a cookie imported as a header — ${where}`)
      return { type: 'apiKey', apiKeyName: t('key'), apiKeyValue: t('value'), apiKeyLocation: addTo === 'queryParams' ? 'query' : 'header' }
    }
    case 'digest':
      return { type: 'digest', digestUsername: t('username'), digestPassword: t('password') }
    case 'oauth1': {
      const method = str(raw.signatureMethod)
      if (method === 'RSA-SHA1') skipped.add(`OAuth 1.0 RSA-SHA1 signing is not supported, imported as HMAC-SHA1 — ${where}`)
      return {
        type: 'oauth1',
        oauth1ConsumerKey: t('consumerKey'),
        oauth1ConsumerSecret: t('consumerSecret'),
        oauth1Token: t('tokenKey'),
        oauth1TokenSecret: t('tokenSecret'),
        oauth1SignatureMethod: method === 'HMAC-SHA256' || method === 'PLAINTEXT' ? method : 'HMAC-SHA1',
        oauth1Realm: t('realm'),
        oauth1Version: t('version') || '1.0'
      }
    }
    case 'oauth2': {
      const grant = str(raw.grantType)
      if (grant === 'implicit' || grant === 'refresh_token') {
        skipped.add(`OAuth 2.0 "${grant}" grant imported as authorization code — ${where}`)
      }
      return {
        type: 'oauth2',
        oauth2GrantType: grant === 'client_credentials' || grant === 'password' ? grant : 'authorization_code',
        oauth2AuthUrl: t('authorizationUrl'),
        oauth2TokenUrl: t('accessTokenUrl'),
        oauth2ClientId: t('clientId'),
        oauth2ClientSecret: t('clientSecret'),
        oauth2Scope: t('scope'),
        oauth2RedirectUri: t('redirectUrl'),
        oauth2Username: t('username'),
        oauth2Password: t('password')
      }
    }
    case 'iam':
      return {
        type: 'aws',
        awsAccessKey: t('accessKeyId'),
        awsSecretKey: t('secretAccessKey'),
        awsSessionToken: t('sessionToken'),
        awsRegion: t('region'),
        awsService: t('service')
      }
    case 'hawk':
      return { type: 'hawk', hawkId: t('id'), hawkKey: t('key'), hawkAlgorithm: str(raw.algorithm) === 'sha1' ? 'sha1' : 'sha256', hawkExt: t('ext') }
    default:
      skipped.add(`Unsupported auth "${str(raw.type)}" — ${where} (set to no auth)`)
      return { type: 'none' }
  }
}

interface BodyResult {
  body: RequestBody
  graphql?: ApiRequest['graphql']
}

function insomniaBody(raw: unknown, skipped: NoteList, warnings: NoteList, where: string): BodyResult {
  if (!isRecord(raw)) return { body: { type: 'none', content: '' } }
  const mime = str(raw.mimeType).toLowerCase()
  const text = convertInsomniaTemplate(str(raw.text), skipped)
  if (mime === 'application/graphql') {
    const parsed = isJson(text) ? (JSON.parse(text) as Doc) : {}
    const variables = parsed.variables
    return {
      body: { type: 'none', content: '' },
      graphql: {
        query: str(parsed.query),
        variables: typeof variables === 'string' ? variables : JSON.stringify(variables ?? {}, null, 2),
        ...(str(parsed.operationName) ? { operationName: str(parsed.operationName) } : {})
      }
    }
  }
  if (mime === 'application/x-www-form-urlencoded') {
    const params = Array.isArray(raw.params) ? raw.params.filter(isRecord) : []
    return {
      body: urlEncodedBody(params.map((p) => ({ key: convertInsomniaTemplate(str(p.name)), value: convertInsomniaTemplate(str(p.value)), enabled: p.disabled !== true })))
    }
  }
  if (mime === 'multipart/form-data') {
    const params = Array.isArray(raw.params) ? raw.params.filter(isRecord) : []
    return {
      body: {
        type: 'form-data',
        content: '',
        formData: params.map((p) => {
          const isFile = p.type === 'file'
          if (isFile) warnings.add(`File fields need their file chosen again — ${where}`)
          return {
            ...kv(convertInsomniaTemplate(str(p.name)), isFile ? '' : convertInsomniaTemplate(str(p.value)), p.disabled !== true),
            type: isFile ? ('file' as const) : ('text' as const),
            ...(isFile && str(p.fileName) ? { fileName: str(p.fileName).split(/[\\/]/).pop() } : {})
          }
        })
      }
    }
  }
  if (mime === 'application/octet-stream' || str(raw.fileName)) {
    skipped.add(`Binary file bodies are not imported — ${where}`)
    return { body: { type: 'none', content: '' } }
  }
  if (!text && !mime) return { body: { type: 'none', content: '' } }
  if (mime.includes('json')) return { body: { type: 'json', content: text } }
  return { body: { type: 'text', content: text } }
}

/** Shared by v4 resources and v5 items: both describe a request with the same field names. */
function buildRequest(raw: Doc, folderId: string | null, now: string, skipped: NoteList, warnings: NoteList): ApiRequest | null {
  const name = str(raw.name) || 'Imported Request'
  const method = toMethod(raw.method)
  if (!method) {
    skipped.add(`Request with method "${str(raw.method)}" (only standard HTTP methods are supported)`)
    return null
  }
  const where = `"${name}"`
  const url = convertInsomniaTemplate(str(raw.url), skipped)
  const { base, params } = splitQuery(url)
  const { body, graphql } = insomniaBody(raw.body, skipped, warnings, where)
  const scripts = isRecord(raw.scripts) ? raw.scripts : {}
  const preRequest = convertInsomniaScript(str(raw.preRequestScript) || str(scripts.preRequest))
  const tests = convertInsomniaScript(str(raw.afterResponseScript) || str(scripts.afterResponse))
  const meta = isRecord(raw.meta) ? raw.meta : {}
  return request(
    {
      name,
      method: graphql ? 'POST' : method,
      url: base,
      headers: pairs(raw.headers, skipped),
      queryParams: [...params, ...pairs(raw.parameters, skipped)],
      pathParams: pathParams(base, Object.fromEntries(pairs(raw.pathParameters, skipped).map((p) => [p.key, p.value]))),
      body,
      auth: insomniaAuth(raw.authentication, skipped, where),
      description: str(raw.description) || str(meta.description),
      ...(preRequest ? { preRequestScript: preRequest } : {}),
      ...(tests ? { tests } : {}),
      ...(graphql ? { requestType: 'graphql' as const, graphql } : {}),
      folderId
    },
    now
  )
}

function folderSettings(raw: Doc, skipped: NoteList): Partial<ApiFolder> {
  const name = str(raw.name) || 'Folder'
  const headers = pairs(raw.headers, skipped)
  const scripts = isRecord(raw.scripts) ? raw.scripts : {}
  const pre = convertInsomniaScript(str(raw.preRequestScript) || str(scripts.preRequest))
  const after = str(raw.afterResponseScript) || str(scripts.afterResponse)
  if (after.trim()) skipped.add(`Folder after-response scripts (folders only run pre-request scripts) — "${name}"`)
  const env = raw.environment
  if (isRecord(env) && Object.keys(env).length) skipped.add(`Folder environments — "${name}" (add those variables to an environment)`)
  return {
    auth: insomniaAuth(raw.authentication, skipped, `folder "${name}"`),
    ...(headers.length ? { headers } : {}),
    ...(pre ? { preRequestScript: pre } : {})
  }
}

function skipNonHttp(type: string, skipped: NoteList): void {
  if (type === 'grpc_request') skipped.add('gRPC requests')
  else if (type === 'websocket_request' || type === 'websocket_payload') skipped.add('WebSocket requests')
  else if (type === 'unit_test_suite' || type === 'unit_test') skipped.add('Insomnia unit test suites')
  else if (type === 'mock' || type === 'mock_route') skipped.add('Insomnia mock servers')
}

function sortKey(raw: Doc): number {
  const meta = isRecord(raw.meta) ? raw.meta : raw
  const key = Number(meta.metaSortKey ?? meta.sortKey)
  return Number.isFinite(key) ? key : 0
}

function environmentsFor(
  base: Doc | undefined,
  subs: Doc[],
  workspaceName: string,
  multiple: boolean,
  now: string
): ImportedEnvironment[] {
  const prefix = multiple ? `${workspaceName} / ` : ''
  const baseVars = base ? flattenVariables(base.data) : []
  if (subs.length === 0) {
    return baseVars.length ? [environment(`${prefix}${str(base?.name) || 'Base Environment'}`, baseVars, now)] : []
  }
  return subs.map((sub) => environment(`${prefix}${str(sub.name) || 'Environment'}`, mergeVariables(baseVars, flattenVariables(sub.data)), now))
}

function importV4(doc: Doc, now: string): ImportResult {
  const skipped = new NoteList()
  const warnings = new NoteList()
  const resources = (doc.resources as unknown[]).filter(isRecord).sort((a, b) => sortKey(a) - sortKey(b))
  const byId = new Map(resources.map((r) => [str(r._id), r]))
  const workspaces = resources.filter((r) => r._type === 'workspace')

  /** Workspace id a resource belongs to (walks parentId). */
  const workspaceOf = (resource: Doc): string | null => {
    let current: Doc | undefined = resource
    for (let depth = 0; current && depth < 64; depth++) {
      if (current._type === 'workspace') return str(current._id)
      current = byId.get(str(current.parentId))
    }
    return null
  }

  const collections = new Map<string, ApiCollection>()
  const folderIds = new Map<string, string>()
  for (const ws of workspaces) {
    collections.set(str(ws._id), collection(str(ws.name) || 'Insomnia Workspace', now, { description: str(ws.description) }))
  }
  const orphanCollection = (): ApiCollection => {
    const key = '__orphans__'
    if (!collections.has(key)) collections.set(key, collection('Insomnia Import', now))
    return collections.get(key)!
  }

  // Folders first, parents before children, so `parentId` always points at an existing folder.
  const groups = resources.filter((r) => r._type === 'request_group')
  const depth = (r: Doc): number => {
    let d = 0
    let current = byId.get(str(r.parentId))
    while (current && current._type === 'request_group' && d < 64) {
      d++
      current = byId.get(str(current.parentId))
    }
    return d
  }
  for (const group of [...groups].sort((a, b) => depth(a) - depth(b))) {
    const target = collections.get(workspaceOf(group) ?? '') ?? orphanCollection()
    const parent = folderIds.get(str(group.parentId)) ?? null
    const created = folder(str(group.name), parent, folderSettings(group, skipped))
    target.folders.push(created)
    folderIds.set(str(group._id), created.id)
  }

  for (const resource of resources) {
    const type = str(resource._type)
    if (type !== 'request') {
      skipNonHttp(type, skipped)
      continue
    }
    const target = collections.get(workspaceOf(resource) ?? '') ?? orphanCollection()
    const built = buildRequest(resource, folderIds.get(str(resource.parentId)) ?? null, now, skipped, warnings)
    if (built) target.requests.push(built)
  }

  // Base environments hang off the workspace; sub-environments hang off the base one.
  const environments: ImportedEnvironment[] = []
  const envs = resources.filter((r) => r._type === 'environment')
  for (const ws of workspaces) {
    const base = envs.find((e) => e.parentId === ws._id)
    const subs = base ? envs.filter((e) => e.parentId === base._id) : []
    environments.push(...environmentsFor(base, subs, str(ws.name), workspaces.length > 1, now))
  }

  const list = [...collections.values()].filter((c) => c.requests.length || c.folders.length || workspaces.length === 1)
  return { collections: list, environments, summary: summarize('insomnia', list, environments, skipped, warnings) }
}

function importV5(doc: Doc, now: string): ImportResult {
  const skipped = new NoteList()
  const warnings = new NoteList()
  const type = str(doc.type)
  if (!type.startsWith('collection.') && !type.startsWith('environment.')) {
    throw new Error(type.startsWith('spec.') ? 'This is an Insomnia design document — import its OpenAPI spec instead' : `Unsupported Insomnia file type "${type}"`)
  }
  const meta = isRecord(doc.meta) ? doc.meta : {}
  const result = collection(str(doc.name) || 'Insomnia Collection', now, { description: str(meta.description) })

  const walk = (items: unknown, parentId: string | null): void => {
    if (!Array.isArray(items)) return
    for (const item of items.filter(isRecord).sort((a, b) => sortKey(a) - sortKey(b))) {
      if (Array.isArray(item.children)) {
        const created = folder(str(item.name), parentId, folderSettings(item, skipped))
        result.folders.push(created)
        walk(item.children, created.id)
      } else if (item.method !== undefined) {
        const built = buildRequest(item, parentId, now, skipped, warnings)
        if (built) result.requests.push(built)
      } else if (item.protoFileId !== undefined || item.protoMethodName !== undefined) {
        skipped.add('gRPC requests')
      } else if (item.url !== undefined) {
        skipped.add('WebSocket requests')
      }
    }
  }
  walk(doc.collection, null)

  const env = isRecord(doc.environments) ? doc.environments : undefined
  const subs = env && Array.isArray(env.subEnvironments) ? env.subEnvironments.filter(isRecord) : []
  const environments = environmentsFor(env, subs, result.name, false, now)
  const collections = type.startsWith('environment.') ? [] : [result]
  return { collections, environments, summary: summarize('insomnia', collections, environments, skipped, warnings) }
}

/** Imports an Insomnia v4 export (JSON or YAML) or a v5 YAML collection. */
export function importInsomnia(text: string, now = new Date().toISOString()): ImportResult {
  const doc = load(text)
  if (!isInsomniaExport(doc)) throw new Error('Not an Insomnia export')
  return (doc as Doc)._type === 'export' ? importV4(doc as Doc, now) : importV5(doc as Doc, now)
}
