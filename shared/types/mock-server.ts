import type { HttpMethod } from './api-studio'

export type MockHttpMethod = HttpMethod

export type MockBodyType = 'json' | 'text' | 'xml' | 'html' | 'binary'

export type MockServerRuntimeStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

export interface MockCorsSettings {
  enabled: boolean
  allowedOrigins: string
  allowedMethods: string
  allowedHeaders: string
  allowCredentials: boolean
}

export interface MockResponse {
  id: string
  name: string
  status: number
  headers: Record<string, string>
  body: string
  bodyType: MockBodyType
  delay: number
  enabled: boolean
}

export interface MockRoute {
  id: string
  method: MockHttpMethod
  path: string
  description?: string
  enabled: boolean
  sourceRequestId?: string
  sourceCollectionId?: string
  responses: MockResponse[]
  activeResponseId?: string
}

export interface MockServer {
  id: string
  name: string
  description?: string
  host: string
  port: number
  cors: MockCorsSettings
  routes: MockRoute[]
  createdAt: string
  updatedAt: string
}

export interface MockServerDocument {
  version: 1
  servers: MockServer[]
}

export interface MockServerStatus {
  serverId: string
  status: MockServerRuntimeStatus
  host: string
  port: number
  baseUrl: string
  startedAt?: string
  error?: string
}

export interface MockRequestLog {
  id: string
  timestamp: string
  method: string
  path: string
  status: number
  durationMs: number
  responseSize: number
}

export interface CreateMockServerInput {
  name?: string
  description?: string
  host?: string
  port?: number
}

export interface UpdateMockServerInput {
  id: string
  name?: string
  description?: string
  host?: string
  port?: number
  cors?: Partial<MockCorsSettings>
}

export interface UpsertMockRouteInput {
  serverId: string
  route: MockRoute
}

export interface MockRouteTestInput {
  serverId: string
  routeId: string
  /** Override path for parameterized routes, e.g. `/users/1` */
  pathOverride?: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: string
}

export interface ImportCollectionToMockInput {
  serverId?: string
  collectionId: string
  collectionName: string
  requests: Array<{
    id: string
    method: MockHttpMethod
    url: string
    name: string
    description?: string
  }>
  createNewServer?: boolean
  serverName?: string
}

export interface MockServerExportPayload {
  name: string
  description?: string
  host: string
  port: number
  cors: MockCorsSettings
  routes: MockRoute[]
}

export const MOCK_STATUS_PRESETS: Array<{ code: number; label: string }> = [
  { code: 200, label: 'OK' },
  { code: 201, label: 'Created' },
  { code: 202, label: 'Accepted' },
  { code: 204, label: 'No Content' },
  { code: 301, label: 'Moved Permanently' },
  { code: 302, label: 'Found' },
  { code: 304, label: 'Not Modified' },
  { code: 400, label: 'Bad Request' },
  { code: 401, label: 'Unauthorized' },
  { code: 403, label: 'Forbidden' },
  { code: 404, label: 'Not Found' },
  { code: 409, label: 'Conflict' },
  { code: 422, label: 'Unprocessable Entity' },
  { code: 429, label: 'Too Many Requests' },
  { code: 500, label: 'Internal Server Error' },
  { code: 502, label: 'Bad Gateway' },
  { code: 503, label: 'Service Unavailable' }
]

export const DEFAULT_MOCK_CORS: MockCorsSettings = {
  enabled: true,
  allowedOrigins: '*',
  allowedMethods: 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
  allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
  allowCredentials: false
}
