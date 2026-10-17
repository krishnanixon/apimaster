/**
 * Next.js extraction. Routes come from the file system:
 *  - App Router:   `app/users/[id]/route.ts` exporting `GET`/`POST`… → `/users/:id`
 *  - Pages Router: `pages/api/users/[id].ts` default-exporting a handler → `/api/users/:id`
 * `basePath` from `next.config.*` is prepended to every route of that app.
 */
import ts from 'typescript'
import type { HttpMethod } from '../../../types/api-studio'
import type { DetectedEndpoint } from '../../../types/code-scanner'
import { joinRoutePaths } from '../paths'
import { addInput, emptyInputs, makeEndpoint, type EndpointDraft, type RequestInputs } from './common'
import { readRequestInputs } from './request-inputs'
import { hasModifier, isFunctionNode, lineOf, skipOuter, type FunctionNode } from './ts-utils'

const HTTP_EXPORTS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const AUTH_CALLS = /^(getServerSession|auth|currentUser|getAuth|getToken|getSession|requireAuth|requireUser|verify\w*(Token|User|Access|Session|Auth)\w*|validateRequest|getUser|getKindeServerSession)$/
const AUTH_WRAPPERS = /auth|protect|session|guard|withUser/i
/** Auth *providers* (the sign-in endpoint itself), not protection. */
const AUTH_PROVIDERS = /^(NextAuth|Auth)$/
const CONFIG_FILE = /(^|\/)next\.config\.(js|mjs|cjs|ts|mts)$/

export interface NextRouteLocation {
  router: 'app' | 'pages'
  path: string
}

export interface NextFileFacts {
  file: string
  drafts: EndpointDraft[]
  /** Set when the file is a `next.config.*` declaring `basePath`. */
  basePath?: { dir: string; value: string }
}

function segmentToPath(segment: string): string | null {
  if (/^\(.*\)$/.test(segment) || segment.startsWith('@')) return '' // route groups and parallel slots
  if (segment.startsWith('_') || segment.startsWith('(.')) return null // private folders, intercepting routes
  const dynamic = segment.match(/^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/)
  return dynamic ? `:${dynamic[1]}` : segment
}

/** Maps a file to its Next.js route, or null when the file isn't a route handler. */
export function nextRouteLocation(file: string): NextRouteLocation | null {
  const app = file.match(/(?:^|\/)app\/((?:[^/]+\/)*)route\.(?:ts|js|tsx|jsx|mjs)$/)
  if (app && !/(^|\/)pages\//.test(file)) {
    const segments = app[1].split('/').filter(Boolean).map(segmentToPath)
    if (segments.some((s) => s === null)) return null
    return { router: 'app', path: joinRoutePaths(...(segments as string[])) }
  }
  const pages = file.match(/(?:^|\/)pages\/api\/(.+)\.(?:ts|js|tsx|jsx|mjs)$/)
  if (pages) {
    const segments = pages[1].split('/')
    if (segments[segments.length - 1] === 'index') segments.pop()
    const mapped = segments.map(segmentToPath)
    if (mapped.some((s) => s === null)) return null
    return { router: 'pages', path: joinRoutePaths('api', ...(mapped as string[])) }
  }
  return null
}

function dirOf(file: string): string {
  const index = file.lastIndexOf('/')
  return index === -1 ? '' : file.slice(0, index)
}

