import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { v4 as uuidv4 } from 'uuid'
import type {
  MockHttpMethod,
  MockRequestLog,
  MockResponse,
  MockRoute,
  MockServer
} from '@shared/types/mock-server'
import { MockRouteTable, normalizeMockPath } from '@shared/lib/mock-server/route-matcher'
import {
  applyMockTemplates,
  parseQueryFromUrl,
  parseRequestBody,
  type MockTemplateContext
} from '@shared/lib/mock-server/templates'
import { defaultContentTypeForBody, validateJsonBody } from '@shared/lib/mock-server/validation'
import { pickActiveResponse } from '@shared/lib/mock-server/defaults'
import { logger } from '../infra/logger.service'

const MAX_LOG_ENTRIES = 500
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie'])

export type RuntimeStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

export interface MockRuntimeState {
  status: RuntimeStatus
  startedAt?: string
  error?: string
  logs: MockRequestLog[]
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function lowerCaseHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

function buildCorsHeaders(server: MockServer, req: IncomingMessage): Record<string, string> {
  if (!server.cors.enabled) return {}
  const origin = req.headers.origin ?? '*'
  const allowed = server.cors.allowedOrigins.trim()
  const allowOrigin =
    allowed === '*' ? '*' : allowed.split(',').map((o) => o.trim()).includes(origin) ? origin : allowed.split(',')[0]?.trim() ?? '*'
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': server.cors.allowedMethods,
    'Access-Control-Allow-Headers': server.cors.allowedHeaders
  }
  if (server.cors.allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  return headers
}

function resolveResponseBody(response: MockResponse): { body: string | Buffer; isBinary: boolean } {
  if (response.bodyType === 'binary') {
    try {
      return { body: Buffer.from(response.body, 'base64'), isBinary: true }
    } catch {
      return { body: '', isBinary: false }
    }
  }
  if (response.bodyType === 'json') {
    const check = validateJsonBody(response.body)
    if (!check.ok) {
      return { body: JSON.stringify({ error: 'Invalid mock JSON', message: check.message }), isBinary: false }
    }
    try {
      const parsed = JSON.parse(response.body) as unknown
      return { body: JSON.stringify(parsed), isBinary: false }
    } catch {
      return { body: response.body, isBinary: false }
    }
  }
  return { body: response.body, isBinary: false }
}

function jsonError(res: ServerResponse, status: number, payload: Record<string, unknown>, extraHeaders?: Record<string, string>): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders })
  res.end(body)
}

export class MockServerRuntime {
  private server: Server | null = null
  private config: MockServer
  private routeTable: MockRouteTable
  state: MockRuntimeState = { status: 'stopped', logs: [] }

  constructor(config: MockServer) {
    this.config = config
    this.routeTable = new MockRouteTable(config.routes)
  }

  getConfig(): MockServer {
    return this.config
  }

  updateConfig(config: MockServer): void {
    this.config = config
    this.routeTable = new MockRouteTable(config.routes)
  }

  private pushLog(entry: MockRequestLog): void {
    this.state.logs.unshift(entry)
    if (this.state.logs.length > MAX_LOG_ENTRIES) {
      this.state.logs.length = MAX_LOG_ENTRIES
    }
  }

  clearLogs(): void {
    this.state.logs = []
  }

  getLogs(): MockRequestLog[] {
    return [...this.state.logs]
  }

