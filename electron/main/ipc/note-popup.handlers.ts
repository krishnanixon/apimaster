import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import { hideQuickNote } from '../notepad/note-popup.window'
import { logger } from '../infra/logger.service'
import { broadcastToWorkbench } from '../windows/window-manager'
import { registerNotepadBridge } from '../voice-assistant/notepadBridge'

function success(): IpcResult {
  return { success: true }
}

function failure(error: string): IpcResult {
  logger.error(error, 'QuickNoteIPC')
  return { success: false, error }
}

export function registerNotePopupHandlers(): void {
  registerNotepadBridge()

  ipcMain.handle(IPC_CHANNELS.NOTE_POPUP_CLOSE, () => {
    try {
      hideQuickNote()
      return success()
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to close quick note')
    }
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_POPUP_SAVED, () => {
    try {
      broadcastToWorkbench(IPC_CHANNELS.NOTE_POPUP_SAVED)
      hideQuickNote()
      return success()
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to finish saving quick note')
    }
  })
}
