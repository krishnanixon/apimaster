/**
 * FastAPI and Flask extraction. Both declare routes with decorators on app/router objects
 * (`@router.get("/x")`, `@bp.route("/x", methods=[...])`) and compose them with
 * `include_router(router, prefix=…)` / `register_blueprint(bp, url_prefix=…)`.
 */
import type { HttpMethod } from '../../../../types/api-studio'
import type { CodeScanConfidence, CodeScanWarning, DetectedEndpoint } from '../../../../types/code-scanner'
import { attachSchema } from '../../../body-schema'
import { joinExactPaths } from '../../paths'
import { addInput, emptyInputs, makeEndpoint, type RequestInputs } from '../common'
import { resolveDotted, resolveInstanceClass, type PythonContext } from './context'
import type { PythonModelIndex } from './models'
import { scanRequestUsage } from './request-usage'
import {
  angleParamsToColon,
  parseCall,
  pyString,
  pyStringList,
  splitTopLevel,
  stringConstants,
  type PyDef,
  type PyModule
} from './source'

type Framework = 'fastapi' | 'flask'

const FACTORIES: Record<string, { framework: Framework; kind: 'app' | 'router'; prefixKey: string }> = {
  FastAPI: { framework: 'fastapi', kind: 'app', prefixKey: 'root_path' },
  APIRouter: { framework: 'fastapi', kind: 'router', prefixKey: 'prefix' },
  Flask: { framework: 'flask', kind: 'app', prefixKey: '' },
  Blueprint: { framework: 'flask', kind: 'router', prefixKey: 'url_prefix' }
}
const METHOD_DECORATORS: Record<string, HttpMethod> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  options: 'OPTIONS',
  head: 'HEAD'
}
const HTTP_METHODS = new Set<string>(Object.values(METHOD_DECORATORS))
/** `Depends(get_current_user)`, `Security(oauth2_scheme)`, … */
const AUTH_DEPENDENCY = /auth|current_\w*user|active_user|token|jwt|login|api_?key|verify|permission|scope|credential|security|oauth/i
const AUTH_DECORATOR = /login_required|jwt_required|token_required|auth_required|requires_auth|roles_required|permission_required|roles_accepted|auth\.login_required|verify_jwt|authenticated/i
const FRAMEWORK_PARAM_TYPES = /\b(Request|Response|BackgroundTasks|WebSocket|HTTPConnection|Session|AsyncSession|Connection)\b/

interface PyRouter {
  id: string
  framework: Framework
  kind: 'app' | 'router'
  prefix: string
  auth: boolean
}

interface PyRoute {
  routerId: string
  methods: HttpMethod[]
  path: string
  computed: boolean
  line: number
  def: PyDef
  auth: boolean
  summary?: string
}

interface PyInclude {
  parentId: string
  target: string
  prefix: string | null
  /** Unresolved prefix expression, retried at link time (`settings.API_V1_STR`, `config.PREFIX`). */
  prefixExpr?: string
  line: number
  auth: boolean
}

export interface PyRouterFileFacts {
  file: string
  routers: Map<string, PyRouter>
  routes: PyRoute[]
  includes: PyInclude[]
  ports: number[]
  warnings: CodeScanWarning[]
}

