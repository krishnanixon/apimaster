import { ipcMain, dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  CreateVaultFolderInput,
  CreateVaultItemInput,
  GeneratePasswordOptions,
  UpdateVaultFolderInput,
  UpdateVaultItemInput,
  VaultExportOptions,
  VaultImportOptions,
  VaultItemSecrets,
  VaultSearchQuery,
  VaultSettings,
  VaultSetupInput,
  VaultUnlockInput
} from '@shared/types/vault'
import { vaultService } from '../vault/vault.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return {
    success: true,
    data: data === undefined ? data : ipcSafe(data)
  }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'VaultIPC')
  return { success: false, error }
}

/** Electron IPC cannot serialize bigint values returned from SQLite. */
function ipcSafe<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? Number(value) : value))
  ) as T
}

export function registerVaultHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.VAULT_STATUS, async () => {
    try {
      return success(await vaultService.getStatus())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get vault status')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_SETUP, async (_e, input: VaultSetupInput) => {
    try {
      await vaultService.setup(input)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Vault setup failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_UNLOCK, async (_e, input: VaultUnlockInput) => {
    try {
      await vaultService.unlock(input)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Unlock failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_LOCK, async () => {
    try {
      vaultService.lock()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Lock failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_UPDATE_SETTINGS, async (_e, settings: Partial<VaultSettings>) => {
    try {
      return success(await vaultService.updateSettings(settings))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_CHANGE_MASTER_PASSWORD, async (_e, current: string, next: string) => {
    try {
      await vaultService.changeMasterPassword(current, next)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to change master password')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_LIST_FOLDERS, async () => {
    try {
      return success(await vaultService.listFolders())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list folders')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_CREATE_FOLDER, async (_e, input: CreateVaultFolderInput) => {
    try {
      return success(await vaultService.createFolder(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create folder')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_UPDATE_FOLDER, async (_e, id: string, input: UpdateVaultFolderInput) => {
    try {
      return success(await vaultService.updateFolder(id, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update folder')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_DELETE_FOLDER, async (_e, id: string) => {
    try {
      await vaultService.deleteFolder(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete folder')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_REORDER_FOLDERS, async (_e, orderedIds: string[]) => {
    try {
      await vaultService.reorderFolders(orderedIds)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to reorder folders')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_LIST_TAGS, async () => {
    try {
      return success(await vaultService.listTags())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list tags')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.VAULT_LIST_ITEMS,
    async (_e, filter?: { folderId?: string | null; view?: string }) => {
      try {
        return success(await vaultService.listItems(filter))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to list items')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.VAULT_GET_ITEM, async (_e, id: string, includeSecrets?: boolean) => {
    try {
      return success(await vaultService.getItem(id, includeSecrets))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_CREATE_ITEM, async (_e, input: CreateVaultItemInput) => {
    try {
      return success(await vaultService.createItem(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_UPDATE_ITEM, async (_e, id: string, input: UpdateVaultItemInput) => {
    try {
      return success(await vaultService.updateItem(id, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_ARCHIVE_ITEM, async (_e, id: string) => {
    try {
      await vaultService.archiveItem(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to archive item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_RESTORE_ITEM, async (_e, id: string) => {
    try {
      await vaultService.restoreItem(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to restore item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_TRASH_ITEM, async (_e, id: string) => {
    try {
      await vaultService.trashItem(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to move item to trash')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_DELETE_ITEM, async (_e, id: string) => {
    try {
      await vaultService.deleteItemPermanent(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_REORDER_ITEMS, async (_e, orderedIds: string[]) => {
    try {
      await vaultService.reorderItems(orderedIds)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to reorder items')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.VAULT_REVEAL_FIELD,
    async (_e, itemId: string, field: keyof VaultItemSecrets) => {
      try {
        return success(await vaultService.revealField(itemId, field))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to reveal field')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_COPY_FIELD,
    async (_e, itemId: string, field: keyof VaultItemSecrets) => {
      try {
        const seconds = await vaultService.copyToClipboard(itemId, field)
        return success({ clearAfterSeconds: seconds })
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to copy field')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.VAULT_LIST_HISTORY, async (_e, itemId: string) => {
    try {
      return success(await vaultService.listHistory(itemId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list history')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_RESTORE_HISTORY, async (_e, itemId: string, historyId: string) => {
    try {
      await vaultService.restoreHistoryPassword(itemId, historyId)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to restore history')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_SEARCH, async (_e, query: VaultSearchQuery) => {
    try {
      return success(await vaultService.search(query))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Search failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_GENERATE_PASSWORD, async (_e, options?: GeneratePasswordOptions) => {
    try {
      return success(vaultService.generatePassword(options))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to generate password')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_GENERATE_API_KEY, async () => {
    try {
      return success({ apiKey: vaultService.generateApiKey() })
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to generate API key')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_GET_DUPLICATES, async () => {
    try {
      return success(await vaultService.getDuplicates())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get duplicates')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_SECURITY_REPORT, async () => {
    try {
      return success(await vaultService.getSecurityReport())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get security report')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_AI_SUGGESTIONS, async () => {
    try {
      return success(await vaultService.getAiSuggestions())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get AI suggestions')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_LIST_ACTIVITY, async () => {
    try {
      return success(await vaultService.listActivity())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list activity')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_EXPORT, async (_e, options: VaultExportOptions) => {
    try {
      const data = await vaultService.exportData(options)
      const ext = options.format === 'csv' ? 'csv' : 'json'
      const result = await dialog.showSaveDialog({
        title: 'Export Vault',
        defaultPath: `vault-export.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      })
      if (result.canceled || !result.filePath) return success({ saved: false })
      const { writeFileSync } = await import('fs')
      writeFileSync(result.filePath, data, 'utf-8')
      return success({ saved: true, filePath: result.filePath })
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Export failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_IMPORT, async (_e, options: VaultImportOptions) => {
    try {
      return success(await vaultService.importData(options))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Import failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VAULT_PROJECT_CREDENTIALS, async (_e, projectId: string) => {
    try {
      return success(await vaultService.getProjectCredentials(projectId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get project credentials')
    }
  })
}
