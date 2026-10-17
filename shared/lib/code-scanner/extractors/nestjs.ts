/**
 * NestJS extraction: `@Controller()` classes and their `@Get()/@Post()…` methods, joined with
 * `app.setGlobalPrefix()` and URI versioning. Request bodies come from `@Body() dto: CreateUserDto`
 * — the DTO class (including `PartialType`/`PickType`/`OmitType` bases) becomes the example.
 */
import ts from 'typescript'
import type { HttpMethod } from '../../../types/api-studio'
import type { CodeScanWarning, DetectedEndpoint } from '../../../types/code-scanner'
import type { BodySchema } from '../../../types/ai-engineer'
import { mergeSchemas } from '../../body-schema'
import { joinRoutePaths } from '../paths'
import { addInput, emptyInputs, makeEndpoint, type RequestInputs } from './common'
import { lineOf, objectProps, propertyName, skipOuter } from './ts-utils'

const NEST_METHODS: Record<string, HttpMethod | 'ALL'> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Options: 'OPTIONS',
  Head: 'HEAD',
  All: 'ALL'
}
const PUBLIC_DECORATORS = /^(Public|SkipAuth|AllowAnonymous|IsPublic|Unprotected|NoAuth|PublicRoute)$/
const AUTH_DECORATORS = /^(ApiBearerAuth|ApiSecurity|ApiOAuth2|ApiCookieAuth|Auth|Authenticated|Authorized|Roles|RequireAuth|Protected)$/
const AUTH_GUARD = /auth|jwt|session|role|permission|access|token|clerk|firebase|api.?key|passport/i
const NOT_AUTH_GUARD = /throttl|optional/i
const ISO_DATE = '2024-01-01T00:00:00.000Z'
const MAX_DEPTH = 2

type AuthMark = 'yes' | 'no' | 'public'

export interface NestField {
  name: string
  type: string
  validators: string[]
  /** From `@ApiProperty({ example })`. */
  example?: unknown
  /** class-validator rules (`@IsEmail()`, `@MinLength(8)`, …). */
  rules?: BodySchema
  /** Validated and not `@IsOptional()`: the request fails without it. */
  required?: boolean
}

export interface NestClassShape {
  name: string
  fields: NestField[]
  /** `extends X`, `extends PartialType(X)`, `PickType(X, [...])`, `OmitType(X, [...])`, `IntersectionType(A, B)`. */
  bases: Array<{ name: string; pick?: string[]; omit?: string[] }>
}

export interface NestRouteFact {
  method: HttpMethod | 'ALL'
  controllerPaths: string[]
  paths: string[]
  versions: string[] | null
  line: number
  handlerName: string
  auth: AuthMark
  inputs: RequestInputs
  /** `@Body() dto: T` has `key: null`; `@Body('user') dto: T` nests T under `user`. */
  bodyParams: Array<{ key: string | null; type?: string }>
  queryType?: string
  summary?: string
  computed: boolean
}

export interface NestFileFacts {
  file: string
  /** Folder of the Nest app the file belongs to (everything before `src/`), for monorepos. */
  appRoot: string
  routes: NestRouteFact[]
  classes: NestClassShape[]
  globalPrefix?: string
  /** `setGlobalPrefix(config.get(...))` — set at runtime, so routes are shown without it. */
  globalPrefixUnresolved?: boolean
  /** Paths `setGlobalPrefix(prefix, { exclude })` leaves unprefixed. */
  globalPrefixExclude: string[]
  uriVersioning?: { defaultVersion?: string; prefix: string }
  globalAuth: boolean
  /** `app.listen(3000)` in the bootstrap file. */
  ports: number[]
  warnings: CodeScanWarning[]
}

interface DecoratorInfo {
  name: string
  args: readonly ts.Expression[]
}

function calleeName(expr: ts.Expression): string | null {
  const e = skipOuter(expr)
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return null
}

function decoratorsOf(node: ts.Node): DecoratorInfo[] {
  if (!ts.canHaveDecorators(node)) return []
  const out: DecoratorInfo[] = []
  for (const decorator of ts.getDecorators(node) ?? []) {
    const e = decorator.expression
    const name = ts.isCallExpression(e) ? calleeName(e.expression) : calleeName(e)
    if (name) out.push({ name, args: ts.isCallExpression(e) ? e.arguments : [] })
  }
  return out
}