function hasAuthDependency(text: string | undefined): boolean {
  if (!text) return false
  for (const m of text.matchAll(/\b(?:Depends|Security)\s*\(\s*([\w.]+)/g)) if (AUTH_DEPENDENCY.test(m[1])) return true
  return false
}

export function collectPyRouterFacts(file: string, module: PyModule): PyRouterFileFacts | null {
  const consts = stringConstants(module)
  const facts: PyRouterFileFacts = {
    file,
    routers: new Map(),
    routes: [],
    includes: [],
    ports: [],
    warnings: []
  }

  for (const assignment of module.assignments) {
    const call = parseCall(assignment.value)
    const factory = call && FACTORIES[call.callee.split('.').pop() ?? '']
    if (!call || !factory || facts.routers.has(assignment.name)) continue
    const prefixExpr = factory.prefixKey ? call.keywords.get(factory.prefixKey) : undefined
    facts.routers.set(assignment.name, {
      id: `${file}#${assignment.name}`,
      framework: factory.framework,
      kind: factory.kind,
      prefix: (factory.kind === 'router' && pyString(prefixExpr, consts)) || '',
      auth: hasAuthDependency(call.keywords.get('dependencies'))
    })
  }
  if (facts.routers.size === 0) return null

  for (const def of module.defs) {
    const decoratorAuth = def.decorators.some((d) => AUTH_DECORATOR.test(d.text.split('(')[0]))
    for (const decorator of def.decorators) {
      const call = parseCall(decorator.text)
      if (!call) continue
      const dot = call.callee.lastIndexOf('.')
      if (dot === -1) continue
      const router = facts.routers.get(call.callee.slice(0, dot))
      if (!router) continue
      const action = call.callee.slice(dot + 1)

      let methods: HttpMethod[] | null = null
      if (action in METHOD_DECORATORS) methods = [METHOD_DECORATORS[action]]
      else if (action === 'route' || action === 'api_route') {
        const listed = pyStringList(call.keywords.get('methods'), consts)
        methods = (listed ?? ['GET']).map((m) => m.toUpperCase()).filter((m): m is HttpMethod => HTTP_METHODS.has(m))
      }
      if (!methods) continue

      const pathExpr = call.positional[0] ?? call.keywords.get('path') ?? call.keywords.get('rule')
      const path = pyString(pathExpr, consts)
      if (path === null) {
        facts.warnings.push({ file, line: decorator.line, message: `Could not resolve the path of ${def.name}() (${(pathExpr ?? '').slice(0, 60)})` })
        continue
      }
      facts.routes.push({
        routerId: router.id,
        methods,
        path,
        computed: !/^[rRuU]?['"]/.test((pathExpr ?? '').trim()),
        line: decorator.line,
        def,
        auth: decoratorAuth || hasAuthDependency(call.keywords.get('dependencies')),
        summary: pyString(call.keywords.get('summary')) ?? undefined
      })
    }
  }

  for (const line of module.lines) {
    const include = line.text.match(/^([\w.]+)\.(include_router|register_blueprint|add_url_rule)\s*\(/)
    if (!include) continue
    const parent = facts.routers.get(include[1])
    const call = parseCall(line.text)
    if (!parent || !call) continue

    if (include[2] === 'add_url_rule') {
      addUrlRule(facts, module, parent, call, line.line, consts)
      continue
    }
    const target = call.positional[0] ?? call.keywords.get('router') ?? call.keywords.get('blueprint')
    if (!target) continue
    const prefixExpr = call.keywords.get(include[2] === 'include_router' ? 'prefix' : 'url_prefix')
    const prefix = prefixExpr === undefined ? null : pyString(prefixExpr, consts)
    facts.includes.push({
      parentId: parent.id,
      target: target.trim(),
      prefix,
      prefixExpr: prefixExpr !== undefined && prefix === null ? prefixExpr : undefined,
      line: line.line,
      auth: hasAuthDependency(call.keywords.get('dependencies'))
    })
  }

  // `uvicorn.run(app, port=8001)` / `app.run(port=5001)`
  for (const line of module.lines) {
    const run = line.text.match(/\brun\s*\(/) ? parseCall(line.text.slice(line.text.search(/[\w.]*run\s*\(/))) : null
    const port = Number(run?.keywords.get('port'))
    if (Number.isInteger(port) && port > 0 && port < 65536) facts.ports.push(port)
  }
  return facts
}

const METHOD_BY_NAME: Record<string, HttpMethod> = Object.fromEntries(
  Object.values(METHOD_DECORATORS).map((m) => [m, m])
) as Record<string, HttpMethod>

/** Flask `bp.add_url_rule('/users', view_func=UserAPI.as_view('users'))` (MethodView classes). */
function addUrlRule(
  facts: PyRouterFileFacts,
  module: PyModule,
  router: PyRouter,
  call: NonNullable<ReturnType<typeof parseCall>>,
  line: number,
  consts: Map<string, string>
) {
  const path = pyString(call.positional[0] ?? call.keywords.get('rule'), consts)
  const view = call.keywords.get('view_func') ?? call.positional[2]
  if (path === null || !view) return
  const viewName = view.replace(/\.as_view\([\s\S]*$/, '').trim()
  const listed = pyStringList(call.keywords.get('methods'), consts)
  const classMethods = module.defs.filter((d) => d.className === viewName && d.name.toUpperCase() in METHOD_BY_NAME)
  const fn = module.defs.find((d) => d.name === viewName && !d.className)
  const defs = classMethods.length ? classMethods : fn ? [fn] : []
  for (const def of defs) {
    const methods = classMethods.length
      ? [METHOD_BY_NAME[def.name.toUpperCase()]]
      : (listed ?? ['GET']).map((m) => m.toUpperCase()).filter((m): m is HttpMethod => HTTP_METHODS.has(m))
    facts.routes.push({ routerId: router.id, methods, path, computed: false, line, def, auth: false })
  }
}

// ── Handler inputs ──────────────────────────────────────────────────────────

interface HandlerAnalysis {
  inputs: RequestInputs
  bodyExample?: unknown
  auth: boolean
}

/** FastAPI declares inputs in the signature: path/query/header params and Pydantic body models. */
function analyzeFastApiHandler(def: PyDef, path: string, models: PythonModelIndex): HandlerAnalysis {
  const inputs = emptyInputs()
  let bodyExample: unknown
  let auth = false
  const pathParams = new Set([...path.matchAll(/\{(\w+)(?::\w+)?\}/g)].map((m) => m[1]))

  for (const param of splitTopLevel(def.params)) {
    if (param.startsWith('*') || param === '/') continue
    const [declaration, ...defaultParts] = splitTopLevel(param, '=')
    const [name, ...typeParts] = declaration.split(':')
    const argName = name.trim()
    const type = models.expandAlias(typeParts.join(':').trim())
    const fallback = defaultParts.join('=').trim()
    const whole = `${type} ${fallback}`
    if (argName === 'self' || argName === 'cls') continue
    if (/\b(Depends|Security)\s*\(/.test(whole)) {
      if (hasAuthDependency(whole)) auth = true
      continue
    }
    if (FRAMEWORK_PARAM_TYPES.test(type) || pathParams.has(argName)) continue
    const alias = whole.match(/alias\s*=\s*['"]([^'"]+)['"]/)?.[1]
    if (/\bHeader\s*\(/.test(whole)) addInput(inputs, 'headers', alias ?? argName.replace(/_/g, '-'))
    else if (/\bCookie\s*\(/.test(whole)) continue
    else if (/\b(Body|Form|File|UploadFile)\b/.test(whole)) addInput(inputs, 'body', alias ?? argName)
    else if (/\bQuery\s*\(/.test(whole)) addInput(inputs, 'query', alias ?? argName)
    else {
      const list = type.match(/^(?:list|List|Sequence)\[([\s\S]+)\]$/)
      const modelType = list ? list[1] : type
      if (type && models.isPydanticModel(modelType)) {
        const example = attachSchema(models.pydanticExample(modelType), models.pydanticSchema(modelType))
        bodyExample = list ? [example] : example
      } else {
        addInput(inputs, 'query', alias ?? argName)
      }
    }
  }
  return { inputs, bodyExample, auth }
}

/** webargs / flask-smorest schema decorators: `@use_kwargs(article_schema)`, `@blp.arguments(ArticleSchema)`. */
const SCHEMA_DECORATOR = /(^|\.)(use_kwargs|use_args|arguments|expect|input)$/

/** Flask handlers read `request.*`; webargs/marshmallow schemas declare the body instead. */
function analyzeFlaskHandler(def: PyDef, file: string, method: HttpMethod, ctx: PythonContext): HandlerAnalysis {
  const inputs = scanRequestUsage(def.body)
  let bodyExample: unknown
  for (const decorator of def.decorators) {
    const call = parseCall(decorator.text)
    if (!call || !SCHEMA_DECORATOR.test(call.callee) || !call.positional[0]) continue
    const schema = resolveInstanceClass(ctx, file, call.positional[0])
    if (!schema || !ctx.models.isMarshmallowSchema(schema)) continue
    const example = ctx.models.marshmallowExample(schema)
    if (method === 'GET' || pyString(call.keywords.get('location')) === 'query') {
      for (const field of Object.keys(example)) addInput(inputs, 'query', field)
    } else {
      bodyExample = { ...(bodyExample as object), ...example }
    }
  }
  return { inputs, bodyExample, auth: false }
}

/** The method whose body shape matters most (POST over GET for `methods=['GET', 'POST']`). */
function primaryMethod(route: PyRoute): HttpMethod {
  return route.methods.includes('GET') && route.methods.length === 1 ? 'GET' : (route.methods.find((m) => m !== 'GET') ?? 'GET')
}

// ── Linking ─────────────────────────────────────────────────────────────────

export function linkPyRouters(
  allFacts: PyRouterFileFacts[],
  ctx: PythonContext
): { endpoints: DetectedEndpoint[]; warnings: CodeScanWarning[] } {
  const byFile = new Map(allFacts.map((f) => [f.file, f]))
  const warnings: CodeScanWarning[] = []
  const { models } = ctx

  /** `config.API_PREFIX` (module constant) or `settings.API_V1_STR` (pydantic settings default). */
  const resolvePrefix = (file: string, expr: string): string | null => {
    const target = resolveDotted(ctx, file, expr)
    if (target && target.file !== file) {
      const value = pyString(target.name, ctx.constsOf(target.file))
      if (value !== null) return value
    }
    const attr = expr.trim().match(/\.(\w+)$/)
    return attr ? models.settingsDefault(attr[1]) : null
  }
  for (const facts of allFacts) {
    for (const include of facts.includes) {
      if (!include.prefixExpr) continue
      include.prefix = resolvePrefix(facts.file, include.prefixExpr)
      if (include.prefix === null) {
        warnings.push({
          file: facts.file,
          line: include.line,
          message: `Could not resolve prefix ${include.prefixExpr.slice(0, 60)}; routes below it are shown without it`
        })
      }
    }
  }
  const routers = new Map<string, PyRouter>()
  for (const facts of allFacts) for (const router of facts.routers.values()) routers.set(router.id, router)

  const resolveSymbol = (file: string, name: string, depth = 0): string | null => {
    if (depth > 8) return null
    const local = byFile.get(file)?.routers.get(name)
    if (local) return local.id
    const binding = ctx.bindingsOf(file).get(name)
    return binding?.kind === 'symbol' ? resolveSymbol(binding.file, binding.name, depth + 1) : null
  }
  /** `router`, `users.router`, `user.views.blueprint` → router id. */
  const resolveTarget = (file: string, expr: string): string | null => {
    const target = resolveDotted(ctx, file, expr)
    return target ? resolveSymbol(target.file, target.name) : null
  }

  const children = new Map<string, Array<{ childId: string; include: PyInclude }>>()
  const included = new Set<string>()
  for (const facts of allFacts) {
    for (const include of facts.includes) {
      const childId = resolveTarget(facts.file, include.target)
      if (!childId || childId === include.parentId) continue
      children.set(include.parentId, [...(children.get(include.parentId) ?? []), { childId, include }])
      included.add(childId)
    }
  }

  const routesByRouter = new Map<string, Array<PyRoute & { file: string }>>()
  for (const facts of allFacts) {
    for (const route of facts.routes) {
      routesByRouter.set(route.routerId, [...(routesByRouter.get(route.routerId) ?? []), { ...route, file: facts.file }])
    }
  }

  const endpoints: DetectedEndpoint[] = []
  const walk = (routerId: string, prefix: string, inheritedAuth: boolean, cap: CodeScanConfidence, stack: Set<string>) => {
    if (stack.has(routerId) || stack.size > 20) return
    stack.add(routerId)
    const router = routers.get(routerId)!
    const auth = inheritedAuth || router.auth
    for (const route of routesByRouter.get(routerId) ?? []) {
      const routePath = router.framework === 'flask' ? angleParamsToColon(route.path) : route.path.replace(/\{(\w+):\w+\}/g, '{$1}')
      const path = joinExactPaths(prefix, routePath)
      const analysis: HandlerAnalysis =
        router.framework === 'fastapi'
          ? analyzeFastApiHandler(route.def, route.path, models)
          : analyzeFlaskHandler(route.def, route.file, primaryMethod(route), ctx)
      const own: CodeScanConfidence = route.computed ? 'medium' : 'high'
      const confidence = cap === 'low' || (cap === 'medium' && own === 'high') ? cap : own
      for (const method of route.methods) {
        endpoints.push(
          makeEndpoint({
            method,
            path,
            file: route.file,
            line: route.line,
            framework: router.framework,
            confidence,
            auth: auth || route.auth || analysis.auth,
            inputs: analysis.inputs,
            bodyExample: method === 'GET' || method === 'DELETE' ? undefined : analysis.bodyExample,
            operationId: route.def.name,
            summary: route.summary
          })
        )
      }
    }
    for (const { childId, include } of children.get(routerId) ?? []) {
      const child = routers.get(childId)!
      // Flask's register_blueprint(url_prefix=…) replaces the blueprint's own prefix; FastAPI stacks them.
      const childPrefix =
        child.framework === 'flask'
          ? joinExactPaths(prefix, include.prefix ?? child.prefix)
          : joinExactPaths(prefix, include.prefix ?? '', child.prefix)
      const prefixResolved = !include.prefixExpr || include.prefix !== null
      walk(childId, childPrefix === '/' ? '' : childPrefix, auth || include.auth, prefixResolved ? cap : 'low', stack)
    }
    stack.delete(routerId)
  }

  for (const [id, router] of routers) {
    if (included.has(id)) continue
    walk(id, router.prefix, false, router.kind === 'router' ? 'low' : 'high', new Set())
  }
  return { endpoints, warnings }
}
