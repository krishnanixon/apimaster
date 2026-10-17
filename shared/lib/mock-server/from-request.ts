import { v4 as uuidv4 } from 'uuid'
import type { ApiExecutionResult, HttpMethod } from '../../types/api-studio'
import type { MockBodyType, MockResponse, MockRoute } from '../../types/mock-server'
import { createDefaultMockResponse, createDefaultMockRoute } from './defaults'
import { compileMockRoute, matchPath, normalizeMockPath, routePatternKey } from './route-matcher'

/**
 * Extract a route pattern from a request URL. Handles absolute URLs, path-only
 * URLs, and API Studio templates: a leading `{{baseUrl}}` is treated as the
 * origin, and `{{id}}` / `{id}` / `:id` path segments become `:id` parameters.
 */
export function extractMockPathFromUrl(url: string): string {
  let rest = url.trim().split('#')[0] ?? ''
  rest = rest.split('?')[0] ?? ''
  if (!rest) return '/'
  // Leading variable stands in for scheme + host (e.g. `{{baseUrl}}/users`).
  rest = rest.replace(/^\{\{[^}]+\}\}/, '')
  // Strip scheme + authority textually so `{id}` is not percent-encoded by `new URL`.
  rest = rest.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
  const segments = rest
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const param = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/.exec(seg) ?? /^\{([A-Za-z0-9_]+)\}$/.exec(seg)
      return param ? `:${param[1].replace(/[^A-Za-z0-9_]/g, '_')}` : seg
    })
  return normalizeMockPath(`/${segments.join('/')}`)
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

/** Headers that describe the original transport, not the payload — never replay them from a mock. */
const NON_REPLAYABLE_HEADERS = new Set([
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'date',
  'set-cookie',
  'server',
  'via',
  'alt-svc',
  'strict-transport-security',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'x-mock-server',
  'x-mock-response'
])

function bodyTypeFor(contentType: string, isBinary: boolean): MockBodyType {
  const ct = contentType.toLowerCase()
  if (isBinary) return 'binary'
  if (ct.includes('json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml')) return 'xml'
  return 'text'
}

/** Turn a real API response into a mock response example (status, headers, body). */
export function mockResponseFromExecution(result: ApiExecutionResult, name: string): MockResponse {
  let bodyType = bodyTypeFor(result.contentType, result.isBinary)
  let body = result.isBinary ? (result.dataBase64 ?? '') : result.data
  if (bodyType === 'json') {
    try {
      body = JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      bodyType = 'text'
    }
  }
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(result.headers)) {
    if (NON_REPLAYABLE_HEADERS.has(key.toLowerCase())) continue
    if (/[\r\n\0]/.test(value)) continue
    headers[key] = value
  }
  return {
    id: uuidv4(),
    name: name.trim() || `Example ${result.status}`,
    status: result.status >= 100 && result.status <= 599 ? result.status : 200,
    headers,
    body,
    bodyType,
    delay: 0,
    enabled: true
  }
}

/**
 * Find the route an example belongs to: first an identical pattern (`/users/:id`),
 * then a parameterized route that matches the concrete path (`/users/42`).
 */
export function findMockRouteForRequest(routes: MockRoute[], method: HttpMethod, url: string): MockRoute | undefined {
  const path = extractMockPathFromUrl(url)
  const key = routePatternKey(method, path)
  const exact = routes.find((r) => routePatternKey(r.method, r.path) === key)
  if (exact) return exact
  return routes.find((r) => r.method === method && matchPath(compileMockRoute(r.id, r.method, r.path), path) !== null)
}

/** Pick a response name that is not already used on the route (`Example 200`, `Example 200 (2)`, …). */
export function uniqueMockResponseName(route: Pick<MockRoute, 'responses'> | null | undefined, base: string): string {
  const taken = new Set((route?.responses ?? []).map((r) => r.name.trim().toLowerCase()))
  if (!taken.has(base.trim().toLowerCase())) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}
