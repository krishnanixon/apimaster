import type {
  AIProviderConfig,
  AIProviderConfigPatch,
  AIProviderId,
  AIModelOption,
  AIProviderMetric,
  AIRuntimeStatus,
  AITestConnectionResult,
  AppSettings,
  ApiKeyStatus,
  ActivityLog,
  ApiUsageSummary,
  IpcResult,
  UserProfile,
  UserProfilePatch,
  LogEntry,
  UpdateStatus
} from '../types'
import type { BugReport, CreateBugReportInput } from '../types/diagnostics'
import type { WorkspaceLoadResult, WorkspaceSaveResult } from '../lib/workspace-document'
import type {
  ApiExecutionResult,
  ApiTestRun,
  DescribeApiRequestInput,
  EnhanceApiRequestInput,
  EnhanceApiRequestResult,
  ExplainApiResponseInput,
  ExportCollectionFileInput,
  FixApiRequestInput,
  GenerateApiRequestInput,
  GenerateApiTestsInput,
  GenerateCollectionDocumentInput,
  GeneratedApiRequestResult,
  OAuth2AuthorizeInput,
  OAuth2TokenInput,
  OAuth2TokenResult,
  PreRequestScriptResult,
  ResolvedHttpRequest,
  RunApiTestsInput,
  RunPreRequestScriptInput,
  SaveResponseFileInput
} from '../types/api-studio'
import type {
  CreateMockServerInput,
  ImportCollectionToMockInput,
  MockRequestLog,
  MockRoute,
  MockServer,
  MockServerStatus,
  MockRouteTestInput,
  UpdateMockServerInput
} from '../types/mock-server'
import type {
  AiEngineerConfig,
  AiFailureAnalysis,
  AiFinding,
  AiTestRun,
  AiTestSuite,
  AnalyzeAiFailureInput,
  AnalyzeApiInput,
  ApiAnalysisRecord,
  GenerateAiTestsInput
} from '../types/ai-engineer'
import type {
  CodeScanEnrichEstimate,
  CodeScanEnrichInput,
  CodeScanEnrichProgress,
  CodeScanEnrichResult,
  CodeScanInput,
  CodeScanProgress,
  CodeScanResult,
  DetectedEndpoint
} from '../types/code-scanner'
import type {
  CookieDeleteInput,
  NetworkSecretsPatch,
  NetworkSettingsPatch,
  NetworkSettingsView,
  StoredCookie,
  WebSocketConnectInput,
  WebSocketEvent
} from '../types/network'
import type { McpInvokeMessage, McpInvokeResult, McpServerConfigPatch, McpServerStatus } from '../mcp/types'

