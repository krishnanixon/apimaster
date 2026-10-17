import type { HttpMethod } from '../../types/api-studio'
import type { ApiSpecParameter } from '../../types/ai-engineer'
import type {
  AuthScheme,
  CodeLocation,
  CodeScanConfidence,
  CodeScanWarning,
  DetectedEndpoint,
  DetectedFramework
} from '../../types/code-scanner'
import { dedupeFrameworks, detectFrameworksInManifest, isManifestFile } from './detect'
import { extractOpenApi, isOpenApiCandidate } from './extractors/openapi'
import { collectServerFacts, linkServerRoutes, type ImportResolver, type ServerFileFacts } from './extractors/node-server'
import { collectNestFacts, linkNestRoutes, type NestFileFacts } from './extractors/nestjs'
import { collectNextFacts, linkNextRoutes, type NextFileFacts } from './extractors/nextjs'
import { parseSource } from './extractors/ts-utils'
import { importBindings, PythonModuleIndex, scanPython, stringConstants, type PyBinding, type PyModule } from './extractors/python/source'
import { PythonModelIndex } from './extractors/python/models'
import { collectPyRouterFacts, linkPyRouters, type PyRouterFileFacts } from './extractors/python/routers'
import { collectDjangoFacts, linkDjangoRoutes, type DjangoFileFacts } from './extractors/python/django'
import type { PythonContext } from './extractors/python/context'
import { collectFrontendFacts, type FrontendFileFacts } from './extractors/frontend/collect'
import { linkFrontendCalls } from './extractors/frontend/link'
import { normalizeRoutePath } from './paths'
import { endpointKey } from './fingerprint'

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']
/** Port each framework's dev server uses when the code doesn't set one. */
const DEFAULT_PORTS: Record<string, number> = { django: 8000, fastapi: 8000, flask: 5000 }
const DEFAULT_PORT = 3000
const MAX_WARNINGS = 200

export function isSourceFile(path: string): boolean {
  if (!SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))) return false
  if (/\.d\.[mc]?ts$/.test(path) || /\.min\.js$/.test(path)) return false
  // Tests build throwaway apps whose routes aren't part of the real API.
  return !/(^|\/)(__tests__|__mocks__|test|tests|e2e|cypress)\//.test(path) && !/\.(test|spec)\.[^.]+$/.test(path)
}

export function isPythonFile(path: string): boolean {
  if (!path.endsWith('.py')) return false
  if (/(^|\/)(tests?|migrations|site-packages|__pycache__)\//.test(path)) return false
  return !/(^|\/)(test_[^/]*|[^/]*_tests?|conftest|setup)\.py$/.test(path)
}

/** Vue/Svelte single-file components; their `<script>` blocks are scanned for API calls. */
export function isComponentFile(path: string): boolean {
  return /\.(vue|svelte)$/.test(path) && isSourceFile(path.replace(/\.(vue|svelte)$/, '.ts'))
}

/** `.env`, `.env.local`, `.env.example`, … — read only for API base URLs. */
export function isEnvFile(path: string): boolean {
  return /(^|\/)\.env(\.[\w.-]+)?$/.test(path)
}

/** Files the scanner needs to read; everything else is skipped without opening it. */
export function isCandidateFile(path: string): boolean {
  return (
    isSourceFile(path) ||
    isComponentFile(path) ||
    isPythonFile(path) ||
    isOpenApiCandidate(path) ||
    isManifestFile(path) ||
    isEnvFile(path)
  )
}

/** Env keys that name an API location; every other key (secrets included) is ignored. */
const ENV_URL_KEY = /(API|BACKEND|SERVER|SERVICE|GRAPHQL|GQL|BASE)[\w]*_?(URL|URI|HOST|ENDPOINT|ORIGIN)|^(\w+_)?(API|BASE)_?URL$/i
/** Prefer the values a developer runs with locally. */
function envFileRank(path: string): number {
  const name = path.slice(path.lastIndexOf('/') + 1)
  if (/^\.env\.(development\.)?local$/.test(name)) return 0
  if (name === '.env.development') return 1
  if (name === '.env') return 2
  if (/example|sample|template|dist/.test(name)) return 3
  return 4
}

/** Blanks everything outside `<script>` blocks so line numbers stay correct. */
function componentScript(content: string): string {
  const lines = content.split('\n').map(() => '')
  for (const m of content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const start = content.slice(0, m.index! + m[0].indexOf('>') + 1).split('\n').length - 1
    m[1].split('\n').forEach((line, i) => {
      lines[start + i] = i === 0 ? ' '.repeat(content.split('\n')[start].indexOf('>') + 1) + line : line
    })
  }
  return lines.join('\n')
}

/** Resolves `.`, `..` and duplicate slashes in a `/`-separated relative path. */
function normalizeRelative(path: string): string | null {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return null
      out.pop()
    } else {
      out.push(part)
    }
  }
  return out.join('/')
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

