import type { ApiFolder, ApiRequest, FormDataField, KeyValuePair, RequestAuth, RequestBody } from '../../types/api-studio'
import { bruHttpBlock, parseBru, type BruFile, type BruPair } from './bru'
import {
  NoteList,
  collection,
  environment,
  folder,
  isRecord,
  kv,
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

/** A file inside the picked collection folder; `path` is relative and uses `/`. */
export interface BrunoSourceFile {
  path: string
  content: string
}

export function isBrunoCollection(files: BrunoSourceFile[]): boolean {
  return files.some((f) => f.path === 'bruno.json')
}

// ---------------------------------------------------------------- scripts

const NOT_MEMBER = '(?<![.\\w$])'

/** `bru.*` / `req.*` / `res.*` calls with a direct `pm` equivalent. */
const SCRIPT_RULES: Array<[RegExp, string]> = [
  [/bru\.setEnvVar\(/g, 'pm.environment.set('],
  [/bru\.getEnvVar\(/g, 'pm.environment.get('],
  [/bru\.hasEnvVar\(/g, 'pm.environment.has('],
  [/bru\.deleteEnvVar\(/g, 'pm.environment.unset('],
  [/bru\.setVar\(/g, 'pm.variables.set('],
  [/bru\.getVar\(/g, 'pm.variables.get('],
  [/bru\.hasVar\(/g, 'pm.variables.has('],
  [/bru\.deleteVar\(/g, 'pm.variables.unset('],
  [/bru\.getRequestName\(\)/g, 'pm.info.requestName'],
  [/res\.getStatus\(\)/g, 'pm.response.code'],
  [/res\.getBody\(\)/g, 'pm.response.json()'],
  [/res\.getHeaders\(\)/g, 'pm.response.headers.toObject()'],
  [/res\.getHeader\(/g, 'pm.response.headers.get('],
  [/res\.getResponseTime\(\)/g, 'pm.response.responseTime'],
  [/res\.status\b/g, 'pm.response.code'],
  [/res\.body\b/g, 'pm.response.json()'],
  [/res\.headers\b/g, 'pm.response.headers.toObject()'],
  [/res\.responseTime\b/g, 'pm.response.responseTime'],
  [/req\.getUrl\(\)/g, 'pm.request.url'],
  [/req\.getMethod\(\)/g, 'pm.request.method'],
  [/req\.getHeader\(/g, 'pm.request.headers.get('],
  [/test\(/g, 'pm.test('],
  [/expect\(/g, 'pm.expect(']
]

const COMPILED_RULES = SCRIPT_RULES.map(([pattern, replacement]) => [new RegExp(NOT_MEMBER + pattern.source, 'g'), replacement] as const)

/**
 * Rewrites the Bruno script basics to the `pm` API. Anything else (`req.setHeader`, `bru.runRequest`,
 * `require`) is kept as written under a comment, since the QuickJS sandbox has no equivalent.
 */
export function translateBrunoScript(code: string): { code: string; untranslated: boolean } {
  if (!code.trim()) return { code: '', untranslated: false }
  let out = code
  for (const [pattern, replacement] of COMPILED_RULES) out = out.replace(pattern, replacement)
  const leftovers = new Set<string>()
  for (const match of out.matchAll(new RegExp(`${NOT_MEMBER}(bru|req|res)\\.(\\w+)`, 'g'))) leftovers.add(`${match[1]}.${match[2]}`)
  if (new RegExp(`${NOT_MEMBER}require\\(`).test(out)) leftovers.add('require()')
  if (leftovers.size === 0) return { code: out, untranslated: false }
  const header = `// Imported from Bruno. These calls have no pm equivalent here and were left as written: ${[...leftovers].join(', ')}\n`
  return { code: header + out, untranslated: true }
}

const ASSERT_OPERATORS: Record<string, (actual: string, arg: string) => string> = {
  eq: (a, v) => `pm.expect(${a}).to.eql(${v})`,
  neq: (a, v) => `pm.expect(${a}).to.not.eql(${v})`,
  gt: (a, v) => `pm.expect(${a}).to.be.above(${v})`,
  gte: (a, v) => `pm.expect(${a}).to.be.at.least(${v})`,
  lt: (a, v) => `pm.expect(${a}).to.be.below(${v})`,
  lte: (a, v) => `pm.expect(${a}).to.be.at.most(${v})`,
  in: (a, v) => `pm.expect(${a}).to.be.oneOf(${v})`,
  notIn: (a, v) => `pm.expect(${a}).to.not.be.oneOf(${v})`,
  contains: (a, v) => `pm.expect(${a}).to.include(${v})`,
  notContains: (a, v) => `pm.expect(${a}).to.not.include(${v})`,
  length: (a, v) => `pm.expect(${a}).to.have.length(${v})`,
  matches: (a, v) => `pm.expect(String(${a})).to.match(new RegExp(${v}))`,
  startsWith: (a, v) => `pm.expect(String(${a}).startsWith(${v})).to.be.true`,
  endsWith: (a, v) => `pm.expect(String(${a}).endsWith(${v})).to.be.true`,
  isNull: (a) => `pm.expect(${a}).to.be.null`,
  isUndefined: (a) => `pm.expect(${a}).to.be.undefined`,
  isDefined: (a) => `pm.expect(${a}).to.not.be.undefined`,
  isTruthy: (a) => `pm.expect(${a}).to.be.ok`,
  isFalsy: (a) => `pm.expect(${a}).to.not.be.ok`,
  isEmpty: (a) => `pm.expect(${a}).to.be.empty`,
  isNotEmpty: (a) => `pm.expect(${a}).to.not.be.empty`,
  isNumber: (a) => `pm.expect(${a}).to.be.a("number")`,
  isString: (a) => `pm.expect(${a}).to.be.a("string")`,
  isBoolean: (a) => `pm.expect(${a}).to.be.a("boolean")`,
  isArray: (a) => `pm.expect(${a}).to.be.an("array")`,
  isJson: (a) => `pm.expect(${a}).to.be.an("object")`
}

/** Bruno assertion argument: numbers, booleans, null and quoted strings stay; bare words become strings. */
function assertArgument(raw: string): string {
  const value = raw.trim()
  if (!value) return '""'
  if (/^-?\d+(\.\d+)?$/.test(value) || value === 'true' || value === 'false' || value === 'null') return value
  if (/^["'`].*["'`]$/.test(value) || /^\[.*\]$/.test(value)) return value
  return JSON.stringify(value)
}

/** `assert { res.status: eq 200 }` → `pm.test(...)` lines. */
export function assertionsToTests(pairs: BruPair[], skipped: NoteList): string {
  const lines: string[] = []
  for (const pair of pairs.filter((p) => p.enabled)) {
    const [operator, ...rest] = pair.value.split(/\s+/)
    const build = ASSERT_OPERATORS[operator]
    const actual = translateBrunoScript(pair.key).code
    if (!build) {
      // A bare value means equality in Bruno (`res.status: 200`).
      if (operator && !rest.length && /^[\w"'.-]+$/.test(operator)) {
        lines.push(`pm.test(${JSON.stringify(`${pair.key} eq ${pair.value}`)}, function () {\n  ${ASSERT_OPERATORS.eq(actual, assertArgument(operator))}\n})`)
      } else {
        skipped.add(`Bruno assertion operator "${operator}"`)
      }
      continue
    }
    lines.push(`pm.test(${JSON.stringify(`${pair.key} ${pair.value}`)}, function () {\n  ${build(actual, assertArgument(rest.join(' ')))}\n})`)
  }
  return lines.join('\n')
}

function joinScripts(...parts: Array<string | undefined>): string {
  return parts.filter((p) => p && p.trim()).join('\n\n')
}

interface Scripts {
  pre: string
  tests: string
  untranslated: boolean
}

function scriptsFrom(file: BruFile, skipped: NoteList): Scripts {
  const pre = translateBrunoScript(file.text('script:pre-request') ?? '')
  const post = translateBrunoScript(file.text('script:post-response') ?? '')
  const tests = translateBrunoScript(file.text('tests') ?? '')
  const preVars = file
    .pairs('vars:pre-request')
    .filter((p) => p.enabled)
    .map((p) => `pm.variables.set(${JSON.stringify(p.key)}, ${JSON.stringify(p.value)})`)
    .join('\n')
  // Post-response vars are JS expressions over the response (`res.body.token`).
  const postVars = file
    .pairs('vars:post-response')
    .filter((p) => p.enabled)
    .map((p) => `pm.variables.set(${JSON.stringify(p.key)}, ${translateBrunoScript(p.value).code})`)
    .join('\n')
  return {
    pre: joinScripts(preVars, pre.code),
    tests: joinScripts(postVars, post.code, assertionsToTests(file.pairs('assert'), skipped), tests.code),
    untranslated: pre.untranslated || post.untranslated || tests.untranslated
  }
}

// ---------------------------------------------------------------- auth and body

function brunoAuth(mode: string | undefined, file: BruFile, skipped: NoteList, where: string): RequestAuth {
  const m = (mode ?? '').trim()
  const d = (name: string) => file.dict(`auth:${name}`) ?? {}
  switch (m) {
    case '':
    case 'inherit':
      return { type: 'inherit' }
    case 'none':
      return { type: 'none' }
    case 'basic':
      return { type: 'basic', basicUsername: d('basic').username ?? '', basicPassword: d('basic').password ?? '' }
    case 'bearer':
      return { type: 'bearer', bearerToken: d('bearer').token ?? '' }
    case 'digest':
      return { type: 'digest', digestUsername: d('digest').username ?? '', digestPassword: d('digest').password ?? '' }
    case 'apikey': {
      const a = d('apikey')
      return { type: 'apiKey', apiKeyName: a.key ?? '', apiKeyValue: a.value ?? '', apiKeyLocation: a.placement === 'queryparams' ? 'query' : 'header' }
    }
    case 'awsv4': {
      const a = d('awsv4')
      if (a.profileName) skipped.add(`AWS profile names (use access keys instead) — ${where}`)
      return {
        type: 'aws',
        awsAccessKey: a.accessKeyId ?? '',
        awsSecretKey: a.secretAccessKey ?? '',
        awsSessionToken: a.sessionToken ?? '',
        awsService: a.service ?? '',
        awsRegion: a.region ?? ''
      }
    }
    case 'oauth2': {
      const a = d('oauth2')
      const grant = a.grant_type ?? ''
      if (grant && grant !== 'authorization_code' && grant !== 'client_credentials' && grant !== 'password') {
        skipped.add(`OAuth 2.0 "${grant}" grant imported as authorization code — ${where}`)
      }
      return {
        type: 'oauth2',
        oauth2GrantType: grant === 'client_credentials' || grant === 'password' ? grant : 'authorization_code',
        oauth2AuthUrl: a.authorization_url ?? '',
        oauth2TokenUrl: a.access_token_url ?? '',
        oauth2ClientId: a.client_id ?? '',
        oauth2ClientSecret: a.client_secret ?? '',
        oauth2Scope: a.scope ?? '',
        oauth2RedirectUri: a.callback_url ?? '',
        oauth2Username: a.username ?? '',
        oauth2Password: a.password ?? ''
      }
    }
    default:
      skipped.add(`Unsupported auth "${m}" — ${where} (set to no auth)`)
      return { type: 'none' }
  }
}

/** Auth mode from a `get { auth: … }` field, or a folder/collection `auth { mode: … }` block. */
function authMode(file: BruFile, fromHttpBlock?: string): string | undefined {
  if (fromHttpBlock) return fromHttpBlock
  const block = file.dict('auth')
  if (block?.mode) return block.mode
  const named = file.blocks.find((b) => b.name.startsWith('auth:'))
  return named ? named.name.slice(5) : undefined
}

function toPairs(list: BruPair[]): KeyValuePair[] {
  return list.filter((p) => p.key).map((p) => kv(p.key, p.value, p.enabled))
}

function brunoBody(mode: string, file: BruFile, skipped: NoteList, warnings: NoteList, where: string): RequestBody {
  switch (mode) {
    case 'json':
      return { type: 'json', content: file.text('body:json') ?? '' }
    case 'text':
      return { type: 'text', content: file.text('body:text') ?? '' }
    case 'xml':
      return { type: 'text', content: file.text('body:xml') ?? '' }
    case 'sparql':
      return { type: 'text', content: file.text('body:sparql') ?? '' }
    case 'formUrlEncoded':
      return urlEncodedBody(file.pairs('body:form-urlencoded'))
    case 'multipartForm': {
      const formData: FormDataField[] = file.pairs('body:multipart-form').map((p) => {
        const fileRef = p.value.match(/^@file\((.*)\)$/)
        if (fileRef) warnings.add(`File fields need their file chosen again — ${where}`)
        return {
          ...kv(p.key, fileRef ? '' : p.value, p.enabled),
          type: fileRef ? 'file' : 'text',
          ...(fileRef ? { fileName: fileRef[1].split('|')[0].split(/[\\/]/).pop() } : {})
        }
      })
      return { type: 'form-data', content: '', formData }
    }
    case 'file':
      skipped.add(`Binary file bodies are not imported — ${where}`)
      return { type: 'none', content: '' }
    case 'none':
    case '':
    case 'graphql':
      return { type: 'none', content: '' }
    default:
      skipped.add(`Body type "${mode}" — ${where}`)
      return { type: 'none', content: '' }
  }
}

// ---------------------------------------------------------------- files

function buildRequest(path: string, file: BruFile, folderId: string | null, now: string, skipped: NoteList, warnings: NoteList): ApiRequest | null {
  const meta = file.dict('meta') ?? {}
  const fallbackName = path.split('/').pop()!.replace(/\.bru$/, '')
  const name = meta.name || fallbackName
  const where = `"${name}"`
  const http = bruHttpBlock(file)
  if (!http) {
    skipped.add(meta.type === 'grpc' ? 'gRPC requests' : meta.type === 'ws' ? 'WebSocket requests' : `Files without a request block — ${path}`)
    return null
  }
  const method = toMethod(http.method)
  if (!method) {
    skipped.add(`Request with method "${http.method}" (only standard HTTP methods are supported)`)
    return null
  }
  const { base, params } = splitQuery(http.fields.url ?? '')
  const query = file.has('params:query') ? toPairs(file.pairs('params:query')) : file.has('query') ? toPairs(file.pairs('query')) : params
  const pathValues = Object.fromEntries(file.pairs('params:path').map((p) => [p.key, p.value]))
  const scripts = scriptsFrom(file, skipped)
  if (scripts.untranslated) warnings.add(`Some Bruno script calls were kept as written; check the scripts of ${where}`)
  const isGraphql = meta.type === 'graphql' || http.fields.body === 'graphql'
  const settings = file.dict('settings')
  if (settings?.encodeUrl === 'false') warnings.add('Bruno "encode URL" setting is not imported')
  return request(
    {
      name,
      method,
      url: base,
      headers: toPairs(file.pairs('headers')),
      queryParams: query,
      pathParams: pathParams(base, pathValues),
      body: isGraphql ? { type: 'none', content: '' } : brunoBody(http.fields.body ?? 'none', file, skipped, warnings, where),
      auth: brunoAuth(http.fields.auth ?? (file.blocks.some((b) => b.name.startsWith('auth:')) ? authMode(file) : 'none'), file, skipped, where),
      description: file.text('docs') ?? '',
      ...(scripts.pre ? { preRequestScript: scripts.pre } : {}),
      ...(scripts.tests ? { tests: scripts.tests } : {}),
      ...(isGraphql
        ? { requestType: 'graphql' as const, graphql: { query: file.text('body:graphql') ?? '', variables: file.text('body:graphql:vars') || '{}' } }
        : {}),
      folderId
    },
    now
  )
}

/** Settings a folder.bru / collection.bru gives its children. */
function parentSettings(file: BruFile | undefined, skipped: NoteList, warnings: NoteList, where: string): Partial<ApiFolder> {
  if (!file) return { auth: { type: 'inherit' } }
  const headers = toPairs(file.pairs('headers'))
  const scripts = scriptsFrom(file, skipped)
  if (scripts.tests) skipped.add(`Post-response scripts and tests on ${where} (only requests run them here)`)
  if (scripts.untranslated) warnings.add(`Some Bruno script calls were kept as written; check the pre-request script of ${where}`)
  const vars = file.pairs('vars:pre-request')
  if (vars.length) warnings.add(`Variables on ${where} were turned into a pre-request script`)
  return {
    auth: brunoAuth(authMode(file), file, skipped, where),
    ...(headers.length ? { headers } : {}),
    ...(scripts.pre ? { preRequestScript: scripts.pre } : {})
  }
}

function seq(file: BruFile | undefined): number {
  const value = Number(file?.dict('meta')?.seq)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

function brunoEnvironment(path: string, file: BruFile, warnings: NoteList, now: string): ImportedEnvironment {
  const name = path.split('/').pop()!.replace(/\.bru$/, '')
  const variables = toPairs(file.pairs('vars'))
  const secrets = file.list('vars:secret')
  if (secrets.length) warnings.add(`Secret values are not stored in Bruno files; fill in ${secrets.join(', ')} in "${name}"`)
  for (const secret of secrets) if (!variables.some((v) => v.key === secret)) variables.push(kv(secret, ''))
  return environment(name, variables, now)
}

/** Imports a Bruno collection folder: `bruno.json`, `collection.bru`, nested `*.bru` requests and `environments/*.bru`. */
export function importBruno(files: BrunoSourceFile[], now = new Date().toISOString()): ImportResult {
  const skipped = new NoteList()
  const warnings = new NoteList()
  const config = files.find((f) => f.path === 'bruno.json')
  if (!config) throw new Error('No bruno.json found — pick the folder that contains your Bruno collection')
  let configJson: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(config.content) as unknown
    if (isRecord(parsed)) configJson = parsed
  } catch {
    warnings.add('bruno.json could not be read; using the folder name')
  }

  const bruFiles = files.filter((f) => f.path.endsWith('.bru')).map((f) => ({ path: f.path, file: parseBru(f.content) }))
  const rootFile = bruFiles.find((f) => f.path === 'collection.bru')?.file
  const root = parentSettings(rootFile, skipped, warnings, 'the collection')
  const result = collection(str(configJson.name) || 'Bruno Collection', now, {
    description: rootFile?.text('docs') ?? '',
    auth: root.auth?.type === 'inherit' ? { type: 'none' } : root.auth,
    ...(root.headers ? { headers: root.headers } : {}),
    ...(root.preRequestScript ? { preRequestScript: root.preRequestScript } : {})
  })

  const environments = bruFiles
    .filter((f) => /^environments\/[^/]+\.bru$/.test(f.path))
    .map((f) => brunoEnvironment(f.path, f.file, warnings, now))
  const requests = bruFiles.filter(
    (f) => f.path !== 'collection.bru' && !f.path.startsWith('environments/') && !/(^|\/)folder\.bru$/.test(f.path)
  )

  // Every directory that holds a request (directly or deeper) becomes a folder.
  const folderFiles = new Map(bruFiles.filter((f) => /(^|\/)folder\.bru$/.test(f.path)).map((f) => [f.path.replace(/\/?folder\.bru$/, ''), f.file]))
  const dirs = new Set<string>()
  for (const { path } of requests) {
    const parts = path.split('/').slice(0, -1)
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  const sortedDirs = [...dirs].sort((a, b) => {
    const depth = a.split('/').length - b.split('/').length
    return depth || seq(folderFiles.get(a)) - seq(folderFiles.get(b)) || a.localeCompare(b)
  })
  const folderIds = new Map<string, string>()
  for (const dir of sortedDirs) {
    const parentDir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''
    const file = folderFiles.get(dir)
    const name = file?.dict('meta')?.name || dir.split('/').pop()!
    const created = folder(name, folderIds.get(parentDir) ?? null, parentSettings(file, skipped, warnings, `folder "${name}"`))
    result.folders.push(created)
    folderIds.set(dir, created.id)
  }

  const ordered = [...requests].sort((a, b) => seq(a.file) - seq(b.file) || a.path.localeCompare(b.path))
  for (const { path, file } of ordered) {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const built = buildRequest(path, file, folderIds.get(dir) ?? null, now, skipped, warnings)
    if (built) result.requests.push(built)
  }

  return { collections: [result], environments, summary: summarize('bruno', [result], environments, skipped, warnings) }
}
