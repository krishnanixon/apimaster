import { describe, expect, it, vi } from 'vitest'
import type { MockServer } from '../shared/types/mock-server'

const saved: MockServer[] = []
vi.mock('../electron/main/repositories/mock-server.repository', () => ({
  mockServerRepository: {
    list: () => saved,
    get: (id: string) => saved.find((s) => s.id === id),
    create: (server: MockServer) => (saved.push(server), server),
    update: (server: MockServer) => server
  }
}))
vi.mock('../electron/main/mock-server/mock-server-runtime', () => ({ MockServerRuntime: class {} }))
vi.mock('../electron/main/infra/logger.service', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

describe('mock server hand-off', () => {
  it('creates routes for scanned paths and uses example responses', async () => {
    const { mockServerManager } = await import('../electron/main/mock-server/mock-server-manager')
    const server = mockServerManager.importCollection({
      collectionId: 'code-scanner',
      collectionName: 'Shop',
      createNewServer: true,
      serverName: 'Shop Mock',
      requests: [
        { id: 'a', method: 'GET', url: '/api/users/:id', name: 'Get user', exampleBody: '{"id": 1}', exampleStatus: 200 },
        { id: 'b', method: 'POST', url: '/api/users/{id}/avatar', name: 'Upload avatar' }
      ]
    })
    expect(server.name).toBe('Shop Mock')
    expect(server.routes.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /api/users/:id', 'POST /api/users/:id/avatar'])
    expect(server.routes[0].responses[0]).toMatchObject({ status: 200, body: '{"id": 1}', bodyType: 'json' })
  })
})
