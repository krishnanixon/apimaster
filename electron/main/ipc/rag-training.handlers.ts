import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  CreateRagTrainingDocumentInput,
  RagTrainingSettings,
  UpdateRagTrainingDocumentInput
} from '@shared/types/rag-training'
import type { AppScope } from '@shared/types/scope'
import { ragTrainingService } from '../rag/rag-training.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'RagTrainingIPC')
  return { success: false, error }
}

export function registerRagTrainingHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.RAG_TRAIN_LIST,
    async (_e, filter?: { scope?: AppScope; projectId?: string | null; enabledOnly?: boolean }) => {
      try {
        return success(await ragTrainingService.list(filter))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to list training documents')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.RAG_TRAIN_GET, async (_e, id: string) => {
    try {
      return success(await ragTrainingService.get(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get training document')
    }
  })

  ipcMain.handle(IPC_CHANNELS.RAG_TRAIN_CREATE, async (_e, input: CreateRagTrainingDocumentInput) => {
    try {
      return success(await ragTrainingService.create(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create training document')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.RAG_TRAIN_UPDATE,
    async (_e, id: string, input: UpdateRagTrainingDocumentInput) => {
      try {
        return success(await ragTrainingService.update(id, input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to update training document')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.RAG_TRAIN_DELETE, async (_e, id: string) => {
    try {
      await ragTrainingService.delete(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete training document')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.RAG_TRAIN_INDEX,
    async (_e, scope: AppScope, projectId?: string | null) => {
      try {
        return success(await ragTrainingService.indexScope(scope, projectId))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to index training corpus')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.RAG_TRAIN_INDEX_STATUS,
    async (_e, scope: AppScope, projectId?: string | null) => {
      try {
        return success(await ragTrainingService.getIndexStatus(scope, projectId))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to get training index status')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.RAG_TRAIN_GET_SETTINGS, async () => {
    try {
      return success(await ragTrainingService.getSettings())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get training settings')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.RAG_TRAIN_SAVE_SETTINGS,
    async (_e, settings: Partial<RagTrainingSettings>) => {
      try {
        return success(await ragTrainingService.saveSettings(settings))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to save training settings')
      }
    }
  )
}
