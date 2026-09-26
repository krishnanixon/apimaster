import type { MockServer, MockServerDocument } from '@shared/types/mock-server'
import { readJsonFile, writeJsonFile } from '../infra/json-store'
import { createDefaultMockServer } from '@shared/lib/mock-server/defaults'
import { validateMockServer } from '@shared/lib/mock-server/validation'

const STORE_FILE = 'mock-servers.json'

const DEFAULT_DOC: MockServerDocument = { version: 1, servers: [] }

function normalizeServer(raw: Partial<MockServer>): MockServer | null {
  if (!raw.id || typeof raw.id !== 'string') return null
  const base = createDefaultMockServer('Mock Server', raw.port ?? 4010)
  const now = new Date().toISOString()
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : base.name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    host: typeof raw.host === 'string' && raw.host.trim() ? raw.host.trim() : base.host,
    port: Number.isFinite(raw.port) ? Number(raw.port) : base.port,
    cors: { ...base.cors, ...(raw.cors ?? {}) },
    routes: Array.isArray(raw.routes) ? raw.routes : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  }
}

export class MockServerRepository {
  private cache: MockServerDocument | null = null

  load(): MockServerDocument {
    if (this.cache) return this.cache
    const raw = readJsonFile<Partial<MockServerDocument>>(STORE_FILE, DEFAULT_DOC)
    const servers = Array.isArray(raw.servers)
      ? raw.servers.map((s) => normalizeServer(s)).filter((s): s is MockServer => s !== null)
      : []
    this.cache = { version: 1, servers }
    return this.cache
  }

  list(): MockServer[] {
    return [...this.load().servers]
  }

  get(id: string): MockServer | undefined {
    return this.load().servers.find((s) => s.id === id)
  }

  private persist(servers: MockServer[]): MockServer[] {
    for (const server of servers) {
      const err = validateMockServer(server, servers)
      if (err) throw new Error(err)
    }
    const doc: MockServerDocument = { version: 1, servers }
    writeJsonFile(STORE_FILE, doc)
    this.cache = doc
    return servers
  }

  create(server: MockServer): MockServer {
    const servers = this.list()
    const err = validateMockServer(server, servers)
    if (err) throw new Error(err)
    servers.push(server)
    this.persist(servers)
    return server
  }

  update(server: MockServer): MockServer {
    const servers = this.list()
    const idx = servers.findIndex((s) => s.id === server.id)
    if (idx === -1) throw new Error('Mock server not found')
    const next = { ...server, updatedAt: new Date().toISOString() }
    servers[idx] = next
    this.persist(servers)
    return next
  }

  delete(id: string): void {
    const servers = this.list().filter((s) => s.id !== id)
    this.persist(servers)
  }

  replaceAll(servers: MockServer[]): MockServer[] {
    return this.persist(servers)
  }
}

export const mockServerRepository = new MockServerRepository()
