/**
 * Express / Fastify route extraction using the TypeScript compiler API (parse only, nothing runs).
 *
 * Works in two steps so a large project can be parsed file by file:
 *  1. `collectServerFacts` — per file: routers/apps, routes on them, mounts (`use`/`register`),
 *     exports and listen ports.
 *  2. `linkServerRoutes` — across files: follows imports and mounts from the root app down,
 *     joining prefixes, and emits one endpoint per route.
 */
import ts from 'typescript'
import type { HttpMethod } from '../../../types/api-studio'
import type { CodeScanConfidence, CodeScanWarning, DetectedEndpoint } from '../../../types/code-scanner'
import { joinRoutePaths, normalizeRoutePath } from '../paths'
import { addInput, emptyInputs, makeEndpoint, type RequestInputs } from './common'
import { readRequestInputs } from './request-inputs'
import { createValidatorReader, VALIDATOR_PACKAGES } from './validator-example'
import { attachSchema, mergeExamples, mergeSchemas, schemaOf } from '../../body-schema'
import {
  dynamicImportSpecifier,
  hasModifier,
  isFunctionNode,
  lineOf as nodeLine,
  propertyName,
  requireSpecifier,
  skipOuter,
  type FunctionNode
} from './ts-utils'

export type RouterKind = 'app' | 'router' | 'fastify' | 'param'

export type RouterRef =
  | { kind: 'local'; id: string }
  | { kind: 'import'; file: string | null; exportName: string }

export interface RouteFact {
  routerId: string
  method: HttpMethod | 'ALL'
  path: string
  line: number
  /** Path came from a constant/template rather than a plain string literal. */
  computed: boolean
  auth: boolean
  handlerName?: string
  inputs: RequestInputs
  framework: 'express' | 'fastify'
  /** Body example from a validation schema (zod/joi/yup/TypeBox/JSON Schema). */
  bodyExample?: unknown
  /** `basicAuth()` middleware: credentials go in a Basic header. */
  basicAuth?: boolean
  /** Schemas imported from other files, resolved when linking. */
  schemaImports?: Array<{ file: string | null; exportName: string; target: 'body' | 'query' }>
}

export interface MountFact {
  parentId: string
  prefix: string
  prefixResolved: boolean
  target: RouterRef
  auth: boolean
  line: number
}

export interface RouterFact {
  id: string
  kind: RouterKind
  line: number
  /** Router-wide auth middleware (`router.use(requireAuth)`). */
  auth: boolean
}

export interface ServerFileFacts {
  file: string
  routers: RouterFact[]
  routes: RouteFact[]
  mounts: MountFact[]
  /** Export name (`default` for `export default` / `module.exports`) → router it exposes. */
  exports: Map<string, RouterRef>
  /** Files re-exported with `export * from`. */
  starExports: string[]
  ports: number[]
  /** Fastify autoload `export const autoPrefix = '/x'`: prefix for the plugins this file defines. */
  autoPrefix?: string
  /** Examples of schemas defined at the top level of this file, by name (for importers). */
  schemaExamples: Map<string, unknown>
  /** Request schema groups (`const register = { body: Joi.object(…), query: … }`), by name. */
  schemaGroups: Map<string, SchemaGroup>
  warnings: CodeScanWarning[]
}

export interface SchemaGroup {
  body?: unknown
  query?: string[]
}

