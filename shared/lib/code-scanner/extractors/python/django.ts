/**
 * Django + Django REST Framework extraction: walks `urlpatterns` from the root URLconf through
 * `include()`, resolving each view (function, class-based, generic, DRF viewset) to its methods,
 * DRF routers (`router.register('users', UserViewSet)`) to list/detail routes, and serializers
 * to example bodies.
 */
import type { HttpMethod } from '../../../../types/api-studio'
import type { CodeScanConfidence, CodeScanWarning, DetectedEndpoint } from '../../../../types/code-scanner'
import { joinExactPaths } from '../../paths'
import { makeEndpoint, type RequestInputs } from '../common'
import { resolveDotted, type PythonContext } from './context'
import { scanRequestUsage } from './request-usage'
import {
  angleParamsToColon,
  matchingBracket,
  parseCall,
  pyString,
  pyStringList,
  splitTopLevel,
  stringConstants,
  type PyClass,
  type PyDef,
  type PyModule
} from './source'

type Action = 'list' | 'create' | 'retrieve' | 'update' | 'partial_update' | 'destroy'

const ACTION_ROUTES: Record<Action, { method: HttpMethod; detail: boolean }> = {
  list: { method: 'GET', detail: false },
  create: { method: 'POST', detail: false },
  retrieve: { method: 'GET', detail: true },
  update: { method: 'PUT', detail: true },
  partial_update: { method: 'PATCH', detail: true },
  destroy: { method: 'DELETE', detail: true }
}
const VIEWSET_ACTIONS: Array<[RegExp, Action[]]> = [
  [/^ModelViewSet$/, ['list', 'create', 'retrieve', 'update', 'partial_update', 'destroy']],
  [/^ReadOnlyModelViewSet$/, ['list', 'retrieve']],
  [/^ListModelMixin$/, ['list']],
  [/^CreateModelMixin$/, ['create']],
  [/^RetrieveModelMixin$/, ['retrieve']],
  [/^UpdateModelMixin$/, ['update', 'partial_update']],
  [/^DestroyModelMixin$/, ['destroy']]
]
const VIEW_METHODS: Array<[RegExp, HttpMethod[]]> = [
  [/^ListCreateAPIView$/, ['GET', 'POST']],
  [/^RetrieveUpdateDestroyAPIView$/, ['GET', 'PUT', 'PATCH', 'DELETE']],
  [/^RetrieveUpdateAPIView$/, ['GET', 'PUT', 'PATCH']],
  [/^RetrieveDestroyAPIView$/, ['GET', 'DELETE']],
  [/^(ListAPIView|RetrieveAPIView)$/, ['GET']],
  [/^CreateAPIView$/, ['POST']],
  [/^UpdateAPIView$/, ['PUT', 'PATCH']],
  [/^DestroyAPIView$/, ['DELETE']],
  [/^ListModelMixin$|^RetrieveModelMixin$/, ['GET']],
  [/^CreateModelMixin$/, ['POST']],
  [/^UpdateModelMixin$/, ['PUT', 'PATCH']],
  [/^DestroyModelMixin$/, ['DELETE']],
  [/^(ListView|DetailView|TemplateView|RedirectView|\w*ArchiveView|ArchiveIndexView)$/, ['GET']],
  [/^(CreateView|UpdateView|FormView|DeleteView|LoginView|LogoutView|Password\w*View)$/, ['GET', 'POST']]
]
const HTTP_METHOD_NAMES = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
const DRF_VIEW_BASES = /APIView|ViewSet|GenericAPIView|Mixin$/
const AUTH_DECORATOR = /login_required|permission_required|user_passes_test|staff_member_required|auth_required|jwt_required/
const AUTH_PERMISSION = /IsAuthenticated|IsAdminUser|DjangoModelPermissions|TokenHasScope|HasAPIKey/
/** `IsAuthenticatedOrReadOnly`: reads are public, writes need a login. */
const READ_ONLY_PERMISSION = /OrReadOnly|OrAnonReadOnly/
const SAFE_METHODS = new Set<HttpMethod>(['GET', 'HEAD', 'OPTIONS'])

type AuthRule = boolean | 'writes'

