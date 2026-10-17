import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { ElectronAPI } from '@shared/ipc/api'

type WindowChromeState = { fullscreen: boolean; maximized: boolean }

/** Latest window state from main, cached from preload start so late subscribers don't miss it. */
let lastWindowChrome: WindowChromeState | null = null
ipcRenderer.on(IPC_CHANNELS.APP_WINDOW_CHROME, (_: Electron.IpcRendererEvent, state: WindowChromeState) => {
  lastWindowChrome = state
})

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
    onChrome: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        state: { fullscreen: boolean; maximized: boolean }
      ) => callback(state)
      ipcRenderer.on(IPC_CHANNELS.APP_WINDOW_CHROME, handler)
      // Replay the state sent before React subscribed (e.g. relaunching in full screen).
      if (lastWindowChrome) callback(lastWindowChrome)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_WINDOW_CHROME, handler)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (data) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, data)
  },
  profile: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET),
    update: (patch) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_UPDATE, patch)
  },
  activity: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_GET),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_CLEAR)
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
    getSummary: () => ipcRenderer.invoke(IPC_CHANNELS.USAGE_SUMMARY),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.USAGE_CLEAR)
  },
  log: {
    write: (entry) => ipcRenderer.invoke(IPC_CHANNELS.LOG_WRITE, entry),
    getRecent: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.LOG_GET_RECENT, limit)
  },
  workspace: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LOAD),
    save: (payload) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SAVE, payload),
    saveSync: (payload) => ipcRenderer.sendSync(IPC_CHANNELS.WORKSPACE_SAVE_SYNC, payload)
  },
  bugReports: {
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.BUG_REPORT_CREATE, input),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.BUG_REPORT_LIST)
  },
  apiStudio: {
    sendRequest: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_SEND_REQUEST, request),
    cancelRequest: (clientRequestId) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_CANCEL_REQUEST, clientRequestId),
    runTests: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_RUN_TESTS, input),
    runPreRequest: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_RUN_PRE_REQUEST, input),
    saveResponse: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_SAVE_RESPONSE, input),
    pickImportCollection: () => ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_PICK_IMPORT_COLLECTION),
    exportCollection: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_EXPORT_COLLECTION, input),
    oauth2: {
      authorize: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_OAUTH2_AUTHORIZE, input),
      exchangeToken: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_OAUTH2_TOKEN, input)
    },
    ai: {
      generateRequest: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_GENERATE, input),
      explainResponse: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_EXPLAIN, input),
      generateTests: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_TESTS, input),
      fixRequest: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_FIX, input),
      documentCollection: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_DOCUMENT, input),
      describeRequest: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_DESCRIBE, input),
      enhance: (input) =>
        ipcRenderer.invoke(IPC_CHANNELS.API_STUDIO_AI_ENHANCE, input)
    }
  },
  mockServer: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_LIST),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_CREATE, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_UPDATE, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_DELETE, id),
    save: (server) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_SAVE, server),
    upsertRoute: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_UPSERT_ROUTE, payload),
    deleteRoute: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_DELETE_ROUTE, payload),
    start: (id) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_START, id),
    stop: (id) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_STOP, id),
    restart: (id) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_RESTART, id),
    status: (id) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_STATUS, id),
    statuses: () => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_STATUSES),
    logs: (id) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_LOGS, id),
    clearLogs: (id) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_CLEAR_LOGS, id),
    testRoute: (input) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_TEST_ROUTE, input),
    findPort: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_FIND_PORT, payload),
    importCollection: (input) => ipcRenderer.invoke(IPC_CHANNELS.MOCK_SERVER_IMPORT_COLLECTION, input)
  },
  aiEngineer: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_GET_CONFIG),
    updateConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_UPDATE_CONFIG, patch),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_STATUS),
    dashboard: () => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_DASHBOARD),
    analyze: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_ANALYZE, input),
    listAnalyses: () => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_LIST_ANALYSES),
    getAnalysis: (id) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_GET_ANALYSIS, id),
    generateTests: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_GENERATE_TESTS, input),
    listSuites: () => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_LIST_SUITES),
    getSuite: (id) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_GET_SUITE, id),
    saveRun: (run) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_SAVE_RUN, run),
    listRuns: () => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_LIST_RUNS),
    getRun: (id) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_GET_RUN, id),
    analyzeFailure: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_ANALYZE_FAILURE, input),
    listFindings: () => ipcRenderer.invoke(IPC_CHANNELS.AI_ENGINEER_LIST_FINDINGS)
  },
  codeScanner: {
    pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_PICK_FOLDER),
    scan: (input) => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_SCAN, input),
    cancel: (scanId) => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_CANCEL, scanId),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) =>
        callback(progress)
      ipcRenderer.on(IPC_CHANNELS.CODE_SCANNER_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CODE_SCANNER_PROGRESS, handler)
    },
    estimateEnrich: (input) => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_ENRICH_ESTIMATE, input),
    enrich: (input) => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_ENRICH, input),
    openSource: (input) => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_OPEN_SOURCE, input),
    readSource: (input) => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_READ_SOURCE, input),
    scanRef: (input) => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_SCAN_REF, input),
    watch: (rootPath) => ipcRenderer.invoke(IPC_CHANNELS.CODE_SCANNER_WATCH, rootPath),
    onChanged: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, rootPath: string) => callback(rootPath)
      ipcRenderer.on(IPC_CHANNELS.CODE_SCANNER_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CODE_SCANNER_CHANGED, handler)
    },
    onEnrichProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) =>
        callback(progress)
      ipcRenderer.on(IPC_CHANNELS.CODE_SCANNER_ENRICH_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CODE_SCANNER_ENRICH_PROGRESS, handler)
    }
  },
  mcp: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_STATUS),
    updateConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.MCP_UPDATE_CONFIG, patch),
    regenerateToken: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_REGENERATE_TOKEN),
    installClaudeDesktop: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_INSTALL_CLAUDE),
    ready: (ready) => ipcRenderer.invoke(IPC_CHANNELS.MCP_READY, ready),
    onInvoke: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, message: Parameters<typeof callback>[0]) =>
        callback(message)
      ipcRenderer.on(IPC_CHANNELS.MCP_INVOKE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MCP_INVOKE, handler)
    },
    result: (result) => ipcRenderer.send(IPC_CHANNELS.MCP_RESULT, result)
  },
  updater: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_GET_STATUS),
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_INSTALL),
    onStatus: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) =>
        callback(status)
      ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_STATUS, handler)
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
