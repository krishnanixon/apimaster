import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  CreateMockServerInput,
  ImportCollectionToMockInput,
  MockRoute,
  MockServer,
  MockRouteTestInput,
  UpdateMockServerInput
} from '@shared/types/mock-server'
import { mockServerManager, findAvailablePort } from '../mock-server/mock-server-manager'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'IPC')
  return { success: false, error }
}

export function registerMockServerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_LIST, () => {
    try {
      return success(mockServerManager.list())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list mock servers')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_GET, (_e, id: string) => {
    try {
      if (typeof id !== 'string') return failure('Invalid server id')
      const server = mockServerManager.get(id)
      if (!server) return failure('Mock server not found')
      return success(server)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get mock server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_CREATE, async (_e, input: CreateMockServerInput) => {
    try {
      const server = await mockServerManager.create(input ?? {})
      return success(server)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create mock server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_UPDATE, (_e, input: UpdateMockServerInput) => {
    try {
      if (!input?.id) return failure('Invalid input')
      return success(mockServerManager.update(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update mock server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_DELETE, (_e, id: string) => {
    try {
      mockServerManager.delete(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete mock server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_SAVE, (_e, server: MockServer) => {
    try {
      if (!server?.id) return failure('Invalid mock server')
      return success(mockServerManager.saveServer(server))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save mock server')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.MOCK_SERVER_UPSERT_ROUTE,
    (_e, payload: { serverId: string; route: MockRoute }) => {
      try {
        if (!payload?.serverId || !payload.route) return failure('Invalid route payload')
        return success(mockServerManager.upsertRoute(payload.serverId, payload.route))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to save route')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MOCK_SERVER_DELETE_ROUTE,
    (_e, payload: { serverId: string; routeId: string }) => {
      try {
        if (!payload?.serverId || !payload.routeId) return failure('Invalid payload')
        return success(mockServerManager.deleteRoute(payload.serverId, payload.routeId))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to delete route')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_START, async (_e, id: string) => {
    try {
      return success(await mockServerManager.start(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to start mock server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_STOP, async (_e, id: string) => {
    try {
      return success(await mockServerManager.stop(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to stop mock server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_RESTART, async (_e, id: string) => {
    try {
      return success(await mockServerManager.restart(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to restart mock server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_STATUS, (_e, id: string) => {
    try {
      return success(mockServerManager.status(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read status')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_STATUSES, () => {
    try {
      return success(mockServerManager.statuses())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read statuses')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_LOGS, (_e, id: string) => {
    try {
      return success(mockServerManager.logs(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read logs')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_CLEAR_LOGS, (_e, id: string) => {
    try {
      mockServerManager.clearLogs(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to clear logs')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_TEST_ROUTE, async (_e, input: MockRouteTestInput) => {
    try {
      return success(await mockServerManager.testRoute(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Route test failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_FIND_PORT, async (_e, payload: { host?: string; preferred?: number }) => {
    try {
      const host = payload?.host?.trim() || '127.0.0.1'
      const preferred = Number.isFinite(payload?.preferred) ? Number(payload!.preferred) : 4010
      return success(await findAvailablePort(host, preferred))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to find port')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MOCK_SERVER_IMPORT_COLLECTION, (_e, input: ImportCollectionToMockInput) => {
    try {
      return success(mockServerManager.importCollection(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Import failed')
    }
  })
}
