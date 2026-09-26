import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import { logger } from '../infra/logger.service'
import {
  createWorkbenchWindow,
  getWindowById,
  listWindowInfo,
  openOrFocusWindow,
  openProjectWindow,
  showWorkbenchWindow,
  windowFromEvent
} from '../windows/window-manager'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'WindowsIPC')
  return { success: false, error }
}

export function registerWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_CREATE, (_event, path?: string) => {
    try {
      const win = createWorkbenchWindow({ path, kind: 'workbench' })
      return success({ id: win.id })
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to create window')
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_OPEN_PATH, (_event, path: string) => {
    try {
      const win = openOrFocusWindow({ path })
      return success({ id: win.id })
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to open path in new window')
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_OPEN_MODULE, (_event, path: string) => {
    try {
      const win = openOrFocusWindow({ path, kind: 'module', reuse: true })
      return success({ id: win.id })
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to open module window')
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_OPEN_PROJECT, (_event, projectId: string, segment?: string) => {
    try {
      const id = String(projectId ?? '').trim()
      if (!id) return failure('Project id is required')
      const win = openProjectWindow(id, String(segment ?? 'overview'))
      return success({ id: win.id })
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to open project window')
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_OPEN_WORKBENCH, (_event, path?: string) => {
    try {
      const win = openOrFocusWindow({ path, kind: 'workbench', reuse: true })
      return success({ id: win.id })
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to open in workbench')
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_CLOSE, (event) => {
    try {
      windowFromEvent(event)?.close()
      return success()
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to close window')
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_LIST, () => {
    try {
      return success(listWindowInfo())
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to list windows')
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_FOCUS, (_event, id: number) => {
    try {
      const win = getWindowById(id)
      if (!win) return failure('Window not found')
      showWorkbenchWindow(win)
      return success()
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to focus window')
    }
  })
}
