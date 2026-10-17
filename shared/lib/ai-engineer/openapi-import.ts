import { v4 as uuidv4 } from 'uuid'
import type { HttpMethod } from '../../types/api-studio'
import type { ApiSpec, ApiSpecEndpoint, ApiSpecParameter, ApiSpecRequestBody, ApiSpecResponse } from '../../types/ai-engineer'
import { resolveRef, schemaExample } from '../schema-example'
import { fromJsonSchema } from '../body-schema'

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function schemaSummary(schema: unknown): string | undefined {
  if (!isRecord(schema)) return undefined
  if (schema.type) return String(schema.type)
  if (schema.$ref) return String(schema.$ref)
  if (Array.isArray(schema.required)) return `object(${schema.required.length} required)`
  return undefined
}

function paramExample(item: Record<string, unknown>, root: unknown): string | undefined {
  const value = item.example !== undefined ? item.example : schemaExample(item.schema ?? item, root)
  return value === undefined || value === null || typeof value === 'object' ? undefined : String(value)
}

/**
 * Path-item and operation parameters merged (the operation wins for the same name + location),
 * with `$ref`s resolved. Swagger 2 `in: body` / `formData` are returned separately as the body.
 */
function parseParameters(
  pathLevel: unknown,
  operationLevel: unknown,
  root: unknown
): { parameters: ApiSpecParameter[]; body: Record<string, unknown>[]; form: Record<string, unknown>[] } {
  const merged = new Map<string, Record<string, unknown>>()
  for (const list of [pathLevel, operationLevel]) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      const item = resolveRef(raw, root)
      if (!isRecord(item) || typeof item.name !== 'string' || typeof item.in !== 'string') continue
      merged.set(`${item.in}:${item.name}`, item)
    }
  }
  const parameters: ApiSpecParameter[] = []
  const body: Record<string, unknown>[] = []
  const form: Record<string, unknown>[] = []
  for (const item of merged.values()) {
    if (item.in === 'body') body.push(item)
    else if (item.in === 'formData') form.push(item)
    else if (['path', 'query', 'header', 'cookie'].includes(item.in as string)) {
      parameters.push({
        name: item.name as string,
        in: item.in as ApiSpecParameter['in'],
        required: Boolean(item.required),
        schemaType: schemaSummary(isRecord(item.schema) ? item.schema : item),
        description: typeof item.description === 'string' ? item.description : undefined,
        example: paramExample(item, root)
      })
    }
  }
  return { parameters, body, form }
}

function parseRequestBody(raw: unknown, root: unknown): ApiSpecRequestBody | undefined {
  const body = resolveRef(raw, root)
  if (!isRecord(body)) return undefined
  const content = isRecord(body.content) ? body.content : {}
  const contentTypes = Object.keys(content)
  let example: unknown
  let schemaSummaryText: string | undefined
  let schema: ApiSpecRequestBody['schema']
  // Prefer JSON when an operation accepts several media types.
  const ordered = [...contentTypes].sort((a, b) => Number(b.includes('json')) - Number(a.includes('json')))
  for (const ct of ordered) {
    const media = content[ct]
    if (!isRecord(media)) continue
    if (example === undefined && media.example !== undefined) example = media.example
    if (example === undefined && isRecord(media.examples)) {
      const first = resolveRef(Object.values(media.examples)[0], root)
      if (isRecord(first) && first.value !== undefined) example = first.value
    }
    if (media.schema !== undefined) {
      schemaSummaryText ??= schemaSummary(resolveRef(media.schema, root))
      schema ??= fromJsonSchema(media.schema, root)
      if (example === undefined) example = schemaExample(media.schema, root)
    }
  }
  return { required: Boolean(body.required), contentTypes, schemaSummary: schemaSummaryText, example, ...(schema ? { schema } : {}) }
}

