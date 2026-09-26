import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  CreatePresentationInput,
  GeneratePresentationInput,
  PresentationAssistantInput,
  UpdatePresentationInput
} from '@shared/types/presentation'
import { presentationRepository } from '../repositories/presentation.repository'
import { presentationAIService } from '../presentation/presentation-ai.service'
import { exportPresentationPdf } from '../presentation/presentation-export.service'
import { exportPresentationPptx } from '../presentation/presentation-pptx.service'
import { projectRepository } from '../repositories/project.repository'
import { importPresentationAsset } from '../presentation/presentation-assets.service'
import { logger } from '../infra/logger.service'
import { ipcSchemas, schema, validatedHandle } from './runtime-schema'

const themeIdSchema = schema.literal(
  'professional',
  'modern',
  'bold',
  'minimal',
  'warm',
  'dark',
  'coral',
  'forest',
  'midnight',
  'canvas'
)
const serializedDeckSchema = schema.string({ max: 25_000_000 })

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'PresentationIPC')
  return { success: false, error }
}

export function registerPresentationHandlers(): void {
  validatedHandle(
    IPC_CHANNELS.PRESENTATION_LIST,
    [ipcSchemas.id] as const,
    async (_e, projectId) => {
      try {
        return success(await presentationRepository.listByProject(projectId))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to list presentations')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_GET,
    [ipcSchemas.id] as const,
    async (_e, id) => {
      try {
        const presentation = await presentationRepository.getById(id)
        if (!presentation) return failure('Presentation not found')
        return success(presentation)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to load presentation')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_CREATE,
    [
      schema.object({
        projectId: ipcSchemas.id,
        title: schema.optional(schema.string({ max: 1_024 })),
        description: schema.optional(schema.string({ max: 100_000 })),
        themeId: schema.optional(themeIdSchema),
        cards: schema.optional(serializedDeckSchema),
        documentJson: schema.optional(serializedDeckSchema),
        schemaVersion: schema.optional(schema.number({ integer: true, min: 0, max: 100 })),
        templateId: schema.optional(schema.string({ max: 256 }))
      }) as import('./runtime-schema').RuntimeSchema<CreatePresentationInput>
    ] as const,
    async (_e, input) => {
      try {
        return success(await presentationRepository.create(input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to create presentation')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_UPDATE,
    [
      ipcSchemas.id,
      schema.object({
        title: schema.optional(schema.string({ max: 1_024 })),
        description: schema.optional(schema.string({ max: 100_000 })),
        themeId: schema.optional(themeIdSchema),
        cards: schema.optional(serializedDeckSchema),
        viewState: schema.optional(schema.string({ max: 2_000_000 })),
        versions: schema.optional(schema.string({ max: 25_000_000 })),
        documentJson: schema.optional(serializedDeckSchema),
        schemaVersion: schema.optional(schema.number({ integer: true, min: 0, max: 100 })),
        templateId: schema.optional(schema.string({ max: 256 })),
        isFavorite: schema.optional(schema.boolean()),
        deletedAt: schema.optional(schema.nullable(schema.string({ max: 128 }))),
        isPinned: schema.optional(schema.boolean())
      }) as import('./runtime-schema').RuntimeSchema<UpdatePresentationInput>
    ] as const,
    async (_e, id, input) => {
      try {
        const presentation = await presentationRepository.update(id, input)
        if (!presentation) return failure('Presentation not found')
        return success(presentation)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to update presentation')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_DELETE,
    [ipcSchemas.id] as const,
    async (_e, id) => {
      try {
        const ok = await presentationRepository.delete(id)
        if (!ok) return failure('Presentation not found')
        return success()
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to delete presentation')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_DUPLICATE,
    [ipcSchemas.id] as const,
    async (_e, id) => {
      try {
        const presentation = await presentationRepository.duplicate(id)
        if (!presentation) return failure('Presentation not found')
        return success(presentation)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to duplicate presentation')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_GENERATE,
    [
      schema.object({
        projectId: ipcSchemas.id,
        prompt: schema.string({ max: 100_000 }),
        themeId: schema.optional(themeIdSchema),
        tone: schema.optional(schema.string({ max: 1_024 })),
        cardCount: schema.optional(schema.number({ integer: true, min: 1, max: 100 })),
        documentIds: schema.optional(schema.array(ipcSchemas.id, { max: 100 })),
        includeKnowledge: schema.optional(schema.boolean())
      }) as import('./runtime-schema').RuntimeSchema<GeneratePresentationInput>
    ] as const,
    async (_e, input) => {
      try {
        return success(await presentationAIService.generate(input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to generate presentation')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_ASSIST,
    [
      schema.object({
        projectId: ipcSchemas.id,
        instruction: schema.string({ min: 1, max: 100_000 }),
        cards: serializedDeckSchema,
        themeId: schema.optional(themeIdSchema),
        title: schema.optional(schema.string({ max: 1_024 })),
        selectedCardIds: schema.optional(schema.array(ipcSchemas.id, { max: 100 })),
        documentIds: schema.optional(schema.array(ipcSchemas.id, { max: 100 })),
        includeKnowledge: schema.optional(schema.boolean())
      }) as import('./runtime-schema').RuntimeSchema<PresentationAssistantInput>
    ] as const,
    async (_e, input) => {
      try {
        return success(await presentationAIService.assist(input))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to run the presentation assistant')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_EXPORT_PDF,
    [ipcSchemas.id, schema.optional(ipcSchemas.path)] as const,
    async (_e, presentationId, outputPath) => {
      try {
        const presentation = await presentationRepository.getById(presentationId)
        if (!presentation) return failure('Presentation not found')
        const project = await projectRepository.getById(presentation.projectId)
        const path = await exportPresentationPdf(presentation, outputPath, project)
        return success({ path })
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to export presentation PDF')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_EXPORT_PPTX,
    [ipcSchemas.id, schema.optional(ipcSchemas.path)] as const,
    async (_e, presentationId, outputPath) => {
      try {
        const presentation = await presentationRepository.getById(presentationId)
        if (!presentation) return failure('Presentation not found')
        const project = await projectRepository.getById(presentation.projectId)
        const path = await exportPresentationPptx(presentation, project, outputPath)
        return success({ path })
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to export presentation PowerPoint')
      }
    },
    'PresentationIPC'
  )

  validatedHandle(
    IPC_CHANNELS.PRESENTATION_IMPORT_ASSET,
    [
      ipcSchemas.id,
      schema.string({ min: 1, max: 1_024 }),
      schema.string({ min: 1, max: 30_000_000 })
    ] as const,
    async (_e, presentationId, name, dataUrl) => {
      try {
        const presentation = await presentationRepository.getById(presentationId)
        if (!presentation) return failure('Presentation not found')
        return success({ src: await importPresentationAsset(presentationId, name, dataUrl) })
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to import presentation image')
      }
    },
    'PresentationIPC'
  )
}
