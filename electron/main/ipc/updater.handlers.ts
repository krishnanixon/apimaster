import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult, UpdateStatus } from '@shared/types'
import { updaterService } from '../infra/updater.service'

export function registerUpdaterHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.UPDATER_GET_STATUS, (): IpcResult<UpdateStatus> => ({
    success: true,
    data: updaterService.getStatus()
  }))

  ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK, async (): Promise<IpcResult<UpdateStatus>> => ({
    success: true,
    data: await updaterService.check()
  }))

  ipcMain.handle(IPC_CHANNELS.UPDATER_INSTALL, (): IpcResult => {
    try {
      updaterService.install()
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed to install update' }
    }
  })
}