export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>
    getPath: (name: string) => Promise<string>
    openExternal: (url: string) => Promise<void>
    getPathForFile: (file: File) => string
    onNavigate: (callback: (path: string) => void) => () => void
  }
  onboarding: {
    get: () => Promise<
      IpcResult<{
        termsVersion: string | null
        termsAcceptedAt: string | null
        setupCompletedAt: string | null
        isComplete: boolean
        currentTermsVersion: string
      }>
    >
    complete: (termsVersion?: string) => Promise<
      IpcResult<{
        termsVersion: string | null
        termsAcceptedAt: string | null
        setupCompletedAt: string | null
      }>
    >
  }
  windows: {
    onChrome: (
      callback: (state: { fullscreen: boolean; maximized: boolean }) => void
    ) => () => void
  }
  settings: {
    get: () => Promise<IpcResult<AppSettings>>
    update: (data: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>
  }
  profile: {
    get: () => Promise<IpcResult<UserProfile>>
    update: (patch: UserProfilePatch) => Promise<IpcResult<UserProfile>>
  }
  activity: {
    get: () => Promise<IpcResult<ActivityLog>>
    clear: () => Promise<IpcResult>
  }
  apiKey: {
    set: (key: string) => Promise<IpcResult>
    getStatus: () => Promise<IpcResult<ApiKeyStatus>>
    delete: () => Promise<IpcResult>
    setFor: (providerId: AIProviderId, key: string) => Promise<IpcResult>
    getStatusFor: (providerId: AIProviderId) => Promise<IpcResult<ApiKeyStatus>>
    deleteFor: (providerId: AIProviderId) => Promise<IpcResult>
    listStatuses: () => Promise<IpcResult<Partial<Record<AIProviderId, ApiKeyStatus>>>>
  }
  ai: {
    getConfig: () => Promise<IpcResult<AIProviderConfig>>
    setConfig: (patch: AIProviderConfigPatch) => Promise<IpcResult<AIProviderConfig>>
    getStatus: () => Promise<IpcResult<AIRuntimeStatus>>
    testConnection: (providerId: AIProviderId) => Promise<IpcResult<AITestConnectionResult>>
    listModels: (providerId: AIProviderId) => Promise<IpcResult<AIModelOption[]>>
    getMetrics: () => Promise<IpcResult<AIProviderMetric[]>>
  }
  usage: {
    getSummary: () => Promise<IpcResult<ApiUsageSummary>>
    clear: () => Promise<IpcResult>
  }
  log: {
    write: (entry: Omit<LogEntry, 'timestamp'>) => Promise<void>
    getRecent: (limit?: number) => Promise<IpcResult<LogEntry[]>>
  }
  workspace: {
    load: () => Promise<IpcResult<WorkspaceLoadResult>>
    save: (payload: string) => Promise<IpcResult<WorkspaceSaveResult>>
    saveSync: (payload: string) => IpcResult<WorkspaceSaveResult>
  }
  bugReports: {
    create: (input: CreateBugReportInput) => Promise<IpcResult<BugReport>>
    list: () => Promise<IpcResult<BugReport[]>>
  }
  apiStudio: {
    sendRequest: (request: ResolvedHttpRequest) => Promise<IpcResult<ApiExecutionResult>>
    cancelRequest: (clientRequestId: string) => Promise<IpcResult>
    runTests: (input: RunApiTestsInput) => Promise<IpcResult<ApiTestRun>>
    runPreRequest: (input: RunPreRequestScriptInput) => Promise<IpcResult<PreRequestScriptResult>>
    saveResponse: (input: SaveResponseFileInput) => Promise<IpcResult<string>>
    pickImportCollection: () => Promise<IpcResult<string>>
    /** Bruno collection folder: `bruno.json` and `.bru` files; `null` when the picker was cancelled. */
    pickImportFolder: () => Promise<IpcResult<{ name: string; files: Array<{ path: string; content: string }> } | null>>
    exportCollection: (input: ExportCollectionFileInput) => Promise<IpcResult<string>>
    oauth2: {
      authorize: (input: OAuth2AuthorizeInput) => Promise<IpcResult<{ code: string; state?: string }>>
      exchangeToken: (input: OAuth2TokenInput) => Promise<IpcResult<OAuth2TokenResult>>
    }
    ai: {
      generateRequest: (input: GenerateApiRequestInput) => Promise<IpcResult<GeneratedApiRequestResult>>
      explainResponse: (input: ExplainApiResponseInput) => Promise<IpcResult<string>>
      generateTests: (input: GenerateApiTestsInput) => Promise<IpcResult<string>>
      fixRequest: (input: FixApiRequestInput) => Promise<IpcResult<GeneratedApiRequestResult>>
      documentCollection: (input: GenerateCollectionDocumentInput) => Promise<IpcResult<string>>
      describeRequest: (input: DescribeApiRequestInput) => Promise<IpcResult<string>>
      enhance: (input: EnhanceApiRequestInput) => Promise<IpcResult<EnhanceApiRequestResult>>
    }
    /** WebSockets run in the main process so headers, proxy, TLS and cookies apply. */
    websocket: {
      connect: (input: WebSocketConnectInput) => Promise<IpcResult>
      send: (connectionId: string, data: string) => Promise<IpcResult>
      close: (connectionId: string) => Promise<IpcResult>
      onEvent: (callback: (event: WebSocketEvent) => void) => () => void
    }
  }
  network: {
    getSettings: () => Promise<IpcResult<NetworkSettingsView>>
    updateSettings: (patch: NetworkSettingsPatch) => Promise<IpcResult<NetworkSettingsView>>
    /** Secrets are encrypted with the OS keychain; only their presence comes back. */
    updateSecrets: (patch: NetworkSecretsPatch) => Promise<IpcResult<NetworkSettingsView>>
    /** Native file picker for certificates; resolves to null when cancelled. */
    pickFile: (input: { title: string; kind: 'pem' | 'key' | 'pfx' | 'any' }) => Promise<IpcResult<string | null>>
    /** Which proxy a URL would use with the current settings. */
    resolveProxy: (url: string) => Promise<
      IpcResult<{ proxy: string | null; source: 'none' | 'system' | 'manual' | 'bypass'; unsupported?: string }>
    >
  }
  cookies: {
    list: () => Promise<IpcResult<StoredCookie[]>>
    upsert: (input: {
      cookie: StoredCookie
      previous?: { domain: string; path: string; name: string }
    }) => Promise<IpcResult<StoredCookie[]>>
    delete: (input: CookieDeleteInput) => Promise<IpcResult<StoredCookie[]>>
    clear: () => Promise<IpcResult<StoredCookie[]>>
  }
  mockServer: {
    list: () => Promise<IpcResult<MockServer[]>>
    get: (id: string) => Promise<IpcResult<MockServer>>
    create: (input?: CreateMockServerInput) => Promise<IpcResult<MockServer>>
    update: (input: UpdateMockServerInput) => Promise<IpcResult<MockServer>>
    delete: (id: string) => Promise<IpcResult>
    save: (server: MockServer) => Promise<IpcResult<MockServer>>
    upsertRoute: (payload: { serverId: string; route: MockRoute }) => Promise<IpcResult<MockServer>>
    deleteRoute: (payload: { serverId: string; routeId: string }) => Promise<IpcResult<MockServer>>
    start: (id: string) => Promise<IpcResult<MockServerStatus>>
    stop: (id: string) => Promise<IpcResult<MockServerStatus>>
    restart: (id: string) => Promise<IpcResult<MockServerStatus>>
    status: (id: string) => Promise<IpcResult<MockServerStatus>>
    statuses: () => Promise<IpcResult<MockServerStatus[]>>
    logs: (id: string) => Promise<IpcResult<MockRequestLog[]>>
    clearLogs: (id: string) => Promise<IpcResult>
    testRoute: (input: MockRouteTestInput) => Promise<IpcResult<ApiExecutionResult>>
    findPort: (payload?: { host?: string; preferred?: number }) => Promise<IpcResult<number>>
    importCollection: (input: ImportCollectionToMockInput) => Promise<IpcResult<MockServer>>
  }
  aiEngineer: {
    getConfig: () => Promise<IpcResult<AiEngineerConfig>>
    updateConfig: (patch: Partial<AiEngineerConfig>) => Promise<IpcResult<AiEngineerConfig>>
    status: () => Promise<IpcResult<{ providerOnline: boolean }>>
    dashboard: () => Promise<
      IpcResult<{
        endpointCount: number
        analysisCount: number
        suiteCount: number
        runCount: number
        testsExecuted: number
        passRate: number
        findings: { high: number; medium: number; low: number }
        recentFindings: AiFinding[]
      }>
    >
    analyze: (input: AnalyzeApiInput) => Promise<IpcResult<ApiAnalysisRecord>>
    listAnalyses: () => Promise<IpcResult<ApiAnalysisRecord[]>>
    getAnalysis: (id: string) => Promise<IpcResult<ApiAnalysisRecord>>
    generateTests: (input: GenerateAiTestsInput) => Promise<IpcResult<AiTestSuite>>
    listSuites: () => Promise<IpcResult<AiTestSuite[]>>
    getSuite: (id: string) => Promise<IpcResult<AiTestSuite>>
    saveRun: (run: AiTestRun) => Promise<IpcResult<AiTestRun>>
    listRuns: () => Promise<IpcResult<AiTestRun[]>>
    getRun: (id: string) => Promise<IpcResult<AiTestRun>>
    analyzeFailure: (input: AnalyzeAiFailureInput) => Promise<IpcResult<AiFailureAnalysis>>
    listFindings: () => Promise<IpcResult<AiFinding[]>>
  }
  codeScanner: {
    /** Opens the native folder picker. Resolves to null when the user cancels. */
    pickFolder: () => Promise<IpcResult<string | null>>
    scan: (input: CodeScanInput) => Promise<IpcResult<CodeScanResult>>
    cancel: (scanId: string) => Promise<IpcResult>
    onProgress: (callback: (progress: CodeScanProgress) => void) => () => void
    /** Cost and provider for an AI enrichment run — shown before asking for consent. */
    estimateEnrich: (input: { rootPath: string; endpoints: DetectedEndpoint[] }) => Promise<IpcResult<CodeScanEnrichEstimate>>
    enrich: (input: CodeScanEnrichInput) => Promise<IpcResult<CodeScanEnrichResult>>
    onEnrichProgress: (callback: (progress: CodeScanEnrichProgress) => void) => () => void
    /** Opens a scanned file at a line in the installed code editor (falls back to the default app). */
    openSource: (input: { rootPath: string; file: string; line: number }) => Promise<IpcResult<{ editor: string | null }>>
    /** Code around scanned locations, from a folder picked in the folder picker; credentials redacted. */
    readSource: (input: {
      rootPath: string
      locations: Array<{ file: string; line: number }>
    }) => Promise<IpcResult<Array<{ file: string; line: number; code: string }>>>
    /** Endpoints as they are at a git branch, tag or commit (read from git; the working tree is untouched). */
    scanRef: (input: { rootPath: string; ref: string }) => Promise<IpcResult<{ commit: string; endpoints: DetectedEndpoint[]; truncated: boolean }>>
    /** Watches a scanned folder for source changes; `null` stops. */
    watch: (rootPath: string | null) => Promise<IpcResult>
    onChanged: (callback: (rootPath: string) => void) => () => void
  }
  mcp: {
    getStatus: () => Promise<IpcResult<McpServerStatus>>
    updateConfig: (patch: McpServerConfigPatch) => Promise<IpcResult<McpServerStatus>>
    regenerateToken: () => Promise<IpcResult<McpServerStatus>>
    installClaudeDesktop: () => Promise<IpcResult<{ configPath: string }>>
    ready: (ready?: boolean) => Promise<IpcResult>
    onInvoke: (callback: (message: McpInvokeMessage) => void) => () => void
    result: (result: McpInvokeResult) => void
  }
  updater: {
    getStatus: () => Promise<IpcResult<UpdateStatus>>
    /** Checks GitHub releases now (allowed even when automatic updates are off — the user asked). */
    check: () => Promise<IpcResult<UpdateStatus>>
    /** Quits and installs a downloaded update (Windows/Linux only). */
    install: () => Promise<IpcResult>
    onStatus: (callback: (status: UpdateStatus) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
