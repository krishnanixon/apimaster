import type { HttpMethod } from '../../types/api-studio'
import { createDefaultMockResponse, createDefaultMockRoute } from './defaults'
import { normalizeMockPath } from './route-matcher'

/** Extract pathname from a request URL (supports absolute URLs and path-only). */
export function extractMockPathFromUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return '/'
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed)
      return normalizeMockPath(u.pathname || '/')
    }
  } catch {
    // fall through
  }
  const withoutQuery = trimmed.split('?')[0] ?? trimmed
  return normalizeMockPath(withoutQuery)
}

export function mockRouteFromRequest(input: {
  method: HttpMethod
  url: string
  name: string
  description?: string
  sourceRequestId?: string
  sourceCollectionId?: string
  exampleBody?: string
  exampleStatus?: number
}) {
  const path = extractMockPathFromUrl(input.url)
  const route = createDefaultMockRoute(input.method, path)
  route.description = input.description ?? input.name
  route.sourceRequestId = input.sourceRequestId
  route.sourceCollectionId = input.sourceCollectionId

  if (input.exampleBody !== undefined || input.exampleStatus !== undefined) {
    const resp = route.responses[0] ?? createDefaultMockResponse()
    if (input.exampleStatus !== undefined) resp.status = input.exampleStatus
    if (input.exampleBody !== undefined) {
      resp.body = input.exampleBody
      try {
        JSON.parse(input.exampleBody)
        resp.bodyType = 'json'
        resp.headers = { ...resp.headers, 'Content-Type': 'application/json' }
      } catch {
        resp.bodyType = 'text'
        resp.headers = { ...resp.headers, 'Content-Type': 'text/plain' }
      }
    }
    route.responses = [resp]
    route.activeResponseId = resp.id
  }

  return route
}
