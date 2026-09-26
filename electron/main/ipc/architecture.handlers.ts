import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  ArchitectureAssistantInput,
  CreateArchitectureDiagramInput,
  GenerateArchitectureInput,
  UpdateArchitectureDiagramInput
} from '@shared/types/architecture'
import { architectureRepository } from '../repositories/architecture.repository'
import { architectureAIService } from '../architecture/architecture-ai.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'ArchitectureIPC')
  return { success: false, error }
}

export function registerArchitectureHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ARCHITECTURE_LIST, async (_e, projectId: string) => {
    try {
      return success(await architectureRepository.listByProject(projectId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list architectures')
    }
  })

  ipcMain.handle(IPC_CHANNELS.ARCHITECTURE_GET, async (_e, id: string) => {
    try {
      const diagram = await architectureRepository.getById(id)
      if (!diagram) return failure('Architecture not found')
      return success(diagram)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load architecture')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.ARCHITECTURE_CREATE,
    async (_e, input: CreateArchitectureDiagramInput) => {
      try {
        return success(await architectureRepository.create(input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to create architecture')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ARCHITECTURE_UPDATE,
    async (_e, id: string, input: UpdateArchitectureDiagramInput) => {
      try {
        const diagram = await architectureRepository.update(id, input)
        if (!diagram) return failure('Architecture not found')
        return success(diagram)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to update architecture')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.ARCHITECTURE_DELETE, async (_e, id: string) => {
    try {
      const ok = await architectureRepository.delete(id)
      if (!ok) return failure('Architecture not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete architecture')
    }
  })

  ipcMain.handle(IPC_CHANNELS.ARCHITECTURE_DUPLICATE, async (_e, id: string) => {
    try {
      const diagram = await architectureRepository.duplicate(id)
      if (!diagram) return failure('Architecture not found')
      return success(diagram)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to duplicate architecture')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.ARCHITECTURE_GENERATE,
    async (_e, input: GenerateArchitectureInput) => {
      try {
        return success(await architectureAIService.generate(input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to generate architecture')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ARCHITECTURE_ASSIST,
    async (_e, input: ArchitectureAssistantInput) => {
      try {
        return success(await architectureAIService.assist(input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to run the architecture assistant')
      }
    }
  )
}
