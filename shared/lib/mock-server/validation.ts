import type { MockBodyType, MockResponse, MockRoute, MockServer } from '../../types/mock-server'
import { MOCK_RESPONSE_MODES } from '../../types/mock-server'
import { areRoutePatternsAmbiguous, normalizeMockPath, routePatternKey } from './route-matcher'

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

export function isValidHost(host: string): boolean {
  const h = host.trim()
  if (!h) return false
  if (h === '127.0.0.1' || h === 'localhost' || h === '::1') return true
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    return h.split('.').every((oct) => {
      const n = Number(oct)
      return n >= 0 && n <= 255
    })
  }
  // Simple hostname
  return /^[a-zA-Z0-9.-]+$/.test(h)
}

export function validateHttpStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 100 && status <= 599
}

export function validateJsonBody(body: string): { ok: true } | { ok: false; message: string } {
  if (!body.trim()) return { ok: true }
  try {
    JSON.parse(body)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON'
    return { ok: false, message: msg }
  }
}

export function defaultContentTypeForBody(bodyType: MockBodyType): string | undefined {
  switch (bodyType) {
    case 'json':
      return 'application/json'
    case 'xml':
      return 'application/xml'
    case 'html':
      return 'text/html'
    case 'text':
      return 'text/plain'
    case 'binary':
      return 'application/octet-stream'
    default:
      return undefined
  }
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

/** Node's `writeHead` throws on these, so reject them at save time instead of at request time. */
export function validateMockHeaders(headers: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(headers)) {
    if (!HEADER_NAME.test(key)) return `Invalid header name: "${key}"`
    if (/[\r\n\0]/.test(value)) return `Header "${key}" contains a line break`
  }
  return null
}

export const MAX_MOCK_DELAY_MS = 120_000

export function validateMockResponse(response: MockResponse): string | null {
  if (!response.name.trim()) return 'Response name is required'
  if (!validateHttpStatus(response.status)) return 'Invalid HTTP status code'
  if (response.delay < 0 || !Number.isFinite(response.delay)) return 'Delay must be >= 0'
  if (response.delay > MAX_MOCK_DELAY_MS) return `Delay must be at most ${MAX_MOCK_DELAY_MS} ms`
  const headerError = validateMockHeaders(response.headers ?? {})
  if (headerError) return `${response.name}: ${headerError}`
  if (response.bodyType === 'json') {
    const json = validateJsonBody(response.body)
    if (!json.ok) return `Invalid JSON: ${json.message}`
  }
  return null
}

export function validateMockRoute(route: MockRoute, existing: MockRoute[]): string | null {
  if (!route.path.trim()) return 'Route path is required'
  normalizeMockPath(route.path)
  const key = routePatternKey(route.method, route.path)
  for (const other of existing) {
    if (other.id === route.id) continue
    if (routePatternKey(other.method, other.path) === key) {
      return `Duplicate route: ${route.method} ${normalizeMockPath(route.path)}`
    }
    if (
      other.method === route.method &&
      areRoutePatternsAmbiguous(other.path, route.path)
    ) {
      return `Ambiguous route pattern: ${route.method} ${normalizeMockPath(route.path)}`
    }
  }
  if (route.responses.length === 0) return 'At least one response is required'
  if (route.responseMode && !MOCK_RESPONSE_MODES.includes(route.responseMode)) return 'Invalid response mode'
  for (const resp of route.responses) {
    const err = validateMockResponse(resp)
    if (err) return err
  }
  return null
}

export function validateMockServer(server: MockServer, allServers: MockServer[]): string | null {
  if (!server.name.trim()) return 'Server name is required'
  if (!isValidHost(server.host)) return 'Invalid host'
  if (!isValidPort(server.port)) return 'Port must be between 1 and 65535'
  for (const other of allServers) {
    if (other.id === server.id) continue
    if (other.host === server.host && other.port === server.port) {
      return `Port ${server.port} is already used by mock server "${other.name}"`
    }
  }
  const routeIds = new Set<string>()
  for (const route of server.routes) {
    if (routeIds.has(route.id)) return 'Duplicate route id'
    routeIds.add(route.id)
    const err = validateMockRoute(route, server.routes.filter((r) => r.id !== route.id))
    if (err) return err
  }
  return null
}
