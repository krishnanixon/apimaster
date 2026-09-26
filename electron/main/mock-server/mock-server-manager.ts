import net from 'node:net'
import http from 'node:http'
import type {
  CreateMockServerInput,
  ImportCollectionToMockInput,
  MockRequestLog,
  MockRoute,
  MockServer,
  MockServerStatus,
  MockRouteTestInput,
  UpdateMockServerInput
} from '@shared/types/mock-server'
import type { ApiExecutionResult } from '@shared/types/api-studio'
import { createDefaultMockServer, DEFAULT_MOCK_HOST } from '@shared/lib/mock-server/defaults'
import { mockRouteFromRequest } from '@shared/lib/mock-server/from-request'
import { validateMockRoute, validateMockServer } from '@shared/lib/mock-server/validation'
import { mockServerRepository } from '../repositories/mock-server.repository'
import { MockServerRuntime } from './mock-server-runtime'
import { logger } from '../infra/logger.service'

function baseUrl(host: string, port: number): string {
  return `http://${host}:${port}`
}

export async function findAvailablePort(host: string, preferred: number): Promise<number> {
  const tryPort = (port: number) =>
    new Promise<boolean>((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close(() => resolve(true))
      })
      server.listen(port, host)
    })

  if (await tryPort(preferred)) return preferred
  for (let port = preferred + 1; port <= preferred + 50; port++) {
    if (await tryPort(port)) return port
  }
  throw new Error('No available port found')
}

class MockServerManager {
  private runtimes = new Map<string, MockServerRuntime>()

  list(): MockServer[] {
    return mockServerRepository.list()
  }

  get(id: string): MockServer | undefined {
    return mockServerRepository.get(id)
  }

  async create(input: CreateMockServerInput = {}): Promise<MockServer> {
    const host = input.host?.trim() || DEFAULT_MOCK_HOST
    const port =
      input.port !== undefined
        ? input.port
        : await findAvailablePort(host, 4010)
    const server = createDefaultMockServer(input.name ?? 'New Mock Server', port)
    server.host = host
    if (input.description) server.description = input.description
    return mockServerRepository.create(server)
  }

