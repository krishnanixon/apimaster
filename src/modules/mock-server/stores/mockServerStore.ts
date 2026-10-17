import { create } from 'zustand'
import type {
  MockRequestLog,
  MockRoute,
  MockServer,
  MockServerStatus
} from '@shared/types/mock-server'
import {
  findMockRouteForRequest,
  mockResponseFromExecution,
  mockRouteFromRequest,
  uniqueMockResponseName
} from '@shared/lib/mock-server/from-request'
import type { ApiCollection, ApiExecutionResult, ApiRequest } from '@shared/types/api-studio'

interface MockServerState {
  servers: MockServer[]
  statuses: Record<string, MockServerStatus>
  selectedServerId: string | null
  selectedRouteId: string | null
  logs: MockRequestLog[]
  loading: boolean
  refresh: () => Promise<void>
  refreshStatuses: () => Promise<void>
  refreshLogs: (serverId: string) => Promise<void>
  selectServer: (id: string | null) => void
  selectRoute: (id: string | null) => void
  createServer: () => Promise<MockServer | null>
  saveServer: (server: MockServer) => Promise<boolean>
  deleteServer: (id: string) => Promise<boolean>
  upsertRoute: (serverId: string, route: MockRoute) => Promise<boolean>
  deleteRoute: (serverId: string, routeId: string) => Promise<boolean>
  startServer: (id: string) => Promise<boolean>
  stopServer: (id: string) => Promise<boolean>
  restartServer: (id: string) => Promise<boolean>
  clearLogs: (id: string) => Promise<void>
  importCollection: (collection: ApiCollection, createNew?: boolean, serverId?: string) => Promise<MockServer | null>
  createMockFromRequest: (
    collectionId: string,
    request: ApiRequest,
    serverId?: string
  ) => Promise<MockServer | null>
  /**
   * Save a real response as a mock example. Appends to the matching route
   * (same method + path pattern) or creates the route. Creates a server when
   * `serverId` is omitted.
   */
  addExampleFromResponse: (
    request: ApiRequest,
    response: ApiExecutionResult,
    serverId?: string
  ) => Promise<{ server: MockServer; route: MockRoute; created: boolean } | null>
}

