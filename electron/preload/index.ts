import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { ElectronAPI } from '@shared/ipc/api'
import type { ChatStreamChunk, ChatContextAttachment } from '@shared/types'
import type {
  CreateEntryInput,
  EditorAiChunk,
  EditorAiRequest,
  EditorContextSnapshot,
  ReadDirectoryOptions,
  RenameEntryInput
} from '@shared/types/code-editor'
import type {
  TerminalDataEvent,
  TerminalExecRequest,
  TerminalExitEvent
} from '@shared/types/terminal'
import type {
  DescribeApiRequestInput,
  EnhanceApiRequestInput,
  ExplainApiResponseInput,
  FixApiRequestInput,
  GenerateApiRequestInput,
  GenerateApiTestsInput,
  GenerateCollectionDocumentInput,
  ResolvedHttpRequest,
  RunApiTestsInput
} from '@shared/types/api-studio'

function bindChatStreamListeners(
  onChunk: (chunk: ChatStreamChunk) => void,
  onEnd: () => void,
  onError: (error: string) => void
): () => void {
  const chunkHandler = (_: Electron.IpcRendererEvent, chunk: ChatStreamChunk): void => {
    onChunk(chunk)
  }
  const endHandler = (): void => {
    cleanup()
    onEnd()
  }
  const errorHandler = (_: Electron.IpcRendererEvent, error: string): void => {
    cleanup()
    onError(error)
  }

  const cleanup = (): void => {
    ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_CHUNK, chunkHandler)
    ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_END, endHandler)
    ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_ERROR, errorHandler)
  }

  ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_CHUNK, chunkHandler)
  ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_END, endHandler)
  ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_ERROR, errorHandler)

  return cleanup
}

