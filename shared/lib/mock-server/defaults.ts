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

export function mergeCors(base: MockCorsSettings, patch: Partial<MockCorsSettings>): MockCorsSettings {
  return { ...base, ...patch }
}
