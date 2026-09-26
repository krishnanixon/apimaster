import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  CreateDbConnectionInput,
  DbAiRequest,
  DbDataPageOptions,
  DbDdlPreviewInput,
  DbQueryOptions,
  DbSaveDataChangesInput,
  DbSchemaCompareInput,
  DbWorkspaceSettings,
  UpdateDbConnectionInput
} from '@shared/types/database-workspace'
import type { AppScope } from '@shared/types/scope'
import { dbWorkspaceService } from '../database-workspace/db-workspace.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'DbWorkspaceIPC')
  return { success: false, error }
}

export function registerDbWorkspaceHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_PROVIDERS, async () => {
    try {
      return success(await dbWorkspaceService.listProviders())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list providers')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_CONNECTIONS, async (_e, filter?: { scope?: AppScope; projectId?: string | null }) => {
    try {
      return success(await dbWorkspaceService.listConnections(filter))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list connections')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_GET_CONNECTION, async (_e, id: string) => {
    try {
      return success(await dbWorkspaceService.getConnection(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_GET_CONNECTION_SECRETS, async (_e, id: string) => {
    try {
      return success(await dbWorkspaceService.getConnectionSecrets(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get connection secrets')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_CREATE_CONNECTION, async (_e, input: CreateDbConnectionInput) => {
    try {
      return success(await dbWorkspaceService.createConnection(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_UPDATE_CONNECTION, async (_e, id: string, input: UpdateDbConnectionInput) => {
    try {
      return success(await dbWorkspaceService.updateConnection(id, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_DELETE_CONNECTION, async (_e, id: string) => {
    try {
      await dbWorkspaceService.deleteConnection(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_DUPLICATE_CONNECTION, async (_e, id: string) => {
    try {
      return success(await dbWorkspaceService.duplicateConnection(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to duplicate connection')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_TEST_CONNECTION, async (_e, id: string) => {
    try {
      return success(await dbWorkspaceService.testConnection(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Connection test failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_TEST_CONNECTION_CONFIG, async (_e, input: CreateDbConnectionInput) => {
    try {
      return success(await dbWorkspaceService.testConnectionConfig(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Connection test failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_CONNECT, async (_e, id: string) => {
    try {
      await dbWorkspaceService.connect(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to connect')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_DISCONNECT, async (_e, id: string) => {
    try {
      await dbWorkspaceService.disconnect(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to disconnect')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_DATABASES, async (_e, connectionId: string) => {
    try {
      return success(await dbWorkspaceService.listDatabases(connectionId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list databases')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_SCHEMAS, async (_e, connectionId: string, database: string) => {
    try {
      return success(await dbWorkspaceService.listSchemas(connectionId, database))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list schemas')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.DB_WS_GET_EXPLORER,
    async (_e, connectionId: string, database?: string, schema?: string) => {
      try {
        return success(await dbWorkspaceService.getExplorerTree(connectionId, database, schema))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to load explorer')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DB_WS_GET_TABLE_INFO,
    async (_e, connectionId: string, database: string, schema: string, table: string) => {
      try {
        return success(await dbWorkspaceService.getTableInfo(connectionId, database, schema, table))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to load table info')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.DB_WS_EXECUTE_QUERY, async (_e, options: DbQueryOptions) => {
    try {
      return success(await dbWorkspaceService.executeQuery(options))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Query failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_FETCH_DATA_PAGE, async (_e, options: DbDataPageOptions) => {
    try {
      return success(await dbWorkspaceService.fetchDataPage(options))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to fetch data')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_SAVE_DATA_CHANGES, async (_e, input: DbSaveDataChangesInput) => {
    try {
      return success(await dbWorkspaceService.saveDataChanges(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save changes')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_PREVIEW_DDL, async (_e, input: DbDdlPreviewInput) => {
    try {
      return success(await dbWorkspaceService.previewDdl(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to preview DDL')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_GET_SETTINGS, async () => {
    try {
      return success(await dbWorkspaceService.getSettings())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_SAVE_SETTINGS, async (_e, settings: Partial<DbWorkspaceSettings>) => {
    try {
      return success(await dbWorkspaceService.saveSettings(settings))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_QUERY_HISTORY, async (_e, connectionId?: string, limit?: number) => {
    try {
      return success(await dbWorkspaceService.listQueryHistory(connectionId, limit))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list query history')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_SAVED_QUERIES, async (_e, filter?: { scope?: AppScope; projectId?: string | null }) => {
    try {
      return success(await dbWorkspaceService.listSavedQueries(filter))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list saved queries')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_SAVE_QUERY, async (_e, input: Parameters<typeof dbWorkspaceService.saveQuery>[0]) => {
    try {
      return success(await dbWorkspaceService.saveQuery(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save query')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_DELETE_SAVED_QUERY, async (_e, id: string) => {
    try {
      await dbWorkspaceService.deleteSavedQuery(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete query')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_TABLE_LINKS, async (_e, connectionId: string, table?: string) => {
    try {
      return success(await dbWorkspaceService.listTableLinks(connectionId, table))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list table links')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_CREATE_TABLE_LINK, async (_e, input: Parameters<typeof dbWorkspaceService.createTableLink>[0]) => {
    try {
      return success(await dbWorkspaceService.createTableLink(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create table link')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_SEARCH, async (_e, query: string, connectionId?: string) => {
    try {
      return success(await dbWorkspaceService.search(query, connectionId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Search failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_GENERATE_ER, async (_e, connectionId: string, database: string, schema: string) => {
    try {
      return success(await dbWorkspaceService.generateErDiagram(connectionId, database, schema))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to generate ER diagram')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_COMPARE_SCHEMA, async (_e, input: DbSchemaCompareInput) => {
    try {
      return success(await dbWorkspaceService.compareSchema(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Schema comparison failed')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.DB_WS_KNOWLEDGE_SYNC,
    async (_e, connectionId: string, projectId: string, database: string, schema: string) => {
      try {
        return success(await dbWorkspaceService.syncKnowledgeReport(connectionId, projectId, database, schema))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Knowledge sync failed')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.DB_WS_AI_RUN, async (_e, request: DbAiRequest) => {
    try {
      return success(await dbWorkspaceService.runAi(request))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'AI request failed')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.DB_WS_AI_SCHEMA_GET,
    async (_e, connectionId: string, database: string, schema: string) => {
      try {
        return success(await dbWorkspaceService.getAiSchemaInfo(connectionId, database, schema))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to load AI schema')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DB_WS_AI_SCHEMA_RESYNC,
    async (_e, connectionId: string, database: string, schema: string) => {
      try {
        return success(await dbWorkspaceService.resyncAiSchema(connectionId, database, schema))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to resync AI schema')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.DB_WS_EXPORT_CONNECTIONS, async (_e, connectionIds: string[], includeSecrets?: boolean) => {
    try {
      return success(await dbWorkspaceService.exportConnections(connectionIds, includeSecrets))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Export failed')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.DB_WS_IMPORT_CONNECTIONS,
    async (_e, payload: string, scope: AppScope, projectId?: string | null) => {
      try {
        return success(await dbWorkspaceService.importConnections(payload, scope, projectId))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Import failed')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.DB_WS_CREATE_SNAPSHOT, async (_e, connectionId: string, label: string) => {
    try {
      return success(await dbWorkspaceService.createSnapshot(connectionId, label))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create snapshot')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_SNAPSHOTS, async (_e, connectionId: string) => {
    try {
      return success(await dbWorkspaceService.listSnapshots(connectionId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list snapshots')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_LIST_FOLDERS, async (_e, filter?: { scope?: AppScope; projectId?: string | null }) => {
    try {
      return success(await dbWorkspaceService.listFolders(filter))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list folders')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_CREATE_FOLDER, async (_e, input: Parameters<typeof dbWorkspaceService.createFolder>[0]) => {
    try {
      return success(await dbWorkspaceService.createFolder(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create folder')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DB_WS_PICK_SQLITE_FILE, async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        properties: ['openFile'] as Array<'openFile'>,
        filters: [
          { name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
          { name: 'All files', extensions: ['*'] }
        ]
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      const filePath = result.canceled ? null : (result.filePaths[0] ?? null)
      return success(filePath)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to pick SQLite file')
    }
  })
}