const api: ElectronAPI = {
  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
    getPath: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PATH, name),
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
    getPathForFile: (file: File) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
    onNavigate: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, path: string) => callback(path)
      ipcRenderer.on(IPC_CHANNELS.APP_NAVIGATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_NAVIGATE, handler)
    }
  },
  onboarding: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_GET),
    complete: (termsVersion?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_COMPLETE, termsVersion)
  },
  windows: {
    create: (path) => ipcRenderer.invoke(IPC_CHANNELS.APP_WINDOW_CREATE, path),
    openPath: (path) => ipcRenderer.invoke(IPC_CHANNELS.APP_WINDOW_OPEN_PATH, path),
    openModule: (path) => ipcRenderer.invoke(IPC_CHANNELS.APP_WINDOW_OPEN_MODULE, path),
    openInWorkbench: (path) => ipcRenderer.invoke(IPC_CHANNELS.APP_WINDOW_OPEN_WORKBENCH, path),
    openProject: (projectId, segment) =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_WINDOW_OPEN_PROJECT, projectId, segment),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.APP_WINDOW_CLOSE),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.APP_WINDOW_LIST),
    focus: (id) => ipcRenderer.invoke(IPC_CHANNELS.APP_WINDOW_FOCUS, id),
    onChrome: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        state: { fullscreen: boolean; maximized: boolean }
      ) => callback(state)
      ipcRenderer.on(IPC_CHANNELS.APP_WINDOW_CHROME, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_WINDOW_CHROME, handler)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (data) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, data)
  },
  apiKey: {
    set: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_SET, key),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_GET_STATUS),
    delete: () => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_DELETE),
    setFor: (providerId, key) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_SET_FOR, providerId, key),
    getStatusFor: (providerId) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEY_GET_STATUS_FOR, providerId),
    deleteFor: (providerId) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_DELETE_FOR, providerId),
    listStatuses: () => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_LIST_STATUSES)
  },
  ai: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_CONFIG),
    setConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.AI_SET_CONFIG, patch),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AI_STATUS),
    testConnection: (providerId) => ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_CONNECTION, providerId),
    listModels: (providerId) => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_MODELS, providerId),
    getMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.AI_METRICS)
  },
  usage: {
    getSummary: (projectId?: string) => ipcRenderer.invoke(IPC_CHANNELS.USAGE_SUMMARY, projectId),
    clear: (projectId?: string) => ipcRenderer.invoke(IPC_CHANNELS.USAGE_CLEAR, projectId)
  },
  projects: {
    list: (status?: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST, status),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, id, input),
    updateSettings: (id, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE_SETTINGS, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, id),
    duplicate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DUPLICATE, id),
    archive: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_ARCHIVE, id),
    open: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN, id),
    recent: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_RECENT)
  },
  conversations: {
    list: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LIST, projectId),
    listGlobal: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LIST_GLOBAL),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_GET, id),
    create: (projectId, title) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CREATE, projectId, title),
    createGlobal: (title?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CREATE_GLOBAL, title),
    update: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_UPDATE, id, data),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, id),
    duplicate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DUPLICATE, id),
    search: (projectId, query) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_SEARCH, projectId, query),
    clearMessages: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CLEAR_MESSAGES, conversationId)
  },
  messages: {
    list: (conversationId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_LIST, conversationId),
    create: (conversationId, role, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_CREATE, conversationId, role, content),
    update: (id: string, content: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_UPDATE, id, content),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_DELETE, id)
  },
  chat: {
    stream: (conversationId, content, onChunk, onEnd, onError, options) => {
      const cleanup = bindChatStreamListeners(onChunk, onEnd, onError)
      void ipcRenderer.invoke(IPC_CHANNELS.CHAT_STREAM, conversationId, content, options)
      return cleanup
    },
    regenerate: (conversationId, onChunk, onEnd, onError) => {
      const cleanup = bindChatStreamListeners(onChunk, onEnd, onError)
      void ipcRenderer.invoke(IPC_CHANNELS.CHAT_REGENERATE, conversationId)
      return cleanup
    },
    editMessage: (conversationId, messageId, newContent, onChunk, onEnd, onError) => {
      const cleanup = bindChatStreamListeners(onChunk, onEnd, onError)
      void ipcRenderer.invoke(IPC_CHANNELS.CHAT_EDIT_MESSAGE, conversationId, messageId, newContent)
      return cleanup
    },
    abort: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_STREAM_ABORT, conversationId),
    generateRequirement: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_GENERATE_REQUIREMENT, input),
    editDocument: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_EDIT_DOCUMENT, input),
    editSelection: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_EDIT_SELECTION, input),
    editSection: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_EDIT_SECTION, input)
  },
  contextEngine: {
    resolve: (input) => ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_RESOLVE, input)
  },
  agent: {
    run: (request) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_RUN, request),
    cancel: (runId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_CANCEL, runId),
    pause: (runId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_PAUSE, runId),
    resume: (runId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_RESUME, runId),
    confirm: (requestId, approved) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_CONFIRM, requestId, approved),
    revertLast: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_REVERT),
    revertPatch: (id) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_REVERT_ID, id),
    acceptPatch: (id) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_ACCEPT_PATCH, id),
    acceptHunk: (id, hunkIndex) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_ACCEPT_HUNK, id, hunkIndex),
    rejectHunk: (id, hunkIndex) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_REJECT_HUNK, id, hunkIndex),
    acceptAllPatches: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_ACCEPT_ALL),
    restoreCheckpoint: (runId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_RESTORE_CHECKPOINT, runId),
    listPatches: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_PATCHES),
    listTasks: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_TASKS),
    recallMemory: (query) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY, query),
    mcpStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_MCP_STATUS),
    onEvent: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        event: import('@shared/types/agent').AgentEvent
      ) => callback(event)
      ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, handler)
    }
  },
  events: {
    onConversationUpdate: (callback: (data: { id: string; title: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { id: string; title: string }) =>
        callback(data)
      ipcRenderer.on(IPC_CHANNELS.CONVERSATION_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_UPDATE, handler)
    }
  },
  documents: {
    list: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_LIST, projectId),
    listAll: () => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_LIST_ALL),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_CREATE, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_DELETE, id),
    duplicate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_DUPLICATE, id),
    getVersions: (documentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_VERSIONS, documentId),
    restoreVersion: (documentId, versionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_RESTORE_VERSION, documentId, versionId),
    saveVersion: (documentId, label) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_SAVE_VERSION, documentId, label),
    markReviewed: (documentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_MARK_REVIEWED, documentId),
    getSyncSuggestions: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_SYNC_SUGGESTIONS, projectId),
    parseWord: (input) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_PARSE_WORD, input),
    parsePdf: (input) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_PARSE_PDF, input),
    saveWord: (input) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_SAVE_WORD, input)
  },
  search: {
    global: (projectId, query) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_GLOBAL, projectId, query),
    reindex: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_REINDEX, projectId)
  },
  export: {
    document: (options) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_DOCUMENT, options),
    selectPath: (format) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SELECT_PATH, format),
    selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SELECT_FOLDER),
    revealPath: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_REVEAL_PATH, filePath),
    openPath: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_OPEN_PATH, filePath)
  },
  knowledge: {
    load: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_LOAD, projectId),
    getStats: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_STATS, projectId),
    getContext: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_CONTEXT, projectId),
    search: (projectId, query) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_SEARCH, projectId, query),
    getSuggestions: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_SUGGESTIONS, projectId),
    extract: (input) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_EXTRACT, input),
    updateOverview: (projectId, data) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_UPDATE_OVERVIEW, projectId, data),
    createItem: (entityType, projectId, data) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_CREATE_ITEM, entityType, projectId, data),
    updateItem: (entityType, id, data) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_UPDATE_ITEM, entityType, id, data),
    deleteItem: (entityType, id) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_DELETE_ITEM, entityType, id),
    syncSearch: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_SYNC_SEARCH, projectId),
    seedSample: (projectId: string, force?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_SEED_SAMPLE, projectId, force)
  },
  flows: {
    list: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_LIST, projectId),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_CREATE, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_DELETE, id),
    duplicate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_DUPLICATE, id),
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_GENERATE, input),
    reverse: (input) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_REVERSE, input),
    aiAction: (input) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_AI_ACTION, input),
    analyze: (input) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_ANALYZE, input),
    explain: (input) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_EXPLAIN, input),
    architecture: (input) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_ARCHITECTURE, input),
    requirementCoverage: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.FLOW_REQUIREMENT_COVERAGE, input)
  },
  architectures: {
    list: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.ARCHITECTURE_LIST, projectId),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ARCHITECTURE_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.ARCHITECTURE_CREATE, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.ARCHITECTURE_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ARCHITECTURE_DELETE, id),
    duplicate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ARCHITECTURE_DUPLICATE, id),
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.ARCHITECTURE_GENERATE, input),
    assist: (input) => ipcRenderer.invoke(IPC_CHANNELS.ARCHITECTURE_ASSIST, input)
  },
  presentations: {
    list: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_LIST, projectId),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_CREATE, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_DELETE, id),
    duplicate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_DUPLICATE, id),
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_GENERATE, input),
    assist: (input) => ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_ASSIST, input),
    exportPdf: (presentationId: string, outputPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_EXPORT_PDF, presentationId, outputPath),
    exportPptx: (presentationId: string, outputPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_EXPORT_PPTX, presentationId, outputPath),
    importAsset: (presentationId: string, name: string, dataUrl: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESENTATION_IMPORT_ASSET, presentationId, name, dataUrl)
  },
  log: {
    write: (entry) => ipcRenderer.invoke(IPC_CHANNELS.LOG_WRITE, entry),
    getRecent: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.LOG_GET_RECENT, limit)
  },
  bugReports: {
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.BUG_REPORT_CREATE, input),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.BUG_REPORT_LIST)
  },
  vault: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_STATUS),
    setup: (input) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_SETUP, input),
    unlock: (input) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_UNLOCK, input),
    lock: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_LOCK),
    updateSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_UPDATE_SETTINGS, settings),
    changeMasterPassword: (current, next) =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_CHANGE_MASTER_PASSWORD, current, next),
    listFolders: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_LIST_FOLDERS),
    createFolder: (input) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_CREATE_FOLDER, input),
    updateFolder: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_UPDATE_FOLDER, id, input),
    deleteFolder: (id) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_DELETE_FOLDER, id),
    reorderFolders: (orderedIds) =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_REORDER_FOLDERS, orderedIds),
    listTags: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_LIST_TAGS),
    listItems: (filter) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_LIST_ITEMS, filter),
    getItem: (id, includeSecrets) =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_GET_ITEM, id, includeSecrets),
    createItem: (input) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_CREATE_ITEM, input),
    updateItem: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_UPDATE_ITEM, id, input),
    archiveItem: (id) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_ARCHIVE_ITEM, id),
    restoreItem: (id) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_RESTORE_ITEM, id),
    trashItem: (id) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_TRASH_ITEM, id),
    deleteItem: (id) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_DELETE_ITEM, id),
    reorderItems: (orderedIds) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_REORDER_ITEMS, orderedIds),
    revealField: (itemId, field) =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_REVEAL_FIELD, itemId, field),
    copyField: (itemId, field) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_COPY_FIELD, itemId, field),
    listHistory: (itemId) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_LIST_HISTORY, itemId),
    restoreHistory: (itemId, historyId) =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_RESTORE_HISTORY, itemId, historyId),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_SEARCH, query),
    generatePassword: (options) =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_GENERATE_PASSWORD, options),
    generateApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_GENERATE_API_KEY),
    getDuplicates: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_GET_DUPLICATES),
    getSecurityReport: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_SECURITY_REPORT),
    getAiSuggestions: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_AI_SUGGESTIONS),
    listActivity: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT_LIST_ACTIVITY),
    export: (options) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_EXPORT, options),
    import: (options) => ipcRenderer.invoke(IPC_CHANNELS.VAULT_IMPORT, options),
    getProjectCredentials: (projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_PROJECT_CREDENTIALS, projectId)
  },
  vps: {
    listServers: () => ipcRenderer.invoke(IPC_CHANNELS.VPS_SERVER_LIST),
    getServer: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_SERVER_GET, id),
    createServer: (input) => ipcRenderer.invoke(IPC_CHANNELS.VPS_SERVER_CREATE, input),
    updateServer: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.VPS_SERVER_UPDATE, id, input),
    deleteServer: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_SERVER_DELETE, id),
    pickKeyFile: (passphrase?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_PICK_KEY_FILE, passphrase),
    inspectKey: (content: string, passphrase?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_INSPECT_KEY, content, passphrase),
    testConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.VPS_TEST_CONNECTION, input),
    connect: (serverId: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_CONNECT, serverId),
    disconnect: (serverId: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_DISCONNECT, serverId),
    reconnect: (serverId: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_RECONNECT, serverId),
    execute: (serverId: string, command: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_EXECUTE, serverId, command),
    getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.VPS_SESSIONS),
    getMetrics: (serverId: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_METRICS, serverId),
    getAuditLog: (serverId?: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_AUDIT_LOG, serverId),
    listProjects: (serverId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_PROJECT_LIST, serverId),
    createProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.VPS_PROJECT_CREATE, input),
    updateProject: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.VPS_PROJECT_UPDATE, id, input),
    deleteProject: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_PROJECT_DELETE, id),
    listPM2: (serverId: string) => ipcRenderer.invoke(IPC_CHANNELS.VPS_PM2_LIST, serverId),
    pm2Action: (serverId, action, name) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_PM2_ACTION, serverId, action, name),
    streamPM2Logs: (serverId: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_PM2_LOGS, serverId, name),
    fetchEnv: (serverId: string, filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_ENV_FETCH, serverId, filePath),
    updateEnv: (serverId, filePath, variables) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_ENV_UPDATE, serverId, filePath, variables),
    listFiles: (serverId: string, dirPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_FILE_LIST, serverId, dirPath),
    readFile: (serverId: string, filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_FILE_READ, serverId, filePath),
    writeFile: (serverId, filePath, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_FILE_WRITE, serverId, filePath, content),
    runDeploy: (serverId: string, projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_DEPLOY_RUN, serverId, projectId),
    getDeploy: (deploymentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VPS_DEPLOY_GET, deploymentId),
    onLogChunk: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        data: { serverId: string; chunk: string; stream: string }
      ) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.VPS_LOG_CHUNK, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VPS_LOG_CHUNK, handler)
    },
    onDeployUpdate: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, deployment: unknown) =>
        callback(deployment as import('@shared/types/vps').VPSDeployment)
      ipcRenderer.on(IPC_CHANNELS.VPS_DEPLOY_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VPS_DEPLOY_UPDATE, handler)
    },
    onDeployStepLog: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        data: { deploymentId: string; stepId: string; chunk: string; stream: string }
      ) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.VPS_DEPLOY_STEP_LOG, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VPS_DEPLOY_STEP_LOG, handler)
    },
    onStatusChange: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) =>
        callback(data as import('@shared/types/vps').VPSStatusChange)
      ipcRenderer.on(IPC_CHANNELS.VPS_STATUS_CHANGE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VPS_STATUS_CHANGE, handler)
    }
  },
  clipboard: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_LIST),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_SEARCH, query),
    copy: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_COPY, id),
    writeText: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_WRITE_TEXT, text),
    pin: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_PIN, id),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_REMOVE, id),
    clearUnpinned: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_CLEAR_UNPINNED),
    openPanel: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_OPEN_PANEL),
    pickAndPaste: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_PICK_AND_PASTE, id),
    closePicker: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_CLOSE_PICKER),
    onHistoryUpdate: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        snapshot: import('@shared/types/clipboard').ClipboardHistorySnapshot
      ) => callback(snapshot)
      ipcRenderer.on(IPC_CHANNELS.CLIPBOARD_HISTORY_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLIPBOARD_HISTORY_UPDATE, handler)
    },
    onOpenPanel: (callback) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.CLIPBOARD_OPEN_PANEL, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLIPBOARD_OPEN_PANEL, handler)
    }
  },
  quickNote: {
    close: () => ipcRenderer.invoke(IPC_CHANNELS.NOTE_POPUP_CLOSE),
    notifySaved: () => ipcRenderer.invoke(IPC_CHANNELS.NOTE_POPUP_SAVED),
    onSaved: (callback) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.NOTE_POPUP_SAVED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTE_POPUP_SAVED, handler)
    }
  },
  notepad: {
    onCreateRequest: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        payload: { requestId: string; title: string; content: string }
      ) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.NOTEPAD_CREATE_REQUEST, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTEPAD_CREATE_REQUEST, handler)
    },
    replyCreate: (payload) => {
      ipcRenderer.send(IPC_CHANNELS.NOTEPAD_CREATE_RESULT, payload)
    },
    onQueryRequest: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        payload: {
          requestId: string
          action: 'list' | 'get' | 'search'
          id?: string
          query?: string
        }
      ) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.NOTEPAD_QUERY_REQUEST, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTEPAD_QUERY_REQUEST, handler)
    },
    replyQuery: (payload) => {
      ipcRenderer.send(IPC_CHANNELS.NOTEPAD_QUERY_RESULT, payload)
    }
  },
  codeEditor: {
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_OPEN_FOLDER),
    openFolderPath: (path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_OPEN_FOLDER_PATH, path),
    closeWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_CLOSE_WORKSPACE),
    getWorkspaceState: () => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_GET_WORKSPACE_STATE),
    saveWorkspaceState: (state) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_SAVE_WORKSPACE_STATE, state),
    readDirectory: (path: string, options?: ReadDirectoryOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_READ_DIR, path, options),
    readFile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_READ_FILE, path),
    writeFile: (path: string, content: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_WRITE_FILE, path, content),
    createEntry: (input: CreateEntryInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_CREATE_ENTRY, input),
    renameEntry: (input: RenameEntryInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_RENAME_ENTRY, input),
    deleteEntry: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_DELETE_ENTRY, path),
    searchFiles: (query: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_SEARCH_FILES, query),
    importPaths: (sourcePaths: string[], destDir: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_IMPORT_PATHS, sourcePaths, destDir),
    inspectPath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_INSPECT_PATH, path),
    copyEntry: (input) => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_COPY_ENTRY, input),
    moveEntry: (input) => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_MOVE_ENTRY, input),
    revealInOs: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_REVEAL, path),
    getIgnoreRules: () => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_GET_IGNORE_RULES),
    setIgnoreRules: (patch) => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_SET_IGNORE_RULES, patch),
    getContext: () => ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_GET_CONTEXT),
    setContext: (snapshot: EditorContextSnapshot | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_SET_CONTEXT, snapshot),
    ai: {
      stream: (request: EditorAiRequest, onChunk, onEnd, onError) => {
        const chunkHandler = (_: Electron.IpcRendererEvent, chunk: EditorAiChunk) => {
          if (chunk.requestId !== request.requestId) return
          onChunk(chunk)
        }
        const endHandler = (_: Electron.IpcRendererEvent, chunk: EditorAiChunk) => {
          if (chunk.requestId !== request.requestId) return
          cleanup()
          onEnd(chunk)
        }
        const errorHandler = (_: Electron.IpcRendererEvent, requestId: string, error: string) => {
          if (requestId !== request.requestId) return
          cleanup()
          onError(requestId, error)
        }
        const cleanup = () => {
          ipcRenderer.removeListener(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_CHUNK, chunkHandler)
          ipcRenderer.removeListener(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_END, endHandler)
          ipcRenderer.removeListener(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_ERROR, errorHandler)
        }
        ipcRenderer.on(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_CHUNK, chunkHandler)
        ipcRenderer.on(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_END, endHandler)
        ipcRenderer.on(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_ERROR, errorHandler)
        void ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_AI_STREAM, request)
        return () => {
          cleanup()
          void ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_ABORT, request.requestId)
        }
      },
      abort: (requestId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_ABORT, requestId)
    }
  },
  git: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS),
    diff: (path: string, staged: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF, path, staged),
    log: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, limit),
    stage: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE, path),
    unstage: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE, path),
    commit: (input) => ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, input),
    checkout: (input) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CHECKOUT, input),
    revert: (input) => ipcRenderer.invoke(IPC_CHANNELS.GIT_REVERT, input),
    fileAtHead: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_AT_HEAD, path),
    fetch: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_FETCH),
    pull: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL),
    push: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH),
    stash: (message?: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STASH, message),
    stashPop: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_STASH_POP),
    initialize: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_INIT),
    listStashes: () => ipcRenderer.invoke(IPC_CHANNELS.GIT_STASH_LIST),
    applyStash: (ref: string, pop?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STASH_APPLY, ref, pop),
    dropStash: (ref: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STASH_DROP, ref)
  },
  codeIndex: {
    start: () => ipcRenderer.invoke(IPC_CHANNELS.INDEX_START),
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.INDEX_CANCEL),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.INDEX_GET_STATUS),
    searchText: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.INDEX_SEARCH_TEXT, query, limit),
    searchRegex: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.INDEX_SEARCH_REGEX, query, limit),
    searchSymbol: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.INDEX_SEARCH_SYMBOL, query, limit),
    searchReference: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.INDEX_SEARCH_REFERENCE, query, limit),
    fileSymbols: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.INDEX_FILE_SYMBOLS, path),
    onProgress: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        status: import('@shared/types/code-intel').IndexerStatus
      ) => callback(status)
      ipcRenderer.on(IPC_CHANNELS.INDEX_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INDEX_PROGRESS, handler)
    }
  },
  seoAudit: {
    run: () => ipcRenderer.invoke(IPC_CHANNELS.SEO_AUDIT_RUN),
    crawl: (options) => ipcRenderer.invoke(IPC_CHANNELS.SEO_CRAWL_RUN, options)
  },
  language: {
    hover: (query) => ipcRenderer.invoke(IPC_CHANNELS.LANG_HOVER, query),
    definition: (query) => ipcRenderer.invoke(IPC_CHANNELS.LANG_DEFINITION, query),
    references: (query) => ipcRenderer.invoke(IPC_CHANNELS.LANG_REFERENCES, query),
    completions: (query) => ipcRenderer.invoke(IPC_CHANNELS.LANG_COMPLETIONS, query),
    diagnostics: (path, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.LANG_GET_DIAGNOSTICS, path, content),
    updateBuffer: (path, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.LANG_UPDATE_BUFFER, path, content),
    onDiagnostics: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        payload: { path: string; items: import('@shared/types/agent').DiagnosticHit[] }
      ) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.LANG_DIAGNOSTICS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.LANG_DIAGNOSTICS, handler)
    }
  },
  debug: {
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_START, input),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_STOP),
    continue: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_CONTINUE),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_PAUSE),
    stepOver: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_STEP_OVER),
    stepInto: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_STEP_INTO),
    stepOut: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_STEP_OUT),
    evaluate: (expression) => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_EVAL, expression),
    setBreakpoints: (breakpoints) =>
      ipcRenderer.invoke(IPC_CHANNELS.DEBUG_SET_BREAKPOINTS, breakpoints),
    snapshot: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_SNAPSHOT),
    onEvent: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        event: import('@shared/types/debug').DebugEvent
      ) => callback(event)
      ipcRenderer.on(IPC_CHANNELS.DEBUG_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.DEBUG_EVENT, handler)
    }
  },
  apiStudio: {
    sendRequest: (request: ResolvedHttpRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_SEND_REQUEST, request),
    cancelRequest: (clientRequestId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_CANCEL_REQUEST, clientRequestId),
    runTests: (input: RunApiTestsInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_RUN_TESTS, input),
    runPreRequest: (input: import('@shared/types/api-studio').RunPreRequestScriptInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_RUN_PRE_REQUEST, input),
    saveResponse: (input: import('@shared/types/api-studio').SaveResponseFileInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_SAVE_RESPONSE, input),
    pickImportCollection: () => ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_PICK_IMPORT_COLLECTION),
    exportCollection: (input: import('@shared/types/api-studio').ExportCollectionFileInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_EXPORT_COLLECTION, input),
    oauth2: {
      authorize: (input: import('@shared/types/api-studio').OAuth2AuthorizeInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_OAUTH2_AUTHORIZE, input),
      exchangeToken: (input: import('@shared/types/api-studio').OAuth2TokenInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_OAUTH2_TOKEN, input)
    },
    ai: {
      generateRequest: (input: GenerateApiRequestInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_GENERATE, input),
      explainResponse: (input: ExplainApiResponseInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_EXPLAIN, input),
      generateTests: (input: GenerateApiTestsInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_TESTS, input),
      fixRequest: (input: FixApiRequestInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_FIX, input),
      documentCollection: (input: GenerateCollectionDocumentInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_DOCUMENT, input),
      describeRequest: (input: DescribeApiRequestInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_DESCRIBE, input),
      enhance: (input: EnhanceApiRequestInput) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_ENHANCE, input)
    }
  },
  terminal: {
    create: (id: string, cwd: string, cols?: number, rows?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, id, cwd, cols, rows),
    write: (id: string, data: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_WRITE, id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESIZE, id, cols, rows),
    run: (id: string, command: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RUN, id, command),
    stop: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_STOP, id),
    dispose: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_DISPOSE, id),
    getWorkspaceState: () => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_GET_WORKSPACE_STATE),
    saveWorkspaceState: (state) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_SAVE_WORKSPACE_STATE, state),
    pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_PICK_FOLDER),
    openFolderPath: (path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_OPEN_FOLDER_PATH, path),
    exec: (request: TerminalExecRequest) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_EXEC, request),
    cancelExec: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_EXEC_CANCEL, id),
    classifyCommand: (command: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CLASSIFY_COMMAND, command),
    onData: (callback: (event: TerminalDataEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: TerminalDataEvent) => callback(event)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_DATA, handler)
    },
    onExit: (callback: (event: TerminalExitEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: TerminalExitEvent) => callback(event)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, handler)
    }
  },
  dbWorkspace: {
    listProviders: () => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_PROVIDERS),
    listConnections: (filter) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_CONNECTIONS, filter),
    getConnection: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_GET_CONNECTION, id),
    getConnectionSecrets: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_GET_CONNECTION_SECRETS, id),
    createConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_CREATE_CONNECTION, input),
    updateConnection: (id, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_UPDATE_CONNECTION, id, input),
    deleteConnection: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_DELETE_CONNECTION, id),
    duplicateConnection: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_DUPLICATE_CONNECTION, id),
    testConnection: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_TEST_CONNECTION, id),
    testConnectionConfig: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_TEST_CONNECTION_CONFIG, input),
    connect: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_CONNECT, id),
    disconnect: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_DISCONNECT, id),
    listDatabases: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_DATABASES, connectionId),
    listSchemas: (connectionId, database) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_SCHEMAS, connectionId, database),
    getExplorer: (connectionId, database, schema) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_GET_EXPLORER, connectionId, database, schema),
    getTableInfo: (connectionId, database, schema, table) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_GET_TABLE_INFO, connectionId, database, schema, table),
    executeQuery: (options) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_EXECUTE_QUERY, options),
    fetchDataPage: (options) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_FETCH_DATA_PAGE, options),
    saveDataChanges: (input) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_SAVE_DATA_CHANGES, input),
    previewDdl: (input) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_PREVIEW_DDL, input),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_GET_SETTINGS),
    saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_SAVE_SETTINGS, settings),
    listQueryHistory: (connectionId, limit) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_QUERY_HISTORY, connectionId, limit),
    listSavedQueries: (filter) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_SAVED_QUERIES, filter),
    saveQuery: (input) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_SAVE_QUERY, input),
    deleteSavedQuery: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_DELETE_SAVED_QUERY, id),
    listTableLinks: (connectionId, table) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_TABLE_LINKS, connectionId, table),
    createTableLink: (input) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_CREATE_TABLE_LINK, input),
    search: (query, connectionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_SEARCH, query, connectionId),
    generateErDiagram: (connectionId, database, schema) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_GENERATE_ER, connectionId, database, schema),
    compareSchema: (input) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_COMPARE_SCHEMA, input),
    knowledgeSyncReport: (connectionId, projectId, database, schema) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.DB_WS_KNOWLEDGE_SYNC,
        connectionId,
        projectId,
        database,
        schema
      ),
    ai: {
      run: (request) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_AI_RUN, request),
      getSchema: (connectionId: string, database: string, schema: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.DB_WS_AI_SCHEMA_GET, connectionId, database, schema),
      resyncSchema: (connectionId: string, database: string, schema: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.DB_WS_AI_SCHEMA_RESYNC, connectionId, database, schema)
    },
    exportConnections: (connectionIds, includeSecrets) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_EXPORT_CONNECTIONS, connectionIds, includeSecrets),
    importConnections: (payload, scope, projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_IMPORT_CONNECTIONS, payload, scope, projectId),
    createSnapshot: (connectionId, label) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_CREATE_SNAPSHOT, connectionId, label),
    listSnapshots: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_SNAPSHOTS, connectionId),
    listFolders: (filter) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_LIST_FOLDERS, filter),
    createFolder: (input) => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_CREATE_FOLDER, input),
    pickSqliteFile: () => ipcRenderer.invoke(IPC_CHANNELS.DB_WS_PICK_SQLITE_FILE)
  },
  vectorWorkspace: {
    listConnections: (filter) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_LIST_CONNECTIONS, filter),
    getConnection: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_CONNECTION, id),
    getConnectionSecrets: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_CONNECTION_SECRETS, id),
    createConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_CREATE_CONNECTION, input),
    updateConnection: (id, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_UPDATE_CONNECTION, id, input),
    deleteConnection: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_DELETE_CONNECTION, id),
    duplicateConnection: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_DUPLICATE_CONNECTION, id),
    testConnection: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_TEST_CONNECTION, id),
    testConnectionConfig: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_TEST_CONNECTION_CONFIG, input),
    connect: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_CONNECT, id),
    disconnect: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_DISCONNECT, id),
    getExplorer: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_EXPLORER, connectionId),
    getHealth: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_HEALTH, connectionId),
    getVersion: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_VERSION, connectionId),
    getStats: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_STATS, connectionId),
    listCollections: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_LIST_COLLECTIONS, connectionId),
    createCollection: (connectionId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_CREATE_COLLECTION, connectionId, input),
    deleteCollection: (connectionId, name) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_DELETE_COLLECTION, connectionId, name),
    renameCollection: (connectionId, name, newName) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_RENAME_COLLECTION, connectionId, name, newName),
    getCollectionStats: (connectionId, name) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_COLLECTION_STATS, connectionId, name),
    upsertVectors: (connectionId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_UPSERT_VECTORS, connectionId, input),
    deleteVectors: (connectionId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_DELETE_VECTORS, connectionId, input),
    getVector: (connectionId, collection, id) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_VECTOR, connectionId, collection, id),
    getVectors: (connectionId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_VECTORS, connectionId, input),
    search: (connectionId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_SEARCH, connectionId, input),
    searchWithText: (connectionId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_SEARCH_TEXT, connectionId, input),
    upsertWithText: (connectionId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_UPSERT_TEXT, connectionId, input),
    backup: (connectionId, destination) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_BACKUP, connectionId, destination),
    restore: (connectionId, source) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_RESTORE, connectionId, source),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_GET_SETTINGS),
    saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_SAVE_SETTINGS, settings),
    ragIndex: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_RAG_INDEX, projectId),
    ragStatus: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_RAG_STATUS, projectId),
    ragRetrieve: (projectId: string, query: string, topK?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEC_WS_RAG_RETRIEVE, projectId, query, topK)
  },
  ragTraining: {
    list: (filter) => ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_LIST, filter),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_CREATE, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_DELETE, id),
    index: (scope, projectId) => ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_INDEX, scope, projectId),
    indexStatus: (scope, projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_INDEX_STATUS, scope, projectId),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_GET_SETTINGS),
    saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.RAG_TRAIN_SAVE_SETTINGS, settings)
  },
  voice: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_STATUS),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_GET_SETTINGS),
    updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.VOICE_UPDATE_SETTINGS, patch),
    getModelStatus: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_MODEL_STATUS),
    downloadModel: (id) => ipcRenderer.invoke(IPC_CHANNELS.VOICE_MODEL_DOWNLOAD, id),
    cancelModelDownload: (id) => ipcRenderer.invoke(IPC_CHANNELS.VOICE_MODEL_CANCEL_DOWNLOAD, id),
    removeModel: (id) => ipcRenderer.invoke(IPC_CHANNELS.VOICE_MODEL_REMOVE, id),
    listConversations: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_LIST_CONVERSATIONS),
    searchConversations: (query: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOICE_SEARCH_CONVERSATIONS, query),
    getConversation: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VOICE_GET_CONVERSATION, id),
    createConversation: (title?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOICE_CREATE_CONVERSATION, title),
    renameConversation: (id: string, title: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOICE_RENAME_CONVERSATION, id, title),
    deleteConversation: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOICE_DELETE_CONVERSATION, id),
    startListening: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_START_LISTENING),
    transcribe: (audio) => ipcRenderer.invoke(IPC_CHANNELS.VOICE_TRANSCRIBE, audio),
    processTurn: (conversationId, transcript) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOICE_PROCESS_TURN, conversationId, transcript),
    synthesize: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.VOICE_SYNTHESIZE, text),
    stopSpeech: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_STOP_SPEECH),
    finishSpeaking: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_FINISH_SPEAKING),
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_CANCEL),
    confirmTool: (requestId: string, approved: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOICE_CONFIRM_TOOL, requestId, approved),
    clearData: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_CLEAR_DATA),
    onEvent: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        event: import('@shared/types/voice-assistant').VoiceEngineEvent
      ) => callback(event)
      ipcRenderer.on(IPC_CHANNELS.VOICE_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_EVENT, handler)
    }
  }
}

try {
  contextBridge.exposeInMainWorld('electronAPI', api)
} catch (error) {
  console.error('Failed to expose desktop API', error)
  try {
    // Fallback when context isolation is off or exposeInMainWorld rejects a re-expose.
    ;(window as Window & { electronAPI?: ElectronAPI }).electronAPI = api
  } catch (fallbackError) {
    console.error('Failed to assign desktop API on window', fallbackError)
  }
}
