import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { ASSISTANT_NAME, PRODUCT_NAME } from '@shared/constants/product'
import type {
  AIProviderConfigPatch,
  AIProviderId,
  ChatContextAttachment,
  IpcResult
} from '@shared/types'
import type { CreateBugReportInput } from '@shared/types'
import { projectRepository } from '../repositories/project.repository'
import { conversationRepository } from '../repositories/conversation.repository'
import { messageRepository } from '../repositories/message.repository'
import { documentRepository } from '../repositories/document.repository'
import { knowledgeRepository } from '../repositories/knowledge.repository'
import { settingsRepository, searchRepository } from '../repositories/settings.repository'
import { usageRepository } from '../repositories/usage.repository'
import { apiKeyService } from '../infra/api-key.service'
import { onboardingService } from '../infra/onboarding.service'
import { TERMS_VERSION } from '@shared/constants/terms'
import { aiService } from '../ai/ai.service'
import { aiManager } from '../ai'
import { acquireGenerateLock, releaseGenerateLock } from '../ai/credit-guard'
import { exportService } from '../export/export.service'
import { parseDocxBuffer } from '@shared/lib/docx-import'
import { parsePdfBuffer } from '@shared/lib/pdf-import'
import { saveDocumentWordById, saveDocumentWordCopy } from '../documents/document-word-save.service'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { sanitizeWordFileName, wordFileNameForDocument } from '@shared/lib/word-file-path'
import { buildKnowledgeContext } from '../knowledge/knowledge-context.service'
import { resolveProjectKnowledgeText } from '../knowledge/project-knowledge.service'
import { contextEngine, estimateTokens } from '../context-engine/context-engine.service'
import type { ContextPackSummary } from '@shared/types/context-engine'
import { ensureSddFlowSlotsHtml } from '@shared/lib/architecture-to-sdd'
import { bootstrapNewProject } from '../knowledge/project-bootstrap.service'
import { combineGenerationRules } from '@shared/lib/document-generation-rules'
import {
  extractKnowledgeFromText,
  syncKnowledgeToSearch
} from '../knowledge/knowledge-extraction.service'
import { analyzeKnowledgeSuggestions } from '../knowledge/knowledge-suggestions.service'
import { seedSampleKnowledge } from '../knowledge/knowledge-seed.service'
import { logger } from '../infra/logger.service'
import { bugReportService } from '../infra/bug-report.service'

async function resolveDocumentGenerationRules(projectId?: string | null): Promise<string> {
  const [appSettings, project] = await Promise.all([
    settingsRepository.get(),
    projectId ? projectRepository.getById(projectId) : Promise.resolve(null)
  ])
  return combineGenerationRules(
    appSettings.documentGenerationRules,
    project?.settings?.documentGenerationRules
  )
}

function saveImportedSourceFile(fileName: string, buffer: Buffer, fallbackExtension: '.pdf' | '.docx'): string {
  const actualExtension = extname(fileName).toLowerCase()
  const extension = actualExtension === fallbackExtension ? fallbackExtension : fallbackExtension
  const folderName = fallbackExtension === '.pdf' ? 'Imported PDFs' : 'Imported Word Files'
  const importFolder = join(app.getPath('documents'), 'AI Requirement Studio', folderName)
  mkdirSync(importFolder, { recursive: true })
  const safeBase = sanitizeWordFileName(basename(fileName, extname(fileName)) || 'Imported document')
  let savedFilePath = join(importFolder, `${safeBase}${extension}`)
  let suffix = 2
  while (existsSync(savedFilePath)) {
    savedFilePath = join(importFolder, `${safeBase} (${suffix})${extension}`)
    suffix += 1
  }
  writeFileSync(savedFilePath, buffer)
  return savedFilePath
}
import { flowRepository } from '../repositories/flow.repository'
import { flowAIService } from '../flows/flow-ai.service'
import { analyzeDocumentSync } from '../documents/document-sync.service'
import { registerArchitectureHandlers } from './architecture.handlers'
import { registerPresentationHandlers } from './presentation.handlers'
import { registerVaultHandlers } from './vault.handlers'
import { registerVPSHandlers } from './vps.handlers'
import { registerClipboardHandlers } from './clipboard.handlers'
import { registerNotePopupHandlers } from './note-popup.handlers'
import { registerCodeEditorHandlers } from './code-editor.handlers'
import { registerGitHandlers } from './git.handlers'
import { registerCodeIntelHandlers } from './code-intel.handlers'
import { registerSeoAuditHandlers } from './seo-audit.handlers'
import { registerDebugHandlers } from './debug.handlers'
import { registerContextEngineHandlers } from './context-engine.handlers'
import { registerAgentHandlers } from './agent.handlers'
import { registerApiStudioHandlers } from './api-studio.handlers'
import { registerTerminalHandlers } from './terminal.handlers'
import { registerDbWorkspaceHandlers } from './db-workspace.handlers'
import { registerVectorWorkspaceHandlers } from './vector-workspace.handlers'
import { registerRagTrainingHandlers } from './rag-training.handlers'
import { registerVoiceHandlers } from './voice.handlers'
import { registerWindowHandlers } from './windows.handlers'
import { setClipboardMainWindowGetter } from '../clipboard-manager/clipboard.service'
import { broadcastToWorkbench, windowFromEvent } from '../windows/window-manager'
import type {
  AnalyzeFlowInput,
  CreateFlowDiagramInput,
  EditDocumentSectionInput,
  ExplainFlowInput,
  FlowAIActionInput,
  FlowRequirementCoverageInput,
  GenerateFlowArchitectureInput,
  GenerateFlowInput,
  ReverseFlowInput,
  UpdateFlowDiagramInput
} from '@shared/types'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'IPC')
  return { success: false, error }
}

