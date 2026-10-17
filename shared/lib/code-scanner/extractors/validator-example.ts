/**
 * Example values from validation schemas written in code: zod, joi, yup, TypeBox (Fastify), and
 * plain JSON-Schema object literals (Fastify `schema: { body: {...} }`). Read from the AST only.
 */
import ts from 'typescript'
import type { BodySchema } from '../../../types/ai-engineer'
import { schemaExample } from '../../schema-example'
import { attachSchema, fromJsonSchema, mergeSchemas } from '../../body-schema'
import { propertyName, skipOuter } from './ts-utils'

/** Packages whose builders we understand; their imported names mark an expression as a schema. */
export const VALIDATOR_PACKAGES = new Set(['zod', 'joi', '@hapi/joi', 'yup', '@sinclair/typebox', 'typebox'])

const ISO_DATE = '2024-01-01T00:00:00.000Z'
const MAX_DEPTH = 5

interface Link {
  name: string
  args: readonly ts.Expression[]
}

/** `z.object({...}).strict().optional()` → root `z`, links `object, strict, optional`. */
function chainOf(expr: ts.Expression): { root: string | null; links: Link[] } | null {
  const links: Link[] = []
  let e = skipOuter(expr)
  while (ts.isCallExpression(e)) {
    const callee = skipOuter(e.expression)
    if (ts.isPropertyAccessExpression(callee)) {
      links.unshift({ name: callee.name.text, args: e.arguments })
      e = skipOuter(callee.expression)
    } else if (ts.isIdentifier(callee)) {
      // yup/zod named imports: `object({...})`, `string()`
      links.unshift({ name: callee.text, args: e.arguments })
      return { root: null, links }
    } else {
      return null
    }
  }
  if (ts.isPropertyAccessExpression(e) && links.length === 0) return null
  return ts.isIdentifier(e) ? { root: e.text, links } : null
}

export interface ValidatorReader {
  /** Example for a schema expression, or undefined when it isn't one. */
  example(expr: ts.Expression): unknown
  /** Whether an expression (or the constant it names) is a schema. */
  isSchema(expr: ts.Expression): boolean
  /** Field names of an object schema (for query-string schemas). */
  fields(expr: ts.Expression): string[]
}

/**
 * @param validatorNames identifiers imported from validator packages (`z`, `Joi`, `yup`, `Type`, `object`, …)
 * @param resolve        initializer of a same-file constant, for schemas referenced by name
 */
