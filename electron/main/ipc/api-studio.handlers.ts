import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  DescribeApiRequestInput,
  EnhanceApiRequestInput,
  ExplainApiResponseInput,
  FixApiRequestInput,
  GenerateApiRequestInput,
  GenerateApiTestsInput,
  GenerateCollectionDocumentInput,
  OAuth2AuthorizeInput,
  OAuth2TokenInput,
  ResolvedHttpRequest,
  RunApiTestsInput,
  RunPreRequestScriptInput,
  SaveResponseFileInput,
  ExportCollectionFileInput
} from '@shared/types/api-studio'
import { httpClientService } from '../api-studio/http-client.service'
import { scriptRunnerService } from '../api-studio/script-runner.service'
import { oauth2Service } from '../api-studio/oauth2.service'
import { apiStudioAIService } from '../api-studio/api-studio-ai.service'
import { logger } from '../infra/logger.service'
import { activityRepository } from '../repositories/activity.repository'
import { ipcSchemas, schema, validatedHandle } from './runtime-schema'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'ApiStudioIPC')
  return { success: false, error }
}

export function registerApiStudioHandlers(getMainWindow: () => BrowserWindow | null): void {
  validatedHandle(IPC_CHANNELS.API_STUDIO_SEND_REQUEST, [schema.object({
    clientRequestId: ipcSchemas.id,
    method: schema.literal('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'),
    url: schema.string({ min: 1, max: 32_768 }),
    headers: schema.record(schema.string({ max: 1_000_000 }), { maxKeys: 1_000 }),
    params: schema.record(schema.string({ max: 1_000_000 }), { maxKeys: 1_000 }),
    body: schema.unknown(),
    timeoutMs: schema.optional(schema.number({ integer: true, min: 100, max: 3_600_000 })),
    auth: schema.optional(schema.unknown()),
    network: schema.optional(schema.object({
      verifySsl: schema.optional(schema.boolean()),
      disableCookies: schema.optional(schema.boolean())
    }))
  }, { passthrough: true }) as import('./runtime-schema').RuntimeSchema<ResolvedHttpRequest>] as const, async (_e, request) => {
    try {
      const result = await httpClientService.execute(request)
      activityRepository.record('request')
      return success(result)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Request failed')
    }
  }, 'ApiStudioIPC')

  validatedHandle(IPC_CHANNELS.API_STUDIO_CANCEL_REQUEST, [ipcSchemas.id] as const, (_e, clientRequestId) => {
    httpClientService.cancel(clientRequestId)
    return success()
  }, 'ApiStudioIPC')

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_RUN_TESTS, async (_e, input: RunApiTestsInput) => {
    try {
      const run = await scriptRunnerService.runTests(input)
      if (run.results.length) activityRepository.record('test')
      return success(run)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to run tests')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_RUN_PRE_REQUEST, async (_e, input: RunPreRequestScriptInput) => {
    try {
      return success(await scriptRunnerService.runPreRequest(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to run pre-request script')
    }
  })

  validatedHandle(IPC_CHANNELS.API_STUDIO_SAVE_RESPONSE, [schema.object({
    defaultName: schema.string({ max: 1_024 }),
    content: ipcSchemas.text,
    isBase64: schema.optional(schema.boolean()),
    contentType: schema.optional(schema.string({ max: 1_024 }))
  }) as import('./runtime-schema').RuntimeSchema<SaveResponseFileInput>] as const, async (_e, input) => {
    try {
      const win = getMainWindow()
      if (!win) return failure('No active window')

      const ext = input.isBase64 ? 'bin' : input.contentType?.includes('json') ? 'json' : 'txt'
      const result = await dialog.showSaveDialog(win, {
        title: 'Save Response',
        defaultPath: input.defaultName || `response.${ext}`,
        filters: [{ name: 'All Files', extensions: ['*'] }]
      })

      if (result.canceled || !result.filePath) return failure('Save cancelled')

      if (input.isBase64) {
        await fs.writeFile(result.filePath, Buffer.from(input.content, 'base64'))
      } else {
        await fs.writeFile(result.filePath, input.content, 'utf-8')
      }

      return success(result.filePath)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save response')
    }
  }, 'ApiStudioIPC')

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_PICK_IMPORT_COLLECTION, async () => {
    try {
      const win = getMainWindow()
      if (!win) return failure('No active window')

      const result = await dialog.showOpenDialog(win, {
        title: 'Import Postman Collection',
        filters: [{ name: 'Postman Collection', extensions: ['json'] }],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths[0]) return failure('Import cancelled')

      const content = await fs.readFile(result.filePaths[0], 'utf-8')
      return success(content)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to import collection')
    }
  })

  validatedHandle(IPC_CHANNELS.API_STUDIO_EXPORT_COLLECTION, [schema.object({
    defaultName: schema.string({ min: 1, max: 1_024 }),
    content: ipcSchemas.text,
    title: schema.optional(schema.string({ max: 1_024 })),
    filters: schema.optional(schema.array(schema.object({
      name: schema.string({ min: 1, max: 256 }),
      extensions: schema.array(schema.string({ min: 1, max: 32 }), { max: 32 })
    }), { max: 32 }))
  }) as import('./runtime-schema').RuntimeSchema<ExportCollectionFileInput>] as const, async (_e, input) => {
    try {
      const win = getMainWindow()
      if (!win) return failure('No active window')

      const result = await dialog.showSaveDialog(win, {
        title: input.title || 'Export Collection',
        defaultPath: input.defaultName,
        filters: input.filters?.length
          ? input.filters
          : [{ name: 'Postman Collection', extensions: ['json'] }]
      })

      if (result.canceled || !result.filePath) return failure('Export cancelled')

      await fs.writeFile(result.filePath, input.content, 'utf-8')
      return success(result.filePath)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to export collection')
    }
  }, 'ApiStudioIPC')

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_OAUTH2_AUTHORIZE, async (_e, input: OAuth2AuthorizeInput) => {
    try {
      return success(await oauth2Service.authorize(input, getMainWindow))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'OAuth authorization failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_OAUTH2_TOKEN, async (_e, input: OAuth2TokenInput) => {
    try {
      return success(await oauth2Service.exchangeToken(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Token exchange failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_AI_GENERATE, async (_e, input: GenerateApiRequestInput) => {
    try {
      return success(await apiStudioAIService.generateRequest(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to generate request')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_AI_EXPLAIN, async (_e, input: ExplainApiResponseInput) => {
    try {
      return success(await apiStudioAIService.explainResponse(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to explain response')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_AI_TESTS, async (_e, input: GenerateApiTestsInput) => {
    try {
      return success(await apiStudioAIService.generateTests(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to generate tests')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_AI_FIX, async (_e, input: FixApiRequestInput) => {
    try {
      return success(await apiStudioAIService.fixRequest(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to fix request')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_AI_DOCUMENT, async (_e, input: GenerateCollectionDocumentInput) => {
    try {
      return success(await apiStudioAIService.documentCollection(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to generate collection document')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_AI_DESCRIBE, async (_e, input: DescribeApiRequestInput) => {
    try {
      return success(await apiStudioAIService.describeRequest(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to describe request')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_STUDIO_AI_ENHANCE, async (_e, input: EnhanceApiRequestInput) => {
    try {
      return success(await apiStudioAIService.enhance(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to enhance request')
    }
  })
}