/** A literal value usable as an example (`'x'`, `1`, `true`, `null`, `['a']`), else undefined. */
function literalValue(expr: ts.Expression): unknown {
  const e = skipOuter(expr)
  if (ts.isStringLiteralLike(e)) return e.text
  if (ts.isNumericLiteral(e)) return Number(e.text)
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) {
    return -Number(e.operand.text)
  }
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true
  if (e.kind === ts.SyntaxKind.FalseKeyword) return false
  if (e.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(e)) {
    const values = e.elements.map(literalValue)
    return values.every((v) => v !== undefined) ? values : undefined
  }
  return undefined
}

/** Classes behind `X`, `PartialType(X)`, `PickType(X, [...])`, `OmitType(PartialType(X), [...])`, `IntersectionType(A, B)`. */
function mappedBases(expr: ts.Expression, pick?: string[], omit?: string[]): NestClassShape['bases'] {
  const e = skipOuter(expr)
  if (ts.isIdentifier(e)) return [{ name: e.text, pick, omit }]
  if (!ts.isCallExpression(e) || !e.arguments[0]) return []
  const helper = calleeName(e.expression)
  if (helper === 'IntersectionType') return e.arguments.flatMap((arg) => mappedBases(arg, pick, omit))
  const keys = e.arguments[1] ? literalValue(e.arguments[1]) : undefined
  const keyList = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : []
  return mappedBases(
    e.arguments[0],
    helper === 'PickType' ? (pick ? pick.filter((k) => keyList.includes(k)) : keyList) : pick,
    helper === 'OmitType' ? [...(omit ?? []), ...keyList] : omit
  )
}

function typeName(type: ts.TypeNode | string | undefined): string | undefined {
  if (typeof type === 'string') {
    const t = type.trim().replace(/\[\]$/, '').replace(/^Array<(.+)>$/, '$1')
    return /^[A-Za-z_][\w.]*$/.test(t) ? t : undefined
  }
  if (!type) return undefined
  if (ts.isArrayTypeNode(type)) return typeName(type.elementType)
  if (ts.isTypeReferenceNode(type)) {
    const name = type.typeName.getText()
    if (name === 'Array' && type.typeArguments?.[0]) return typeName(type.typeArguments[0])
    return name
  }
  return undefined
}

/** `3000`, `process.env.PORT ?? 3000`, `+(process.env.PORT || '3000')` → 3000. */
function portValue(expr: ts.Expression): number | null {
  const e = skipOuter(expr)
  if (ts.isNumericLiteral(e) || ts.isStringLiteralLike(e)) {
    const n = Number(e.text)
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : null
  }
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) {
    return portValue(e.right)
  }
  if (ts.isPrefixUnaryExpression(e)) return portValue(e.operand)
  return null
}

function isAuthGuard(expr: ts.Expression): boolean {
  const text = skipOuter(expr).getText()
  return AUTH_GUARD.test(text) && !NOT_AUTH_GUARD.test(text)
}

function authMark(decorators: DecoratorInfo[]): AuthMark {
  if (decorators.some((d) => PUBLIC_DECORATORS.test(d.name))) return 'public'
  if (decorators.some((d) => AUTH_DECORATORS.test(d.name))) return 'yes'
  if (decorators.some((d) => d.name === 'UseGuards' && d.args.some(isAuthGuard))) return 'yes'
  return 'no'
}