/** Swagger 2: the body is a parameter (`in: body`) or a set of `formData` fields. */
function swagger2Body(
  body: Record<string, unknown>[],
  form: Record<string, unknown>[],
  consumes: unknown,
  root: unknown
): ApiSpecRequestBody | undefined {
  const types = Array.isArray(consumes) ? consumes.filter((c): c is string => typeof c === 'string') : []
  if (body[0]) {
    return {
      required: Boolean(body[0].required),
      contentTypes: types.length ? types : ['application/json'],
      schemaSummary: schemaSummary(resolveRef(body[0].schema, root)),
      example: schemaExample(body[0].schema, root),
      schema: fromJsonSchema(body[0].schema, root)
    }
  }
  if (form.length) {
    return {
      required: form.some((f) => f.required),
      contentTypes: types.length ? types : ['application/x-www-form-urlencoded'],
      example: Object.fromEntries(form.map((f) => [f.name as string, paramExample(f, root) ?? '']))
    }
  }
  return undefined
}

function parseResponses(raw: unknown): ApiSpecResponse[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw).map(([status, value]) => ({
    status,
    description: isRecord(value) && typeof value.description === 'string' ? value.description : undefined,
    schemaSummary: isRecord(value) && isRecord(value.content) ? 'has-body' : undefined
  }))
}

function inferBaseUrl(doc: Record<string, unknown>): string {
  const servers = doc.servers
  if (Array.isArray(servers) && servers[0] && isRecord(servers[0]) && typeof servers[0].url === 'string') {
    return servers[0].url.replace(/\/$/, '')
  }
  return 'https://api.example.com'
}

function hasSecurity(operation: Record<string, unknown>, rootSecurity: unknown): boolean {
  const sec = operation.security ?? rootSecurity
  return Array.isArray(sec) && sec.length > 0
}

export function parseOpenApiDocument(json: string, name = 'Imported API'): ApiSpec {
  const doc = JSON.parse(json) as Record<string, unknown>
  if (!doc || typeof doc !== 'object') throw new Error('Invalid OpenAPI document')
  const paths = isRecord(doc.paths) ? doc.paths : {}
  const baseUrl = inferBaseUrl(doc)
  const rootSecurity = doc.security
  const endpoints: ApiSpecEndpoint[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue
      if (!isRecord(operation)) continue
      const httpMethod = method.toUpperCase() as HttpMethod
      const params = parseParameters(pathItem.parameters, operation.parameters, doc)
      endpoints.push({
        id: uuidv4(),
        method: httpMethod,
        path,
        operationId: typeof operation.operationId === 'string' ? operation.operationId : undefined,
        summary: typeof operation.summary === 'string' ? operation.summary : undefined,
        description: typeof operation.description === 'string' ? operation.description : undefined,
        parameters: params.parameters,
        requestBody:
          parseRequestBody(operation.requestBody, doc) ??
          swagger2Body(params.body, params.form, operation.consumes ?? doc.consumes, doc),
        responses: parseResponses(operation.responses),
        securityRequired: hasSecurity(operation, rootSecurity),
        tags: Array.isArray(operation.tags) ? operation.tags.filter((t): t is string => typeof t === 'string') : []
      })
    }
  }

  const authEndpoints = endpoints.filter(
    (e) =>
      /auth|login|token|oauth/i.test(`${e.path} ${e.operationId ?? ''} ${e.summary ?? ''}`) ||
      e.tags.some((t) => /auth/i.test(t))
  )

  return {
    id: uuidv4(),
    name: typeof doc.info === 'object' && doc.info && typeof (doc.info as Record<string, unknown>).title === 'string'
      ? String((doc.info as Record<string, unknown>).title)
      : name,
    version:
      typeof doc.info === 'object' && doc.info && typeof (doc.info as Record<string, unknown>).version === 'string'
        ? String((doc.info as Record<string, unknown>).version)
        : undefined,
    baseUrl,
    endpoints,
    analyzedAt: new Date().toISOString(),
    source: 'openapi',
    endpointCount: endpoints.length,
    authEndpointCount: authEndpoints.length,
    protectedEndpointCount: endpoints.filter((e) => e.securityRequired).length
  }
}