export const useMockServerStore = create<MockServerState>((set, get) => ({
  servers: [],
  statuses: {},
  selectedServerId: null,
  selectedRouteId: null,
  logs: [],
  loading: false,

  async refresh() {
    set({ loading: true })
    const res = await window.electronAPI.mockServer.list()
    if (res.success && res.data) {
      set({ servers: res.data, loading: false })
      await get().refreshStatuses()
    } else {
      set({ loading: false })
    }
  },

  async refreshStatuses() {
    const res = await window.electronAPI.mockServer.statuses()
    if (!res.success || !res.data) return
    const map: Record<string, MockServerStatus> = {}
    for (const st of res.data) map[st.serverId] = st
    set({ statuses: map })
  },

  async refreshLogs(serverId) {
    const res = await window.electronAPI.mockServer.logs(serverId)
    if (res.success && res.data) set({ logs: res.data })
  },

  selectServer(id) {
    set({ selectedServerId: id, selectedRouteId: null, logs: [] })
    if (id) void get().refreshLogs(id)
  },

  selectRoute(id) {
    set({ selectedRouteId: id })
  },

  async createServer() {
    const res = await window.electronAPI.mockServer.create({})
    if (!res.success || !res.data) return null
    await get().refresh()
    get().selectServer(res.data.id)
    return res.data
  },

  async saveServer(server) {
    const res = await window.electronAPI.mockServer.save(server)
    if (!res.success || !res.data) return false
    set((s) => ({
      servers: s.servers.map((item) => (item.id === res.data!.id ? res.data! : item))
    }))
    return true
  },

  async deleteServer(id) {
    const res = await window.electronAPI.mockServer.delete(id)
    if (!res.success) return false
    const { selectedServerId } = get()
    if (selectedServerId === id) set({ selectedServerId: null, selectedRouteId: null })
    await get().refresh()
    return true
  },

  async upsertRoute(serverId, route) {
    const res = await window.electronAPI.mockServer.upsertRoute({ serverId, route })
    if (!res.success || !res.data) return false
    set((s) => ({
      servers: s.servers.map((item) => (item.id === res.data!.id ? res.data! : item))
    }))
    get().selectRoute(route.id)
    return true
  },

  async deleteRoute(serverId, routeId) {
    const res = await window.electronAPI.mockServer.deleteRoute({ serverId, routeId })
    if (!res.success || !res.data) return false
    set((s) => ({
      servers: s.servers.map((item) => (item.id === res.data!.id ? res.data! : item)),
      selectedRouteId: s.selectedRouteId === routeId ? null : s.selectedRouteId
    }))
    return true
  },

  async startServer(id) {
    const res = await window.electronAPI.mockServer.start(id)
    if (!res.success) return false
    await get().refreshStatuses()
    return true
  },

  async stopServer(id) {
    const res = await window.electronAPI.mockServer.stop(id)
    if (!res.success) return false
    await get().refreshStatuses()
    return true
  },

  async restartServer(id) {
    const res = await window.electronAPI.mockServer.restart(id)
    if (!res.success) return false
    await get().refreshStatuses()
    return true
  },

  async clearLogs(id) {
    await window.electronAPI.mockServer.clearLogs(id)
    await get().refreshLogs(id)
  },

  async importCollection(collection, createNew = true, serverId) {
    const requests = collection.requests
      .filter((r) => (r.requestType ?? 'http') === 'http' && r.url.trim())
      .map((r) => ({
        id: r.id,
        method: r.method,
        url: r.url,
        name: r.name,
        description: r.description
      }))
    const res = await window.electronAPI.mockServer.importCollection({
      collectionId: collection.id,
      collectionName: collection.name,
      requests,
      createNewServer: createNew,
      serverId,
      serverName: `${collection.name} Mock`
    })
    if (!res.success || !res.data) return null
    await get().refresh()
    get().selectServer(res.data.id)
    return res.data
  },

  async createMockFromRequest(collectionId, request, serverId) {
    const route = mockRouteFromRequest({
      method: request.method,
      url: request.url,
      name: request.name,
      description: request.description,
      sourceRequestId: request.id,
      sourceCollectionId: collectionId
    })

    let targetServerId = serverId
    if (!targetServerId) {
      const created = await get().createServer()
      if (!created) return null
      targetServerId = created.id
    }

    const ok = await get().upsertRoute(targetServerId, route)
    if (!ok) return null
    const server = get().servers.find((s) => s.id === targetServerId)
    return server ?? null
  },

  async addExampleFromResponse(request, response, serverId) {
    if (get().servers.length === 0) await get().refresh()
    let targetId = serverId
    if (!targetId) {
      const created = await get().createServer()
      if (!created) return null
      targetId = created.id
    }
    const server = get().servers.find((s) => s.id === targetId)
    if (!server) return null

    const existing = findMockRouteForRequest(server.routes, request.method, request.url)
    const base = `${response.status} ${response.statusText || 'Example'}`.trim()
    const example = mockResponseFromExecution(response, uniqueMockResponseName(existing, base))

    let route: MockRoute
    if (existing) {
      route = { ...existing, responses: [...existing.responses, example] }
    } else {
      route = mockRouteFromRequest({
        method: request.method,
        url: request.url,
        name: request.name,
        description: request.description
      })
      route.responses = [example]
      route.activeResponseId = example.id
    }

    const ok = await get().upsertRoute(server.id, route)
    if (!ok) return null
    const saved = get().servers.find((s) => s.id === server.id) ?? server
    return { server: saved, route, created: !existing }
  }
}))
