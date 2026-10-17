import { ipcMain, BrowserWindow, app, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { AIProviderConfigPatch, AIProviderId, CreateBugReportInput, IpcResult } from '@shared/types'
import { settingsRepository } from '../repositories/settings.repository'
import { usageRepository } from '../repositories/usage.repository'
import { profileRepository } from '../repositories/profile.repository'
import { activityRepository } from '../repositories/activity.repository'
import { PROFILE_LIMITS } from '@shared/lib/profile'
import { schema, validatedHandle } from './runtime-schema'
import { apiKeyService } from '../infra/api-key.service'
import { onboardingService } from '../infra/onboarding.service'
import { TERMS_VERSION } from '@shared/constants/terms'
import { aiManager } from '../ai'
import { logger } from '../infra/logger.service'
import { bugReportService } from '../infra/bug-report.service'
import { workspaceStore } from '../infra/workspace-store'
import { WORKSPACE_PAYLOAD_MAX_CHARS } from '@shared/lib/workspace-document'
import { registerApiStudioHandlers } from './api-studio.handlers'
import { registerMockServerHandlers } from './mock-server.handlers'
import { registerAiEngineerHandlers } from './ai-engineer.handlers'
import { registerMcpHandlers } from './mcp.handlers'
import { registerCodeScannerHandlers } from './code-scanner.handlers'
import { registerUpdaterHandlers } from './updater.handlers'
import { updaterService } from '../infra/updater.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'IPC')
  return { success: false, error }
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())

  ipcMain.handle(IPC_CHANNELS.APP_GET_PATH, (_e, name: string) => {
    return app.getPath(name as Parameters<typeof app.getPath>[0])
  })

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_e, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC_CHANNELS.ONBOARDING_GET, () => {
    try {
      const state = onboardingService.get()
      return success({
        ...state,
        isComplete: onboardingService.isSetupComplete(),
        currentTermsVersion: TERMS_VERSION
      })
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read onboarding state')
    }
  })

  ipcMain.handle(IPC_CHANNELS.ONBOARDING_COMPLETE, (_e, termsVersion?: string) => {
    try {
      const state = onboardingService.acceptTermsAndComplete(
        typeof termsVersion === 'string' && termsVersion.trim()
          ? termsVersion.trim()
          : TERMS_VERSION
      )
      return success(state)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to complete setup')
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    try {
      const settings = await settingsRepository.get()
      return success(settings)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_e, data) => {
    try {
      const before = await settingsRepository.get()
      const settings = await settingsRepository.update(data)
      if (settings.autoUpdate !== before.autoUpdate) updaterService.setEnabled(settings.autoUpdate)
      return success(settings)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET, () => {
    try {
      return success(profileRepository.get())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read profile')
    }
  })

  const profileText = (max: number) => schema.optional(schema.string({ max }))
  validatedHandle(
    IPC_CHANNELS.PROFILE_UPDATE,
    [
      schema.object({
        displayName: profileText(PROFILE_LIMITS.displayName),
        email: profileText(PROFILE_LIMITS.email),
        role: profileText(PROFILE_LIMITS.role),
        bio: profileText(PROFILE_LIMITS.bio),
        location: profileText(PROFILE_LIMITS.location),
        website: profileText(PROFILE_LIMITS.website),
        avatarDataUrl: schema.optional(
          schema.nullable(schema.string({ max: PROFILE_LIMITS.avatarDataUrl }))
        )
      })
    ] as const,
    (_e, patch) => {
      try {
        // Drop keys the renderer didn't send so they keep their stored value
        const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
        return success(profileRepository.update(defined))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to save profile')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_GET, () => {
    try {
      return success(activityRepository.get())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read activity')
    }
  })

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_CLEAR, () => {
    try {
      activityRepository.clear()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to clear activity')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_KEY_SET, (_e, key: string) => {
    try {
      apiKeyService.setApiKey(key)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to set API key')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_KEY_GET_STATUS, () => {
    return success(apiKeyService.getStatus())
  })

  ipcMain.handle(IPC_CHANNELS.API_KEY_DELETE, () => {
    try {
      apiKeyService.deleteApiKey()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete API key')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_KEY_SET_FOR, (_e, providerId: AIProviderId, key: string) => {
    try {
      apiKeyService.setProviderKey(providerId, key)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to set API key')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_KEY_GET_STATUS_FOR, (_e, providerId: AIProviderId) => {
    return success(apiKeyService.getProviderStatus(providerId))
  })

  ipcMain.handle(IPC_CHANNELS.API_KEY_DELETE_FOR, (_e, providerId: AIProviderId) => {
    try {
      apiKeyService.deleteProviderKey(providerId)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete API key')
    }
  })

  ipcMain.handle(IPC_CHANNELS.API_KEY_LIST_STATUSES, () => {
    return success(apiKeyService.listProviderStatuses())
  })

  // ── AI Provider Management ──────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AI_GET_CONFIG, () => {
    try {
      return success(aiManager.getConfig())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load AI config')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_SET_CONFIG, (_e, patch: AIProviderConfigPatch) => {
    try {
      return success(aiManager.setConfig(patch))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update AI config')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_STATUS, async () => {
    try {
      return success(await aiManager.getStatus())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load AI status')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_TEST_CONNECTION, async (_e, providerId: AIProviderId) => {
    try {
      return success(await aiManager.testConnection(providerId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Connection test failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_LIST_MODELS, async (_e, providerId: AIProviderId) => {
    try {
      return success(await aiManager.listModels(providerId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list models')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_METRICS, () => {
    try {
      return success(aiManager.getMetrics())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load AI metrics')
    }
  })

  ipcMain.handle(IPC_CHANNELS.USAGE_SUMMARY, async () => {
    try {
      const summary = await usageRepository.getSummary()
      return success(summary)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load API usage')
    }
  })

  ipcMain.handle(IPC_CHANNELS.USAGE_CLEAR, async () => {
    try {
      await usageRepository.clear()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to clear API usage')
    }
  })

  ipcMain.handle(IPC_CHANNELS.LOG_WRITE, (_e, entry) => {
    logger.write(entry)
  })

  ipcMain.handle(IPC_CHANNELS.LOG_GET_RECENT, (_e, limit?: number) => {
    return success(logger.getRecent(limit))
  })

  ipcMain.handle(IPC_CHANNELS.BUG_REPORT_CREATE, (_e, input: CreateBugReportInput) => {
    if (!input?.title?.trim() || !input?.description?.trim()) {
      return failure('A title and description are required')
    }
    try {
      return success(bugReportService.create(input))
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to save bug report')
    }
  })

  ipcMain.handle(IPC_CHANNELS.BUG_REPORT_LIST, () => success(bugReportService.list()))

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_LOAD, () => {
    try {
      return success(workspaceStore.load())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load workspace')
    }
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SAVE, (_e, payload: unknown) => {
    try {
      if (typeof payload !== 'string' || payload.length > WORKSPACE_PAYLOAD_MAX_CHARS) {
        return failure('Invalid workspace payload')
      }
      return success(workspaceStore.save(payload))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save workspace')
    }
  })

  ipcMain.on(IPC_CHANNELS.WORKSPACE_SAVE_SYNC, (event, payload: unknown) => {
    try {
      if (typeof payload !== 'string' || payload.length > WORKSPACE_PAYLOAD_MAX_CHARS) {
        event.returnValue = { success: false, error: 'Invalid workspace payload' }
        return
      }
      event.returnValue = { success: true, data: workspaceStore.save(payload) }
    } catch (e) {
      event.returnValue = {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to save workspace'
      }
    }
  })

  registerApiStudioHandlers(getMainWindow)
  registerMockServerHandlers()
  registerAiEngineerHandlers()
  registerCodeScannerHandlers(getMainWindow)
  registerMcpHandlers(getMainWindow)
  registerUpdaterHandlers()
}