/**
 * Resolves relative imports (and the common `@/` / `~/` → `src/` alias) against the project's
 * file list, the way a bundler would: exact file, `.js` → `.ts`, added extension, `index` file.
 */
export function createImportResolver(allPaths: Iterable<string>): ImportResolver {
  const files = new Set(allPaths)
  const tryResolve = (base: string | null): string | null => {
    if (base === null) return null
    if (files.has(base)) return base
    const withoutJsExt = base.replace(/\.(m|c)?jsx?$/, '')
    for (const stem of withoutJsExt === base ? [base] : [withoutJsExt, base]) {
      for (const ext of SOURCE_EXTENSIONS) if (files.has(stem + ext)) return stem + ext
      for (const ext of SOURCE_EXTENSIONS) if (files.has(`${stem}/index${ext}`)) return `${stem}/index${ext}`
    }
    return null
  }

  return (fromFile, specifier) => {
    if (specifier.startsWith('.')) return tryResolve(normalizeRelative(`${dirname(fromFile)}/${specifier}`))
    const alias = /^[@~]\//.test(specifier) ? specifier.slice(2) : specifier.startsWith('src/') ? specifier : null
    if (alias === null) return null
    // Aliases point at the `src` folder of the package the importing file belongs to.
    const srcIndex = fromFile.lastIndexOf('src/')
    const packageRoot = srcIndex === -1 ? '' : fromFile.slice(0, srcIndex)
    const inSrc = alias.startsWith('src/') ? alias : `src/${alias}`
    return tryResolve(normalizeRelative(packageRoot + inSrc)) ?? tryResolve(normalizeRelative(packageRoot + alias))
  }
}

const CONFIDENCE_RANK: Record<CodeScanConfidence, number> = { high: 2, medium: 1, low: 0 }
const METHOD_ORDER: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

function mergeParameters(a: ApiSpecParameter[], b: ApiSpecParameter[]): ApiSpecParameter[] {
  const out = [...a]
  for (const param of b) if (!out.some((p) => p.name === param.name && p.in === param.in)) out.push(param)
  return out
}

function mergeSources(a: CodeLocation[], b: CodeLocation[]): CodeLocation[] {
  const out = [...a]
  for (const loc of b) if (!out.some((l) => l.file === loc.file && l.line === loc.line)) out.push(loc)
  return out
}

/** Which description wins a merge: a shipped OpenAPI document, then backend code, then frontend calls. */
const ORIGIN_RANK = { openapi: 2, backend: 1, frontend: 0 } as const

function mergePair(a: DetectedEndpoint, b: DetectedEndpoint): DetectedEndpoint {
  const aFirst =
    ORIGIN_RANK[a.origin] !== ORIGIN_RANK[b.origin]
      ? ORIGIN_RANK[a.origin] > ORIGIN_RANK[b.origin]
      : CONFIDENCE_RANK[a.confidence] >= CONFIDENCE_RANK[b.confidence]
  const [primary, other] = aFirst ? [a, b] : [b, a]
  const frameworks = [...new Set([...primary.framework.split(', '), ...other.framework.split(', ')])]
  return {
    ...primary,
    summary: primary.summary ?? other.summary,
    description: primary.description ?? other.description,
    operationId: primary.operationId ?? other.operationId,
    parameters: mergeParameters(primary.parameters, other.parameters),
    requestBody:
      primary.requestBody && !primary.requestBody.schema && other.requestBody?.schema
        ? { ...primary.requestBody, schema: other.requestBody.schema }
        : (primary.requestBody ?? other.requestBody),
    responses: primary.responses.length ? primary.responses : other.responses,
    securityRequired: a.securityRequired || b.securityRequired,
    confidence: CONFIDENCE_RANK[a.confidence] >= CONFIDENCE_RANK[b.confidence] ? a.confidence : b.confidence,
    framework: frameworks.join(', '),
    sources: mergeSources(primary.sources, other.sources),
    callers: a.callers || b.callers ? mergeSources(primary.callers ?? [], other.callers ?? []) : undefined
  }
}

/** One endpoint per method + path shape; sorted by path, then conventional method order. */
export function mergeEndpoints(endpoints: DetectedEndpoint[]): DetectedEndpoint[] {
  const byKey = new Map<string, DetectedEndpoint>()
  for (const endpoint of endpoints) {
    const key = endpointKey(endpoint)
    const existing = byKey.get(key)
    byKey.set(key, existing ? mergePair(existing, endpoint) : endpoint)
  }
  return [...byKey.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
  )
}