/** What an App Router handler `(request: Request) => …` reads, plus whether it checks a session. */
function readAppRouteInputs(fn: FunctionNode): { inputs: RequestInputs; auth: boolean } {
  const inputs = emptyInputs()
  let auth = false
  const param = fn.parameters[0]
  const reqName = param && ts.isIdentifier(param.name) ? param.name.text : null
  const jsonAliases = new Set<string>()
  const formAliases = new Set<string>()
  if (!fn.body) return { inputs, auth }

  /** `request.json()` / `request.formData()` */
  const readerKind = (expr: ts.Expression): 'json' | 'form' | null => {
    const e = skipOuter(expr)
    if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression)) return null
    const receiver = skipOuter(e.expression.expression)
    if (!reqName || !ts.isIdentifier(receiver) || receiver.text !== reqName) return null
    return e.expression.name.text === 'json' ? 'json' : e.expression.name.text === 'formData' ? 'form' : null
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const kind = readerKind(node.initializer)
      if (kind === 'json' && ts.isObjectBindingPattern(node.name)) {
        for (const el of node.name.elements) {
          const name = (el.propertyName ?? el.name).getText()
          if (!el.dotDotDotToken) addInput(inputs, 'body', name)
        }
      } else if (kind && ts.isIdentifier(node.name)) {
        ;(kind === 'json' ? jsonAliases : formAliases).add(node.name.text)
      }
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && jsonAliases.has(node.expression.text)) {
      addInput(inputs, 'body', node.name.text)
    } else if (ts.isCallExpression(node)) {
      const callee = skipOuter(node.expression)
      const arg = node.arguments[0]
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'get' && arg && ts.isStringLiteralLike(arg)) {
        const receiver = skipOuter(callee.expression)
        const receiverText = receiver.getText()
        if (/searchParams$/.test(receiverText)) addInput(inputs, 'query', arg.text)
        else if (/headers$/.test(receiverText) || /headers\(\)$/.test(receiverText)) addInput(inputs, 'headers', arg.text)
        else if (ts.isIdentifier(receiver) && formAliases.has(receiver.text)) addInput(inputs, 'body', arg.text)
      }
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
      if (AUTH_CALLS.test(name)) auth = true
    }
    ts.forEachChild(node, visit)
  }
  visit(fn.body)
  return { inputs, auth }
}

