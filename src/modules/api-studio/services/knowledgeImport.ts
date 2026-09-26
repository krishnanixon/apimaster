import { v4 as uuidv4 } from 'uuid'
import type { APIEndpoint } from '@shared/types/knowledge'
import type { ApiCollection, ApiRequest, HttpMethod, KeyValuePair } from '../types/api.types'
import { createDefaultAuth, createDefaultBody, createEmptyKeyValue, createEmptyRequest } from './requestBuilder'

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

function parseMethod(method: string): HttpMethod {
  const upper = method.toUpperCase()
  return VALID_METHODS.has(upper) ? (upper as HttpMethod) : 'GET'
}

function tryParseJson(text: string): unknown {
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function headersFromJson(value: unknown): KeyValuePair[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [createEmptyKeyValue()]
  const pairs = Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
    id: uuidv4(),
    key,
    value: String(val),
    enabled: true
  }))
  return pairs.length > 0 ? pairs : [createEmptyKeyValue()]
}

function bodyFromRequestField(requestText: string): ReturnType<typeof createDefaultBody> {
  const parsed = tryParseJson(requestText)
  if (parsed === null) {
    if (!requestText.trim()) return createDefaultBody()
    return { type: 'text', content: requestText }
  }
  return { type: 'json', content: JSON.stringify(parsed, null, 2) }
}

function inferAuth(authentication: string, endpoint: APIEndpoint): ReturnType<typeof createDefaultAuth> {
  const auth = createDefaultAuth()
  const hint = `${authentication} ${endpoint.notes}`.toLowerCase()
  if (hint.includes('bearer') || hint.includes('jwt') || hint.includes('oauth')) {
    auth.type = 'bearer'
  } else if (hint.includes('basic')) {
    auth.type = 'basic'
  } else if (hint.includes('api key') || hint.includes('apikey') || hint.includes('x-api')) {
    auth.type = 'apiKey'
    auth.apiKeyName = 'x-api-key'
  }
  return auth
}

function buildUrl(baseUrl: string | undefined, path: string): string {
  const trimmedPath = path.trim()
  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath
  if (!baseUrl?.trim()) return trimmedPath
  const base = baseUrl.replace(/\/$/, '')
  const segment = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`
  return `${base}${segment}`
}

export function endpointToRequest(endpoint: APIEndpoint, baseUrl?: string): ApiRequest {
  const requestJson = tryParseJson(endpoint.request)
  const req = createEmptyRequest(endpoint.description?.trim() || `${endpoint.method} ${endpoint.path}`)
  req.method = parseMethod(endpoint.method)
  req.url = buildUrl(baseUrl, endpoint.path)

  if (requestJson && typeof requestJson === 'object' && !Array.isArray(requestJson)) {
    const obj = requestJson as Record<string, unknown>
    if (obj.headers) req.headers = headersFromJson(obj.headers)
    if (obj.body !== undefined) {
      req.body = { type: 'json', content: JSON.stringify(obj.body, null, 2) }
    } else if (obj.query && typeof obj.query === 'object') {
      req.queryParams = headersFromJson(obj.query)
    }
  } else {
    req.body = bodyFromRequestField(endpoint.request)
  }

  req.auth = inferAuth(endpoint.authentication, endpoint)
  if (endpoint.validation?.trim()) {
    req.tests = `pm.test("status is successful", function () {\n  if (!pm.response.ok) throw new Error("Request failed with " + pm.response.status)\n})`
  }

  return req
}

export function apiEndpointsToCollection(
  endpoints: APIEndpoint[],
  collectionName: string,
  baseUrl?: string
): ApiCollection {
  const now = new Date().toISOString()
  const active = endpoints.filter((e) => !e.deletedAt)
  return {
    id: uuidv4(),
    name: collectionName,
    description: `Imported from project knowledge (${active.length} endpoints)`,
    folders: [],
    requests: active.map((e) => endpointToRequest(e, baseUrl)),
    createdAt: now,
    updatedAt: now
  }
}