const activeChatStreams = new Map<string, AbortController>()

const GLOBAL_ASSISTANT_SYSTEM_PROMPT = `You are ${ASSISTANT_NAME}, the ${PRODUCT_NAME} assistant — an expert software engineering copilot.
You help with coding, architecture, DevOps, debugging, research, planning, and technical writing.
When the user links a project, use its knowledge base, documents, and flows as authoritative context.
You can reference modules across the workbench: API Studio, Database Studio, Terminal, Vault, Documents, and Flows.
Be concise, practical, and actionable. Suggest concrete next steps inside the workbench when appropriate.`

async function buildChatMessages(
  conversationId: string,
  conversation: { scope: string; projectId: string | null },
  attachments?: ChatContextAttachment[],
  linkedProjectId?: string | null
) {
  const contextProjectId =
    conversation.scope === 'PROJECT' ? conversation.projectId : (linkedProjectId ?? null)

  const [settings, existingMessages] = await Promise.all([
    settingsRepository.get(),
    messageRepository.listByConversation(conversationId)
  ])

  let project = null
  if (contextProjectId) {
    project = await projectRepository.getById(contextProjectId)
  }

  const chatMessages = existingMessages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content
  }))

  if (contextProjectId) {
    if (project?.settings?.systemPrompt) {
      chatMessages.unshift({ role: 'system', content: project.settings.systemPrompt })
    } else if (project) {
      chatMessages.unshift({ role: 'system', content: buildProjectSystemPrompt(project) })
    }
  } else {
    chatMessages.unshift({
      role: 'system',
      content: GLOBAL_ASSISTANT_SYSTEM_PROMPT
    })
  }

  const model = project?.settings?.aiModel ?? settings.aiModel
  const temperature = project?.settings?.temperature ?? settings.temperature
  const maxTokens = project?.settings?.maxTokens ?? settings.maxTokens
  const lastUser = [...existingMessages].reverse().find((m) => m.role === 'user')
  const systemTokens = estimateTokens(
    chatMessages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n')
  )
  const conversationTokens = estimateTokens(
    chatMessages
      .filter((m) => m.role !== 'system')
      .map((m) => m.content)
      .join('\n')
  )

  let contextPack: ContextPackSummary | null = null
  try {
    const pack = await contextEngine.resolve({
      query: lastUser?.content ?? '',
      projectId: contextProjectId,
      attachments,
      model,
      conversationTokens,
      systemTokens
    })
    contextPack = pack.summary
    if (pack.formatted) {
      chatMessages.unshift({ role: 'system', content: pack.formatted })
    }
  } catch (error) {
    logger.warn(
      `Context engine skipped: ${error instanceof Error ? error.message : error}`,
      'Chat'
    )
  }

  return {
    chatMessages,
    model,
    temperature,
    maxTokens,
    existingMessages,
    project,
    contextProjectId,
    contextPack
  }
}

type BuiltChatContext = Awaited<ReturnType<typeof buildChatMessages>>