/** Methods a `pages/api` handler branches on: `req.method === 'POST'`, `switch (req.method) { case 'GET': … }`. */
function pagesMethods(fn: FunctionNode): HttpMethod[] {
  const methods = new Set<HttpMethod>()
  const add = (value: string) => {
    const upper = value.toUpperCase()
    if (HTTP_EXPORTS.has(upper)) methods.add(upper as HttpMethod)
  }
  const isMethodRef = (expr: ts.Expression) => /\.method$/.test(skipOuter(expr).getText())
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind)) {
      if (isMethodRef(node.left) && ts.isStringLiteralLike(node.right)) add(node.right.text)
      if (isMethodRef(node.right) && ts.isStringLiteralLike(node.left)) add(node.left.text)
    } else if (ts.isSwitchStatement(node) && isMethodRef(node.expression)) {
      for (const clause of node.caseBlock.clauses) {
        if (ts.isCaseClause(clause) && ts.isStringLiteralLike(clause.expression)) add(clause.expression.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  if (fn.body) visit(fn.body)
  return [...methods]
}

export function collectNextFacts(sf: ts.SourceFile): NextFileFacts | null {
  const file = sf.fileName
  if (CONFIG_FILE.test(file)) {
    const match = sf.text.match(/basePath\s*:\s*['"`]([^'"`$]+)['"`]/)
    return match ? { file, drafts: [], basePath: { dir: dirOf(file), value: match[1] } } : null
  }
  const location = nextRouteLocation(file)
  if (!location) return null

  const functions = new Map<string, FunctionNode>()
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) functions.set(statement.name.text, statement)
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        const init = decl.initializer ? skipOuter(decl.initializer) : undefined
        if (ts.isIdentifier(decl.name) && init && isFunctionNode(init)) functions.set(decl.name.text, init)
      }
    }
  }
  /** Handler behind an export: the function itself, a named function, or the one a wrapper receives. */
  const handlerOf = (expr: ts.Expression): { fn: FunctionNode | null; wrapped: boolean; wrapper?: string } => {
    const e = skipOuter(expr)
    if (isFunctionNode(e)) return { fn: e, wrapped: false }
    if (ts.isIdentifier(e)) return { fn: functions.get(e.text) ?? null, wrapped: false }
    if (ts.isCallExpression(e)) {
      const inner = e.arguments.map((a) => handlerOf(a)).find((h) => h.fn)
      return { fn: inner?.fn ?? null, wrapped: true, wrapper: e.expression.getText(sf) }
    }
    return { fn: null, wrapped: false }
  }

  const drafts: EndpointDraft[] = []
  const add = (method: HttpMethod, handler: ReturnType<typeof handlerOf>, node: ts.Node, extra: Partial<EndpointDraft> = {}) => {
    const wrappedAuth = Boolean(handler.wrapper && AUTH_WRAPPERS.test(handler.wrapper) && !AUTH_PROVIDERS.test(handler.wrapper))
    let inputs = emptyInputs()
    let auth = wrappedAuth
    if (handler.fn) {
      if (location.router === 'app') {
        const read = readAppRouteInputs(handler.fn)
        inputs = read.inputs
        auth = auth || read.auth
      } else {
        inputs = readRequestInputs(handler.fn)
      }
    }
    drafts.push({
      method,
      path: location.path,
      file,
      line: lineOf(sf, node),
      framework: 'nextjs',
      confidence: 'high',
      auth,
      inputs,
      ...extra
    })
  }

  if (location.router === 'app') {
    for (const statement of sf.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && HTTP_EXPORTS.has(statement.name.text) && hasModifier(statement, ts.ModifierFlags.Export)) {
        add(statement.name.text as HttpMethod, { fn: statement, wrapped: false }, statement)
      } else if (ts.isVariableStatement(statement) && hasModifier(statement, ts.ModifierFlags.Export)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && HTTP_EXPORTS.has(decl.name.text) && decl.initializer) {
            add(decl.name.text as HttpMethod, handlerOf(decl.initializer), decl)
          }
        }
      } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const el of statement.exportClause.elements) {
          if (HTTP_EXPORTS.has(el.name.text)) {
            const local = (el.propertyName ?? el.name).text
            add(el.name.text as HttpMethod, { fn: functions.get(local) ?? null, wrapped: false }, el)
          }
        }
      }
    }
    return { file, drafts }
  }

  // Pages Router: one default-exported handler serves every method.
  for (const statement of sf.statements) {
    let handler: ReturnType<typeof handlerOf> | null = null
    if (ts.isFunctionDeclaration(statement) && hasModifier(statement, ts.ModifierFlags.Default)) {
      handler = { fn: statement, wrapped: false }
    } else if (ts.isExportAssignment(statement)) {
      handler = handlerOf(statement.expression)
    } else if (
      ts.isExpressionStatement(statement) &&
      ts.isBinaryExpression(statement.expression) &&
      statement.expression.left.getText(sf) === 'module.exports'
    ) {
      handler = handlerOf(statement.expression.right)
    }
    if (!handler) continue
    const methods = handler.fn ? pagesMethods(handler.fn) : []
    if (methods.length === 0) {
      add('GET', handler, statement, { description: 'The handler does not check req.method, so it accepts any HTTP method.' })
    } else {
      for (const method of methods) add(method, handler, statement)
    }
    break
  }
  return { file, drafts }
}

export function linkNextRoutes(allFacts: NextFileFacts[]): DetectedEndpoint[] {
  const basePaths = allFacts.flatMap((f) => (f.basePath ? [f.basePath] : []))
  const endpoints: DetectedEndpoint[] = []
  for (const facts of allFacts) {
    for (const draft of facts.drafts) {
      // The config sits in the app's root folder, which contains the route file.
      const base = basePaths
        .filter((b) => b.dir === '' || draft.file.startsWith(`${b.dir}/`))
        .sort((a, b) => b.dir.length - a.dir.length)[0]
      endpoints.push(makeEndpoint({ ...draft, path: base ? joinRoutePaths(base.value, draft.path) : draft.path }))
    }
  }
  return endpoints
}
