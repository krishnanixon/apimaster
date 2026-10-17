/**
 * Example values from JSON Schema (OpenAPI 3 / Swagger 2 schemas, Fastify route schemas).
 * Prefers what the schema states (`example`, `default`, `enum`, `const`), else a placeholder
 * of the right type and format.
 */

const ISO_DATE_TIME = '2024-01-01T00:00:00.000Z'
const MAX_DEPTH = 4
const MAX_PROPERTIES = 40

type Schema = Record<string, unknown>

function isRecord(value: unknown): value is Schema {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Follows a local `$ref` (`#/components/schemas/User`) within `root`. */
export function resolveRef<T = unknown>(value: T, root: unknown, seen: Set<string> = new Set()): T {
  if (!isRecord(value) || typeof value.$ref !== 'string') return value
  const ref = value.$ref
  if (!ref.startsWith('#/') || seen.has(ref)) return {} as T
  seen.add(ref)
  let target: unknown = root
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
    target = isRecord(target) ? target[key] : undefined
  }
  return resolveRef(target as T, root, seen)
}

function formatExample(format: string | undefined): unknown {
  switch (format) {
    case 'email':
      return 'user@example.com'
    case 'uuid':
      return '00000000-0000-0000-0000-000000000000'
    case 'uri':
    case 'url':
      return 'https://example.com'
    case 'date-time':
      return ISO_DATE_TIME
    case 'date':
      return '2024-01-01'
    case 'password':
      return ''
    default:
      return undefined
  }
}

export function schemaExample(input: unknown, root: unknown = input, depth = 0, seen: Set<string> = new Set()): unknown {
  let schema = input
  if (isRecord(schema) && typeof schema.$ref === 'string') {
    // Stop on recursive schemas (a User with a `friends: User[]`).
    if (seen.has(schema.$ref)) return {}
    seen = new Set(seen).add(schema.$ref)
    schema = resolveRef(schema, root)
  }
  if (!isRecord(schema)) return undefined
  if (schema.example !== undefined) return schema.example
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0]
  if (schema.const !== undefined) return schema.const
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]

  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const parts = schema[key]
    if (!Array.isArray(parts) || parts.length === 0) continue
    if (key !== 'allOf') return schemaExample(parts.find((p) => !(isRecord(p) && p.type === 'null')) ?? parts[0], root, depth, seen)
    const merged: Record<string, unknown> = {}
    for (const part of parts) {
      const value = schemaExample(part, root, depth, seen)
      if (isRecord(value)) Object.assign(merged, value)
    }
    return merged
  }

  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type
  if (type === 'object' || isRecord(schema.properties)) {
    if (depth >= MAX_DEPTH) return {}
    const out: Record<string, unknown> = {}
    const properties = isRecord(schema.properties) ? Object.entries(schema.properties).slice(0, MAX_PROPERTIES) : []
    for (const [name, property] of properties) {
      const resolved = resolveRef(property, root)
      if (isRecord(resolved) && resolved.readOnly === true) continue
      out[name] = schemaExample(property, root, depth + 1, seen)
    }
    return out
  }
  if (type === 'array') {
    if (depth >= MAX_DEPTH || schema.items === undefined) return []
    const item = schemaExample(schema.items, root, depth + 1, seen)
    return item === undefined ? [] : [item]
  }
  if (type === 'integer' || type === 'number') return typeof schema.minimum === 'number' ? schema.minimum : 0
  if (type === 'boolean') return false
  if (type === 'string') return formatExample(typeof schema.format === 'string' ? schema.format : undefined) ?? ''
  return undefined
}

/** Top-level property names of an object schema (for query-string schemas). */
export function schemaPropertyNames(input: unknown, root: unknown = input): string[] {
  const schema = resolveRef(input, root)
  return isRecord(schema) && isRecord(schema.properties) ? Object.keys(schema.properties) : []
}
