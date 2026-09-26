import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { ContextEngineResult } from '@shared/types/context-engine'
import { settingsRepository } from '../repositories/settings.repository'
import { contextEngine } from '../context-engine/context-engine.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'ContextEngineIPC')
  return { success: false, error }
}

export function registerContextEngineHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_RESOLVE,
    async (
      _e,
      input: { query: string; projectId?: string | null; model?: string }
    ): Promise<IpcResult<ContextEngineResult>> => {
      try {
        const settings = await settingsRepository.get()
        const pack = await contextEngine.resolve({
          query: input.query ?? '',
          projectId: input.projectId ?? null,
          model: input.model || settings.aiModel,
          conversationTokens: 0,
          systemTokens: 0
        })
        return success(pack)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to resolve context')
      }
    }
  )
}
