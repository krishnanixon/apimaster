import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { ClipboardItem, ClipboardSearchQuery } from '@shared/types/clipboard'
import { clipboardManagerService } from '../clipboard-manager/clipboard.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'ClipboardIPC')
  return { success: false, error }
}

export function registerClipboardHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_LIST, async () => {
    try {
      return success(clipboardManagerService.list())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list clipboard history')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_SEARCH, async (_e, query: ClipboardSearchQuery) => {
    try {
      return success(clipboardManagerService.search(query))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Clipboard search failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_COPY, async (_e, id: string) => {
    try {
      const copied = clipboardManagerService.copyToClipboard(id)
      if (!copied) return failure('Clipboard item not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to copy clipboard item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_WRITE_TEXT, async (_e, text: string) => {
    try {
      clipboardManagerService.writeText(text)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to write clipboard text')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_PIN, async (_e, id: string) => {
    try {
      return success(clipboardManagerService.pin(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to pin clipboard item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_REMOVE, async (_e, id: string) => {
    try {
      return success(clipboardManagerService.remove(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to remove clipboard item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_CLEAR_UNPINNED, async () => {
    try {
      return success(clipboardManagerService.clearUnpinned())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to clear clipboard history')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_OPEN_PANEL, async () => {
    try {
      clipboardManagerService.openPanel()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to open clipboard panel')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_PICK_AND_PASTE, async (_e, id: string) => {
    try {
      const pasted = await clipboardManagerService.pickAndPaste(id)
      if (!pasted) return failure('Clipboard item not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to paste clipboard item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_CLOSE_PICKER, async () => {
    try {
      clipboardManagerService.closeQuickPicker()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to close clipboard picker')
    }
  })
}

export function startClipboardManager(): void {
  clipboardManagerService.start()
}

export function syncClipboardToRenderer(): void {
  clipboardManagerService.syncToRenderer()
}

export function stopClipboardManager(): void {
  clipboardManagerService.stop()
}