  async start(): Promise<void> {
    if (this.state.status === 'running' || this.state.status === 'starting') return
    this.state = { status: 'starting', logs: this.state.logs }
    this.routeTable = new MockRouteTable(this.config.routes)

    await new Promise<void>((resolve, reject) => {
      const httpServer = http.createServer((req, res) => {
        void this.handleRequest(req, res)
      })
      httpServer.on('error', (err: NodeJS.ErrnoException) => {
        this.state = {
          status: 'error',
          error: err.code === 'EADDRINUSE' ? `Port ${this.config.port} is already in use` : err.message,
          logs: this.state.logs
        }
        reject(err)
      })
      httpServer.listen(this.config.port, this.config.host, () => {
        this.server = httpServer
        this.state = {
          status: 'running',
          startedAt: new Date().toISOString(),
          logs: this.state.logs
        }
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) {
      this.state = { status: 'stopped', logs: this.state.logs }
      return
    }
    this.state = { ...this.state, status: 'stopping' }
    const srv = this.server
    this.server = null
    await new Promise<void>((resolve) => {
      srv.close(() => resolve())
    })
    this.state = { status: 'stopped', logs: this.state.logs }
  }

  private findRoute(method: MockHttpMethod, path: string): { route: MockRoute; params: Record<string, string> } | null {
    const hit = this.routeTable.match(method, path)
    if (!hit) return null
    const route = this.config.routes.find((r) => r.id === hit.routeId)
    if (!route || !route.enabled) return null
    return { route, params: hit.params }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now()
    const method = (req.method ?? 'GET').toUpperCase() as MockHttpMethod
    const url = req.url ?? '/'
    const pathOnly = url.split('?')[0] ?? '/'
    const normalizedPath = normalizeMockPath(pathOnly)
    const query = parseQueryFromUrl(`http://local${url}`)
    const corsHeaders = buildCorsHeaders(this.config, req)

    if (method === 'OPTIONS' && this.config.cors.enabled) {
      res.writeHead(204, corsHeaders)
      res.end()
      this.pushLog({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        method,
        path: normalizedPath,
        status: 204,
        durationMs: Date.now() - started,
        responseSize: 0
      })
      return
    }

    try {
      const rawBody = await readRequestBody(req)
      const reqHeaders = lowerCaseHeaders(req.headers)
      for (const key of Object.keys(reqHeaders)) {
        if (SENSITIVE_HEADERS.has(key)) reqHeaders[key] = '[redacted]'
      }
      const bodyParsed = parseRequestBody(rawBody, req.headers['content-type'])

      const matched = this.findRoute(method, normalizedPath)
      if (!matched) {
        const allowed = this.routeTable.methodsForPath(normalizedPath)
        if (allowed.length > 0) {
          const allow = allowed.join(', ')
          jsonError(
            res,
            405,
            { error: 'Method Not Allowed', path: normalizedPath, method },
            { ...corsHeaders, Allow: allow }
          )
          this.pushLog({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            method,
            path: normalizedPath,
            status: 405,
            durationMs: Date.now() - started,
            responseSize: 0
          })
          return
        }
        jsonError(res, 404, { error: 'Not Found', path: normalizedPath }, corsHeaders)
        this.pushLog({
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          method,
          path: normalizedPath,
          status: 404,
          durationMs: Date.now() - started,
          responseSize: 0
        })
        return
      }

      const response = pickActiveResponse(matched.route)
      if (!response || !response.enabled) {
        jsonError(res, 500, { error: 'No active mock response configured' }, corsHeaders)
        return
      }

      const templateCtx: MockTemplateContext = {
        params: matched.params,
        query,
        headers: lowerCaseHeaders(req.headers),
        body: bodyParsed,
        method,
        path: normalizedPath,
        host: req.headers.host ?? `${this.config.host}:${this.config.port}`
      }

      const templatedBody =
        response.bodyType === 'json'
          ? applyMockTemplates(response.body, templateCtx)
          : applyMockTemplates(response.body, templateCtx)

      const mockResponse: MockResponse = {
        ...response,
        body: templatedBody
      }

      const delayMs = Math.max(0, response.delay)
      await new Promise((r) => setTimeout(r, delayMs))

      const resolved = resolveResponseBody(mockResponse)
      const outHeaders: Record<string, string> = {
        ...corsHeaders,
        'X-Mock-Server': 'APIMaster',
        ...response.headers
      }
      const defaultCt = defaultContentTypeForBody(response.bodyType)
      const hasContentType = Object.keys(outHeaders).some((k) => k.toLowerCase() === 'content-type')
      if (defaultCt && !hasContentType) {
        outHeaders['Content-Type'] = defaultCt
      }

      const bodyBuffer = resolved.isBinary ? resolved.body : Buffer.from(resolved.body as string, 'utf8')
      res.writeHead(response.status, outHeaders)
      res.end(bodyBuffer)

      this.pushLog({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        method,
        path: normalizedPath,
        status: response.status,
        durationMs: Date.now() - started,
        responseSize: bodyBuffer.length
      })
    } catch (e) {
      logger.error(
        e instanceof Error ? e.message : 'Mock request failed',
        'MockServer'
      )
      if (!res.headersSent) {
        jsonError(res, 500, { error: 'Internal Mock Server Error' }, corsHeaders)
      }
    }
  }
}
