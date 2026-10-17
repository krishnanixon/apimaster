/**
 * Reads what an Express-style handler `(req, res) => …` takes from the request:
 * `req.body.x`, `const { a } = req.body`, `req.query.x`, `req.headers['x-key']`, `req.get('X-Key')`.
 * Shared by Express, Fastify and Next.js `pages/api` handlers.
 */
import ts from 'typescript'
import { addInput, emptyInputs, type RequestInputs } from './common'
import { propertyName, skipOuter, type FunctionNode } from './ts-utils'

export function readRequestInputs(fn: FunctionNode): RequestInputs {
  const inputs = emptyInputs()
  if (!fn.body) return inputs
  const reqParam = fn.parameters[0]
  if (!reqParam) return inputs

  const reqNames = new Set<string>()
  const aliases = { body: new Set<string>(), query: new Set<string>(), headers: new Set<string>() }
  const addField = (section: 'body' | 'query' | 'headers', name: string) => addInput(inputs, section, name)
  const addPattern = (section: 'body' | 'query' | 'headers', pattern: ts.ObjectBindingPattern) => {
    for (const el of pattern.elements) {
      if (el.dotDotDotToken) continue
      const name = propertyName(el.propertyName ?? el.name)
      if (name) addField(section, name)
    }
  }
  /** `req.body` → `'body'` (also `alias` variables that hold `req.body`). */
  const sectionOf = (expr: ts.Expression): 'body' | 'query' | 'headers' | null => {
    const e = skipOuter(expr)
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(skipOuter(e.expression)) && reqNames.has((skipOuter(e.expression) as ts.Identifier).text)) {
      const name = e.name.text
      return name === 'body' || name === 'query' || name === 'headers' ? name : null
    }
    if (ts.isIdentifier(e)) {
      for (const section of ['body', 'query', 'headers'] as const) if (aliases[section].has(e.text)) return section
    }
    return null
  }

  if (ts.isIdentifier(reqParam.name)) reqNames.add(reqParam.name.text)
  else if (ts.isObjectBindingPattern(reqParam.name)) {
    for (const el of reqParam.name.elements) {
      const prop = propertyName(el.propertyName ?? el.name)
      if (prop !== 'body' && prop !== 'query' && prop !== 'headers') continue
      if (ts.isIdentifier(el.name)) aliases[prop].add(el.name.text)
      else if (ts.isObjectBindingPattern(el.name)) addPattern(prop, el.name)
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const section = sectionOf(node.initializer)
      if (section) {
        if (ts.isObjectBindingPattern(node.name)) addPattern(section, node.name)
        else if (ts.isIdentifier(node.name)) aliases[section].add(node.name.text)
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const section = sectionOf(node.expression)
      if (section) addField(section, node.name.text)
    } else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      const section = sectionOf(node.expression)
      if (section) addField(section, node.argumentExpression.text)
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['get', 'header'].includes(node.expression.name.text) &&
      ts.isIdentifier(node.expression.expression) &&
      reqNames.has(node.expression.expression.text) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      addField('headers', node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(fn.body)
  return inputs
}
