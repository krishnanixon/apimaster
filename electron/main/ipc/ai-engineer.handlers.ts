import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  AiEngineerConfig,
  AiFailureAnalysis,
  AiTestRun,
  AiTestSuite,
  AnalyzeAiFailureInput,
  AnalyzeApiInput,
  ApiAnalysisRecord,
  GenerateAiTestsInput
} from '@shared/types/ai-engineer'
import { analysisService } from '../ai-engineer/analysis.service'
import { testGenerationService } from '../ai-engineer/test-generation.service'
import { failureAnalysisService } from '../ai-engineer/failure-analysis.service'
import { aiEngineerRepository } from '../ai-engineer/ai-engineer.repository'
import { aiEngineerProvider } from '../ai-engineer/ai-engineer-provider'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'IPC')
  return { success: false, error }
}

export function registerAiEngineerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_GET_CONFIG, () => {
    try {
      return success(aiEngineerRepository.getConfig())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read AI Engineer config')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_UPDATE_CONFIG, (_e, patch: Partial<AiEngineerConfig>) => {
    try {
      return success(aiEngineerRepository.updateConfig(patch ?? {}))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update config')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_STATUS, async () => {
    try {
      const online = await aiEngineerProvider.isOnline()
      return success({ providerOnline: online })
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read AI status')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_DASHBOARD, () => {
    try {
      return success(aiEngineerRepository.getDashboardStats())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load dashboard')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_ANALYZE, async (_e, input: AnalyzeApiInput) => {
    try {
      return success(await analysisService.analyze(input ?? {}))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Analysis failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_LIST_ANALYSES, () => {
    try {
      return success(analysisService.listAnalyses())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list analyses')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_GET_ANALYSIS, (_e, id: string) => {
    try {
      const record = analysisService.getAnalysis(id)
      if (!record) return failure('Analysis not found')
      return success(record)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get analysis')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_GENERATE_TESTS, async (_e, input: GenerateAiTestsInput) => {
    try {
      if (!input?.analysisId) return failure('analysisId is required')
      return success(await testGenerationService.generate(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Test generation failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_LIST_SUITES, () => {
    try {
      return success(aiEngineerRepository.listSuites())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list suites')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_GET_SUITE, (_e, id: string) => {
    try {
      const suite = aiEngineerRepository.getSuite(id)
      if (!suite) return failure('Suite not found')
      return success(suite)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get suite')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_SAVE_RUN, (_e, run: AiTestRun) => {
    try {
      if (!run?.id) return failure('Invalid run')
      return success(aiEngineerRepository.saveRun(run))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save run')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_LIST_RUNS, () => {
    try {
      return success(aiEngineerRepository.listRuns())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list runs')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_GET_RUN, (_e, id: string) => {
    try {
      const run = aiEngineerRepository.getRun(id)
      if (!run) return failure('Run not found')
      return success(run)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get run')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_ANALYZE_FAILURE, async (_e, input: AnalyzeAiFailureInput) => {
    try {
      return success(await failureAnalysisService.analyzeFailure(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failure analysis failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ENGINEER_LIST_FINDINGS, () => {
    try {
      return success(aiEngineerRepository.listFindings())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list findings')
    }
  })
}
