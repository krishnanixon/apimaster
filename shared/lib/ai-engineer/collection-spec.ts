import { v4 as uuidv4 } from 'uuid'
import type { ApiCollection, ApiRequest, HttpMethod } from '../../types/api-studio'
import type { ApiSpec, ApiSpecEndpoint, ApiSpecParameter } from '../../types/ai-engineer'

function inferBaseUrl(collection: ApiCollection): string {
  for (const req of collection.requests) {
    const match = req.url.match(/^(https?:\/\/[^/]+)/i)
    if (match) return match[1]
  }
  return '{{baseUrl}}'
}

function pathFromUrl(url: string): { path: string; query: ApiSpecParameter[] } {
  try {
    const hasScheme = /^https?:\/\//i.test(url)
    const parsed = new URL(url, hasScheme ? undefined : 'https://api.example.com')
    const query: ApiSpecParameter[] = [...parsed.searchParams.keys()].map((name) => ({
      name,
      in: 'query' as const,
      required: false,
      schemaType: 'string'
    }))
    return { path: parsed.pathname || '/', query }
  } catch {
    const [pathPart, queryPart = ''] = url.split('?')
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart || ''}`
    const query = queryPart
      .split('&')
      .map((p) => p.split('=')[0])
      .filter(Boolean)
      .map((name) => ({ name, in: 'query' as const, required: false, schemaType: 'string' }))
    return { path: path || '/', query }
  }
}

function authRequired(request: ApiRequest, collection: ApiCollection): boolean {
  const auth = request.auth?.type ?? collection.auth?.type ?? 'none'
  return auth !== 'none' && auth !== 'inherit'
}

function endpointFromRequest(request: ApiRequest, collection: ApiCollection): ApiSpecEndpoint | null {
  if (request.requestType !== 'http' || !request.url.trim()) return null
  const { path, query } = pathFromUrl(request.url)
  const parameters: ApiSpecParameter[] = [
    ...query,
    ...request.queryParams
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => ({
        name: p.key,
        in: 'query' as const,
        required: false,
        schemaType: 'string'
      })),
    ...(request.pathParams ?? [])
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => ({
        name: p.key,
        in: 'path' as const,
        required: true,
        schemaType: 'string'
      }))
  ]

  let requestBody: ApiSpecEndpoint['requestBody']
  if (request.body.type === 'json' && request.body.content.trim()) {
    requestBody = {
      required: true,
      contentTypes: ['application/json'],
      schemaSummary: 'json',
      example: tryParseJson(request.body.content)
    }
  } else if (request.body.type !== 'none') {
    requestBody = {
      required: false,
      contentTypes: [request.body.type],
      schemaSummary: request.body.type
    }
  }

  const securityRequired = authRequired(request, collection)

  return {
    id: request.id,
    method: request.method as HttpMethod,
    path,
    summary: request.name,
    description: request.description || undefined,
    parameters,
    requestBody,
    responses: [{ status: '2XX', description: 'Expected success (inferred from collection)' }],
    securityRequired,
    tags: request.folderId ? ['folder'] : []
  }
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function buildApiSpecFromCollection(collection: ApiCollection): ApiSpec {
  const endpoints: ApiSpecEndpoint[] = []
  for (const request of collection.requests) {
    const ep = endpointFromRequest(request, collection)
    if (ep) endpoints.push(ep)
  }

  const authEndpoints = endpoints.filter((e) =>
    /auth|login|token|oauth/i.test(`${e.path} ${e.summary ?? ''}`)
  )

  return {
    id: uuidv4(),
    name: collection.name,
    baseUrl: inferBaseUrl(collection),
    endpoints,
    analyzedAt: new Date().toISOString(),
    source: 'collection',
    endpointCount: endpoints.length,
    authEndpointCount: authEndpoints.length,
    protectedEndpointCount: endpoints.filter((e) => e.securityRequired).length
  }
}