function mostCommon(values: number[]): number | undefined {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: number | undefined
  for (const [value, count] of counts) if (best === undefined || count > counts.get(best)!) best = value
  return best
}

function mostCommonString(values: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function segments(path: string): string[] {
  return normalizeRoutePath(path)
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith(':') || s.startsWith('{') ? '{}' : s))
}

/**
 * A frontend call whose base URL couldn't be resolved (`${config.api}/users`) is missing its
 * prefix. When exactly one backend route ends with the same segments, use that route's path.
 */
function alignWithBackend(frontend: DetectedEndpoint[], unresolved: Set<string>, backend: DetectedEndpoint[]): void {
  for (const call of frontend) {
    if (!unresolved.has(call.id) || call.host) continue
    const tail = segments(call.path)
    if (tail.length === 0) continue
    const matches = new Set(
      backend
        .filter((route) => {
          if (route.method !== call.method) return false
          const own = segments(route.path)
          return own.length > tail.length && tail.every((segment, i) => own[own.length - tail.length + i] === segment)
        })
        .map((route) => route.path)
    )
    if (matches.size === 1) call.path = [...matches][0]
  }
}

/** Compares backend routes with frontend calls when the scan found both. */
function markCrossCheck(endpoints: DetectedEndpoint[]): void {
  const own = endpoints.filter((e) => !e.host && !e.graphql)
  const hasBackend = own.some((e) => e.origin !== 'frontend')
  const hasFrontend = own.some((e) => e.callers?.length)
  if (!hasBackend || !hasFrontend) return
  for (const endpoint of own) {
    endpoint.crossCheck = endpoint.origin === 'frontend' ? 'no-backend' : endpoint.callers?.length ? 'called' : 'not-called'
  }
}

/** Dev-server port of the framework most endpoints came from. */
function defaultPort(endpoints: DetectedEndpoint[]): number {
  const counts = new Map<string, number>()
  for (const e of endpoints) for (const fw of e.framework.split(', ')) counts.set(fw, (counts.get(fw) ?? 0) + 1)
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
  return (top && DEFAULT_PORTS[top]) || DEFAULT_PORT
}

/** Project-wide signals about how credentials are sent, gathered from source text. */
interface AuthHints {
  /** Custom `Authorization` scheme word (`Token`, `JWT`) when the code configures one. */
  prefix?: string
  bearer: boolean
  basic: boolean
  apiKey?: AuthScheme
  declared?: AuthScheme
}

