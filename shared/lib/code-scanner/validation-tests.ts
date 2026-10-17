/**
 * Validation tests from the rules the scanner found (OpenAPI schemas, zod/joi/yup/TypeBox,
 * class-validator, Pydantic): one request per broken rule, each expecting the API to reject it.
 */
import type { BodySchema } from '../../types/ai-engineer'
import type { DetectedEndpoint } from '../../types/code-scanner'

/** Enough to cover every field's main rule without flooding a folder. */
const MAX_CASES_PER_ENDPOINT = 10
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

export interface ValidationCase {
  /** Stable id for re-scan merges, e.g. `missing:email`. */
  id: string
  /** Shown in the request name, e.g. `missing email`. */
  label: string
  body: Record<string, unknown>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** A value that passes the field's rules, so each case breaks exactly one thing. */
function validValue(schema: BodySchema, example: unknown): unknown {
  if (schema.enum?.length) return schema.enum.includes(example) ? example : schema.enum[0]
  switch (schema.format) {
    case 'email':
      return typeof example === 'string' && example.includes('@') ? example : 'user@example.com'
    case 'uuid':
      return '00000000-0000-4000-8000-000000000000'
    case 'uri':
    case 'url':
      return 'https://example.com'
    case 'date-time':
      return '2024-01-01T00:00:00.000Z'
    case 'date':
      return '2024-01-01'
  }
  if (schema.type === 'string' || (schema.type === undefined && typeof example === 'string')) {
    let text = typeof example === 'string' && example ? example : 'example'
    if (schema.minLength !== undefined && text.length < schema.minLength) text = text.padEnd(schema.minLength, 'x')
    if (schema.maxLength !== undefined && text.length > schema.maxLength) text = text.slice(0, schema.maxLength)
    return text
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    let n = typeof example === 'number' ? example : 1
    if (schema.minimum !== undefined && n < schema.minimum) n = schema.minimum
    if (schema.maximum !== undefined && n > schema.maximum) n = schema.maximum
    return n
  }
  if (schema.type === 'boolean') return typeof example === 'boolean' ? example : true
  if (schema.type === 'array') return Array.isArray(example) ? example : []
  if (schema.type === 'object' && schema.properties) return validBody(schema, example)
  return example ?? ''
}

/** The example body with every known rule satisfied. */
export function validBody(schema: BodySchema, example: unknown): Record<string, unknown> {
  const base = isPlainObject(example) ? { ...example } : {}
  for (const [name, rules] of Object.entries(schema.properties ?? {})) {
    if (name in base || schema.required?.includes(name)) base[name] = validValue(rules, base[name])
  }
  return base
}

const WRONG_TYPE: Record<string, unknown> = {
  string: 12345,
  number: 'not-a-number',
  integer: 'not-a-number',
  boolean: 'not-a-boolean',
  array: 'not-an-array',
  object: 'not-an-object'
}

const BAD_FORMAT: Record<string, string> = {
  email: 'not-an-email',
  uuid: 'not-a-uuid',
  uri: 'not a url',
  url: 'not a url',
  'date-time': 'not-a-date',
  date: 'not-a-date'
}

/** Cases that break one rule of the body, most telling first: missing fields, bad formats, types, limits. */
export function validationCases(endpoint: DetectedEndpoint): ValidationCase[] {
  const schema = endpoint.requestBody?.schema
  if (!schema?.properties || !BODY_METHODS.has(endpoint.method) || endpoint.graphql) return []
  const valid = validBody(schema, endpoint.requestBody?.example)
  const fields = Object.entries(schema.properties)
  const without = (name: string) => Object.fromEntries(Object.entries(valid).filter(([k]) => k !== name))
  const withValue = (name: string, value: unknown) => ({ ...valid, [name]: value })

  const missing: ValidationCase[] = (schema.required ?? [])
    .filter((name) => name in schema.properties!)
    .map((name) => ({ id: `missing:${name}`, label: `missing ${name}`, body: without(name) }))
  const format: ValidationCase[] = []
  const types: ValidationCase[] = []
  const limits: ValidationCase[] = []
  for (const [name, rules] of fields) {
    if (rules.format && BAD_FORMAT[rules.format]) {
      format.push({ id: `format:${name}`, label: `invalid ${name} (${rules.format})`, body: withValue(name, BAD_FORMAT[rules.format]) })
    }
    if (rules.enum?.length) format.push({ id: `enum:${name}`, label: `${name} not one of the allowed values`, body: withValue(name, '__invalid__') })
    // A format case already sends the wrong kind of value.
    else if (rules.type && !rules.format && WRONG_TYPE[rules.type] !== undefined) {
      types.push({ id: `type:${name}`, label: `${name} is not ${rules.type === 'integer' ? 'an integer' : `a ${rules.type}`}`, body: withValue(name, WRONG_TYPE[rules.type]) })
    }
    if (rules.minLength !== undefined && rules.minLength > 0) {
      limits.push({ id: `minLength:${name}`, label: `${name} shorter than ${rules.minLength}`, body: withValue(name, 'x'.repeat(rules.minLength - 1)) })
    }
    if (rules.maxLength !== undefined && rules.maxLength < 10_000) {
      limits.push({ id: `maxLength:${name}`, label: `${name} longer than ${rules.maxLength}`, body: withValue(name, 'x'.repeat(rules.maxLength + 1)) })
    }
    if (rules.minimum !== undefined) limits.push({ id: `minimum:${name}`, label: `${name} below ${rules.minimum}`, body: withValue(name, rules.minimum - 1) })
    if (rules.maximum !== undefined) limits.push({ id: `maximum:${name}`, label: `${name} above ${rules.maximum}`, body: withValue(name, rules.maximum + 1) })
  }
  return [...missing, ...format, ...types, ...limits].slice(0, MAX_CASES_PER_ENDPOINT)
}

/** Test script for a validation case: a 4xx that isn't about auth or routing passes; 2xx and 5xx fail. */
export function validationTestScript(label: string): string {
  return `// Generated by the Code Scanner: the API should reject this body (${label}).
pm.test("rejects ${label.replace(/["\\]/g, '')}", function () {
  var status = pm.response.status
  if (status >= 500) throw new Error("Server error " + status + ": invalid input should be rejected with a 4xx, not crash the handler")
  if (status === 401 || status === 403) throw new Error("Got " + status + ": sign in first (send the login request) so the body is validated")
  if (status === 404 || status === 405) throw new Error("Got " + status + ": the route was not found; check {{baseUrl}} and path parameters")
  if (status < 400) throw new Error("Accepted with " + status + ": the API did not validate this input")
})
`
}