  update(input: UpdateMockServerInput): MockServer {
    const existing = mockServerRepository.get(input.id)
    if (!existing) throw new Error('Mock server not found')
    const runtime = this.runtimes.get(input.id)
    if (runtime && runtime.state.status === 'running') {
      throw new Error('Stop the mock server before changing host or port')
    }
    const next: MockServer = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      host: input.host ?? existing.host,
      port: input.port ?? existing.port,
      cors: input.cors ? { ...existing.cors, ...input.cors } : existing.cors,
      updatedAt: new Date().toISOString()
    }
    const saved = mockServerRepository.update(next)
    runtime?.updateConfig(saved)
    return saved
  }

  delete(id: string): void {
    const runtime = this.runtimes.get(id)
    if (runtime?.state.status === 'running') {
      throw new Error('Stop the mock server before deleting it')
    }
    mockServerRepository.delete(id)
    this.runtimes.delete(id)
  }

  saveServer(server: MockServer): MockServer {
    const err = validateMockServer(server, mockServerRepository.list())
    if (err) throw new Error(err)
    const saved = mockServerRepository.update(server)
    this.runtimes.get(server.id)?.updateConfig(saved)
    return saved
  }

  upsertRoute(serverId: string, route: MockRoute): MockServer {
    const server = mockServerRepository.get(serverId)
    if (!server) throw new Error('Mock server not found')
    const others = server.routes.filter((r) => r.id !== route.id)
    const routeErr = validateMockRoute(route, others)
    if (routeErr) throw new Error(routeErr)
    const idx = server.routes.findIndex((r) => r.id === route.id)
    const routes =
      idx === -1 ? [...server.routes, route] : server.routes.map((r) => (r.id === route.id ? route : r))
    return this.saveServer({ ...server, routes, updatedAt: new Date().toISOString() })
  }

  deleteRoute(serverId: string, routeId: string): MockServer {
    const server = mockServerRepository.get(serverId)
    if (!server) throw new Error('Mock server not found')
    return this.saveServer({
      ...server,
      routes: server.routes.filter((r) => r.id !== routeId),
      updatedAt: new Date().toISOString()
    })
  }

  importCollection(input: ImportCollectionToMockInput): MockServer {
    let server: MockServer
    if (input.createNewServer || !input.serverId) {
      server = createDefaultMockServer(input.serverName ?? `${input.collectionName} Mock`)
    } else {
      const existing = mockServerRepository.get(input.serverId)
      if (!existing) throw new Error('Mock server not found')
      server = existing
    }

    const newRoutes = input.requests.map((req) =>
      mockRouteFromRequest({
        method: req.method,
        url: req.url,
        name: req.name,
        description: req.description,
        sourceRequestId: req.id,
        sourceCollectionId: input.collectionId
      })
    )

    server = {
      ...server,
      routes: [...server.routes, ...newRoutes],
      updatedAt: new Date().toISOString()
    }

    const err = validateMockServer(server, mockServerRepository.list().filter((s) => s.id !== server.id))
    if (err) throw new Error(err)

    if (input.createNewServer || !input.serverId) {
      return mockServerRepository.create(server)
    }
    return mockServerRepository.update(server)
  }

  private getOrCreateRuntime(server: MockServer): MockServerRuntime {
    let runtime = this.runtimes.get(server.id)
    if (!runtime) {
      runtime = new MockServerRuntime(server)
      this.runtimes.set(server.id, runtime)
    } else {
      runtime.updateConfig(server)
    }
    return runtime
  }

  status(serverId: string): MockServerStatus {
    const server = mockServerRepository.get(serverId)
    if (!server) throw new Error('Mock server not found')
    const runtime = this.runtimes.get(serverId)
    const st = runtime?.state.status ?? 'stopped'
    return {
      serverId,
      status: st,
      host: server.host,
      port: server.port,
      baseUrl: baseUrl(server.host, server.port),
      startedAt: runtime?.state.startedAt,
      error: runtime?.state.error
    }
  }

  statuses(): MockServerStatus[] {
    return this.list().map((s) => this.status(s.id))
  }

  async start(serverId: string): Promise<MockServerStatus> {
    const server = mockServerRepository.get(serverId)
    if (!server) throw new Error('Mock server not found')

    for (const other of this.list()) {
      if (other.id === serverId) continue
      const otherRuntime = this.runtimes.get(other.id)
      if (
        otherRuntime?.state.status === 'running' &&
        other.host === server.host &&
        other.port === server.port
      ) {
        throw new Error(`Port ${server.port} is already used by mock server "${other.name}"`)
      }
    }

    const runtime = this.getOrCreateRuntime(server)
    try {
      await runtime.start()
      return this.status(serverId)
    } catch (e) {
      const message =
        e instanceof Error && e.message.includes('EADDRINUSE')
          ? `Port ${server.port} is already in use`
          : e instanceof Error
            ? e.message
            : 'Failed to start mock server'
      logger.error(`MOCK_SERVER_START_FAILED: ${message}`, 'MockServer')
      throw new Error(message)
    }
  }

  async stop(serverId: string): Promise<MockServerStatus> {
    const runtime = this.runtimes.get(serverId)
    if (runtime) {
      try {
        await runtime.stop()
      } catch (e) {
        logger.error(
          e instanceof Error ? e.message : 'Stop failed',
          'MockServer'
        )
        throw e
      }
    }
    return this.status(serverId)
  }

  async restart(serverId: string): Promise<MockServerStatus> {
    await this.stop(serverId)
    return this.start(serverId)
  }

  logs(serverId: string): MockRequestLog[] {
    return this.runtimes.get(serverId)?.getLogs() ?? []
  }

  clearLogs(serverId: string): void {
    this.runtimes.get(serverId)?.clearLogs()
  }

  async testRoute(input: MockRouteTestInput): Promise<ApiExecutionResult> {
    const server = mockServerRepository.get(input.serverId)
    if (!server) throw new Error('Mock server not found')
    const route = server.routes.find((r) => r.id === input.routeId)
    if (!route) throw new Error('Route not found')

    const st = this.status(input.serverId)
    if (st.status !== 'running') {
      throw new Error('Start the mock server before testing a route')
    }

    const path =
      input.pathOverride?.trim() ||
      route.path.replace(/:([a-zA-Z0-9_]+)/g, '1')
    const url = new URL(path.startsWith('/') ? path : `/${path}`, st.baseUrl)
    if (input.query) {
      for (const [k, v] of Object.entries(input.query)) {
        url.searchParams.set(k, v)
      }
    }

    const started = Date.now()
    return await new Promise((resolve) => {
      const req = http.request(
        url,
        {
          method: route.method,
          headers: input.headers
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            const buf = Buffer.concat(chunks)
            const contentType = res.headers['content-type']
            const isBinary = (contentType ?? '').includes('octet-stream')
            resolve({
              ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? '',
              headers: Object.fromEntries(
                Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')])
              ),
              data: isBinary ? '' : buf.toString('utf8'),
              dataBase64: isBinary ? buf.toString('base64') : undefined,
              isBinary,
              contentType: typeof contentType === 'string' ? contentType : '',
              timeMs: Date.now() - started,
              sizeBytes: buf.length,
              error: undefined,
              aborted: false
            })
          })
        }
      )
      req.on('error', (err) => {
        resolve({
          ok: false,
          status: 0,
          statusText: '',
          headers: {},
          data: '',
          isBinary: false,
          contentType: '',
          timeMs: Date.now() - started,
          sizeBytes: 0,
          error: err.message,
          aborted: false
        })
      })
      if (input.body) req.write(input.body)
      req.end()
    })
  }

  async shutdownAll(): Promise<void> {
    const ids = [...this.runtimes.keys()]
    await Promise.all(ids.map((id) => this.stop(id).catch(() => undefined)))
  }
}

export const mockServerManager = new MockServerManager()