export function collectNestFacts(sf: ts.SourceFile): NestFileFacts {
  const file = sf.fileName
  const srcIndex = file.lastIndexOf('src/')
  const facts: NestFileFacts = {
    file,
    appRoot: srcIndex === -1 ? '' : file.slice(0, srcIndex),
    routes: [],
    classes: [],
    globalPrefixExclude: [],
    globalAuth: false,
    ports: [],
    warnings: []
  }

  const consts = new Map<string, ts.Expression>()
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) consts.set(decl.name.text, decl.initializer)
    }
  }
  const evalString = (expr: ts.Expression, depth = 0): string | null => {
    const e = skipOuter(expr)
    if (ts.isStringLiteralLike(e)) return e.text
    if (depth < 5 && ts.isIdentifier(e) && consts.has(e.text)) return evalString(consts.get(e.text)!, depth + 1)
    if (ts.isTemplateExpression(e)) {
      let out = e.head.text
      for (const span of e.templateSpans) {
        const value = depth < 5 ? evalString(span.expression, depth + 1) : null
        if (value === null) return null
        out += value + span.literal.text
      }
      return out
    }
    return null
  }
  /** `'a'` → `['a']`, `['a', 'b']` → both; `computed` when anything wasn't a plain literal. */
  const evalStrings = (expr: ts.Expression | undefined): { values: string[]; computed: boolean } | null => {
    if (!expr) return { values: [''], computed: false }
    const e = skipOuter(expr)
    if (ts.isArrayLiteralExpression(e)) {
      const values = e.elements.map((el) => evalString(el))
      return values.every((v): v is string => v !== null) ? { values, computed: !e.elements.every(ts.isStringLiteralLike) } : null
    }
    const value = evalString(e)
    return value === null ? null : { values: [value], computed: !ts.isStringLiteralLike(e) }
  }

  const versionsOf = (decorators: DecoratorInfo[], fallback?: ts.Expression): string[] | null => {
    const version = decorators.find((d) => d.name === 'Version')?.args[0] ?? fallback
    if (!version) return null
    const evaluated = evalStrings(version)
    return evaluated ? evaluated.values : null
  }

  const readClass = (node: ts.ClassDeclaration) => {
    if (!node.name) return
    const shape: NestClassShape = { name: node.name.text, fields: [], bases: [] }
    for (const clause of node.heritageClauses ?? []) {
      if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue
      for (const type of clause.types) shape.bases.push(...mappedBases(type.expression))
    }
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member) || !member.name) continue
      const name = propertyName(member.name)
      if (!name || member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) continue
      const decorators = decoratorsOf(member)
      const apiProperty = decorators.find((d) => d.name === 'ApiProperty' || d.name === 'ApiPropertyOptional')
      const apiOptions = apiProperty?.args[0] && ts.isObjectLiteralExpression(skipOuter(apiProperty.args[0]))
        ? objectProps(skipOuter(apiProperty.args[0]) as ts.ObjectLiteralExpression)
        : undefined
      const exampleExpr = apiOptions?.get('example') ?? apiOptions?.get('default')
      shape.fields.push({
        name,
        type: member.type?.getText(sf) ?? (member.initializer ? typeof literalValue(member.initializer) : ''),
        validators: decorators.map((d) => d.name),
        example: exampleExpr ? literalValue(exampleExpr) : undefined,
        ...validatorRules(decorators, Boolean(member.questionToken))
      })
    }
    if (shape.fields.length || shape.bases.length) facts.classes.push(shape)

    const classDecorators = decoratorsOf(node)
    const controller = classDecorators.find((d) => d.name === 'Controller')
    if (!controller) return

    let controllerPaths = evalStrings(undefined)!
    let classVersionExpr: ts.Expression | undefined
    const arg = controller.args[0] ? skipOuter(controller.args[0]) : undefined
    if (arg && ts.isObjectLiteralExpression(arg)) {
      const props = objectProps(arg)
      controllerPaths = evalStrings(props.get('path')) ?? { values: [''], computed: true }
      classVersionExpr = props.get('version')
    } else if (arg) {
      controllerPaths = evalStrings(arg) ?? { values: [''], computed: true }
    }
    const classVersions = versionsOf(classDecorators, classVersionExpr)
    const classAuth = authMark(classDecorators)

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || !member.name) continue
      const decorators = decoratorsOf(member)
      const route = decorators.find((d) => d.name in NEST_METHODS)
      if (!route) continue
      const paths = evalStrings(route.args[0])
      if (!paths) continue

      const methodAuth = authMark(decorators)
      const inputs = emptyInputs()
      const bodyParams: NestRouteFact['bodyParams'] = []
      let queryType: string | undefined
      for (const param of member.parameters) {
        for (const d of decoratorsOf(param)) {
          const key = d.args[0] ? evalString(d.args[0]) : null
          if (d.name === 'Body') {
            bodyParams.push({ key, type: param.type?.getText(sf) })
          } else if (d.name === 'Query') {
            if (key) addInput(inputs, 'query', key)
            else queryType = typeName(param.type)
          } else if (d.name === 'Headers' && key) {
            addInput(inputs, 'headers', key)
          }
        }
      }
      const operation = decorators.find((d) => d.name === 'ApiOperation')?.args[0]
      const summaryExpr = operation && ts.isObjectLiteralExpression(skipOuter(operation))
        ? objectProps(skipOuter(operation) as ts.ObjectLiteralExpression).get('summary')
        : undefined

      facts.routes.push({
        method: NEST_METHODS[route.name],
        controllerPaths: controllerPaths.values,
        paths: paths.values,
        versions: versionsOf(decorators) ?? classVersions,
        line: lineOf(sf, member),
        handlerName: propertyName(member.name) ?? 'handler',
        auth: methodAuth !== 'no' ? methodAuth : classAuth,
        inputs,
        bodyParams,
        queryType,
        summary: summaryExpr ? (evalString(summaryExpr) ?? undefined) : undefined,
        computed: controllerPaths.computed || paths.computed
      })
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) readClass(node)
    else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const arg = node.arguments[0]
      if (method === 'setGlobalPrefix' && arg) {
        const prefix = evalString(arg)
        if (prefix !== null) facts.globalPrefix = prefix
        else {
          facts.globalPrefixUnresolved = true
          facts.warnings.push({
            file,
            line: lineOf(sf, node),
            message: `Global prefix comes from configuration (${arg.getText(sf).slice(0, 60)}); routes are shown without it`
          })
        }
        const options = node.arguments[1] && skipOuter(node.arguments[1])
        const exclude = options && ts.isObjectLiteralExpression(options) ? objectProps(options).get('exclude') : undefined
        const excluded = exclude && ts.isArrayLiteralExpression(skipOuter(exclude)) ? (skipOuter(exclude) as ts.ArrayLiteralExpression).elements : []
        for (const el of excluded) {
          const e = skipOuter(el)
          const path = ts.isObjectLiteralExpression(e) ? objectProps(e).get('path') : e
          const value = path ? evalString(path) : null
          if (value !== null) facts.globalPrefixExclude.push(value)
        }
      } else if (method === 'enableVersioning') {
        const options = arg && ts.isObjectLiteralExpression(skipOuter(arg)) ? objectProps(skipOuter(arg) as ts.ObjectLiteralExpression) : new Map()
        const type = options.get('type')?.getText(sf) ?? 'URI'
        if (/URI/.test(type)) {
          const defaultVersion = options.get('defaultVersion')
          const versions = defaultVersion ? evalStrings(defaultVersion) : null
          facts.uriVersioning = {
            defaultVersion: versions?.values[0],
            prefix: (options.get('prefix') && evalString(options.get('prefix')!)) ?? 'v'
          }
        }
      } else if (method === 'useGlobalGuards' && node.arguments.some(isAuthGuard)) {
        facts.globalAuth = true
      } else if (method === 'listen' && arg && sf.text.includes('NestFactory')) {
        const port = portValue(arg)
        if (port) facts.ports.push(port)
      }
    } else if (ts.isObjectLiteralExpression(node)) {
      // `{ provide: APP_GUARD, useClass: JwtAuthGuard }`
      const props = objectProps(node)
      const guard = props.get('useClass') ?? props.get('useExisting')
      if (props.get('provide')?.getText(sf) === 'APP_GUARD' && guard && isAuthGuard(guard)) facts.globalAuth = true
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return facts
}

