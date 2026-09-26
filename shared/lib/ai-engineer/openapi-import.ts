import { v4 as uuidv4 } from 'uuid'
import type { HttpMethod } from '../../types/api-studio'
import type { ApiSpec, ApiSpecEndpoint, ApiSpecParameter, ApiSpecRequestBody, ApiSpecResponse } from '../../types/ai-engineer'

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

function parseParameters(raw: unknown): ApiSpecParameter[] {
  if (!Array.isArray(raw)) return []
  const out: ApiSpecParameter[] = []
  for (const item of raw) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.in !== 'string') continue
    if (!['path', 'query', 'header', 'cookie'].includes(item.in)) continue
    out.push({
      name: item.name,
      in: item.in as ApiSpecParameter['in'],
      required: Boolean(item.required),
      schemaType: isRecord(item.schema) ? schemaSummary(item.schema) : undefined,
      description: typeof item.description === 'string' ? item.description : undefined
    })
  }
  return out
}

function parseRequestBody(raw: unknown): ApiSpecRequestBody | undefined {
  if (!isRecord(raw)) return undefined
  const content = isRecord(raw.content) ? raw.content : {}
  const contentTypes = Object.keys(content)
  let example: unknown
  let schemaSummaryText: string | undefined
  for (const ct of contentTypes) {
    const media = content[ct]
    if (!isRecord(media)) continue
    if (media.example !== undefined) example = media.example
    if (isRecord(media.schema)) schemaSummaryText = schemaSummary(media.schema)
  }
  return {
    required: Boolean(raw.required),
    contentTypes,
    schemaSummary: schemaSummaryText,
    example
  }
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
      endpoints.push({
        id: uuidv4(),
        method: httpMethod,
        path,
        operationId: typeof operation.operationId === 'string' ? operation.operationId : undefined,
        summary: typeof operation.summary === 'string' ? operation.summary : undefined,
        description: typeof operation.description === 'string' ? operation.description : undefined,
        parameters: parseParameters(operation.parameters ?? pathItem.parameters),
        requestBody: parseRequestBody(operation.requestBody),
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