async function runChatStream(
  event: Electron.IpcMainInvokeEvent,
  conversationId: string,
  attachments?: ChatContextAttachment[],
  prebuilt?: BuiltChatContext,
  linkedProjectId?: string | null
): Promise<IpcResult> {
  if (event.sender.isDestroyed()) return failure('No active window')

  const conversation = await conversationRepository.getById(conversationId)
  if (!conversation) return failure('Conversation not found')

  activeChatStreams.get(conversationId)?.abort()
  const controller = new AbortController()
  activeChatStreams.set(conversationId, controller)

  try {
    const built =
      prebuilt ??
      (await buildChatMessages(conversationId, conversation, attachments, linkedProjectId))
    const { chatMessages, model, temperature, maxTokens, contextProjectId, contextPack } = built

    if (contextPack && contextPack.chunkCount > 0) {
      event.sender.send(IPC_CHANNELS.CHAT_STREAM_CHUNK, {
        conversationId,
        messageId: '',
        content: '',
        done: false,
        contextPack
      })
    }

    let fullContent = ''
    const assistantMessage = await messageRepository.create(conversationId, 'assistant', '')

    try {
      for await (const chunk of aiService.streamChat(
        chatMessages,
        model,
        temperature,
        maxTokens,
        controller.signal,
        { projectId: contextProjectId ?? undefined, feature: 'chat' }
      )) {
        fullContent += chunk
        event.sender.send(IPC_CHANNELS.CHAT_STREAM_CHUNK, {
          conversationId,
          messageId: assistantMessage.id,
          content: chunk,
          done: false
        })
      }
    } finally {
      activeChatStreams.delete(conversationId)
    }

    if (controller.signal.aborted) {
      if (fullContent.trim()) {
        await messageRepository.update(assistantMessage.id, fullContent)
      } else {
        await messageRepository.delete(assistantMessage.id)
      }
    } else {
      await messageRepository.update(assistantMessage.id, fullContent)
    }

    event.sender.send(IPC_CHANNELS.CHAT_STREAM_END, {
      conversationId,
      messageId: assistantMessage.id,
      content: '',
      done: true
    })

    return success()
  } catch (e) {
    activeChatStreams.delete(conversationId)
    const errorMsg = e instanceof Error ? e.message : 'Chat stream failed'
    event.sender.send(IPC_CHANNELS.CHAT_STREAM_ERROR, errorMsg)
    return failure(errorMsg)
  }
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  setClipboardMainWindowGetter(getMainWindow)
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
      const settings = await settingsRepository.update(data)
      return success(settings)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update settings')
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

  ipcMain.handle(IPC_CHANNELS.USAGE_SUMMARY, async (_e, projectId?: string) => {
    try {
      const summary = await usageRepository.getSummary(projectId)
      return success(summary)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load API usage')
    }
  })

  ipcMain.handle(IPC_CHANNELS.USAGE_CLEAR, async (_e, projectId?: string) => {
    try {
      await usageRepository.clear(projectId)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to clear API usage')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, async (_e, status?: string) => {
    try {
      const projects = await projectRepository.list(status)
      return success(projects)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list projects')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_GET, async (_e, id: string) => {
    try {
      const project = await projectRepository.getById(id)
      if (!project) return failure('Project not found')
      return success(project)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, async (_e, input) => {
    try {
      const project = await projectRepository.create(input)
      await bootstrapNewProject(project)
      await settingsRepository.addRecentProject(project.id)
      return success(project)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, async (_e, id: string, input) => {
    try {
      const project = await projectRepository.update(id, input)
      if (!project) return failure('Project not found')
      return success(project)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE_SETTINGS, async (_e, id: string, input) => {
    try {
      const existing = await projectRepository.getById(id)
      if (!existing) return failure('Project not found')
      const settings = await projectRepository.updateSettings(id, input)
      if (!settings) return failure('Failed to update project settings')
      return success(settings)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update project settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, async (_e, id: string) => {
    try {
      const deleted = await projectRepository.delete(id)
      if (!deleted) return failure('Project not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_DUPLICATE, async (_e, id: string) => {
    try {
      const project = await projectRepository.duplicate(id)
      if (!project) return failure('Project not found')
      return success(project)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to duplicate project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_ARCHIVE, async (_e, id: string) => {
    try {
      const project = await projectRepository.update(id, { status: 'archived' })
      if (!project) return failure('Project not found')
      return success(project)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to archive project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN, async (_e, id: string) => {
    try {
      const project = await projectRepository.open(id)
      if (!project) return failure('Project not found')
      await settingsRepository.addRecentProject(id)
      return success(project)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to open project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_RECENT, async () => {
    try {
      const recentIds = await settingsRepository.getRecentProjectIds()
      const projects = await Promise.all(recentIds.map((id) => projectRepository.getById(id)))
      return success(
        projects
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .map(({ settings: _, ...p }) => p)
      )
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get recent projects')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST, async (_e, projectId: string) => {
    try {
      const conversations = await conversationRepository.listByProject(projectId)
      return success(conversations)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list conversations')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST_GLOBAL, async () => {
    try {
      return success(await conversationRepository.listGlobal())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list global conversations')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_CREATE_GLOBAL, async (_e, title?: string) => {
    try {
      return success(await conversationRepository.createGlobal(title))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create global conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET, async (_e, id: string) => {
    try {
      const conversation = await conversationRepository.getById(id)
      if (!conversation) return failure('Conversation not found')
      return success(conversation)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get conversation')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_CREATE,
    async (_e, projectId: string, title?: string) => {
      try {
        const conversation = await conversationRepository.create(projectId, title)
        return success(conversation)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to create conversation')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_UPDATE, async (_e, id: string, data) => {
    try {
      const conversation = await conversationRepository.update(id, data)
      if (!conversation) return failure('Conversation not found')
      return success(conversation)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, async (_e, id: string) => {
    try {
      const deleted = await conversationRepository.delete(id)
      if (!deleted) return failure('Conversation not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DUPLICATE, async (_e, id: string) => {
    try {
      const conversation = await conversationRepository.duplicate(id)
      if (!conversation) return failure('Conversation not found')
      return success(conversation)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to duplicate conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_SEARCH, async (_e, projectId: string, query: string) => {
    try {
      const conversations = await conversationRepository.search(projectId, query)
      return success(conversations)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to search conversations')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MESSAGE_LIST, async (_e, conversationId: string) => {
    try {
      const messages = await messageRepository.listByConversation(conversationId)
      return success(messages)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list messages')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.MESSAGE_CREATE,
    async (_e, conversationId: string, role: string, content: string) => {
      try {
        const message = await messageRepository.create(
          conversationId,
          role as 'user' | 'assistant' | 'system',
          content
        )
        return success(message)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to create message')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MESSAGE_UPDATE, async (_e, id: string, content: string) => {
    try {
      const message = await messageRepository.update(id, content)
      if (!message) return failure('Message not found')
      return success(message)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update message')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MESSAGE_DELETE, async (_e, id: string) => {
    try {
      const ok = await messageRepository.delete(id)
      if (!ok) return failure('Message not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete message')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_CLEAR_MESSAGES, async (_e, conversationId: string) => {
    try {
      await messageRepository.clearConversation(conversationId)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to clear conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_STREAM_ABORT, async (_e, conversationId: string) => {
    activeChatStreams.get(conversationId)?.abort()
    return success()
  })

  ipcMain.handle(
    IPC_CHANNELS.CHAT_STREAM,
    async (
      event,
      conversationId: string,
      content: string,
      options?:
        | ChatContextAttachment[]
        | { context?: ChatContextAttachment[]; linkedProjectId?: string | null }
    ) => {
      if (event.sender.isDestroyed()) return failure('No active window')

      const streamOptions = Array.isArray(options) ? { context: options } : (options ?? {})
      const attachments = streamOptions.context
      const linkedProjectId = streamOptions.linkedProjectId

      try {
        const conversation = await conversationRepository.getById(conversationId)
        if (!conversation) return failure('Conversation not found')

        await messageRepository.create(conversationId, 'user', content)

        const built = await buildChatMessages(
          conversationId,
          conversation,
          attachments,
          linkedProjectId
        )
        const userMessageCount = built.existingMessages.filter((m) => m.role === 'user').length
        if (userMessageCount === 1) {
          aiService.generateConversationTitle(content).then((title) => {
            conversationRepository.update(conversationId, { title })
            broadcastToWorkbench(IPC_CHANNELS.CONVERSATION_UPDATE, { id: conversationId, title })
          })
        }

        const result = await runChatStream(
          event,
          conversationId,
          attachments,
          built,
          linkedProjectId
        )

        if (result.success && conversation.projectId) {
          await searchRepository.index(
            'conversation',
            conversationId,
            conversation.projectId,
            conversation.title,
            content
          )
        }

        return result
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Chat stream failed'
        event.sender.send(IPC_CHANNELS.CHAT_STREAM_ERROR, errorMsg)
        return failure(errorMsg)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CHAT_REGENERATE, async (event, conversationId: string) => {
    try {
      const conversation = await conversationRepository.getById(conversationId)
      if (!conversation) return failure('Conversation not found')

      const messages = await messageRepository.listByConversation(conversationId)
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
      if (!lastAssistant) return failure('No assistant message to regenerate')

      await messageRepository.delete(lastAssistant.id)
      return runChatStream(event, conversationId)
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Regenerate failed'
      event.sender.send(IPC_CHANNELS.CHAT_STREAM_ERROR, errorMsg)
      return failure(errorMsg)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.CHAT_EDIT_MESSAGE,
    async (event, conversationId: string, messageId: string, newContent: string) => {
      try {
        const conversation = await conversationRepository.getById(conversationId)
        if (!conversation) return failure('Conversation not found')

        const messages = await messageRepository.listByConversation(conversationId)
        const target = messages.find((m) => m.id === messageId)
        if (!target || target.role !== 'user') return failure('User message not found')

        await messageRepository.deleteFrom(conversationId, messageId, false)
        await messageRepository.update(messageId, newContent.trim())

        return runChatStream(event, conversationId)
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Edit message failed'
        event.sender.send(IPC_CHANNELS.CHAT_STREAM_ERROR, errorMsg)
        return failure(errorMsg)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CHAT_GENERATE_REQUIREMENT, async (_e, input) => {
    try {
      acquireGenerateLock(input.projectId)
      const project = await projectRepository.getById(input.projectId)
      const settings = await settingsRepository.get()
      const model = project?.settings?.aiModel ?? settings.aiModel
      const temperature = project?.settings?.temperature ?? settings.temperature
      const maxTokens =
        input.maxTokens ?? project?.settings?.maxTokens ?? settings.maxTokens
      const projectContext = project
        ? `Project: ${project.name}\nDescription: ${project.description}`
        : undefined

      const knowledgeText = input.knowledgeAlreadyInPrompt
        ? ''
        : await resolveProjectKnowledgeText(input.projectId, {
            mode: 'brief',
            query: [input.type, input.title, 'generate requirement document specification']
              .filter(Boolean)
              .join(' ')
          })
      const generationRules = combineGenerationRules(
        settings.documentGenerationRules,
        project?.settings?.documentGenerationRules
      )
      const generatedContent = await aiService.generateRequirement(
        { ...input, maxTokens },
        projectContext,
        knowledgeText,
        { model, temperature, generationRules }
      )

      let htmlContent = generatedContent
      if (input.type === 'system_design') {
        htmlContent = ensureSddFlowSlotsHtml(generatedContent)
      }

      const fallbackTitle = `${input.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} - ${new Date().toLocaleDateString()}`
      let doc = await documentRepository.create({
        projectId: input.projectId,
        title: input.title?.trim() || fallbackTitle,
        type: input.type,
        style: input.style,
        content: htmlContent,
        htmlContent
      })

      await searchRepository.index('document', doc.id, input.projectId, doc.title, htmlContent)

      try {
        const wordPath = await saveDocumentWordCopy(doc)
        if (wordPath) doc = { ...doc, exportedFilePath: wordPath }
      } catch (wordError) {
        logger.error(
          wordError instanceof Error ? wordError.message : 'Word save failed',
          'Export'
        )
      }

      return success(doc)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to generate requirement')
    } finally {
      releaseGenerateLock(input.projectId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_EDIT_DOCUMENT, async (_e, input) => {
    try {
      const knowledgeText = input.projectId
        ? await resolveProjectKnowledgeText(input.projectId, {
            mode: 'auto',
            query: [input.instruction, input.title, 'edit document'].filter(Boolean).join(' ')
          })
        : null
      const generationRules = await resolveDocumentGenerationRules(input.projectId)
      const editedHtml = await aiService.editDocument(
        input,
        knowledgeText ?? undefined,
        generationRules
      )
      return success(editedHtml)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to edit document with AI')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_EDIT_SELECTION, async (_e, input) => {
    try {
      const edited = await aiService.editSelection(input)
      return success(edited)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to edit selection with AI')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_EDIT_SECTION, async (_e, input: EditDocumentSectionInput) => {
    try {
      const knowledgeText = input.projectId
        ? await resolveProjectKnowledgeText(input.projectId, {
            mode: 'auto',
            query: [input.instruction, input.sectionTitle, 'edit section'].filter(Boolean).join(' ')
          })
        : null
      const generationRules = await resolveDocumentGenerationRules(input.projectId)
      const result = await aiService.editSection(
        input,
        knowledgeText ?? undefined,
        generationRules
      )
      return success(result)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to edit section with AI')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_LIST, async (_e, projectId: string) => {
    try {
      const documents = await documentRepository.listByProject(projectId)
      return success(documents)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list documents')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_LIST_ALL, async () => {
    try {
      const documents = await documentRepository.listAll()
      return success(documents)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list documents')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_GET, async (_e, id: string) => {
    try {
      const document = await documentRepository.getById(id)
      if (!document) return failure('Document not found')
      return success(document)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get document')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_CREATE, async (_e, input) => {
    try {
      let document = await documentRepository.create(input)
      await searchRepository.index(
        'document',
        document.id,
        input.projectId,
        document.title,
        document.htmlContent || document.content
      )
      try {
        const wordPath = await saveDocumentWordCopy(document)
        if (wordPath) document = { ...document, exportedFilePath: wordPath }
      } catch (wordError) {
        logger.error(
          wordError instanceof Error ? wordError.message : 'Word save failed',
          'Export'
        )
      }
      return success(document)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create document')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_UPDATE, async (_e, id: string, input) => {
    try {
      const document = await documentRepository.update(id, input)
      if (!document) return failure('Document not found')
      if (input.content !== undefined || input.htmlContent !== undefined || input.title !== undefined) {
        await searchRepository.index(
          'document',
          id,
          document.projectId,
          document.title,
          input.htmlContent ?? input.content ?? document.htmlContent ?? document.content
        )
      }
      return success(document)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update document')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_DELETE, async (_e, id: string) => {
    try {
      const deleted = await documentRepository.delete(id)
      if (!deleted) return failure('Document not found')
      await searchRepository.remove('document', id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete document')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_DUPLICATE, async (_e, id: string) => {
    try {
      const document = await documentRepository.duplicate(id)
      if (!document) return failure('Document not found')
      await searchRepository.index(
        'document',
        document.id,
        document.projectId,
        document.title,
        document.htmlContent || document.content
      )
      return success(document)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to duplicate document')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_VERSIONS, async (_e, documentId: string) => {
    try {
      const versions = await documentRepository.getVersions(documentId)
      return success(versions)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get document versions')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_RESTORE_VERSION,
    async (_e, documentId: string, versionId: string) => {
      try {
        const document = await documentRepository.restoreVersion(documentId, versionId)
        if (!document) return failure('Version not found')
      await searchRepository.index(
        'document',
        document.id,
        document.projectId,
        document.title,
        document.htmlContent || document.content
      )
      return success(document)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to restore version')
    }
  }
)

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_SAVE_VERSION,
    async (_e, documentId: string, label: string) => {
      try {
        const version = await documentRepository.saveNamedVersion(documentId, label)
        if (!version) return failure('Document not found')
        return success(version)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to save version')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_MARK_REVIEWED, async (_e, documentId: string) => {
    try {
      const document = await documentRepository.markReviewed(documentId)
      if (!document) return failure('Document not found')
      return success(document)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to mark document reviewed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_SYNC_SUGGESTIONS, async (_e, projectId: string) => {
    try {
      const suggestions = await analyzeDocumentSync(projectId)
      return success(suggestions)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to analyze document sync')
    }
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_GLOBAL, async (_e, projectId: string, query: string) => {
    try {
      const results = await searchRepository.search(projectId, query)
      return success(results)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Search failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_REINDEX, async (_e, projectId: string) => {
    try {
      await searchRepository.reindexProject(projectId)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Reindex failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_SELECT_PATH, async (event, format: 'docx' | 'pdf') => {
    const win = windowFromEvent(event) ?? getMainWindow()
    if (!win) return failure('No active window')

    const result = await dialog.showSaveDialog(win, {
      title: 'Export Document',
      defaultPath: `document.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    })

    if (result.canceled || !result.filePath) return failure('Export cancelled')
    return success(result.filePath)
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_SELECT_FOLDER, async (event) => {
    const win = windowFromEvent(event) ?? getMainWindow()
    if (!win) return failure('No active window')

    const result = await dialog.showOpenDialog(win, {
      title: 'Choose folder for Word documents',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return failure('Folder selection cancelled')
    return success(result.filePaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_REVEAL_PATH, async (_e, filePath: string) => {
    if (!filePath?.trim()) return failure('No path to open')
    try {
      if (statSync(filePath).isDirectory()) {
        const error = await shell.openPath(filePath)
        if (error) return failure(error)
        return success()
      }
    } catch {
      /* file may not exist yet; still try to reveal */
    }
    shell.showItemInFolder(filePath)
    return success()
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_OPEN_PATH, async (_e, filePath: string) => {
    if (!filePath?.trim()) return failure('No path to open')
    try {
      const error = await shell.openPath(filePath)
      if (error) return failure(error)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Could not open file')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_PARSE_WORD, async (_e, input: { fileName: string; bytes: Uint8Array | number[] }) => {
    try {
      const bytes = input.bytes instanceof Uint8Array ? input.bytes : Uint8Array.from(input.bytes)
      const buffer = Buffer.from(bytes)
      const parsed = parseDocxBuffer(buffer, input.fileName)
      const savedFilePath = saveImportedSourceFile(input.fileName, buffer, '.docx')
      return success({ ...parsed, savedFilePath })
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Could not read Word file')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_PARSE_PDF, async (_e, input: { fileName: string; bytes: Uint8Array | number[] }) => {
    try {
      const bytes = input.bytes instanceof Uint8Array ? input.bytes : Uint8Array.from(input.bytes)
      const buffer = Buffer.from(bytes)
      const parsed = await parsePdfBuffer(buffer, input.fileName)

      // Keep the original PDF in a predictable, user-accessible system folder.
      // Never overwrite an existing import with the same name.
      const savedFilePath = saveImportedSourceFile(input.fileName, buffer, '.pdf')

      return success({ ...parsed, savedFilePath })
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Could not read PDF file')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_SAVE_WORD,
    async (_e, input: { documentId: string; folderPath?: string }) => {
      try {
        const filePath = await saveDocumentWordById(input.documentId, input.folderPath)
        return success({ filePath })
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Could not save Word file')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.EXPORT_DOCUMENT, async (event, options) => {
    try {
      const document = await documentRepository.getById(options.documentId)
      if (!document) return failure('Document not found')

      const projectData = await projectRepository.getById(document.projectId)
      if (!projectData) return failure('Project not found')

      let outputPath = typeof options.filePath === 'string' ? options.filePath.trim() : ''
      if (!outputPath && typeof options.folderPath === 'string' && options.folderPath.trim()) {
        mkdirSync(options.folderPath.trim(), { recursive: true })
        outputPath = join(
          options.folderPath.trim(),
          options.format === 'docx'
            ? wordFileNameForDocument(document.title, document.id)
            : `${sanitizeWordFileName(document.title)}.${options.format}`
        )
      }

      if (!outputPath) {
        const win = windowFromEvent(event) ?? getMainWindow()
        if (!win) return failure('No active window')

        const pathResult = await dialog.showSaveDialog(win, {
          title: 'Export Document',
          defaultPath: `${document.title}.${options.format}`,
          filters: [{ name: options.format.toUpperCase(), extensions: [options.format] }]
        })

        if (pathResult.canceled || !pathResult.filePath) {
          return success({ success: false, error: 'Export cancelled' })
        }
        outputPath = pathResult.filePath
      }

      await exportService.export({ document, project: projectData, options }, outputPath)

      if (options.format === 'docx') {
        await documentRepository.update(document.id, { exportedFilePath: outputPath })
      }

      return success({ success: true, filePath: outputPath })
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Export failed')
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

  // Knowledge Base handlers
  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_LOAD, async (_e, projectId: string) => {
    try {
      const bundle = await knowledgeRepository.loadBundle(projectId)
      if (!bundle.overview) {
        bundle.overview = await knowledgeRepository.getOrCreateOverview(projectId)
      }
      return success(bundle)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load knowledge')
    }
  })

  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_STATS, async (_e, projectId: string) => {
    try {
      return success(await knowledgeRepository.getStats(projectId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get knowledge stats')
    }
  })

  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_CONTEXT, async (_e, projectId: string) => {
    try {
      return success(await buildKnowledgeContext(projectId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to build knowledge context')
    }
  })

  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_SEARCH, async (_e, projectId: string, query: string) => {
    try {
      return success(await knowledgeRepository.search(projectId, query))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Knowledge search failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_SUGGESTIONS, async (_e, projectId: string) => {
    try {
      return success(await analyzeKnowledgeSuggestions(projectId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get suggestions')
    }
  })

  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_EXTRACT, async (_e, input) => {
    try {
      const result = await extractKnowledgeFromText(input)
      await syncKnowledgeToSearch(input.projectId, searchRepository.index.bind(searchRepository))
      return success(result)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Knowledge extraction failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_UPDATE_OVERVIEW, async (_e, projectId: string, data) => {
    try {
      return success(await knowledgeRepository.updateOverview(projectId, data))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update overview')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE_CREATE_ITEM,
    async (_e, entityType: string, projectId: string, data) => {
      try {
        const creators: Record<string, (pid: string, d: unknown) => Promise<unknown>> = {
          stakeholder: (pid, d) => knowledgeRepository.createStakeholder(pid, d as never),
          module: (pid, d) => knowledgeRepository.createModule(pid, d as never),
          feature: (pid, d) => knowledgeRepository.createFeature(pid, d as never),
          requirement: (pid, d) => knowledgeRepository.createRequirement(pid, d as never),
          role: (pid, d) => knowledgeRepository.createRole(pid, d as never),
          businessRule: (pid, d) => knowledgeRepository.createBusinessRule(pid, d as never),
          workflow: (pid, d) => knowledgeRepository.createWorkflow(pid, d as never),
          entity: (pid, d) => knowledgeRepository.createEntity(pid, d as never),
          apiEndpoint: (pid, d) => knowledgeRepository.createAPIEndpoint(pid, d as never),
          integration: (pid, d) => knowledgeRepository.createIntegration(pid, d as never),
          report: (pid, d) => knowledgeRepository.createReport(pid, d as never),
          risk: (pid, d) => knowledgeRepository.createRisk(pid, d as never),
          assumption: (pid, d) => knowledgeRepository.createAssumption(pid, d as never),
          decision: (pid, d) => knowledgeRepository.createDecision(pid, d as never)
        }
        const create = creators[entityType]
        if (!create) return failure(`Unknown entity type: ${entityType}`)
        const item = await create(projectId, data)
        return success(item)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to create item')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE_UPDATE_ITEM,
    async (_e, entityType: string, id: string, data) => {
      try {
        const updaters: Record<string, (id: string, d: unknown) => Promise<unknown>> = {
          stakeholder: (i, d) => knowledgeRepository.updateStakeholder(i, d as never),
          module: (i, d) => knowledgeRepository.updateModule(i, d as never),
          feature: (i, d) => knowledgeRepository.updateFeature(i, d as never),
          requirement: (i, d) => knowledgeRepository.updateRequirement(i, d as never),
          role: (i, d) => knowledgeRepository.updateRole(i, d as never),
          businessRule: (i, d) => knowledgeRepository.updateBusinessRule(i, d as never),
          workflow: (i, d) => knowledgeRepository.updateWorkflow(i, d as never),
          entity: (i, d) => knowledgeRepository.updateEntity(i, d as never),
          apiEndpoint: (i, d) => knowledgeRepository.updateAPIEndpoint(i, d as never),
          integration: (i, d) => knowledgeRepository.updateIntegration(i, d as never),
          report: (i, d) => knowledgeRepository.updateReport(i, d as never),
          risk: (i, d) => knowledgeRepository.updateRisk(i, d as never),
          assumption: (i, d) => knowledgeRepository.updateAssumption(i, d as never),
          decision: (i, d) => knowledgeRepository.updateDecision(i, d as never),
          overview: async (projectId, d) =>
            knowledgeRepository.updateOverview(projectId, d as never)
        }
        const update = updaters[entityType]
        if (!update) return failure(`Unknown entity type: ${entityType}`)
        const item = await update(id, data)
        if (!item) return failure('Item not found')
        return success(item)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to update item')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_DELETE_ITEM, async (_e, entityType: string, id: string) => {
    try {
      const deleters: Record<string, (id: string) => Promise<boolean>> = {
        stakeholder: (i) => knowledgeRepository.deleteStakeholder(i),
        module: (i) => knowledgeRepository.deleteModule(i),
        feature: (i) => knowledgeRepository.deleteFeature(i),
        requirement: (i) => knowledgeRepository.deleteRequirement(i),
        role: (i) => knowledgeRepository.deleteRole(i),
        businessRule: (i) => knowledgeRepository.deleteBusinessRule(i),
        workflow: (i) => knowledgeRepository.deleteWorkflow(i),
        entity: (i) => knowledgeRepository.deleteEntity(i),
        apiEndpoint: (i) => knowledgeRepository.deleteAPIEndpoint(i),
        integration: (i) => knowledgeRepository.deleteIntegration(i),
        report: (i) => knowledgeRepository.deleteReport(i),
        risk: (i) => knowledgeRepository.deleteRisk(i),
        assumption: (i) => knowledgeRepository.deleteAssumption(i),
        decision: (i) => knowledgeRepository.deleteDecision(i)
      }
      const del = deleters[entityType]
      if (!del) return failure(`Unknown entity type: ${entityType}`)
      const ok = await del(id)
      if (!ok) return failure('Item not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete item')
    }
  })

  ipcMain.handle(IPC_CHANNELS.KNOWLEDGE_SYNC_SEARCH, async (_e, projectId: string) => {
    try {
      await syncKnowledgeToSearch(projectId, searchRepository.index.bind(searchRepository))
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to sync search index')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE_SEED_SAMPLE,
    async (_e, projectId: string, force?: boolean) => {
      try {
        const result = await seedSampleKnowledge(projectId, force ?? false)
        return success(result)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to seed sample data')
      }
    }
  )

  // Flow Designer
  ipcMain.handle(IPC_CHANNELS.FLOW_LIST, async (_e, projectId: string) => {
    try {
      const flows = await flowRepository.listByProject(projectId)
      return success(flows)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list flows')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FLOW_GET, async (_e, id: string) => {
    try {
      const flow = await flowRepository.getById(id)
      if (!flow) return failure('Flow not found')
      return success(flow)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get flow')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FLOW_CREATE, async (_e, input: CreateFlowDiagramInput) => {
    try {
      const flow = await flowRepository.create(input)
      return success(flow)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create flow')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.FLOW_UPDATE,
    async (_e, id: string, input: UpdateFlowDiagramInput) => {
      try {
        const flow = await flowRepository.update(id, input)
        if (!flow) return failure('Flow not found')
        return success(flow)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to update flow')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.FLOW_DELETE, async (_e, id: string) => {
    try {
      const ok = await flowRepository.delete(id)
      if (!ok) return failure('Flow not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete flow')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FLOW_DUPLICATE, async (_e, id: string) => {
    try {
      const flow = await flowRepository.duplicate(id)
      if (!flow) return failure('Flow not found')
      return success(flow)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to duplicate flow')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FLOW_GENERATE, async (_e, input: GenerateFlowInput) => {
    try {
      const result = await flowAIService.generateFlow(input)
      return success(result)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to generate flow')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FLOW_REVERSE, async (_e, input: ReverseFlowInput) => {
    try {
      const flow = await flowRepository.getById(input.flowId)
      if (!flow) return failure('Flow not found')
      const html = await flowAIService.reverseEngineer(input, flow.nodes, flow.edges)
      return success(html)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to reverse engineer flow')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FLOW_AI_ACTION, async (_e, input: FlowAIActionInput) => {
    try {
      const result = await flowAIService.runAction(input)
      return success(result)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to run AI action')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FLOW_ANALYZE, async (_e, input: AnalyzeFlowInput) => {
    try {
      const result = flowAIService.analyze(input)
      return success(result)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to analyze flow')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FLOW_EXPLAIN, async (_e, input: ExplainFlowInput) => {
    try {
      const result = flowAIService.explain(input)
      return success(result)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to explain flow')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.FLOW_ARCHITECTURE,
    async (_e, input: GenerateFlowArchitectureInput) => {
      try {
        const result = flowAIService.generateArchitecture(input)
        return success(result)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to generate architecture')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FLOW_REQUIREMENT_COVERAGE,
    async (_e, input: FlowRequirementCoverageInput) => {
      try {
        const result = await flowAIService.requirementCoverage(input)
        return success(result)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to check requirement coverage')
      }
    }
  )

  registerArchitectureHandlers()
  registerPresentationHandlers()
  registerVaultHandlers()
  registerVPSHandlers(getMainWindow)
  registerClipboardHandlers()
  registerNotePopupHandlers()
  registerCodeEditorHandlers(getMainWindow)
  registerGitHandlers()
  registerCodeIntelHandlers()
  registerSeoAuditHandlers()
  registerDebugHandlers()
  registerContextEngineHandlers()
  registerAgentHandlers()
  registerApiStudioHandlers(getMainWindow)
  registerTerminalHandlers(getMainWindow)
  registerDbWorkspaceHandlers()
  registerVectorWorkspaceHandlers()
  registerRagTrainingHandlers()
  registerVoiceHandlers(getMainWindow)
  registerWindowHandlers()
}