// ── Linking ─────────────────────────────────────────────────────────────────

const CLASS_VALIDATOR = /^(Is[A-Z]\w*|Min|Max|MinLength|MaxLength|Length|Matches|Equals|NotEquals|ArrayMinSize|ArrayMaxSize|ValidateNested)$/

/** Rules from class-validator decorators; a field is required when validated and not `@IsOptional()`. */
function validatorRules(decorators: DecoratorInfo[], optionalType: boolean): Pick<NestField, 'rules' | 'required'> {
  const rules: BodySchema = {}
  const num = (d: DecoratorInfo, i = 0) => {
    const v = d.args[i] ? literalValue(d.args[i]) : undefined
    return typeof v === 'number' ? v : undefined
  }
  let validated = false
  for (const d of decorators) {
    if (!CLASS_VALIDATOR.test(d.name)) continue
    validated = true
    switch (d.name) {
      case 'IsEmail':
        Object.assign(rules, { type: 'string', format: 'email' })
        break
      case 'IsUUID':
        Object.assign(rules, { type: 'string', format: 'uuid' })
        break
      case 'IsUrl':
        Object.assign(rules, { type: 'string', format: 'uri' })
        break
      case 'IsString':
        rules.type = 'string'
        break
      case 'IsNotEmpty':
        rules.minLength ??= 1
        break
      case 'IsInt':
        rules.type = 'integer'
        break
      case 'IsNumber':
        rules.type = 'number'
        break
      case 'IsBoolean':
        rules.type = 'boolean'
        break
      case 'IsArray':
        rules.type = 'array'
        break
      case 'IsIn': {
        const values = d.args[0] ? literalValue(d.args[0]) : undefined
        if (Array.isArray(values)) rules.enum = values
        break
      }
      case 'Min':
        rules.minimum = num(d)
        break
      case 'Max':
        rules.maximum = num(d)
        break
      case 'MinLength':
        rules.minLength = num(d)
        break
      case 'MaxLength':
        rules.maxLength = num(d)
        break
      case 'Length':
        rules.minLength = num(d)
        rules.maxLength = num(d, 1)
        break
    }
  }
  for (const key of Object.keys(rules) as Array<keyof BodySchema>) if (rules[key] === undefined) delete rules[key]
  const optional = decorators.some((d) => d.name === 'IsOptional' || d.name === 'ApiPropertyOptional')
  return { rules, required: validated && !optional && !optionalType }
}