/** Rules of one express-validator chain: `body('email').isEmail()`, `body('name').isLength({ min: 2 })`. */
function expressValidatorRules(field: string, chain: string): ReturnType<typeof schemaOf> {
  const property: NonNullable<ReturnType<typeof schemaOf>> = /isEmail/.test(chain)
    ? { type: 'string', format: 'email' }
    : /isUUID/.test(chain)
      ? { type: 'string', format: 'uuid' }
      : /isInt/.test(chain)
        ? { type: 'integer' }
        : /is(Numeric|Float|Decimal)/.test(chain)
          ? { type: 'number' }
          : /isBoolean/.test(chain)
            ? { type: 'boolean' }
            : /is(String|Length)|notEmpty/.test(chain)
              ? { type: 'string' }
              : {}
  const min = chain.match(/isLength\(\s*\{[^}]*\bmin\s*:\s*(\d+)/)?.[1]
  const max = chain.match(/isLength\(\s*\{[^}]*\bmax\s*:\s*(\d+)/)?.[1]
  if (min) property.minLength = Number(min)
  if (max) property.maxLength = Number(max)
  if (/notEmpty\(/.test(chain) && !min) property.minLength = 1
  // A field without `.optional()` fails validation when it is missing.
  return mergeSchemas({ type: 'object', properties: { [field]: property } }, /\.optional\(/.test(chain) ? undefined : { required: [field] })
}

/** Resolves an import specifier to a project-relative file, or null for packages / missing files. */
export type ImportResolver = (fromFile: string, specifier: string) => string | null

const ROUTE_METHODS: Record<string, HttpMethod | 'ALL'> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  options: 'OPTIONS',
  head: 'HEAD',
  all: 'ALL'
}

const ROUTER_PARAM_NAMES = /^(app|router|server|fastify|instance)$/
const ROUTER_TYPE_NAMES = /\b(Express|Application|Router|FastifyInstance)\b/
const AUTH_HINT =
  /auth|protect|jwt|passport|guard|verify(Token|User|Jwt|Session)|require(d)?(User|Login|Auth|Admin)|isLoggedIn|ensureLoggedIn/i
/** Middleware that mentions auth but doesn't require it (`auth.optional`, `passport.initialize()`, `authLimiter`). */
const NOT_AUTH = /optional|initiali[sz]e|limit|session|cors|csrf/i
const PLUGIN_WRAPPERS = /^(fp|fastifyPlugin)$/
/** Router/app methods that return the same instance, so `Router().use(a).use(b)` is one router. */
const CHAINABLE_METHODS = new Set([
  ...Object.keys(ROUTE_METHODS),
  'use',
  'register',
  'set',
  'enable',
  'disable',
  'param',
  'addHook',
  'decorate',
  'withTypeProvider'
])
const LOOP_METHODS = new Set(['forEach', 'map'])
const FASTIFY_HOOK_PROPS = new Set(['preHandler', 'onRequest', 'preValidation'])
const PREFIX_NAME = /prefix|path|base|url/i
/** Names that point at routers/controllers even when they also mention auth (`authRoutes`). */
const ROUTER_NAME = /rout(e|er|es)|controller/i

/** Reference that may still point at a function whose router is only known after the walk. */
type PartialRef = RouterRef | { kind: 'fn'; node: FunctionNode; preferReturn: boolean }

export function collectServerFacts(sf: ts.SourceFile, resolveImport: ImportResolver): ServerFileFacts {
  const file = sf.fileName
  const text = sf.text
  const facts: ServerFileFacts = {
    file,
    routers: [],
    routes: [],
    mounts: [],
    exports: new Map(),
    starExports: [],
    ports: [],
    schemaExamples: new Map(),
    schemaGroups: new Map(),
    warnings: []
  }
  const lineOf = (node: ts.Node) => nodeLine(sf, node)
  const warn = (message: string, node: ts.Node) => facts.warnings.push({ message, file, line: lineOf(node) })

  // ── Pass 1: module-level bindings ────────────────────────────────────────
  const expressNames = new Set<string>(['express'])
  const routerFactoryNames = new Set<string>()
  const fastifyNames = new Set<string>()
  const imports = new Map<string, { file: string | null; exportName: string }>()
  const consts = new Map<string, ts.Expression>()
  const functionsByName = new Map<string, FunctionNode>()
  const validatorNames = new Set<string>()
  /** `body`, `check`, `query`, … imported from express-validator. */
  const expressValidatorNames = new Map<string, 'body' | 'query'>()

  const bindPackage = (spec: string, local: string, imported: string) => {
    if (VALIDATOR_PACKAGES.has(spec)) validatorNames.add(local)
    if (spec === 'express-validator') {
      if (['body', 'check', 'checkBody'].includes(imported)) expressValidatorNames.set(local, 'body')
      if (['query', 'checkQuery'].includes(imported)) expressValidatorNames.set(local, 'query')
    }
  }

  const bindRequire = (name: ts.BindingName, spec: string, member?: string) => {
    if (ts.isIdentifier(name)) bindPackage(spec, name.text, member ?? 'default')
    else if (ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        const orig = propertyName(el.propertyName ?? el.name)
        if (orig && ts.isIdentifier(el.name)) bindPackage(spec, el.name.text, orig)
      }
    }
    if (spec === 'express') {
      if (ts.isIdentifier(name)) (member === 'Router' ? routerFactoryNames : expressNames).add(name.text)
      else if (ts.isObjectBindingPattern(name)) {
        for (const el of name.elements) {
          const orig = propertyName(el.propertyName ?? el.name)
          if (orig === 'Router' && ts.isIdentifier(el.name)) routerFactoryNames.add(el.name.text)
        }
      }
      return
    }
    if (spec === 'fastify') {
      if (ts.isIdentifier(name) && (!member || member === 'default' || member === 'fastify')) fastifyNames.add(name.text)
      return
    }
    const target = resolveImport(file, spec)
    if (!target) return
    if (ts.isIdentifier(name)) imports.set(name.text, { file: target, exportName: member ?? 'default' })
    else if (ts.isObjectBindingPattern(name) && !member) {
      for (const el of name.elements) {
        const orig = propertyName(el.propertyName ?? el.name)
        if (orig && ts.isIdentifier(el.name)) imports.set(el.name.text, { file: target, exportName: orig })
      }
    }
  }

  const unwrapFunction = (expr: ts.Expression): FunctionNode | null => {
    const e = skipOuter(expr)
    if (isFunctionNode(e)) return e
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && PLUGIN_WRAPPERS.test(e.expression.text) && e.arguments[0]) {
      return unwrapFunction(e.arguments[0])
    }
    return null
  }

  const collect = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause) {
      const spec = node.moduleSpecifier.text
      const clause = node.importClause
      const named = clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : []
      const namespace =
        clause.namedBindings && ts.isNamespaceImport(clause.namedBindings) ? clause.namedBindings.name.text : null
      if (clause.name) bindPackage(spec, clause.name.text, 'default')
      if (namespace) bindPackage(spec, namespace, '*')
      for (const el of named) bindPackage(spec, el.name.text, (el.propertyName ?? el.name).text)
      if (spec === 'express') {
        if (clause.name) expressNames.add(clause.name.text)
        if (namespace) expressNames.add(namespace)
        for (const el of named) if ((el.propertyName ?? el.name).text === 'Router') routerFactoryNames.add(el.name.text)
      } else if (spec === 'fastify') {
        if (clause.name) fastifyNames.add(clause.name.text)
        for (const el of named) {
          if (['fastify', 'Fastify', 'default'].includes((el.propertyName ?? el.name).text)) fastifyNames.add(el.name.text)
        }
      } else {
        const target = resolveImport(file, spec)
        if (target) {
          if (clause.name) imports.set(clause.name.text, { file: target, exportName: 'default' })
          if (namespace) imports.set(namespace, { file: target, exportName: '*' })
          for (const el of named) imports.set(el.name.text, { file: target, exportName: (el.propertyName ?? el.name).text })
        }
      }
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = skipOuter(node.initializer)
      const spec = requireSpecifier(init)
      if (spec) bindRequire(node.name, spec)
      else if (ts.isPropertyAccessExpression(init)) {
        const memberSpec = requireSpecifier(init.expression)
        if (memberSpec) bindRequire(node.name, memberSpec, init.name.text)
      }
      if (ts.isIdentifier(node.name)) {
        if (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const && !consts.has(node.name.text)) {
          consts.set(node.name.text, node.initializer)
        }
        const fn = unwrapFunction(init)
        if (fn && !functionsByName.has(node.name.text)) functionsByName.set(node.name.text, fn)
      }
    } else if (ts.isFunctionDeclaration(node) && node.name && !functionsByName.has(node.name.text)) {
      functionsByName.set(node.name.text, node)
    }
    ts.forEachChild(node, collect)
  }
  collect(sf)

  const validators = createValidatorReader(validatorNames, (name) => consts.get(name))
  const hasValidators = validatorNames.size > 0

  /** `{ body: Schema, query: Schema }` — the shape many `validate(...)` middlewares take. */
  const schemaGroup = (expr: ts.Expression, depth = 0): SchemaGroup | null => {
    const e = skipOuter(expr)
    if (ts.isIdentifier(e) && depth < 4) {
      const value = consts.get(e.text)
      return value ? schemaGroup(value, depth + 1) : null
    }
    if (!ts.isObjectLiteralExpression(e)) return null
    const group: SchemaGroup = {}
    for (const p of e.properties) {
      if (!ts.isPropertyAssignment(p)) continue
      const key = propertyName(p.name) ?? ''
      if (key === 'body') group.body = validators.example(p.initializer)
      else if (key === 'query' || key === 'querystring') group.query = validators.fields(p.initializer)
    }
    return group.body !== undefined || group.query?.length ? group : null
  }

  if (hasValidators) {
    for (const statement of sf.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
        const group = schemaGroup(decl.initializer)
        if (group) {
          facts.schemaGroups.set(decl.name.text, group)
          continue
        }
        const value = validators.example(decl.initializer)
        if (value !== undefined) facts.schemaExamples.set(decl.name.text, value)
      }
    }
  }

  const evalString = (expr: ts.Expression, depth = 0): string | null => {
    if (depth > 8) return null
    const e = skipOuter(expr)
    if (ts.isStringLiteralLike(e)) return e.text
    if (ts.isTemplateExpression(e)) {
      let out = e.head.text
      for (const span of e.templateSpans) {
        const value = evalString(span.expression, depth + 1)
        if (value === null) return null
        out += value + span.literal.text
      }
      return out
    }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = evalString(e.left, depth + 1)
      const right = left === null ? null : evalString(e.right, depth + 1)
      return left === null || right === null ? null : left + right
    }
    if (ts.isIdentifier(e)) {
      const value = consts.get(e.text)
      return value ? evalString(value, depth + 1) : null
    }
    return null
  }

  const evalPort = (expr: ts.Expression, depth = 0): number | null => {
    if (depth > 8) return null
    const e = skipOuter(expr)
    if (ts.isNumericLiteral(e) || ts.isStringLiteralLike(e)) {
      const n = Number(e.text)
      return Number.isInteger(n) && n > 0 && n < 65536 ? n : null
    }
    if (
      ts.isBinaryExpression(e) &&
      (e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      return evalPort(e.right, depth + 1) ?? evalPort(e.left, depth + 1)
    }
    if (ts.isIdentifier(e)) {
      const value = consts.get(e.text)
      return value ? evalPort(value, depth + 1) : null
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && ['Number', 'parseInt'].includes(e.expression.text) && e.arguments[0]) {
      return evalPort(e.arguments[0], depth + 1)
    }
    if (ts.isObjectLiteralExpression(e)) {
      for (const prop of e.properties) {
        if (ts.isPropertyAssignment(prop) && propertyName(prop.name) === 'port') return evalPort(prop.initializer, depth + 1)
        if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'port') {
          const value = consts.get('port')
          return value ? evalPort(value, depth + 1) : null
        }
      }
    }
    return null
  }

  // ── Pass 2: routers, routes, mounts, exports (with function scopes) ───────
  const scopes: Map<string, string>[] = [new Map()]
  const routerById = new Map<string, RouterFact>()
  const routerParamName = new Map<string, string>()
  const fnParamRouter = new Map<FunctionNode, string>()
  const fnReturnRouter = new Map<FunctionNode, string>()
  const fnStack: FunctionNode[] = []
  const pendingMounts: Array<Omit<MountFact, 'target'> & { target: PartialRef }> = []
  const pendingExports: Array<{ name: string; ref: PartialRef }> = []
  const exportedLocalNames: Array<{ exportName: string; localName: string }> = []
  const fastifyFile = fastifyNames.size > 0 || /from ['"]fastify['"]|require\(['"]fastify['"]\)/.test(text)

  const lookupRouter = (name: string): string | undefined => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const id = scopes[i].get(name)
      if (id) return id
    }
    return undefined
  }

  const routerByNode = new Map<ts.Node, string>()

  const createRouter = (name: string, kind: RouterKind, node: ts.Node): string => {
    const id = `${file}#${name}:${lineOf(node)}:${node.getStart(sf)}`
    if (!routerById.has(id)) {
      const fact: RouterFact = { id, kind, line: lineOf(node), auth: false }
      routerById.set(id, fact)
      facts.routers.push(fact)
    }
    return id
  }

  const declareParamRouter = (param: ts.ParameterDeclaration & { name: ts.Identifier }): string => {
    const id = createRouter(param.name.text, 'param', param)
    routerParamName.set(id, param.name.text)
    scopes[scopes.length - 1].set(param.name.text, id)
    return id
  }

  const factoryKind = (expr: ts.Expression): RouterKind | null => {
    const e = skipOuter(expr)
    if (!ts.isCallExpression(e) && !ts.isNewExpression(e)) return null
    const callee = skipOuter(e.expression)
    if (ts.isIdentifier(callee)) {
      if (expressNames.has(callee.text)) return 'app'
      if (routerFactoryNames.has(callee.text)) return 'router'
      if (fastifyNames.has(callee.text)) return 'fastify'
      return null
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const obj = skipOuter(callee.expression)
      if (callee.name.text === 'Router' && ((ts.isIdentifier(obj) && expressNames.has(obj.text)) || requireSpecifier(obj) === 'express')) {
        return 'router'
      }
      return null
    }
    const spec = requireSpecifier(callee)
    if (spec === 'express') return 'app'
    if (spec === 'fastify') return 'fastify'
    return null
  }

  /** The router created by an `express()` / `Router()` / `Fastify()` call (one per call site). */
  const routerForFactory = (expr: ts.Expression, name = 'router'): string | undefined => {
    const e = skipOuter(expr)
    const kind = factoryKind(e)
    if (!kind) return undefined
    const existing = routerByNode.get(e)
    if (existing) return existing
    const id = createRouter(name, kind, e)
    routerByNode.set(e, id)
    return id
  }

  /** Router an expression refers to: `app`, `this.router`, `new Routes().router`, `Router().use(x)`. */
  const receiverRouter = (expr: ts.Expression): string | undefined => {
    const e = skipOuter(expr)
    if (ts.isIdentifier(e)) return lookupRouter(e.text)
    if (ts.isPropertyAccessExpression(e)) {
      const obj = skipOuter(e.expression)
      if (obj.kind === ts.SyntaxKind.ThisKeyword || ts.isNewExpression(obj)) return lookupRouter(`this.${e.name.text}`)
      return undefined
    }
    if (ts.isCallExpression(e) || ts.isNewExpression(e)) {
      const created = routerForFactory(e)
      if (created) return created
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && CHAINABLE_METHODS.has(e.expression.name.text)) {
        return receiverRouter(e.expression.expression)
      }
    }
    return undefined
  }

  /** Router assigned to a binding: a fresh instance named after it, or an existing router (alias/chain). */
  const routerForInitializer = (init: ts.Expression, name: string): string | undefined =>
    routerForFactory(init, name) ?? receiverRouter(init)

  const partialRef = (expr: ts.Expression, preferReturn = false): PartialRef | null => {
    const e = skipOuter(expr)
    const local = receiverRouter(e)
    if (local) return { kind: 'local', id: local }
    const fn = unwrapFunction(e)
    if (fn) return { kind: 'fn', node: fn, preferReturn }
    if (ts.isIdentifier(e)) {
      const named = functionsByName.get(e.text)
      if (named) return { kind: 'fn', node: named, preferReturn }
      const imported = imports.get(e.text)
      if (imported && imported.exportName !== '*') return { kind: 'import', ...imported }
      return null
    }
    const spec = requireSpecifier(e) ?? dynamicImportSpecifier(e)
    if (spec) return { kind: 'import', file: resolveImport(file, spec), exportName: 'default' }
    if (ts.isPropertyAccessExpression(e)) {
      const obj = skipOuter(e.expression)
      const objSpec = requireSpecifier(obj)
      if (objSpec) return { kind: 'import', file: resolveImport(file, objSpec), exportName: e.name.text }
      if (ts.isIdentifier(obj)) {
        const imported = imports.get(obj.text)
        if (imported && (imported.exportName === '*' || imported.exportName === 'default')) {
          return { kind: 'import', file: imported.file, exportName: e.name.text }
        }
      }
      return null
    }
    // Router factory call: `app.use('/users', createUserRouter(db))`.
    if (ts.isCallExpression(e)) return partialRef(e.expression, true)
    return null
  }

  /**
   * Judged by the middleware's own name only — `auth('admin')` → `auth`, `passport.authenticate('jwt')`
   * → `passport.authenticate` — so arguments like `validate(authValidation.login)` don't count.
   */
  const isAuthMiddleware = (expr: ts.Expression): boolean => {
    const e = skipOuter(expr)
    if (ts.isObjectLiteralExpression(e)) {
      return e.properties.some(
        (p) => ts.isPropertyAssignment(p) && FASTIFY_HOOK_PROPS.has(propertyName(p.name) ?? '') && isAuthMiddleware(p.initializer)
      )
    }
    if (ts.isArrayLiteralExpression(e)) return e.elements.some((el) => isAuthMiddleware(el))
    if (ts.isCallExpression(e)) return isAuthMiddleware(e.expression)
    if (!ts.isIdentifier(e) && !ts.isPropertyAccessExpression(e)) return false
    const name = e.getText(sf)
    return AUTH_HINT.test(name) && !ROUTER_NAME.test(name) && !NOT_AUTH.test(name)
  }

  const resolveHandler = (expr: ts.Expression, depth = 0): FunctionNode | null => {
    if (depth > 3) return null
    const e = skipOuter(expr)
    if (isFunctionNode(e)) return e
    if (ts.isIdentifier(e)) return functionsByName.get(e.text) ?? null
    // Wrappers such as `asyncHandler(async (req, res) => …)`.
    if (ts.isCallExpression(e) && e.arguments[0]) return resolveHandler(e.arguments[0], depth + 1)
    return null
  }

  const handlerName = (expr: ts.Expression): string | undefined => {
    const e = skipOuter(expr)
    if (ts.isIdentifier(e)) return e.text
    if (ts.isPropertyAccessExpression(e)) return e.name.text
    if ((ts.isFunctionExpression(e) || ts.isFunctionDeclaration(e)) && e.name) return e.name.text
    if (ts.isCallExpression(e) && e.arguments[0]) return handlerName(e.arguments[0])
    return undefined
  }

  const analyzeHandler = (expr: ts.Expression | undefined): RequestInputs => {
    const fn = expr ? resolveHandler(expr) : null
    return fn ? readRequestInputs(fn) : emptyInputs()
  }

  const evalPaths = (expr: ts.Expression): { paths: string[]; computed: boolean } | null => {
    const e = skipOuter(expr)
    if (ts.isArrayLiteralExpression(e)) {
      const paths = e.elements.map((el) => evalString(el))
      return paths.every((p): p is string => p !== null) ? { paths, computed: true } : null
    }
    const value = evalString(e)
    return value === null ? null : { paths: [value], computed: !ts.isStringLiteralLike(e) }
  }

  const frameworkFor = (routerId: string): 'express' | 'fastify' => {
    const kind = routerById.get(routerId)?.kind
    if (kind === 'fastify') return 'fastify'
    if (kind === 'param' && (fastifyFile || /^(fastify|instance)$/.test(routerParamName.get(routerId) ?? ''))) return 'fastify'
    return 'express'
  }

  const addRoutes = (
    routerId: string,
    method: HttpMethod | 'ALL',
    pathArg: ts.Expression,
    rest: readonly ts.Expression[],
    node: ts.Node
  ) => {
    if (ts.isRegularExpressionLiteral(skipOuter(pathArg))) {
      warn(`Skipped ${method} route with a regular-expression path`, node)
      return
    }
    const evaluated = evalPaths(pathArg)
    if (!evaluated) {
      warn(`Could not resolve the path of a ${method} route (${pathArg.getText(sf).slice(0, 60)})`, node)
      return
    }
    const handler = rest[rest.length - 1]
    const middlewares = rest.slice(0, -1)
    const auth = middlewares.some(isAuthMiddleware)
    const basicAuth = middlewares.some((m) => isAuthMiddleware(m) && /basic/i.test(m.getText(sf)))
    const inputs = analyzeHandler(handler)
    const schemas = readSchemas(middlewares, handler, inputs)
    for (const path of evaluated.paths) {
      // `app.options('*', cors())` answers CORS preflights; it isn't an endpoint anyone calls.
      if (method === 'OPTIONS' && (path === '*' || path === '/*')) continue
      facts.routes.push({
        routerId,
        method,
        path,
        line: lineOf(node),
        computed: evaluated.computed,
        auth,
        handlerName: handler ? handlerName(handler) : undefined,
        inputs,
        framework: frameworkFor(routerId),
        ...schemas,
        ...(basicAuth ? { basicAuth } : {})
      })
    }
  }

  // ── Validation schemas ───────────────────────────────────────────────────

  type SchemaTarget = 'body' | 'query'
  const PARSE_METHODS = new Set(['parse', 'safeParse', 'parseAsync', 'safeParseAsync', 'validate', 'validateAsync', 'validateSync', 'cast', 'Check', 'assert'])

  /** A schema expression here, or an imported one resolved later. */
  const schemaRef = (
    expr: ts.Expression
  ): { value: unknown } | { file: string | null; exportName: string } | null => {
    const e = skipOuter(expr)
    if (ts.isIdentifier(e) && imports.has(e.text) && !consts.has(e.text)) {
      const binding = imports.get(e.text)!
      return binding.exportName === '*' ? null : { file: binding.file, exportName: binding.exportName }
    }
    // `schemas.createUser` from `import * as schemas` or a CommonJS `require('./schemas')` object
    const owner = ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) ? imports.get(e.expression.text) : undefined
    if (owner && ts.isPropertyAccessExpression(e) && (owner.exportName === '*' || owner.exportName === 'default')) {
      return { file: owner.file, exportName: e.name.text }
    }
    if (!hasValidators && !ts.isObjectLiteralExpression(e) && !ts.isIdentifier(e)) return null
    const value = validators.example(e)
    return value === undefined ? null : { value }
  }

  /**
   * Request schemas from, in order: Fastify `schema: { body, querystring }` options, validation
   * middleware (`validate(Schema)`, `celebrate({ body })`, `zValidator('json', S)`, express-validator
   * `body('email').isEmail()`), and `Schema.parse(req.body)` inside the handler.
   */
  const readSchemas = (
    middlewares: readonly ts.Expression[],
    handler: ts.Expression | undefined,
    inputs: RequestInputs
  ): Pick<RouteFact, 'bodyExample' | 'schemaImports'> => {
    let bodyExample: unknown
    const schemaImports: NonNullable<RouteFact['schemaImports']> = []
    const applySchema = (expr: ts.Expression, target: SchemaTarget) => {
      const group = schemaGroup(expr)
      if (group) {
        if (group.body !== undefined) bodyExample = group.body
        group.query?.forEach((q) => addInput(inputs, 'query', q))
        return true
      }
      const ref = schemaRef(expr)
      if (!ref) return false
      if ('file' in ref) schemaImports.push({ ...ref, target })
      else if (target === 'body') {
        bodyExample = mergeExamples(bodyExample, ref.value)
      } else if (ref.value && typeof ref.value === 'object') {
        for (const key of Object.keys(ref.value)) addInput(inputs, 'query', key)
      }
      return true
    }
    const targetOf = (key: string): SchemaTarget | null =>
      /^(body|json|form)$/i.test(key) || /BODY/.test(key) ? 'body' : /^(query|querystring)$/i.test(key) || /QUERY/.test(key) ? 'query' : null
    const readObject = (obj: ts.ObjectLiteralExpression) => {
      for (const p of obj.properties) {
        if (!ts.isPropertyAssignment(p)) continue
        const key = propertyName(p.name) ?? (ts.isComputedPropertyName(p.name) ? p.name.expression.getText(sf) : null)
        const target = key ? targetOf(key) : null
        if (target) applySchema(p.initializer, target)
      }
    }

    const visitMiddleware = (arg: ts.Expression): void => {
      const e = skipOuter(arg)
      if (ts.isArrayLiteralExpression(e)) return e.elements.forEach(visitMiddleware)
      if (ts.isObjectLiteralExpression(e)) {
        // Fastify route options: `{ schema: { body, querystring }, preHandler }`
        const schema = objectPropsOf(e).get('schema')
        const resolved = schema && ts.isIdentifier(skipOuter(schema)) ? consts.get((skipOuter(schema) as ts.Identifier).text) : schema
        if (resolved && ts.isObjectLiteralExpression(skipOuter(resolved))) readObject(skipOuter(resolved) as ts.ObjectLiteralExpression)
        return
      }
      if (!ts.isCallExpression(e)) return
      // express-validator: body('email').isEmail().normalizeEmail()
      let root: ts.Expression = e
      while (ts.isCallExpression(root) && ts.isPropertyAccessExpression(root.expression)) root = root.expression.expression
      if (ts.isCallExpression(root) && ts.isIdentifier(root.expression) && expressValidatorNames.has(root.expression.text)) {
        const field = root.arguments[0] && ts.isStringLiteralLike(root.arguments[0]) ? root.arguments[0].text : null
        if (!field) return
        if (expressValidatorNames.get(root.expression.text) === 'query') addInput(inputs, 'query', field)
        else {
          const chain = e.getText(sf)
          const value = /isEmail/.test(chain) ? 'user@example.com' : /is(Int|Numeric|Float|Decimal)/.test(chain) ? 0 : /isBoolean/.test(chain) ? false : ''
          bodyExample = mergeExamples(bodyExample ?? {}, attachSchema({ [field]: value }, expressValidatorRules(field, chain)))
        }
        return
      }
      const calleeText = e.expression.getText(sf)
      const locationArg = e.arguments[0] && ts.isStringLiteralLike(e.arguments[0]) ? e.arguments[0].text : null
      for (const arg of e.arguments) {
        const inner = skipOuter(arg)
        if (ts.isObjectLiteralExpression(inner) && inner.properties.some((p) => p.name && targetOf(propertyName(p.name) ?? p.name.getText(sf)))) {
          readObject(inner)
          continue
        }
        if (ts.isStringLiteralLike(inner)) continue
        const target: SchemaTarget = /query/i.test(calleeText) || (locationArg && /query/i.test(locationArg)) ? 'query' : 'body'
        applySchema(inner, target)
      }
    }
    middlewares.forEach(visitMiddleware)

    // Schema.parse(req.body) / schema.validate(req.query) in the handler
    const fn = handler ? resolveHandler(handler) : null
    if (fn?.body) {
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          PARSE_METHODS.has(node.expression.name.text) &&
          node.arguments[0]
        ) {
          const source = skipOuter(node.arguments[node.expression.name.text === 'Check' ? 1 : 0] ?? node.arguments[0]).getText(sf)
          const target: SchemaTarget | null = /\.body$/.test(source) ? 'body' : /\.query$/.test(source) ? 'query' : null
          if (target) applySchema(node.expression.expression, target)
        }
        ts.forEachChild(node, visit)
      }
      visit(fn.body)
    }
    return { bodyExample, schemaImports: schemaImports.length ? schemaImports : undefined }
  }

  const objectPropsOf = (obj: ts.ObjectLiteralExpression): Map<string, ts.Expression> => {
    const props = new Map<string, ts.Expression>()
    for (const p of obj.properties) {
      if (ts.isPropertyAssignment(p)) {
        const name = propertyName(p.name)
        if (name) props.set(name, p.initializer)
      } else if (ts.isShorthandPropertyAssignment(p)) {
        props.set(p.name.text, p.name)
      }
    }
    return props
  }

  const addFastifyRouteObject = (routerId: string, obj: ts.ObjectLiteralExpression, node: ts.Node) => {
    const props = new Map<string, ts.Expression>()
    for (const p of obj.properties) {
      if (ts.isPropertyAssignment(p)) {
        const name = propertyName(p.name)
        if (name) props.set(name, p.initializer)
      } else if (ts.isShorthandPropertyAssignment(p)) {
        props.set(p.name.text, p.name)
      }
    }
    const methodExpr = props.get('method')
    const urlExpr = props.get('url') ?? props.get('path')
    if (!methodExpr || !urlExpr) return
    const methodValues = ts.isArrayLiteralExpression(skipOuter(methodExpr))
      ? (skipOuter(methodExpr) as ts.ArrayLiteralExpression).elements.map((el) => evalString(el))
      : [evalString(methodExpr)]
    const handler = props.get('handler')
    const auth = isAuthMiddleware(obj)
    const url = evalString(urlExpr)
    if (url === null) {
      warn('Could not resolve the url of a fastify.route() call', node)
      return
    }
    const inputs = analyzeHandler(handler)
    const schemas = readSchemas([obj], handler, inputs)
    for (const raw of methodValues) {
      const method = raw ? ROUTE_METHODS[raw.toLowerCase()] : undefined
      if (!method || method === 'ALL') continue
      facts.routes.push({
        routerId,
        method,
        path: url,
        line: lineOf(node),
        computed: !ts.isStringLiteralLike(skipOuter(urlExpr)),
        auth,
        handlerName: handler ? handlerName(handler) : undefined,
        inputs,
        framework: 'fastify',
        ...schemas
      })
    }
  }

  /** Object literals iterated by the loop that binds `name`: `ROUTES.forEach((r) => …)`, `for (const { path } of ROUTES)`. */
  const loopSource = (name: string, from: ts.Node): { elements: ts.ObjectLiteralExpression[]; binding?: string } | null => {
    const bindingIn = (bound: ts.BindingName): { match: boolean; binding?: string } => {
      if (ts.isIdentifier(bound)) return { match: bound.text === name }
      if (ts.isObjectBindingPattern(bound)) {
        for (const el of bound.elements) {
          if (ts.isIdentifier(el.name) && el.name.text === name) {
            return { match: true, binding: propertyName(el.propertyName ?? el.name) ?? undefined }
          }
        }
      }
      return { match: false }
    }
    const elementsOf = (expr: ts.Expression, depth = 0): ts.ObjectLiteralExpression[] => {
      const e = skipOuter(expr)
      if (depth > 4) return []
      if (ts.isIdentifier(e)) {
        const value = consts.get(e.text)
        return value ? elementsOf(value, depth + 1) : []
      }
      if (!ts.isArrayLiteralExpression(e)) return []
      return e.elements.flatMap((el) =>
        ts.isSpreadElement(el) ? elementsOf(el.expression, depth + 1) : ts.isObjectLiteralExpression(el) ? [el] : []
      )
    }
    for (let current: ts.Node = from; current.parent; current = current.parent) {
      const parent = current.parent
      if (
        (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
        ts.isCallExpression(parent) &&
        parent.arguments[0] === current &&
        ts.isPropertyAccessExpression(parent.expression) &&
        LOOP_METHODS.has(parent.expression.name.text) &&
        current.parameters[0]
      ) {
        const found = bindingIn(current.parameters[0].name)
        if (found.match) return { elements: elementsOf(parent.expression.expression), binding: found.binding }
      }
      if (ts.isForOfStatement(current) && ts.isVariableDeclarationList(current.initializer)) {
        const decl = current.initializer.declarations[0]
        const found = decl ? bindingIn(decl.name) : { match: false }
        if (found.match) return { elements: elementsOf(current.expression), binding: found.binding }
      }
    }
    return null
  }

  /**
   * Expands `router.use(route.path, route.route)` inside a loop over a route table into one
   * argument list per table entry. Returns null when no argument depends on a loop variable.
   */
  const expandLoopArgs = (args: readonly ts.Expression[]): ts.Expression[][] | null => {
    const deps = args.map((arg) => {
      const e = skipOuter(arg)
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
        const source = loopSource(e.expression.text, arg)
        if (source && !source.binding) return { source, property: e.name.text }
      } else if (ts.isIdentifier(e)) {
        const source = loopSource(e.text, arg)
        if (source?.binding) return { source, property: source.binding }
      }
      return null
    })
    const first = deps.find(Boolean)
    if (!first) return null
    const variants: ts.Expression[][] = []
    for (const element of first.source.elements) {
      const values = new Map<string, ts.Expression>()
      for (const p of element.properties) {
        if (ts.isPropertyAssignment(p)) {
          const key = propertyName(p.name)
          if (key) values.set(key, p.initializer)
        } else if (ts.isShorthandPropertyAssignment(p)) {
          values.set(p.name.text, p.name)
        }
      }
      const variant = args.map((arg, i) => (deps[i] ? values.get(deps[i]!.property) : arg))
      if (variant.every((a): a is ts.Expression => Boolean(a))) variants.push(variant)
    }
    return variants
  }

  const handleUse = (routerId: string, args: readonly ts.Expression[], node: ts.Node) => {
    if (args.length === 0) return
    const variants = expandLoopArgs(args)
    if (variants) {
      for (const variant of variants) handleUseArgs(routerId, variant, node)
      return
    }
    handleUseArgs(routerId, args, node)
  }

  const handleUseArgs = (routerId: string, args: readonly ts.Expression[], node: ts.Node) => {
    let prefix = ''
    let prefixResolved = true
    let rest = args
    const first = skipOuter(args[0])
    const firstValue = evalString(first)
    if (firstValue !== null) {
      prefix = firstValue
      rest = args.slice(1)
    } else if (
      args.length >= 2 &&
      !receiverRouter(first) &&
      !isFunctionNode(first) &&
      (ts.isTemplateExpression(first) ||
        ts.isBinaryExpression(first) ||
        (ts.isPropertyAccessExpression(first) && PREFIX_NAME.test(first.name.text)) ||
        (ts.isIdentifier(first) &&
          (PREFIX_NAME.test(first.text) || /^[A-Z][A-Z0-9_]*$/.test(first.text)) &&
          !functionsByName.has(first.text)))
    ) {
      prefixResolved = false
      rest = args.slice(1)
      warn(`Could not resolve mount prefix ${first.getText(sf).slice(0, 60)}; routes below it are shown without it`, node)
    }

    if (rest.length === 0) return
    if (rest.every(isAuthMiddleware)) {
      // `router.use(requireAuth)` — protects everything registered on this router.
      const router = routerById.get(routerId)
      if (router && !prefix) router.auth = true
      return
    }
    // Middleware comes before the router: `app.use('/admin', requireAdmin, adminRouter)`.
    const auth = rest.slice(0, -1).some(isAuthMiddleware)
    for (const target of rest) {
      const ref = partialRef(target)
      if (ref) pendingMounts.push({ parentId: routerId, prefix, prefixResolved, target: ref, auth, line: lineOf(node) })
    }
  }

  const handleRegister = (routerId: string, args: readonly ts.Expression[], node: ts.Node) => {
    const ref = partialRef(args[0])
    if (!ref) return
    let prefix = ''
    let prefixResolved = true
    const opts = args[1] ? skipOuter(args[1]) : undefined
    if (opts && ts.isObjectLiteralExpression(opts)) {
      for (const p of opts.properties) {
        if (ts.isPropertyAssignment(p) && propertyName(p.name) === 'prefix') {
          const value = evalString(p.initializer)
          if (value === null) {
            prefixResolved = false
            warn(`Could not resolve register prefix ${p.initializer.getText(sf).slice(0, 60)}`, node)
          } else {
            prefix = value
          }
        }
      }
    }
    pendingMounts.push({ parentId: routerId, prefix, prefixResolved, target: ref, auth: false, line: lineOf(node) })
  }

  /** `router.route('/x').get(a).post(b)` → the router and path expression at the head of the chain. */
  const routeChain = (expr: ts.Expression): { routerId: string; pathExpr: ts.Expression } | null => {
    const e = skipOuter(expr)
    if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression)) return null
    const name = e.expression.name.text
    if (name === 'route' && e.arguments.length === 1 && !ts.isObjectLiteralExpression(skipOuter(e.arguments[0]))) {
      const routerId = receiverRouter(e.expression.expression)
      return routerId ? { routerId, pathExpr: e.arguments[0] } : null
    }
    return name in ROUTE_METHODS ? routeChain(e.expression.expression) : null
  }

  const handleCall = (call: ts.CallExpression) => {
    const callee = skipOuter(call.expression)
    const args = call.arguments
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text
      const routerId = receiverRouter(callee.expression)
      if (routerId) {
        if (name in ROUTE_METHODS && args.length >= 2) addRoutes(routerId, ROUTE_METHODS[name], args[0], args.slice(1), call)
        else if (name === 'route' && args.length === 1 && ts.isObjectLiteralExpression(skipOuter(args[0]))) {
          addFastifyRouteObject(routerId, skipOuter(args[0]) as ts.ObjectLiteralExpression, call)
        } else if (name === 'use') handleUse(routerId, args, call)
        else if (name === 'register' && args.length >= 1) handleRegister(routerId, args, call)
        else if (name === 'addHook' && args.length >= 2 && FASTIFY_HOOK_PROPS.has(evalString(args[0]) ?? '') && isAuthMiddleware(args[1])) {
          // `fastify.addHook('onRequest', authorize)` protects every route in this plugin.
          const router = routerById.get(routerId)
          if (router) router.auth = true
        }
        else if (name === 'listen' && args[0]) {
          const port = evalPort(args[0])
          if (port) facts.ports.push(port)
        }
        return
      }
      if (name in ROUTE_METHODS && args.length >= 1) {
        const chain = routeChain(callee.expression)
        if (chain) addRoutes(chain.routerId, ROUTE_METHODS[name], chain.pathExpr, args, call)
        return
      }
      // `http.createServer(app).listen(PORT)`
      if (name === 'listen' && args[0] && facts.routers.length > 0) {
        const port = evalPort(args[0])
        if (port) facts.ports.push(port)
      }
      return
    }
    // `registerRoutes(app)` / `require('./routes')(app)` — routes added to the passed-in app.
    const passed = args.map((a) => receiverRouter(a)).find(Boolean)
    if (passed) {
      const ref = partialRef(callee)
      if (ref) pendingMounts.push({ parentId: passed, prefix: '', prefixResolved: true, target: ref, auth: false, line: lineOf(call) })
    }
  }

  const recordExport = (name: string, expr: ts.Expression) => {
    const ref = partialRef(expr)
    if (ref) pendingExports.push({ name, ref })
  }

  const visit = (node: ts.Node): void => {
    if (isFunctionNode(node) && node.body) {
      if (ts.isFunctionDeclaration(node) && hasModifier(node, ts.ModifierFlags.Export)) {
        const exportName = hasModifier(node, ts.ModifierFlags.Default) ? 'default' : node.name?.text
        if (exportName) pendingExports.push({ name: exportName, ref: { kind: 'fn', node, preferReturn: false } })
      }
      scopes.push(new Map())
      fnStack.push(node)
      for (const param of node.parameters) {
        if (!ts.isIdentifier(param.name)) continue
        const typed = param.type ? ROUTER_TYPE_NAMES.test(param.type.getText(sf)) : false
        if (ROUTER_PARAM_NAMES.test(param.name.text) || typed) {
          const id = declareParamRouter(param as ts.ParameterDeclaration & { name: ts.Identifier })
          if (!fnParamRouter.has(node)) fnParamRouter.set(node, id)
        }
      }
      ts.forEachChild(node, visit)
      fnStack.pop()
      scopes.pop()
      return
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const id = routerForInitializer(node.initializer, node.name.text)
      if (id) scopes[scopes.length - 1].set(node.name.text, id)
    } else if (ts.isPropertyDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const id = routerForInitializer(node.initializer, node.name.text)
      if (id) scopes[0].set(`this.${node.name.text}`, id)
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = skipOuter(node.left)
      if (ts.isPropertyAccessExpression(left)) {
        const obj = skipOuter(left.expression)
        const objText = obj.getText(sf)
        if (obj.kind === ts.SyntaxKind.ThisKeyword) {
          const id = routerForInitializer(node.right, left.name.text)
          if (id) scopes[0].set(`this.${left.name.text}`, id)
        } else if (objText === 'module' && left.name.text === 'exports') {
          const right = skipOuter(node.right)
          if (ts.isObjectLiteralExpression(right)) {
            for (const p of right.properties) {
              if (ts.isPropertyAssignment(p)) {
                const name = propertyName(p.name)
                if (name) recordExport(name, p.initializer)
              } else if (ts.isShorthandPropertyAssignment(p)) {
                recordExport(p.name.text, p.name)
              }
            }
          } else {
            recordExport('default', right)
          }
        } else if (objText === 'exports' || objText === 'module.exports') {
          if (left.name.text === 'autoPrefix') facts.autoPrefix = evalString(node.right) ?? undefined
          else recordExport(left.name.text, node.right)
        }
      }
    } else if (ts.isExportAssignment(node)) {
      recordExport('default', node.expression)
    } else if (ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null
      const target = spec ? resolveImport(file, spec) : null
      if (spec && !node.exportClause) {
        if (target) facts.starExports.push(target)
      } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text
          if (spec) facts.exports.set(el.name.text, { kind: 'import', file: target, exportName: local })
          else exportedLocalNames.push({ exportName: el.name.text, localName: local })
        }
      }
    } else if (ts.isVariableStatement(node) && hasModifier(node, ts.ModifierFlags.Export)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        if (decl.name.text === 'autoPrefix' && decl.initializer) facts.autoPrefix = evalString(decl.initializer) ?? undefined
        else exportedLocalNames.push({ exportName: decl.name.text, localName: decl.name.text })
      }
    } else if (ts.isReturnStatement(node) && node.expression && fnStack.length > 0) {
      const returned = receiverRouter(node.expression)
      if (returned) fnReturnRouter.set(fnStack[fnStack.length - 1], returned)
    } else if (ts.isCallExpression(node)) {
      handleCall(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  // ── Finalize: turn function references into the router they expose ──────
  const finalize = (ref: PartialRef): RouterRef | null => {
    if (ref.kind !== 'fn') return ref
    const param = fnParamRouter.get(ref.node)
    const returned = fnReturnRouter.get(ref.node)
    const id = ref.preferReturn ? (returned ?? param) : (param ?? returned)
    return id ? { kind: 'local', id } : null
  }

  for (const mount of pendingMounts) {
    const target = finalize(mount.target)
    if (target) facts.mounts.push({ ...mount, target })
  }
  for (const { exportName, localName } of exportedLocalNames) {
    const id = scopes[0].get(localName)
    if (id) pendingExports.push({ name: exportName, ref: { kind: 'local', id } })
    else {
      const fn = functionsByName.get(localName)
      if (fn) pendingExports.push({ name: exportName, ref: { kind: 'fn', node: fn, preferReturn: false } })
      const imported = imports.get(localName)
      if (imported && imported.exportName !== '*') pendingExports.push({ name: exportName, ref: { kind: 'import', ...imported } })
    }
  }
  for (const { name, ref } of pendingExports) {
    const target = finalize(ref)
    if (target && !facts.exports.has(name)) facts.exports.set(name, target)
  }

  return facts
}

// ── Linking across files ─────────────────────────────────────────────────────

export function linkServerRoutes(allFacts: ServerFileFacts[]): DetectedEndpoint[] {
  const byFile = new Map(allFacts.map((f) => [f.file, f]))
  const routers = new Map<string, RouterFact>()
  const routerFile = new Map<string, ServerFileFacts>()
  const routesByRouter = new Map<string, Array<RouteFact & { file: string }>>()
  for (const facts of allFacts) {
    for (const router of facts.routers) {
      routers.set(router.id, router)
      routerFile.set(router.id, facts)
    }
    for (const route of facts.routes) {
      const list = routesByRouter.get(route.routerId) ?? []
      list.push({ ...route, file: facts.file })
      routesByRouter.set(route.routerId, list)
    }
  }

  const resolveRef = (ref: RouterRef, depth = 0): string | null => {
    if (depth > 10) return null
    if (ref.kind === 'local') return ref.id
    if (!ref.file) return null
    const facts = byFile.get(ref.file)
    if (!facts) return null
    const direct = facts.exports.get(ref.exportName)
    if (direct) return resolveRef(direct, depth + 1)
    if (ref.exportName !== 'default') {
      for (const star of facts.starExports) {
        const found = resolveRef({ kind: 'import', file: star, exportName: ref.exportName }, depth + 1)
        if (found) return found
      }
    }
    return null
  }

  const children = new Map<string, Array<{ childId: string; prefix: string; prefixResolved: boolean; auth: boolean }>>()
  const mounted = new Set<string>()
  for (const facts of allFacts) {
    for (const mount of facts.mounts) {
      const childId = resolveRef(mount.target)
      if (!childId || childId === mount.parentId || !routers.has(childId)) continue
      const list = children.get(mount.parentId) ?? []
      list.push({ childId, prefix: mount.prefix, prefixResolved: mount.prefixResolved, auth: mount.auth })
      children.set(mount.parentId, list)
      mounted.add(childId)
    }
  }

  /** Route inputs plus body/query from schemas that live in other files. */
  const withImportedSchemas = (route: RouteFact): { inputs: RequestInputs; bodyExample?: unknown } => {
    let bodyExample = route.bodyExample
    const inputs: RequestInputs = { ...route.inputs, query: [...route.inputs.query] }
    for (const ref of route.schemaImports ?? []) {
      const target = ref.file ? byFile.get(ref.file) : undefined
      const group = target?.schemaGroups.get(ref.exportName)
      if (group) {
        if (group.body !== undefined) bodyExample = group.body
        group.query?.forEach((q) => addInput(inputs, 'query', q))
        continue
      }
      const value = target?.schemaExamples.get(ref.exportName)
      if (value === undefined) continue
      if (ref.target === 'query') {
        if (value && typeof value === 'object') Object.keys(value).forEach((k) => addInput(inputs, 'query', k))
      } else {
        bodyExample = mergeExamples(bodyExample, value)
      }
    }
    return { inputs, bodyExample }
  }

  const endpoints: DetectedEndpoint[] = []
  const walk = (routerId: string, prefix: string, inheritedAuth: boolean, cap: CodeScanConfidence, stack: Set<string>) => {
    if (stack.has(routerId) || stack.size > 25) return
    stack.add(routerId)
    const router = routers.get(routerId)
    const auth = inheritedAuth || Boolean(router?.auth)
    for (const route of routesByRouter.get(routerId) ?? []) {
      const path = joinRoutePaths(prefix, normalizeRoutePath(route.path))
      const method: HttpMethod = route.method === 'ALL' ? 'GET' : route.method
      const own: CodeScanConfidence = route.computed ? 'medium' : 'high'
      const rank = { high: 2, medium: 1, low: 0 } as const
      const confidence = rank[own] <= rank[cap] ? own : cap
      endpoints.push(
        makeEndpoint({
          method,
          path,
          file: route.file,
          line: route.line,
          framework: route.framework,
          confidence,
          auth: auth || route.auth,
          ...withImportedSchemas(route),
          ...(route.basicAuth ? { authScheme: { type: 'basic' as const } } : {}),
          operationId: route.handlerName,
          description: route.method === 'ALL' ? 'Registered with .all(): matches every HTTP method.' : undefined
        })
      )
    }
    for (const child of children.get(routerId) ?? []) {
      walk(
        child.childId,
        joinRoutePaths(prefix, child.prefix),
        auth || child.auth,
        child.prefixResolved ? cap : 'low',
        stack
      )
    }
    stack.delete(routerId)
  }

  for (const [id, router] of routers) {
    if (mounted.has(id)) continue
    // A Router nobody mounts (as far as we can tell) is missing its prefix; a plugin function is probably fine.
    const cap: CodeScanConfidence = router.kind === 'router' ? 'low' : router.kind === 'param' ? 'medium' : 'high'
    const prefix = router.kind === 'param' ? (routerFile.get(id)?.autoPrefix ?? '') : ''
    walk(id, prefix, false, cap, new Set())
  }
  return endpoints
}