/** `'Token ' + jwt`, `split(' ')[0] === 'Token'`, DRF `TokenAuthentication`. */
const TOKEN_PREFIX = /['"`]Token \$\{|['"`]Token ['"`]\s*\+|\[0\]\s*===?\s*['"]Token['"]|\bTokenAuthentication\b/
/** Settings that name the scheme: `JWT_HEADER_TYPE = 'Token'`, `JWT_AUTH_HEADER_PREFIX = 'JWT'`, `keyword = 'Token'`. */
const CONFIGURED_PREFIX = /\b(?:\w*HEADER_TYPE|\w*HEADER_PREFIX|\w*header_prefix|keyword)['"]?\s*[=:]\s*['"]([A-Za-z]+)['"]/
const BEARER_HINT = /\bBearer\b|passport-jwt|ExtractJwt|HTTPBearer|OAuth2PasswordBearer|JwtAuthGuard|express-jwt|jwt_required|JWTAuthentication/
const BASIC_HINT = /\bbasicAuth\s*\(|\bHTTPBasic\b|BasicAuthentication|express-basic-auth|@fastify\/basic-auth|HTTPBasicAuth/
const PY_API_KEY = /APIKey(Header|Query)\(\s*name\s*=\s*['"]([\w-]+)['"]/

/**
 * One scheme for the collection. An explicit convention (OpenAPI declaration, a `Token` prefix)
 * wins; an API key or Basic auth wins over Bearer only when nothing in the code mentions Bearer.
 */
function decideAuth(endpoints: DetectedEndpoint[], hints: AuthHints): AuthScheme | undefined {
  if (!endpoints.some((e) => e.securityRequired && !e.host)) return undefined
  if (hints.declared) return hints.declared
  if (hints.prefix) return { type: 'bearer', prefix: hints.prefix }
  const counts = new Map<string, { scheme: AuthScheme; n: number }>()
  for (const e of endpoints) {
    if (!e.authScheme || e.host) continue
    const key = JSON.stringify(e.authScheme)
    counts.set(key, { scheme: e.authScheme, n: (counts.get(key)?.n ?? 0) + 1 })
  }
  const voted = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.scheme ?? hints.apiKey
  if (voted && !hints.bearer) return voted
  if (hints.basic && !hints.bearer) return { type: 'basic' }
  return { type: 'bearer' }
}

export interface ProjectAnalysis {
  frameworks: DetectedFramework[]
  endpoints: DetectedEndpoint[]
  baseUrl: string
  auth?: AuthScheme
  warnings: CodeScanWarning[]
}

/**
 * Accumulates per-file results so the caller can read files one at a time (with progress and
 * cancellation), then links everything in `finish()`.
 */
export class ProjectAnalyzer {
  private readonly resolveImport: ImportResolver
  private readonly serverFacts: ServerFileFacts[] = []
  private readonly nestFacts: NestFileFacts[] = []
  private readonly nextFacts: NextFileFacts[] = []
  private readonly pythonIndex: PythonModuleIndex
  private readonly pythonModels = new PythonModelIndex()
  private readonly pythonModules = new Map<string, PyModule>()
  private readonly pythonBindings = new Map<string, Map<string, PyBinding>>()
  private readonly pyRouterFacts: PyRouterFileFacts[] = []
  private readonly djangoFacts: DjangoFileFacts[] = []
  private readonly frontendFacts: FrontendFileFacts[] = []
  /** URL-valued env entries with the rank of the file they came from. */
  private readonly envUrls = new Map<string, { value: string; rank: number }>()
  private packageProxy?: string
  private readonly authHints: AuthHints = { bearer: false, basic: false }

  private readAuthHints(content: string): void {
    const hints = this.authHints
    if (!hints.prefix) {
      const configured = content.match(CONFIGURED_PREFIX)?.[1]
      if (configured && configured.toLowerCase() !== 'bearer') hints.prefix = configured
      else if (TOKEN_PREFIX.test(content)) hints.prefix = 'Token'
    }
    if (!hints.bearer && BEARER_HINT.test(content)) hints.bearer = true
    if (!hints.basic && BASIC_HINT.test(content)) hints.basic = true
    const key = !hints.apiKey ? content.match(PY_API_KEY) : null
    if (key) hints.apiKey = { type: 'apiKey', name: key[2], in: key[1] === 'Query' ? 'query' : 'header' }
  }
  private readonly openApiEndpoints: DetectedEndpoint[] = []
  private readonly declaredBaseUrls: string[] = []
  private readonly frameworks: DetectedFramework[] = []
  private readonly warnings: CodeScanWarning[] = []

  constructor(allPaths: Iterable<string>) {
    const paths = [...allPaths]
    this.resolveImport = createImportResolver(paths)
    this.pythonIndex = new PythonModuleIndex(paths)
  }

  private pythonBindingsOf = (file: string): Map<string, PyBinding> => {
    let bindings = this.pythonBindings.get(file)
    if (!bindings) {
      const module = this.pythonModules.get(file)
      bindings = module ? importBindings(file, module, this.pythonIndex) : new Map()
      this.pythonBindings.set(file, bindings)
    }
    return bindings
  }

  private addEnv(path: string, content: string): void {
    const rank = envFileRank(path)
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/)
      if (!m || !ENV_URL_KEY.test(m[1])) continue
      const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2').replace(/\s+#.*$/, '')
      if (!/^(https?:\/\/|\/)/i.test(value)) continue
      const existing = this.envUrls.get(m[1])
      if (!existing || rank < existing.rank) this.envUrls.set(m[1], { value, rank })
    }
  }

  private addJavaScript(path: string, content: string): void {
    const sf = parseSource(path, content)
    const frontend = collectFrontendFacts(sf, (spec) => this.resolveImport(path, spec))
    if (
      frontend.templates.length ||
      frontend.fnCalls.length ||
      frontend.clients.size ||
      frontend.constShapes.size ||
      frontend.graphql.length ||
      frontend.graphqlUris.length ||
      frontend.proxies.length ||
      frontend.interceptorBase ||
      frontend.skippedDynamic
    ) {
      this.frontendFacts.push(frontend)
    }
    if (isComponentFile(path)) return

    const facts = collectServerFacts(sf, this.resolveImport)
    facts.warnings.forEach((w) => this.warn(w))
    if (facts.routers.length || facts.exports.size || facts.starExports.length || facts.schemaExamples.size || facts.schemaGroups.size) this.serverFacts.push(facts)

    const nest = collectNestFacts(sf)
    nest.warnings.forEach((w) => this.warn(w))
    if (nest.routes.length || nest.classes.length || nest.globalPrefix !== undefined || nest.globalPrefixUnresolved || nest.uriVersioning || nest.globalAuth || nest.ports.length) {
      this.nestFacts.push(nest)
    }
    const next = collectNextFacts(sf)
    if (next) this.nextFacts.push(next)
  }

  private addPython(path: string, content: string): void {
    const module = scanPython(content)
    this.pythonModules.set(path, module)
    this.pythonModels.add(path, module)
    const routers = collectPyRouterFacts(path, module)
    if (routers) {
      routers.warnings.forEach((w) => this.warn(w))
      this.pyRouterFacts.push(routers)
    }
    const django = collectDjangoFacts(path, module, content)
    if (django) {
      django.warnings.forEach((w) => this.warn(w))
      this.djangoFacts.push(django)
    }
  }

  private warn(warning: CodeScanWarning): void {
    if (this.warnings.length < MAX_WARNINGS) this.warnings.push(warning)
  }

  addFile(path: string, content: string): void {
    try {
      if (isEnvFile(path)) {
        this.addEnv(path, content)
      } else if (isComponentFile(path)) {
        this.addJavaScript(path, componentScript(content))
      } else if (isManifestFile(path)) {
        this.frameworks.push(...detectFrameworksInManifest(path, content))
        if (path.endsWith('package.json')) {
          try {
            const proxy = (JSON.parse(content) as { proxy?: unknown }).proxy
            if (typeof proxy === 'string' && !this.packageProxy) this.packageProxy = proxy
          } catch {
            // Invalid package.json — framework detection already ignored it.
          }
        }
      } else if (isOpenApiCandidate(path)) {
        const result = extractOpenApi(path, content)
        if (result) {
          this.openApiEndpoints.push(...result.endpoints)
          if (result.baseUrl) this.declaredBaseUrls.push(result.baseUrl)
          if (result.authScheme && !this.authHints.declared) this.authHints.declared = result.authScheme
        }
      } else if (isSourceFile(path)) {
        this.readAuthHints(content)
        this.addJavaScript(path, content)
      } else if (isPythonFile(path)) {
        this.readAuthHints(content)
        this.addPython(path, content)
      }
    } catch (error) {
      this.warn({ file: path, message: `Could not analyze file: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  finish(): ProjectAnalysis {
    const constsOf = (file: string) => {
      const module = this.pythonModules.get(file)
      return module ? stringConstants(module) : new Map<string, string>()
    }
    const ctx: PythonContext = {
      index: this.pythonIndex,
      models: this.pythonModels,
      modules: this.pythonModules,
      bindingsOf: this.pythonBindingsOf,
      constsOf
    }
    const python = linkPyRouters(this.pyRouterFacts, ctx)
    python.warnings.forEach((w) => this.warn(w))
    const backend = [
      ...linkServerRoutes(this.serverFacts),
      ...linkNestRoutes(this.nestFacts),
      ...linkNextRoutes(this.nextFacts),
      ...python.endpoints,
      ...linkDjangoRoutes(this.djangoFacts, ctx),
      ...this.openApiEndpoints
    ]
    const frontend = linkFrontendCalls({
      facts: this.frontendFacts,
      env: new Map([...this.envUrls].map(([key, { value }]) => [key, value])),
      packageProxy: this.packageProxy
    })
    if (frontend.skippedDynamic > 0) {
      this.warn({
        message: `${frontend.skippedDynamic} ${frontend.skippedDynamic === 1 ? 'request builds its' : 'requests build their'} URL at runtime (for example fetch(url)) and ${frontend.skippedDynamic === 1 ? 'was' : 'were'} skipped`
      })
    }
    alignWithBackend(frontend.endpoints, frontend.unresolved, backend)
    const endpoints = mergeEndpoints([...backend, ...frontend.endpoints])
    markCrossCheck(endpoints)

    const port = mostCommon([
      ...this.serverFacts.flatMap((f) => f.ports),
      ...this.nestFacts.flatMap((f) => f.ports),
      ...this.pyRouterFacts.flatMap((f) => f.ports)
    ])
    const declared = this.declaredBaseUrls.find((url) => /^https?:\/\//i.test(url))
    const frontendOrigin = mostCommonString(frontend.apiOrigins)
    const baseUrl = port
      ? `http://localhost:${port}`
      : (frontendOrigin ?? declared ?? `http://localhost:${defaultPort(endpoints)}`)
    return {
      frameworks: dedupeFrameworks(this.frameworks),
      endpoints,
      baseUrl,
      auth: decideAuth(endpoints, this.authHints),
      warnings: this.warnings
    }
  }
}
