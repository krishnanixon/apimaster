import { v4 as uuidv4 } from 'uuid'
import type { MockCorsSettings, MockResponse, MockRoute, MockServer } from '../../types/mock-server'
import { DEFAULT_MOCK_CORS } from '../../types/mock-server'

export const DEFAULT_MOCK_HOST = '127.0.0.1'
export const DEFAULT_MOCK_PORT = 4010

export function createDefaultMockResponse(name = 'Success'): MockResponse {
  return {
    id: uuidv4(),
    name,
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '{\n  "ok": true\n}',
    bodyType: 'json',
    delay: 0,
    enabled: true
  }
}

export function createDefaultMockRoute(method: MockRoute['method'] = 'GET', path = '/'): MockRoute {
  const response = createDefaultMockResponse()
  return {
    id: uuidv4(),
    method,
    path,
    enabled: true,
    responses: [response],
    activeResponseId: response.id
  }
}

export function createDefaultMockServer(name = 'New Mock Server', port = DEFAULT_MOCK_PORT): MockServer {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    name,
    host: DEFAULT_MOCK_HOST,
    port,
    cors: { ...DEFAULT_MOCK_CORS },
    routes: [],
    createdAt: now,
    updatedAt: now
  }
}

export function pickActiveResponse(route: MockRoute): MockResponse | undefined {
  const active = route.responses.find((r) => r.id === route.activeResponseId && r.enabled)
  if (active) return active
  return route.responses.find((r) => r.enabled) ?? route.responses[0]
}

export type MockResponseSelection =
  | { ok: true; response: MockResponse }
  | { ok: false; reason: 'none-enabled' }
  | { ok: false; reason: 'override-not-found'; requested: string; available: string[] }

/**
 * Choose the response for one incoming request.
 *
 * 1. An explicit override (header/query) matches by id, then name (case-insensitive),
 *    then status code — so `X-Mock-Response: 404` and `X-Mock-Response: Not found` both work.
 * 2. Otherwise the route's `responseMode` decides: the active response, a round-robin
 *    sequence over enabled responses, or a random enabled response.
 */
export function selectMockResponse(
  route: MockRoute,
  options: { override?: string; sequence?: number; random?: () => number } = {}
): MockResponseSelection {
  const enabled = route.responses.filter((r) => r.enabled)
  const override = options.override?.trim()
  if (override) {
    const lower = override.toLowerCase()
    const status = /^\d{3}$/.test(override) ? Number(override) : null
    const hit =
      enabled.find((r) => r.id === override) ??
      enabled.find((r) => r.name.trim().toLowerCase() === lower) ??
      (status !== null ? enabled.find((r) => r.status === status) : undefined)
    if (hit) return { ok: true, response: hit }
    return { ok: false, reason: 'override-not-found', requested: override, available: enabled.map((r) => r.name) }
  }
  if (enabled.length === 0) return { ok: false, reason: 'none-enabled' }

  switch (route.responseMode ?? 'active') {
    case 'sequential':
      return { ok: true, response: enabled[Math.abs(options.sequence ?? 0) % enabled.length] }
    case 'random': {
      const r = (options.random ?? Math.random)()
      return { ok: true, response: enabled[Math.min(enabled.length - 1, Math.floor(r * enabled.length))] }
    }
    default: {
      const active = pickActiveResponse(route)
      return active?.enabled ? { ok: true, response: active } : { ok: false, reason: 'none-enabled' }
    }
  }
}

export function mergeCors(base: MockCorsSettings, patch: Partial<MockCorsSettings>): MockCorsSettings {
  return { ...base, ...patch }
}
