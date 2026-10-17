/** TypeScript-compiler-API helpers shared by the JS/TS extractors (Express/Fastify, NestJS, Next.js). */
import ts from 'typescript'

export type FunctionNode =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX
  // Vue/Svelte <script> blocks are parsed as TypeScript (a superset of JS).
  if (/\.(ts|mts|cts|vue|svelte)$/.test(file)) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

/** Parses once per file; every JS/TS extractor reads the same tree. */
export function parseSource(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file))
}

export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

export function isFunctionNode(node: ts.Node): node is FunctionNode {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  )
}

/** Strips parentheses, `as`, `!`, `<T>x`, `satisfies` and `await`. */
export function skipOuter(expr: ts.Expression): ts.Expression {
  let current = expr
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isAwaitExpression(current)
  ) {
    current = current.expression
  }
  return current
}

/** `require('x')` → `'x'`. */
export function requireSpecifier(expr: ts.Expression): string | null {
  const e = skipOuter(expr)
  if (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === 'require' &&
    e.arguments.length === 1 &&
    ts.isStringLiteralLike(e.arguments[0])
  ) {
    return e.arguments[0].text
  }
  return null
}

/** `import('x')` → `'x'`. */
export function dynamicImportSpecifier(expr: ts.Expression): string | null {
  const e = skipOuter(expr)
  if (
    ts.isCallExpression(e) &&
    e.expression.kind === ts.SyntaxKind.ImportKeyword &&
    e.arguments.length >= 1 &&
    ts.isStringLiteralLike(e.arguments[0])
  ) {
    return e.arguments[0].text
  }
  return null
}

export function propertyName(name: ts.PropertyName | ts.BindingName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isPrivateIdentifier(name)) return name.text
  return null
}

export function hasModifier(node: ts.Node, flag: ts.ModifierFlags): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & flag) !== 0
}

/** String value of a literal / no-substitution template, else null. */
export function literalText(expr: ts.Expression | undefined): string | null {
  if (!expr) return null
  const e = skipOuter(expr)
  return ts.isStringLiteralLike(e) ? e.text : null
}

/** Properties of an object literal by name (shorthand properties map to their identifier). */
export function objectProps(obj: ts.ObjectLiteralExpression): Map<string, ts.Expression> {
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

/** Import bindings of relative/aliased modules: local name → resolved file and the export it refers to. */
export function collectImportBindings(
  sf: ts.SourceFile,
  resolve: (specifier: string) => string | null
): Map<string, { file: string | null; exportName: string }> {
  const bindings = new Map<string, { file: string | null; exportName: string }>()
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.importClause) continue
    const file = resolve(statement.moduleSpecifier.text)
    if (!file) continue
    const clause = statement.importClause
    if (clause.name) bindings.set(clause.name.text, { file, exportName: 'default' })
    const named = clause.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) bindings.set(el.name.text, { file, exportName: (el.propertyName ?? el.name).text })
    } else if (named && ts.isNamespaceImport(named)) {
      bindings.set(named.name.text, { file, exportName: '*' })
    }
  }
  return bindings
}