export function createValidatorReader(
  validatorNames: Set<string>,
  resolve: (name: string) => ts.Expression | undefined
): ValidatorReader {
  const literalValue = (expr: ts.Expression, depth: number): unknown => {
    const e = skipOuter(expr)
    if (ts.isStringLiteralLike(e)) return e.text
    if (ts.isNumericLiteral(e)) return Number(e.text)
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return -Number(e.operand.text)
    if (e.kind === ts.SyntaxKind.TrueKeyword) return true
    if (e.kind === ts.SyntaxKind.FalseKeyword) return false
    if (e.kind === ts.SyntaxKind.NullKeyword) return null
    if (depth > MAX_DEPTH) return undefined
    if (ts.isArrayLiteralExpression(e)) return e.elements.map((el) => literalValue(el, depth + 1))
    if (ts.isObjectLiteralExpression(e)) {
      const out: Record<string, unknown> = {}
      for (const p of e.properties) {
        if (ts.isPropertyAssignment(p)) {
          const key = propertyName(p.name)
          if (key) out[key] = literalValue(p.initializer, depth + 1)
        } else if (ts.isShorthandPropertyAssignment(p)) {
          const value = resolve(p.name.text)
          out[p.name.text] = value ? literalValue(value, depth + 1) : undefined
        }
      }
      return out
    }
    if (ts.isIdentifier(e)) {
      const value = resolve(e.text)
      return value ? literalValue(value, depth + 1) : undefined
    }
    return undefined
  }

  const objectFields = (arg: ts.Expression | undefined, depth: number): Record<string, unknown> => {
    const e = arg ? skipOuter(arg) : undefined
    if (!e) return {}
    if (ts.isIdentifier(e)) {
      const value = resolve(e.text)
      return value ? objectFields(value, depth + 1) : {}
    }
    if (!ts.isObjectLiteralExpression(e)) {
      const nested = example(e, depth + 1)
      return nested && typeof nested === 'object' && !Array.isArray(nested) ? (nested as Record<string, unknown>) : {}
    }
    const out: Record<string, unknown> = {}
    for (const p of e.properties) {
      if (ts.isPropertyAssignment(p)) {
        const key = propertyName(p.name)
        if (key) out[key] = example(p.initializer, depth + 1) ?? ''
      } else if (ts.isShorthandPropertyAssignment(p)) {
        out[p.name.text] = example(p.name, depth + 1) ?? ''
      } else if (ts.isSpreadAssignment(p)) {
        Object.assign(out, objectFields(p.expression, depth + 1))
      }
    }
    return out
  }

  const example = (expr: ts.Expression, depth = 0): unknown => {
    if (depth > MAX_DEPTH) return undefined
    const e = skipOuter(expr)
    if (ts.isIdentifier(e)) {
      const value = resolve(e.text)
      return value ? example(value, depth + 1) : undefined
    }
    // `schema.body` given as a plain JSON Schema object (Fastify).
    if (ts.isObjectLiteralExpression(e)) {
      const value = literalValue(e, depth)
      return value && typeof value === 'object' && ('type' in value || 'properties' in value) ? schemaExample(value) : undefined
    }
    const chain = chainOf(e)
    if (!chain || chain.links.length === 0) return undefined
    const rootKnown = chain.root ? validatorNames.has(chain.root) : validatorNames.has(chain.links[0].name)
    if (!rootKnown) {
      // `BaseSchema.extend({...})`: a chain on another schema constant.
      if (!chain.root || !resolve(chain.root)) return undefined
      const base = example(resolve(chain.root)!, depth + 1)
      return applyModifiers(base, chain.links, depth)
    }
    const [ctor, ...modifiers] = chain.links
    return applyModifiers(construct(ctor, depth), modifiers, depth)
  }

  const construct = (ctor: Link, depth: number): unknown => {
    const name = ctor.name.toLowerCase()
    const [first, second] = ctor.args
    switch (name) {
      case 'object':
      case 'strictobject':
        return objectFields(first, depth)
      case 'string':
        return ''
      case 'number':
      case 'integer':
      case 'bigint':
        return 0
      case 'boolean':
      case 'bool':
        return false
      case 'date':
        return ISO_DATE
      case 'array':
        return first ? [example(first, depth + 1) ?? ''] : []
      case 'enum':
      case 'nativeenum': {
        const values = first ? literalValue(first, depth) : undefined
        if (Array.isArray(values)) return values[0] ?? ''
        if (values && typeof values === 'object') return Object.values(values)[0] ?? ''
        return ''
      }
      case 'literal':
      case 'valid':
      case 'allow':
        return first ? literalValue(first, depth) : ''
      case 'union':
      case 'alternatives':
      case 'oneof':
      case 'anyof': {
        const options = first && ts.isArrayLiteralExpression(skipOuter(first)) ? (skipOuter(first) as ts.ArrayLiteralExpression).elements : ctor.args
        return options[0] ? example(options[0], depth + 1) : ''
      }
      case 'optional':
      case 'nullable':
      case 'nullish':
      case 'readonly':
      case 'lazy':
        return first ? (example(first, depth + 1) ?? '') : ''
      case 'record':
      case 'map':
        return {}
      case 'tuple':
        return first && ts.isArrayLiteralExpression(skipOuter(first))
          ? (skipOuter(first) as ts.ArrayLiteralExpression).elements.map((el) => example(el, depth + 1) ?? '')
          : []
      case 'email':
        return 'user@example.com'
      case 'uuid':
        return '00000000-0000-0000-0000-000000000000'
      case 'url':
        return 'https://example.com'
      default:
        return second === undefined && first ? (example(first, depth + 1) ?? '') : ''
    }
  }

  const applyModifiers = (value: unknown, modifiers: Link[], depth: number): unknown => {
    let out = value
    for (const { name, args } of modifiers) {
      const lower = name.toLowerCase()
      const arg = args[0]
      if (lower === 'default' && arg) {
        const v = literalValue(arg, depth)
        if (v !== undefined) out = v
      } else if (lower === 'email') out = 'user@example.com'
      else if (lower === 'uuid' || lower === 'guid') out = '00000000-0000-0000-0000-000000000000'
      else if (lower === 'url' || lower === 'uri') out = 'https://example.com'
      else if (lower === 'datetime' || lower === 'isodate' || lower === 'iso') out = ISO_DATE
      else if ((lower === 'min' || lower === 'gte' || lower === 'positive') && typeof out === 'number') {
        const v = arg ? literalValue(arg, depth) : 1
        out = typeof v === 'number' ? v : 1
      } else if ((lower === 'keys' || lower === 'shape' || lower === 'extend' || lower === 'append') && out && typeof out === 'object') {
        out = { ...(out as object), ...objectFields(arg, depth) }
      } else if (lower === 'merge' && arg && out && typeof out === 'object') {
        const other = example(arg, depth + 1)
        if (other && typeof other === 'object') out = { ...(out as object), ...(other as object) }
      } else if ((lower === 'pick' || lower === 'omit') && out && typeof out === 'object' && arg) {
        const mask = literalValue(arg, depth)
        const keys = Array.isArray(mask) ? mask.map(String) : mask && typeof mask === 'object' ? Object.keys(mask) : []
        out = Object.fromEntries(Object.entries(out as object).filter(([k]) => (lower === 'pick') === keys.includes(k)))
      } else if ((lower === 'items' || lower === 'of' || lower === 'element') && arg) {
        out = [example(arg, depth + 1) ?? '']
      } else if ((lower === 'valid' || lower === 'oneof') && arg) {
        const v = literalValue(arg, depth)
        out = Array.isArray(v) ? v[0] : v
      }
    }
    return out
  }

  /** Joi and yup fields are optional unless `.required()`; zod and TypeBox fields are required unless `.optional()`. */
  const optionalByDefault = (root: string | null): boolean => root === null || /^(joi|yup)$/i.test(root)

  const isRequiredField = (expr: ts.Expression, depth: number): boolean => {
    const e = skipOuter(expr)
    if (ts.isIdentifier(e)) {
      const value = resolve(e.text)
      return value && depth < MAX_DEPTH ? isRequiredField(value, depth + 1) : false
    }
    const chain = chainOf(e)
    if (!chain || chain.links.length === 0) return false
    const names = chain.links.map((l) => l.name.toLowerCase())
    if (names.some((n) => ['optional', 'nullish', 'notrequired', 'default', 'partial'].includes(n))) return false
    if (names.some((n) => ['required', 'exist', 'defined'].includes(n))) return true
    const knownRoot = chain.root ? validatorNames.has(chain.root) : validatorNames.has(chain.links[0].name)
    // A field built on another schema constant takes that schema's convention.
    if (!knownRoot && chain.root && resolve(chain.root)) return isRequiredField(resolve(chain.root)!, depth + 1)
    return !optionalByDefault(knownRoot ? chain.root : null)
  }

  const objectSchema = (arg: ts.Expression | undefined, depth: number): BodySchema => {
    const e = arg ? skipOuter(arg) : undefined
    if (!e) return { type: 'object', properties: {} }
    if (ts.isIdentifier(e)) {
      const value = resolve(e.text)
      return value && depth < MAX_DEPTH ? objectSchema(value, depth + 1) : { type: 'object', properties: {} }
    }
    if (!ts.isObjectLiteralExpression(e)) return schema(e, depth + 1) ?? { type: 'object', properties: {} }
    const properties: Record<string, BodySchema> = {}
    const required: string[] = []
    let out: BodySchema = { type: 'object', properties, required }
    for (const p of e.properties) {
      const key = ts.isPropertyAssignment(p) ? propertyName(p.name) : ts.isShorthandPropertyAssignment(p) ? p.name.text : null
      const value = ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : null
      if (key && value) {
        properties[key] = schema(value, depth + 1) ?? {}
        if (isRequiredField(value, depth + 1)) required.push(key)
      } else if (ts.isSpreadAssignment(p)) {
        out = mergeSchemas(out, objectSchema(p.expression, depth + 1))!
      }
    }
    return out
  }

  const constructSchema = (ctor: Link, depth: number): BodySchema | undefined => {
    const name = ctor.name.toLowerCase()
    const [first] = ctor.args
    switch (name) {
      case 'object':
      case 'strictobject':
        return objectSchema(first, depth)
      case 'string':
        return { type: 'string' }
      case 'number':
      case 'bigint':
        return { type: 'number' }
      case 'integer':
        return { type: 'integer' }
      case 'boolean':
      case 'bool':
        return { type: 'boolean' }
      case 'date':
        return { type: 'string', format: 'date-time' }
      case 'email':
        return { type: 'string', format: 'email' }
      case 'uuid':
        return { type: 'string', format: 'uuid' }
      case 'url':
        return { type: 'string', format: 'uri' }
      case 'array':
        return { type: 'array', ...(first ? { items: schema(first, depth + 1) } : {}) }
      case 'enum':
      case 'nativeenum': {
        const values = first ? literalValue(first, depth) : undefined
        if (Array.isArray(values)) return { enum: values }
        if (values && typeof values === 'object') return { enum: Object.values(values) }
        return undefined
      }
      case 'literal':
        return first ? { enum: [literalValue(first, depth)] } : undefined
      case 'optional':
      case 'nullable':
      case 'nullish':
      case 'readonly':
        return first ? schema(first, depth + 1) : undefined
      case 'record':
      case 'map':
        return { type: 'object' }
      default:
        return undefined
    }
  }

  const applySchemaModifiers = (base: BodySchema | undefined, modifiers: Link[], depth: number): BodySchema | undefined => {
    let out = base
    for (const { name, args } of modifiers) {
      const lower = name.toLowerCase()
      const n = args[0] ? literalValue(args[0], depth) : undefined
      const limit = typeof n === 'number' ? n : undefined
      const isText = out?.type === 'string' || out?.type === 'array'
      if (lower === 'email') out = { ...out, type: 'string', format: 'email' }
      else if (lower === 'uuid' || lower === 'guid') out = { ...out, type: 'string', format: 'uuid' }
      else if (lower === 'url' || lower === 'uri') out = { ...out, type: 'string', format: 'uri' }
      else if (lower === 'datetime' || lower === 'isodate' || lower === 'iso') out = { ...out, type: 'string', format: 'date-time' }
      else if (lower === 'int' || lower === 'integer') out = { ...out, type: 'integer' }
      else if (lower === 'nonempty') out = { ...out, minLength: 1 }
      else if (limit !== undefined && (lower === 'min' || lower === 'gte')) out = { ...out, ...(isText ? { minLength: limit } : { minimum: limit }) }
      else if (limit !== undefined && (lower === 'max' || lower === 'lte')) out = { ...out, ...(isText ? { maxLength: limit } : { maximum: limit }) }
      else if (limit !== undefined && lower === 'length' && isText) out = { ...out, minLength: limit, maxLength: limit }
      else if ((lower === 'valid' || lower === 'oneof') && n !== undefined) out = { ...out, enum: Array.isArray(n) ? n : args.map((a) => literalValue(a, depth)) }
      else if (lower === 'keys' || lower === 'shape' || lower === 'extend' || lower === 'append') out = mergeSchemas(out, objectSchema(args[0], depth))
      else if (lower === 'merge' && args[0]) out = mergeSchemas(out, schema(args[0], depth + 1))
      else if ((lower === 'items' || lower === 'of' || lower === 'element') && args[0]) out = { ...out, type: 'array', items: schema(args[0], depth + 1) }
      else if (lower === 'partial' && out?.type === 'object') out = { ...out, required: [] }
      else if ((lower === 'pick' || lower === 'omit') && out?.properties && args[0]) {
        const mask = literalValue(args[0], depth)
        const keys = Array.isArray(mask) ? mask.map(String) : mask && typeof mask === 'object' ? Object.keys(mask) : []
        const keep = (k: string) => (lower === 'pick') === keys.includes(k)
        out = {
          ...out,
          properties: Object.fromEntries(Object.entries(out.properties!).filter(([k]) => keep(k))),
          required: out.required?.filter(keep)
        }
      }
    }
    return out
  }

  /** Validation rules of a schema expression, mirroring `example`. */
  const schema = (expr: ts.Expression, depth = 0): BodySchema | undefined => {
    if (depth > MAX_DEPTH) return undefined
    const e = skipOuter(expr)
    if (ts.isIdentifier(e)) {
      const value = resolve(e.text)
      return value ? schema(value, depth + 1) : undefined
    }
    if (ts.isObjectLiteralExpression(e)) {
      const value = literalValue(e, depth)
      return value && typeof value === 'object' && ('type' in value || 'properties' in value) ? fromJsonSchema(value) : undefined
    }
    const chain = chainOf(e)
    if (!chain || chain.links.length === 0) return undefined
    const rootKnown = chain.root ? validatorNames.has(chain.root) : validatorNames.has(chain.links[0].name)
    if (!rootKnown) {
      if (!chain.root || !resolve(chain.root)) return undefined
      return applySchemaModifiers(schema(resolve(chain.root)!, depth + 1), chain.links, depth)
    }
    const [ctor, ...modifiers] = chain.links
    // TypeBox / JSON-Schema-style options: `Type.String({ minLength: 3, format: 'email' })`.
    const optionsArg = ctor.args[/^(object|array|strictobject)$/i.test(ctor.name) ? 1 : 0]
    const options = optionsArg && ts.isObjectLiteralExpression(skipOuter(optionsArg)) ? literalValue(optionsArg, depth) : undefined
    const fromOptions = options && typeof options === 'object' ? fromJsonSchema({ ...(options as object), properties: undefined, type: undefined }) : undefined
    return applySchemaModifiers(mergeSchemas(constructSchema(ctor, depth), fromOptions), modifiers, depth)
  }

  return {
    // The rules travel with the example object (see `attachSchema`).
    example: (expr) => attachSchema(example(expr), schema(expr)),
    isSchema: (expr) => {
      const value = example(expr)
      return value !== undefined
    },
    fields: (expr) => {
      const value = example(expr)
      return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []
    }
  }
}
