import type { ApiCollection, ApiRequest, HttpMethod } from '../types/api.types'
import { applyParentInheritance } from './inheritance'

type OpenApiMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options'

function toOpenApiMethod(method: HttpMethod): OpenApiMethod {
  return method.toLowerCase() as OpenApiMethod
}

function inferServerUrl(collection: ApiCollection): string {
  for (const req of collection.requests) {
    const match = req.url.match(/^(https?:\/\/[^/]+)/i)
    if (match) return match[1]
  }
  return 'https://api.example.com'
}

function pathAndParams(url: string): { path: string; queryKeys: string[] } {
  try {
    const hasScheme = /^https?:\/\//i.test(url)
    const parsed = new URL(url, hasScheme ? undefined : 'https://api.example.com')
    const queryKeys = [...parsed.searchParams.keys()]
    // Keep path; convert common :id style if present in pathname segments
    const path = parsed.pathname || '/'
    return { path, queryKeys }
  } catch {
    const [pathPart, queryPart = ''] = url.split('?')
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart || ''}`
    const queryKeys = queryPart
      .split('&')
      .map((p) => p.split('=')[0])
      .filter(Boolean)
    return { path: path || '/', queryKeys }
  }
}

function operationFromRequest(request: ApiRequest, collection: ApiCollection, folderName?: string) {
  const effective = applyParentInheritance(request, collection)
  const { path, queryKeys } = pathAndParams(request.url)
  const parameters = [
    ...request.queryParams
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => ({
        name: p.key,
        in: 'query' as const,
        required: false,
        schema: { type: 'string' as const },
        example: p.value || undefined
      })),
    // Include URL-inferred query keys not already listed
    ...queryKeys
      .filter((k) => !request.queryParams.some((p) => p.key === k))
      .map((k) => ({
        name: k,
        in: 'query' as const,
        required: false,
        schema: { type: 'string' as const }
      })),
    ...effective.headers
      .filter((h) => h.enabled && h.key.trim() && !/^content-type$/i.test(h.key))
      .map((h) => ({
        name: h.key,
        in: 'header' as const,
        required: false,
        schema: { type: 'string' as const },
        example: h.value || undefined
      }))
  ]

  let requestBody: Record<string, unknown> | undefined
  if (request.body.type !== 'none' && request.method !== 'GET' && request.method !== 'HEAD') {
    if (request.body.type === 'json') {
      let example: unknown = request.body.content
      try {
        example = JSON.parse(request.body.content || '{}')
      } catch {
        /* keep string */
      }
      requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object' },
            example
          }
        }
      }
    } else if (request.body.type === 'x-www-form-urlencoded') {
      requestBody = {
        required: true,
        content: {
          'application/x-www-form-urlencoded': {
            schema: { type: 'object', additionalProperties: { type: 'string' } }
          }
        }
      }
    } else if (request.body.type === 'form-data') {
      requestBody = {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { type: 'object', additionalProperties: { type: 'string' } }
          }
        }
      }
    } else {
      requestBody = {
        required: true,
        content: {
          'text/plain': {
            schema: { type: 'string' },
            example: request.body.content
          }
        }
      }
    }
  }

  const security =
    effective.auth.type === 'bearer' || effective.auth.type === 'jwt' || effective.auth.type === 'oauth2'
      ? [{ bearerAuth: [] }]
      : effective.auth.type === 'apiKey'
        ? [{ apiKeyAuth: [] }]
        : effective.auth.type === 'basic'
          ? [{ basicAuth: [] }]
          : undefined

  return {
    path,
    method: toOpenApiMethod(request.method),
    operation: {
      operationId: request.id.replace(/[^a-zA-Z0-9_-]/g, '_'),
      summary: request.name,
      description: folderName ? `Folder: ${folderName}` : undefined,
      tags: folderName ? [folderName] : ['Root'],
      parameters: parameters.length ? parameters : undefined,
      requestBody,
      security,
      responses: {
        '200': { description: 'Successful response' },
        default: { description: 'Error response' }
      }
    }
  }
}

/** Export collection as OpenAPI 3.1 JSON. */
export function exportToOpenApi(collection: ApiCollection): string {
  const paths: Record<string, Record<string, unknown>> = {}
  const tags = new Set<string>()

  for (const request of collection.requests) {
    if (request.requestType === 'websocket') continue
    const folderName = collection.folders.find((f) => f.id === request.folderId)?.name
    if (folderName) tags.add(folderName)
    else tags.add('Root')

    const { path, method, operation } = operationFromRequest(request, collection, folderName)
    if (!paths[path]) paths[path] = {}
    // If duplicate method+path, suffix with request name in summary only — last write wins for path item
    paths[path][method] = operation
  }

  const resolvedAuth = collection.requests.map((r) => applyParentInheritance(r, collection).auth)
  const hasBearer = resolvedAuth.some(
    (a) => a.type === 'bearer' || a.type === 'jwt' || a.type === 'oauth2'
  )
  const hasApiKey = resolvedAuth.some((a) => a.type === 'apiKey')
  const hasBasic = resolvedAuth.some((a) => a.type === 'basic')

  const securitySchemes: Record<string, unknown> = {}
  if (hasBearer) {
    securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
  }
  if (hasBasic) {
    securitySchemes.basicAuth = { type: 'http', scheme: 'basic' }
  }
  if (hasApiKey) {
    const sample = resolvedAuth.find((a) => a.type === 'apiKey')
    securitySchemes.apiKeyAuth = {
      type: 'apiKey',
      in: sample?.apiKeyLocation === 'query' ? 'query' : 'header',
      name: sample?.apiKeyName || 'X-API-Key'
    }
  }

  const doc = {
    openapi: '3.1.0',
    info: {
      title: collection.name,
      description: collection.description || `Exported from API Studio on ${new Date().toISOString()}`,
      version: '1.0.0'
    },
    servers: [{ url: inferServerUrl(collection) }],
    tags: [...tags].map((name) => ({ name })),
    paths,
    components: Object.keys(securitySchemes).length ? { securitySchemes } : undefined
  }

  return JSON.stringify(doc, null, 2)
}
