/**
 * `BodySchema`: the validation rules of a request body, as a small resolved JSON Schema subset.
 * Built from OpenAPI / JSON Schema here, and from validators in code by the Code Scanner.
 */
import type { BodySchema } from '../types/ai-engineer'
import { resolveRef } from './schema-example'

const MAX_DEPTH = 4
const MAX_PROPERTIES = 40
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean'])

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/** Converts a JSON Schema (OpenAPI 3, Swagger 2, Fastify) to a `BodySchema`, following local `$ref`s. */
export function fromJsonSchema(input: unknown, root: unknown = input, depth = 0, seen: Set<string> = new Set()): BodySchema | undefined {
  let schema = input
  if (isRecord(schema) && typeof schema.$ref === 'string') {
    if (seen.has(schema.$ref)) return undefined
    seen = new Set(seen).add(schema.$ref)
    schema = resolveRef(schema, root)
  }
  if (!isRecord(schema) || depth > MAX_DEPTH) return undefined
  // `allOf` composes objects (a `User` extending a `Base`): merge their rules.
  if (Array.isArray(schema.allOf)) {
    return schema.allOf
      .map((part) => fromJsonSchema(part, root, depth + 1, seen))
      .reduce<BodySchema | undefined>((acc, part) => (part ? mergeSchemas(acc, part) : acc), undefined)
  }
  // A union has no single rule set we can test against; keep only what every option shares.
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) return undefined

  const rawType = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type
  const type = typeof rawType === 'string' && TYPES.has(rawType) ? (rawType as BodySchema['type']) : isRecord(schema.properties) ? 'object' : undefined
  const out: BodySchema = {}
  if (type) out.type = type
  if (typeof schema.format === 'string') out.format = schema.format
  if (Array.isArray(schema.enum) && schema.enum.length) out.enum = schema.enum
  if (schema.const !== undefined) out.enum = [schema.const]
  const limits = {
    minLength: num(schema.minLength),
    maxLength: num(schema.maxLength),
    minimum: num(schema.minimum),
    maximum: num(schema.maximum)
  }
  for (const [key, value] of Object.entries(limits)) if (value !== undefined) out[key as keyof typeof limits] = value
  if (isRecord(schema.properties)) {
    out.properties = {}
    for (const [name, value] of Object.entries(schema.properties).slice(0, MAX_PROPERTIES)) {
      out.properties[name] = fromJsonSchema(value, root, depth + 1, seen) ?? {}
    }
    if (Array.isArray(schema.required)) out.required = schema.required.filter((r): r is string => typeof r === 'string')
  }
  if (schema.items !== undefined) {
    const items = fromJsonSchema(schema.items, root, depth + 1, seen)
    if (items) out.items = items
  }
  return Object.keys(out).length ? out : undefined
}

/** `b`'s rules on top of `a`'s (properties and required fields are combined). */
export function mergeSchemas(a: BodySchema | undefined, b: BodySchema | undefined): BodySchema | undefined {
  if (!a) return b
  if (!b) return a
  const out: BodySchema = { ...a, ...b }
  if (a.properties || b.properties) out.properties = { ...a.properties, ...b.properties }
  if (a.required || b.required) out.required = [...new Set([...(a.required ?? []), ...(b.required ?? [])])]
  return out
}

/** Whether a schema has any rule a validation test could check. */
export function hasRules(schema: BodySchema | undefined): boolean {
  if (!schema) return false
  if (schema.required?.length || schema.enum || schema.format) return true
  if ([schema.minLength, schema.maxLength, schema.minimum, schema.maximum].some((v) => v !== undefined)) return true
  return Object.values(schema.properties ?? {}).some((p) => p.type !== undefined || hasRules(p))
}

const examples = new WeakMap<object, BodySchema>()

/**
 * Validators hand example bodies around (constants, imports, merges); their rules ride along with
 * the example object instead of every map and merge carrying a second value.
 */
export function attachSchema<T>(example: T, schema: BodySchema | undefined): T {
  if (schema && example && typeof example === 'object') examples.set(example, schema)
  return example
}

export function schemaOf(example: unknown): BodySchema | undefined {
  return example && typeof example === 'object' ? examples.get(example) : undefined
}

/** `{ ...a, ...b }` for two example bodies, keeping both bodies' rules. */
export function mergeExamples(a: unknown, b: unknown): unknown {
  if (!(a && typeof a === 'object' && b && typeof b === 'object')) return b
  return attachSchema({ ...(a as object), ...(b as object) }, mergeSchemas(schemaOf(a), schemaOf(b)))
}
