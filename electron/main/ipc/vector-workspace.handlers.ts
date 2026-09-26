import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  CreateVectorConnectionInput,
  UpdateVectorConnectionInput,
  CreateVectorCollectionInput,
  VectorUpsertInput,
  VectorDeleteInput,
  VectorSearchInput,
  VectorGetInput,
  VectorTextSearchInput,
  VectorTextUpsertInput,
  VectorWorkspaceSettings
} from '@shared/types/vector-workspace'
import type { AppScope } from '@shared/types/scope'
import { vectorWorkspaceService } from '../vector-workspace/vector-workspace.service'
import { ragService } from '../rag/rag.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'VectorWorkspaceIPC')
  return { success: false, error }
}

export function registerVectorWorkspaceHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.VEC_WS_LIST_CONNECTIONS, async (_e, filter?: { scope?: AppScope; projectId?: string | null }) => {
    try {
      return success(await vectorWorkspaceService.listConnections(filter))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list connections')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_CONNECTION, async (_e, id: string) => {
    try {
      return success(await vectorWorkspaceService.getConnection(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_CONNECTION_SECRETS, async (_e, id: string) => {
    try {
      return success(await vectorWorkspaceService.getConnectionSecrets(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get connection secrets')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_CREATE_CONNECTION, async (_e, input: CreateVectorConnectionInput) => {
    try {
      return success(await vectorWorkspaceService.createConnection(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_UPDATE_CONNECTION, async (_e, id: string, input: UpdateVectorConnectionInput) => {
    try {
      return success(await vectorWorkspaceService.updateConnection(id, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_DELETE_CONNECTION, async (_e, id: string) => {
    try {
      await vectorWorkspaceService.deleteConnection(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_DUPLICATE_CONNECTION, async (_e, id: string) => {
    try {
      return success(await vectorWorkspaceService.duplicateConnection(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to duplicate connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_TEST_CONNECTION, async (_e, id: string) => {
    try {
      return success(await vectorWorkspaceService.testConnection(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Connection test failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_TEST_CONNECTION_CONFIG, async (_e, input: CreateVectorConnectionInput) => {
    try {
      return success(await vectorWorkspaceService.testConnectionConfig(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Connection test failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_CONNECT, async (_e, id: string) => {
    try {
      await vectorWorkspaceService.connect(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to connect')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_DISCONNECT, async (_e, id: string) => {
    try {
      await vectorWorkspaceService.disconnect(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to disconnect')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_EXPLORER, async (_e, connectionId: string) => {
    try {
      return success(await vectorWorkspaceService.getExplorer(connectionId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load explorer')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_HEALTH, async (_e, connectionId: string) => {
    try {
      return success(await vectorWorkspaceService.getHealth(connectionId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get health')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_VERSION, async (_e, connectionId: string) => {
    try {
      return success(await vectorWorkspaceService.getVersion(connectionId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get version')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_STATS, async (_e, connectionId: string) => {
    try {
      return success(await vectorWorkspaceService.getStats(connectionId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get stats')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_LIST_COLLECTIONS, async (_e, connectionId: string) => {
    try {
      return success(await vectorWorkspaceService.listCollections(connectionId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list collections')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_CREATE_COLLECTION, async (_e, connectionId: string, input: CreateVectorCollectionInput) => {
    try {
      return success(await vectorWorkspaceService.createCollection(connectionId, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create collection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_DELETE_COLLECTION, async (_e, connectionId: string, name: string) => {
    try {
      await vectorWorkspaceService.deleteCollection(connectionId, name)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete collection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_RENAME_COLLECTION, async (_e, connectionId: string, name: string, newName: string) => {
    try {
      return success(await vectorWorkspaceService.renameCollection(connectionId, name, newName))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to rename collection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_COLLECTION_STATS, async (_e, connectionId: string, name: string) => {
    try {
      return success(await vectorWorkspaceService.getCollectionStats(connectionId, name))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get collection stats')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_UPSERT_VECTORS, async (_e, connectionId: string, input: VectorUpsertInput) => {
    try {
      return success(await vectorWorkspaceService.upsertVectors(connectionId, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to upsert vectors')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_DELETE_VECTORS, async (_e, connectionId: string, input: VectorDeleteInput) => {
    try {
      return success(await vectorWorkspaceService.deleteVectors(connectionId, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete vectors')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_VECTOR, async (_e, connectionId: string, collection: string, id: string) => {
    try {
      return success(await vectorWorkspaceService.getVector(connectionId, collection, id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get vector')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_VECTORS, async (_e, connectionId: string, input: VectorGetInput) => {
    try {
      return success(await vectorWorkspaceService.getVectors(connectionId, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list vectors')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_SEARCH, async (_e, connectionId: string, input: VectorSearchInput) => {
    try {
      return success(await vectorWorkspaceService.search(connectionId, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Search failed')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.VEC_WS_SEARCH_TEXT,
    async (_e, connectionId: string, input: VectorTextSearchInput) => {
      try {
        return success(await vectorWorkspaceService.searchWithText(connectionId, input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Text search failed')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.VEC_WS_UPSERT_TEXT,
    async (_e, connectionId: string, input: VectorTextUpsertInput) => {
      try {
        return success(await vectorWorkspaceService.upsertWithText(connectionId, input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Text upsert failed')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.VEC_WS_BACKUP, async (_e, connectionId: string, destination: string) => {
    try {
      return success(await vectorWorkspaceService.backup(connectionId, destination))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Backup failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_RESTORE, async (_e, connectionId: string, source: string) => {
    try {
      return success(await vectorWorkspaceService.restore(connectionId, source))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Restore failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_GET_SETTINGS, async () => {
    try {
      return success(await vectorWorkspaceService.getSettings())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_SAVE_SETTINGS, async (_e, settings: Partial<VectorWorkspaceSettings>) => {
    try {
      return success(await vectorWorkspaceService.saveSettings(settings))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_RAG_INDEX, async (_e, projectId: string) => {
    try {
      return success(await ragService.indexProject(projectId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'RAG indexing failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VEC_WS_RAG_STATUS, async (_e, projectId: string) => {
    try {
      return success(await ragService.getStatus(projectId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get RAG status')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.VEC_WS_RAG_RETRIEVE,
    async (_e, projectId: string, query: string, topK?: number) => {
      try {
        return success(await ragService.retrieve(projectId, query, { topK }))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'RAG retrieve failed')
      }
    }
  )
}