function permissionRule(text: string): AuthRule {
  const strict = text.replace(/\w+Or(Anon)?ReadOnly/g, '')
  if (AUTH_PERMISSION.test(strict)) return true
  return READ_ONLY_PERMISSION.test(text) ? 'writes' : false
}
const BODY_METHODS = new Set<HttpMethod>(['POST', 'PUT', 'PATCH'])

interface UrlEntry {
  route: string
  line: number
  /** `include('app.urls')` target module, `include(router.urls)` router expression, or a view expression. */
  target: { kind: 'include-module'; module: string } | { kind: 'include-router'; router: string } | { kind: 'include-list'; entries: UrlEntry[] } | { kind: 'view'; expr: string }
}

interface DrfRegistration {
  prefix: string
  viewset: string
  line: number
}

export interface DjangoFileFacts {
  file: string
  urlpatterns: UrlEntry[] | null
  routers: Map<string, { trailingSlash: boolean; registrations: DrfRegistration[] }>
  rootUrlconf?: string
  drfGlobalAuth: AuthRule
  warnings: CodeScanWarning[]
}

/** `^users/(?P<pk>[0-9]+)/$` → `users/:pk/`; null when the pattern has regex we can't express as a path. */
function regexToPath(pattern: string): string | null {
  let out = ''
  let i = pattern.startsWith('^') ? 1 : 0
  const end = pattern.endsWith('$') ? pattern.length - 1 : pattern.length
  while (i < end) {
    const ch = pattern[i]
    if (ch === '(') {
      const close = matchingBracket(pattern, i)
      if (close === -1) return null
      const named = pattern.slice(i, close + 1).match(/^\(\?P<(\w+)>/)
      out += named ? `:${named[1]}` : ':param'
      i = close + 1
    } else if (ch === '\\' && i + 1 < end) {
      out += pattern[i + 1]
      i += 2
    } else if (ch === '?' && out) {
      // `users/?` — the slash is optional; use the shorter form.
      out = out.slice(0, -1)
      i++
    } else if ('[]*+?|{}'.includes(ch)) {
      return null
    } else {
      out += ch
      i++
    }
  }
  return out
}

export function collectDjangoFacts(file: string, module: PyModule, text: string): DjangoFileFacts | null {
  const consts = stringConstants(module)
  const facts: DjangoFileFacts = {
    file,
    urlpatterns: null,
    routers: new Map(),
    drfGlobalAuth: false,
    warnings: []
  }

  if (/(^|\/)settings(\/\w+)?\.py$/.test(file)) {
    const root = module.assignments.find((a) => a.name === 'ROOT_URLCONF')
    if (root) facts.rootUrlconf = pyString(root.value, consts) ?? undefined
    const permissions = text.match(/['"]DEFAULT_PERMISSION_CLASSES['"]\s*:\s*[[(]([^\])]*)[\])]/)
    facts.drfGlobalAuth = permissions ? permissionRule(permissions[1]) : false
  }

  for (const a of module.assignments) {
    const call = parseCall(a.value)
    if (call && /(^|\.)(DefaultRouter|SimpleRouter|ExtendedSimpleRouter|ExtendedDefaultRouter)$/.test(call.callee)) {
      facts.routers.set(a.name, { trailingSlash: call.keywords.get('trailing_slash') !== 'False', registrations: [] })
    }
  }
  for (const line of module.lines) {
    const m = line.text.match(/^([\w.]+)\.register\s*\(/)
    const router = m && facts.routers.get(m[1])
    const call = router ? parseCall(line.text) : null
    if (!router || !call || call.positional.length < 2) continue
    const prefix = pyString(call.positional[0] ?? call.keywords.get('prefix'), consts)
    if (prefix === null) continue
    router.registrations.push({ prefix: prefix.replace(/^\^|\$$/g, ''), viewset: call.positional[1], line: line.line })
  }

  const parseEntries = (listText: string, baseLine: number): UrlEntry[] => {
    const entries: UrlEntry[] = []
    for (const item of splitTopLevel(listText)) {
      const call = parseCall(item)
      const kind = call?.callee.split('.').pop()
      if (!call || !kind || !['path', 're_path', 'url'].includes(kind)) continue
      const rawRoute = pyString(call.positional[0] ?? call.keywords.get('route'), consts)
      if (rawRoute === null) continue
      const route = kind === 'path' ? angleParamsToColon(rawRoute) : regexToPath(rawRoute)
      if (route === null) {
        facts.warnings.push({ file, line: baseLine, message: `Skipped URL pattern with a regular expression: ${rawRoute}` })
        continue
      }
      const targetText = (call.positional[1] ?? call.keywords.get('view') ?? '').trim()
      if (!targetText || /^admin\.site\.urls$/.test(targetText)) continue
      const include = parseCall(targetText)
      if (include && /(^|\.)include$/.test(include.callee)) {
        let arg = (include.positional[0] ?? '').trim()
        if (arg.startsWith('(')) arg = splitTopLevel(arg.slice(1, -1))[0] ?? ''
        const module = pyString(arg, consts)
        if (module) entries.push({ route, line: baseLine, target: { kind: 'include-module', module } })
        else if (arg.startsWith('[')) entries.push({ route, line: baseLine, target: { kind: 'include-list', entries: parseEntries(arg.slice(1, -1), baseLine) } })
        else if (/\.urls$/.test(arg)) entries.push({ route, line: baseLine, target: { kind: 'include-router', router: arg.replace(/\.urls$/, '') } })
        else if (arg) entries.push({ route, line: baseLine, target: { kind: 'include-module', module: `@binding:${arg}` } })
        continue
      }
      if (/\.urls$/.test(targetText) && !targetText.includes('(')) {
        entries.push({ route, line: baseLine, target: { kind: 'include-router', router: targetText.replace(/\.urls$/, '') } })
        continue
      }
      entries.push({ route, line: baseLine, target: { kind: 'view', expr: targetText } })
    }
    return entries
  }

  for (const a of module.assignments) {
    if (a.name !== 'urlpatterns' || a.indent !== 0) continue
    const entries: UrlEntry[] = []
    for (const part of splitTopLevel(a.value, '+')) {
      const trimmed = part.trim()
      if (trimmed.startsWith('[')) entries.push(...parseEntries(trimmed.slice(1, -1), a.line))
      else if (/\.urls$/.test(trimmed)) entries.push({ route: '', line: a.line, target: { kind: 'include-router', router: trimmed.replace(/\.urls$/, '') } })
    }
    facts.urlpatterns = [...(facts.urlpatterns ?? []), ...entries]
  }

  const relevant = facts.urlpatterns || facts.routers.size || facts.rootUrlconf || facts.drfGlobalAuth
  return relevant ? facts : null
}

// ── Linking ─────────────────────────────────────────────────────────────────

interface ResolvedView {
  file: string
  def?: PyDef
  cls?: PyClass
}

export function linkDjangoRoutes(allFacts: DjangoFileFacts[], ctx: PythonContext): DetectedEndpoint[] {
  const { modules, bindingsOf, index, models } = ctx
  const byFile = new Map(allFacts.map((f) => [f.file, f]))
  const drfGlobalAuth: AuthRule = allFacts.find((f) => f.drfGlobalAuth)?.drfGlobalAuth ?? false
  const endpoints: DetectedEndpoint[] = []

  const findInFile = (file: string, name: string, depth = 0): ResolvedView | null => {
    const module = modules.get(file)
    if (!module || depth > 6) return null
    const def = module.defs.find((d) => d.name === name && !d.className && d.indent === 0)
    if (def) return { file, def }
    const cls = module.classes.find((c) => c.name === name && !c.parent)
    if (cls) return { file, cls }
    const binding = bindingsOf(file).get(name)
    return binding?.kind === 'symbol' ? findInFile(binding.file, binding.name, depth + 1) : null
  }
  const resolveName = (file: string, expr: string): ResolvedView | null => {
    const target = resolveDotted(ctx, file, expr)
    const found = target ? findInFile(target.file, target.name) : null
    if (found) return found
    const indexed = models.get(expr.split('.').pop() ?? expr)
    return indexed ? { file: indexed.file, cls: indexed.cls } : null
  }

  /** Class plus its project-defined ancestors, nearest first. */
  const lineage = (cls: PyClass, seen = new Set<string>()): PyClass[] => {
    if (seen.has(cls.name)) return []
    seen.add(cls.name)
    return [cls, ...cls.bases.flatMap((b) => {
      const parent = models.get(b)
      return parent ? lineage(parent.cls, seen) : []
    })]
  }
  const baseNames = (cls: PyClass) => lineage(cls).flatMap((c) => c.bases.map((b) => b.split('.').pop() ?? b))
  const classAttr = (cls: PyClass, name: string): string | undefined => {
    for (const c of lineage(cls)) {
      const bodyIndent = c.body[0]?.indent
      // `permission_classes = [...]` or annotated `permission_classes: Sequence[...] = [...]`
      const line = c.body.find((l) => l.indent === bodyIndent && new RegExp(`^${name}\\s*(:[^=]+)?=(?!=)`).test(l.text))
      if (line) return line.text.slice(line.text.search(/=(?!=)/) + 1).trim()
    }
    return undefined
  }
  const moduleOfClass = new Map<PyClass, PyModule>()
  for (const module of modules.values()) for (const cls of module.classes) moduleOfClass.set(cls, module)
  const methodsOf = (cls: PyClass) =>
    lineage(cls).flatMap((c) => moduleOfClass.get(c)?.defs.filter((d) => d.className === c.name) ?? [])

  const classAuth = (cls: PyClass): AuthRule => {
    const permissions = classAttr(cls, 'permission_classes')
    if (permissions !== undefined) return permissionRule(permissions)
    const bases = baseNames(cls)
    if (bases.some((b) => /LoginRequiredMixin|PermissionRequiredMixin/.test(b))) return true
    if (lineage(cls).some((c) => c.decorators.some((d) => AUTH_DECORATOR.test(d.text)))) return true
    return bases.some((b) => DRF_VIEW_BASES.test(b)) ? drfGlobalAuth : false
  }
  const serializerBody = (cls: PyClass): unknown => {
    const serializer = classAttr(cls, 'serializer_class')?.trim()
    return serializer && models.isSerializer(serializer) ? models.serializerExample(serializer) : undefined
  }

  const emit = (
    method: HttpMethod,
    path: string,
    source: { file: string; line: number },
    options: { auth: AuthRule; inputs?: RequestInputs; body?: unknown; name?: string; confidence?: CodeScanConfidence; description?: string }
  ) => {
    endpoints.push(
      makeEndpoint({
        method,
        path,
        file: source.file,
        line: source.line,
        framework: 'django',
        confidence: options.confidence ?? 'high',
        auth: options.auth === 'writes' ? !SAFE_METHODS.has(method) : options.auth,
        inputs: options.inputs,
        bodyExample: BODY_METHODS.has(method) ? options.body : undefined,
        operationId: options.name,
        description: options.description
      })
    )
  }

  const emitViewSet = (cls: PyClass, file: string, listPath: string, detailPath: string, actions: Set<Action>, cap: CodeScanConfidence) => {
    const auth = classAuth(cls)
    const body = serializerBody(cls)
    const methods = methodsOf(cls)
    for (const action of actions) {
      const { method, detail } = ACTION_ROUTES[action]
      const def = methods.find((d) => d.name === action)
      emit(method, detail ? detailPath : listPath, { file, line: def?.line ?? cls.line }, {
        auth,
        body,
        inputs: def ? scanRequestUsage(def.body) : undefined,
        name: `${cls.name}.${action}`,
        confidence: cap
      })
    }
    // Extra endpoints: @action(detail=True, methods=['post'], url_path='set-password')
    for (const def of methods) {
      const decorator = def.decorators.map((d) => parseCall(d.text)).find((c) => c && /(^|\.)action$/.test(c.callee))
      if (!decorator) continue
      const detail = decorator.keywords.get('detail') === 'True'
      const urlPath = pyString(decorator.keywords.get('url_path')) ?? def.name
      const actionMethods = (pyStringList(decorator.keywords.get('methods')) ?? ['get']).map((m) => m.toUpperCase() as HttpMethod)
      const base = detail ? detailPath : listPath
      const path = joinExactPaths(base, listPath.endsWith('/') ? `${urlPath}/` : urlPath)
      const permissions = decorator.keywords.get('permission_classes')
      for (const method of actionMethods) {
        emit(method, path, { file, line: def.line }, {
          auth: permissions !== undefined ? permissionRule(permissions) : auth,
          body,
          inputs: scanRequestUsage(def.body),
          name: `${cls.name}.${def.name}`,
          confidence: cap
        })
      }
    }
  }

  const viewsetActions = (cls: PyClass): Set<Action> => {
    const actions = new Set<Action>()
    for (const base of baseNames(cls)) for (const [re, list] of VIEWSET_ACTIONS) if (re.test(base)) list.forEach((a) => actions.add(a))
    for (const def of methodsOf(cls)) if (def.name in ACTION_ROUTES) actions.add(def.name as Action)
    return actions
  }

  const emitRouter = (file: string, routerExpr: string, prefix: string, cap: CodeScanConfidence) => {
    let routerFile = file
    let routerName = routerExpr
    const binding = bindingsOf(file).get(routerExpr.split('.')[0])
    if (!byFile.get(file)?.routers.has(routerExpr) && binding) {
      routerFile = binding.file
      routerName = binding.kind === 'symbol' ? binding.name : routerExpr.split('.').slice(1).join('.')
    }
    const router = byFile.get(routerFile)?.routers.get(routerName)
    if (!router) return
    const slash = router.trailingSlash ? '/' : ''
    for (const reg of router.registrations) {
      const view = resolveName(routerFile, reg.viewset)
      if (!view?.cls) continue
      const lookup = pyString(classAttr(view.cls, 'lookup_field')) ?? 'pk'
      const listPath = joinExactPaths(prefix, `${reg.prefix}${slash}`)
      const detailPath = joinExactPaths(prefix, `${reg.prefix}/:${lookup}${slash}`)
      emitViewSet(view.cls, view.file, listPath, detailPath, viewsetActions(view.cls), cap)
    }
  }

  const emitView = (file: string, expr: string, path: string, line: number, cap: CodeScanConfidence) => {
    const asView = expr.match(/^([\w.]+)\s*\.as_view\s*\(([\s\S]*)\)\s*$/)
    const name = asView ? asView[1] : expr
    const view = resolveName(file, name)
    if (!view) {
      emit('GET', path, { file, line }, { auth: false, confidence: 'low', description: `View ${name} is defined outside this project.` })
      return
    }
    if (view.cls) {
      const mapping = asView?.[2].trim().startsWith('{') ? asView[2].trim() : null
      if (mapping) {
        // ViewSet wired by hand: .as_view({'get': 'list', 'post': 'create'})
        const methods = splitTopLevel(mapping.slice(1, -1)).flatMap((pair) => {
          const [k] = splitTopLevel(pair, ':')
          const method = pyString(k)?.toUpperCase()
          return method ? [method as HttpMethod] : []
        })
        const auth = classAuth(view.cls)
        const body = serializerBody(view.cls)
        for (const method of methods) emit(method, path, { file: view.file, line: view.cls.line }, { auth, body, name: view.cls.name, confidence: cap })
        return
      }
      const methods = new Set<HttpMethod>()
      for (const base of baseNames(view.cls)) for (const [re, list] of VIEW_METHODS) if (re.test(base)) list.forEach((m) => methods.add(m))
      const defs = methodsOf(view.cls)
      for (const def of defs) if (HTTP_METHOD_NAMES.has(def.name)) methods.add(def.name.toUpperCase() as HttpMethod)
      if (methods.size === 0) methods.add('GET')
      const auth = classAuth(view.cls)
      const body = serializerBody(view.cls)
      for (const method of methods) {
        const def = defs.find((d) => d.name === method.toLowerCase())
        emit(method, path, { file: view.file, line: def?.line ?? view.cls.line }, {
          auth,
          body,
          inputs: def ? scanRequestUsage(def.body) : undefined,
          name: def ? `${view.cls.name}.${def.name}` : view.cls.name,
          confidence: cap
        })
      }
      return
    }

    const def = view.def!
    const decorators = def.decorators.map((d) => d.text)
    let methods: HttpMethod[] | null = null
    for (const text of decorators) {
      const call = parseCall(text)
      const callee = call?.callee.split('.').pop() ?? text.split('(')[0].split('.').pop()
      if ((callee === 'api_view' || callee === 'require_http_methods') && call) {
        methods = (pyStringList(call.positional[0] ?? call.keywords.get('http_method_names')) ?? ['GET']).map((m) => m.toUpperCase() as HttpMethod)
      } else if (callee === 'require_POST') methods = ['POST']
      else if (callee === 'require_GET' || callee === 'require_safe') methods = ['GET']
    }
    const isApiView = decorators.some((d) => /^(\w+\.)?api_view\b/.test(d))
    if (!methods) {
      const found = new Set<HttpMethod>(['GET'])
      const bodyText = def.body.map((l) => l.text).join('\n')
      for (const m of bodyText.matchAll(/request\.method\s*(?:==|!=|in)\s*[([]?\s*['"](\w+)['"]/g)) found.add(m[1].toUpperCase() as HttpMethod)
      methods = [...found]
    }
    const permissionDecorator = decorators.find((d) => /^(\w+\.)?permission_classes\b/.test(d))
    const auth: AuthRule = decorators.some((d) => AUTH_DECORATOR.test(d.split('(')[0]))
      ? true
      : permissionDecorator
        ? permissionRule(permissionDecorator)
        : isApiView && drfGlobalAuth
    const inputs = scanRequestUsage(def.body)
    for (const method of methods) emit(method, path, { file: view.file, line: def.line }, { auth, inputs, name: def.name, confidence: cap })
  }

  const walked = new Set<string>()
  const walkUrls = (file: string, entries: UrlEntry[], prefix: string, cap: CodeScanConfidence, depth: number) => {
    if (depth > 12) return
    for (const entry of entries) {
      const path = joinExactPaths(prefix, entry.route)
      const target = entry.target
      if (target.kind === 'view') emitView(file, target.expr, path, entry.line, cap)
      else if (target.kind === 'include-router') emitRouter(file, target.router, path, cap)
      else if (target.kind === 'include-list') walkUrls(file, target.entries, path, cap, depth + 1)
      else {
        let included: string | null = null
        if (target.module.startsWith('@binding:')) {
          const binding = bindingsOf(file).get(target.module.slice('@binding:'.length).split('.')[0])
          included = binding?.kind === 'module' ? binding.file : null
        } else {
          included = index.resolveModule(file, target.module)
        }
        const facts = included ? byFile.get(included) : undefined
        if (facts?.urlpatterns) {
          walked.add(facts.file)
          walkUrls(facts.file, facts.urlpatterns, path, cap, depth + 1)
        }
      }
    }
  }

  const urlFiles = allFacts.filter((f) => f.urlpatterns)
  const includedFiles = new Set<string>()
  const collectIncludes = (file: string, entries: UrlEntry[]) => {
    for (const entry of entries) {
      if (entry.target.kind === 'include-module' && !entry.target.module.startsWith('@binding:')) {
        const target = index.resolveModule(file, entry.target.module)
        if (target) includedFiles.add(target)
      } else if (entry.target.kind === 'include-module') {
        const binding = bindingsOf(file).get(entry.target.module.slice('@binding:'.length).split('.')[0])
        if (binding?.kind === 'module') includedFiles.add(binding.file)
      } else if (entry.target.kind === 'include-list') {
        collectIncludes(file, entry.target.entries)
      }
    }
  }
  for (const facts of urlFiles) collectIncludes(facts.file, facts.urlpatterns!)

  const settings = allFacts.find((f) => f.rootUrlconf)
  const rootFile = settings?.rootUrlconf ? index.resolveModule(settings.file, settings.rootUrlconf) : null
  const root = urlFiles.find((f) => f.file === rootFile)
  if (root) {
    walked.add(root.file)
    walkUrls(root.file, root.urlpatterns!, '', 'high', 0)
  }
  for (const facts of urlFiles) {
    if (walked.has(facts.file) || includedFiles.has(facts.file)) continue
    walked.add(facts.file)
    // Without ROOT_URLCONF, top-level URLconfs are the roots; with it, these are probably unused.
    walkUrls(facts.file, facts.urlpatterns!, '', root ? 'low' : 'high', 0)
  }
  return endpoints
}