/** Object rules for a DTO class, including inherited and mapped (`PickType`, `OmitType`) fields. */
function classSchema(name: string, index: Map<string, NestClassShape>): BodySchema {
  const fields = classFields(name, index)
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f.name, f.rules ?? {}])),
    required: fields.filter((f) => f.required).map((f) => f.name)
  }
}

function fieldExample(field: NestField, index: Map<string, NestClassShape>, depth: number): unknown {
  if (field.example !== undefined) return field.example
  const validators = new Set(field.validators)
  if (validators.has('IsEmail')) return 'user@example.com'
  if (validators.has('IsUUID')) return '00000000-0000-0000-0000-000000000000'
  if (validators.has('IsUrl')) return 'https://example.com'
  if (validators.has('IsDateString') || validators.has('IsDate')) return ISO_DATE
  if (validators.has('IsBoolean')) return false
  if (validators.has('IsInt') || validators.has('IsNumber') || validators.has('IsPositive')) return 0
  if (validators.has('IsArray')) return []
  return typeExample(field.type, index, depth)
}

function typeExample(type: string, index: Map<string, NestClassShape>, depth: number): unknown {
  const parts = type.split('|').map((p) => p.trim()).filter((p) => p && p !== 'null' && p !== 'undefined')
  const t = parts[0] ?? ''
  if (/^['"]/.test(t)) return t.slice(1, -1)
  if (t.endsWith('[]') || t.startsWith('Array<')) return []
  if (t === 'string') return ''
  if (t === 'number' || t === 'bigint') return 0
  if (t === 'boolean') return false
  if (t === 'Date') return ISO_DATE
  if (index.has(t) && depth < MAX_DEPTH) return classExample(t, index, depth + 1)
  if (t.startsWith('Record<') || t === 'object') return {}
  return ''
}

function classFields(name: string, index: Map<string, NestClassShape>, seen = new Set<string>()): NestField[] {
  const shape = index.get(name)
  if (!shape || seen.has(name)) return []
  seen.add(name)
  const fields: NestField[] = []
  for (const base of shape.bases) {
    let inherited = classFields(base.name, index, seen)
    if (base.pick) inherited = inherited.filter((f) => base.pick!.includes(f.name))
    if (base.omit) inherited = inherited.filter((f) => !base.omit!.includes(f.name))
    fields.push(...inherited)
  }
  for (const field of shape.fields) {
    const existing = fields.findIndex((f) => f.name === field.name)
    if (existing === -1) fields.push(field)
    else fields[existing] = field
  }
  return fields
}

function classExample(name: string, index: Map<string, NestClassShape>, depth = 0): Record<string, unknown> {
  return Object.fromEntries(classFields(name, index).map((f) => [f.name, fieldExample(f, index, depth)]))
}

export function linkNestRoutes(allFacts: NestFileFacts[]): DetectedEndpoint[] {
  const index = new Map<string, NestClassShape>()
  for (const facts of allFacts) for (const shape of facts.classes) if (!index.has(shape.name)) index.set(shape.name, shape)

  // Global settings live in `main.ts`; in a monorepo each app root has its own.
  const settings = allFacts.filter((f) => f.globalPrefix !== undefined || f.globalPrefixUnresolved || f.uriVersioning || f.globalAuth)
  const settingsFor = (appRoot: string) => {
    const matching = settings.filter((s) => s.appRoot === appRoot)
    const pool = matching.length ? matching : settings.length === 1 || new Set(settings.map((s) => s.appRoot)).size === 1 ? settings : []
    return {
      globalPrefix: pool.find((s) => s.globalPrefix !== undefined)?.globalPrefix ?? '',
      prefixUnresolved: pool.some((s) => s.globalPrefixUnresolved),
      exclude: pool.flatMap((s) => s.globalPrefixExclude).map((p) => joinRoutePaths(p)),
      uriVersioning: pool.find((s) => s.uriVersioning)?.uriVersioning,
      globalAuth: pool.some((s) => s.globalAuth)
    }
  }

  const endpoints: DetectedEndpoint[] = []
  for (const facts of allFacts) {
    if (facts.routes.length === 0) continue
    const app = settingsFor(facts.appRoot)
    for (const route of facts.routes) {
      const versions = app.uriVersioning
        ? (route.versions ?? (app.uriVersioning.defaultVersion ? [app.uriVersioning.defaultVersion] : [null]))
        : [null]
      const inputs: RequestInputs = { ...route.inputs, query: [...route.inputs.query] }
      if (route.queryType) for (const field of classFields(route.queryType, index)) addInput(inputs, 'query', field.name)
      let bodyExample: Record<string, unknown> | undefined
      let bodySchema: BodySchema | undefined
      for (const param of route.bodyParams) {
        const type = param.type ?? ''
        if (param.key === null) {
          const name = typeName(type)
          if (name && index.has(name)) {
            bodyExample = { ...bodyExample, ...classExample(name, index) }
            bodySchema = mergeSchemas(bodySchema, classSchema(name, index))
          }
        } else {
          bodyExample = { ...bodyExample, [param.key]: typeExample(type, index, 0) }
        }
      }

      for (const controllerPath of route.controllerPaths) {
        for (const path of route.paths) {
          for (const version of versions) {
            const versionSegment = version ? `${app.uriVersioning!.prefix}${version}` : ''
            const unprefixed = joinRoutePaths(versionSegment, controllerPath, path)
            const excluded = app.exclude.includes(joinRoutePaths(controllerPath, path))
            endpoints.push(
              makeEndpoint({
                method: route.method === 'ALL' ? 'GET' : route.method,
                path: excluded ? joinRoutePaths(controllerPath, path) : joinRoutePaths(app.globalPrefix, unprefixed),
                file: facts.file,
                line: route.line,
                framework: 'nestjs',
                confidence: route.computed || (app.prefixUnresolved && !excluded) ? 'medium' : 'high',
                auth: route.auth === 'yes' || (route.auth !== 'public' && app.globalAuth),
                inputs,
                bodyExample,
                bodySchema,
                operationId: route.handlerName,
                summary: route.summary,
                description: route.method === 'ALL' ? 'Registered with @All(): matches every HTTP method.' : undefined
              })
            )
          }
        }
      }
    }
  }
  return endpoints
}
