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
  ApiUsageSummary,
  ChatStreamChunk,
  ChatContextAttachment,
  ChatStreamOptions,
  ContextEngineResult,
  AgentEvent,
  AgentCheckpointRestoreResult,
  AgentMemoryFact,
  AgentPatchRecord,
  AgentRunRequest,
  AgentRunSnapshot,
  AgentTaskRecord,
  Conversation,
  CreateDocumentInput,
  CreateProjectInput,
  Document,
  DocumentSyncSuggestion,
  DocumentVersion,
  DocumentWithProject,
  EditDocumentInput,
  EditDocumentSectionInput,
  EditDocumentSectionResult,
  EditSelectionInput,
  ExportOptions,
  ExtractKnowledgeInput,
  ExtractKnowledgeResult,
  FlowAIActionInput,
  FlowAnalysisResult,
  FlowArchitectureResult,
  FlowDiagram,
  FlowExplanationResult,
  AnalyzeFlowInput,
  ExplainFlowInput,
  FlowRequirementCoverageInput,
  GenerateFlowArchitectureInput,
  GeneratedFlowResult,
  GenerateFlowInput,
  RequirementCoverageResult,
  ReverseFlowInput,
  CreateFlowDiagramInput,
  UpdateFlowDiagramInput,
  ArchitectureAssistantInput,
  ArchitectureAssistantResult,
  ArchitectureDiagram,
  CreateArchitectureDiagramInput,
  GenerateArchitectureInput,
  GeneratedArchitectureResult,
  UpdateArchitectureDiagramInput,
  CreatePresentationInput,
  GeneratePresentationInput,
  GeneratedPresentationResult,
  Presentation,
  PresentationAssistantInput,
  PresentationAssistantResult,
  UpdatePresentationInput,
  KnowledgeBundle,
  KnowledgeContext,
  KnowledgeSearchResult,
  KnowledgeSeedResult,
  KnowledgeStats,
  KnowledgeSuggestion,
  ExportResult,
  GenerateRequirementInput,
  IpcResult,
  LogEntry,
  BugReport,
  CreateBugReportInput,
  Message,
  Project,
  ProjectSettings,
  SearchResult,
  UpdateDocumentInput,
  UpdateProjectInput,
  UpdateProjectSettingsInput
} from '../types'
import type {
  CreateVaultFolderInput,
  CreateVaultItemInput,
  GeneratePasswordOptions,
  GeneratePasswordResult,
  UpdateVaultFolderInput,
  UpdateVaultItemInput,
  VaultActivityLog,
  VaultAiSuggestion,
  VaultDuplicateGroup,
  VaultExportOptions,
  VaultFolder,
  VaultHistoryEntry,
  VaultImportOptions,
  VaultImportResult,
  VaultItem,
  VaultItemListEntry,
  VaultItemSecrets,
  VaultProjectCredentialRef,
  VaultRevealResult,
  VaultSearchQuery,
  VaultSearchResult,
  VaultSecurityReport,
  VaultSettings,
  VaultSetupInput,
  VaultStatus,
  VaultTag,
  VaultUnlockInput
} from '../types/vault'
import type {
  AuditLogEntry,
  CommandResult,
  EnvVariable,
  FileEntry,
  PM2Process,
  VPSDeployment,
  VPSProject,
  VPSProjectInput,
  VPSServer,
  VPSServerInput,
  VPSServerMetrics,
  VPSSessionInfo,
  VPSStatusChange,
  VPSKeyInspectResult,
  VPSPickedKey
} from '../types/vps'
import type {
  ClipboardHistorySnapshot,
  ClipboardItem,
  ClipboardSearchQuery
} from '../types/clipboard'
import type {
  CodeEditorWorkspaceState,
  CreateEntryInput,
  EditorAiChunk,
  EditorAiRequest,
  EditorContextSnapshot,
  FileSearchHit,
  FileSystemEntry,
  IgnoreRulesState,
  OpenedWorkspace,
  ReadDirectoryOptions,
  ReadDirectoryResult,
  RenameEntryInput,
  CopyMoveEntryInput
} from '../types/code-editor'
import type {
  TerminalDataEvent,
  TerminalExecRequest,
  TerminalExecResult,
  TerminalExitEvent
} from '../types/terminal'
import type { CommandRiskResult } from '../lib/command-risk'
import type {
  GitCheckoutInput,
  GitCommitInput,
  GitDiffResult,
  GitLogEntry,
  GitRevertInput,
  GitSnapshot,
  GitStashEntry,
  GitCommandResult
} from '../types/git'
import type {
  CodeSearchHit,
  IndexedSymbol,
  IndexerStatus,
  LanguageCompletionResult,
  LanguageHover,
  LanguageLocation,
  LanguageQuery
} from '../types/code-intel'
import type { DebugBreakpoint, DebugEvent, DebugLaunchInput, DebugSnapshot } from '../types/debug'
import type {
  ApiExecutionResult,
  ApiTestResult,
  DescribeApiRequestInput,
  EnhanceApiRequestInput,
  EnhanceApiRequestResult,
  ExplainApiResponseInput,
  FixApiRequestInput,
  GenerateApiRequestInput,
  GenerateApiTestsInput,
  GenerateCollectionDocumentInput,
  GeneratedApiRequestResult,
  ResolvedHttpRequest,
  RunApiTestsInput
} from '../types/api-studio'
import type {
  VoiceAssistantSettings,
  VoiceAssistantSettingsPatch,
  VoiceAudioPayload,
  VoiceConversation,
  VoiceConversationSummary,
  VoiceEngineEvent,
  VoiceRuntimeStatus,
  VoiceSynthesizeResult,
  VoiceTranscript,
  VoiceTurnResult
} from '../types/voice-assistant'

export interface WorkbenchWindowInfo {
  id: number
  title: string
  focused: boolean
  kind: 'workbench' | 'module' | 'project'
  path: string
}

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
    create: (path?: string) => Promise<IpcResult<{ id: number }>>
    openPath: (path: string) => Promise<IpcResult<{ id: number }>>
    openModule: (path: string) => Promise<IpcResult<{ id: number }>>
    openInWorkbench: (path?: string) => Promise<IpcResult<{ id: number }>>
    openProject: (projectId: string, segment?: string) => Promise<IpcResult<{ id: number }>>
    close: () => Promise<IpcResult>
    list: () => Promise<IpcResult<WorkbenchWindowInfo[]>>
    focus: (id: number) => Promise<IpcResult>
    onChrome: (
      callback: (state: { fullscreen: boolean; maximized: boolean }) => void
    ) => () => void
  }
  settings: {
    get: () => Promise<IpcResult<AppSettings>>
    update: (data: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>
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
    getSummary: (projectId?: string) => Promise<IpcResult<ApiUsageSummary>>
    clear: (projectId?: string) => Promise<IpcResult>
  }
  projects: {
    list: (status?: string) => Promise<IpcResult<Project[]>>
    get: (id: string) => Promise<IpcResult<Project & { settings: ProjectSettings | null }>>
    create: (input: CreateProjectInput) => Promise<IpcResult<Project>>
    update: (id: string, input: UpdateProjectInput) => Promise<IpcResult<Project>>
    updateSettings: (
      id: string,
      input: UpdateProjectSettingsInput
    ) => Promise<IpcResult<ProjectSettings>>
    delete: (id: string) => Promise<IpcResult>
    duplicate: (id: string) => Promise<IpcResult<Project>>
    archive: (id: string) => Promise<IpcResult<Project>>
    open: (id: string) => Promise<IpcResult<Project>>
    recent: () => Promise<IpcResult<Project[]>>
  }
  conversations: {
    list: (projectId: string) => Promise<IpcResult<Conversation[]>>
    listGlobal: () => Promise<IpcResult<Conversation[]>>
    get: (id: string) => Promise<IpcResult<Conversation>>
    create: (projectId: string, title?: string) => Promise<IpcResult<Conversation>>
    createGlobal: (title?: string) => Promise<IpcResult<Conversation>>
    update: (
      id: string,
      data: Partial<Pick<Conversation, 'title' | 'isPinned'>>
    ) => Promise<IpcResult<Conversation>>
    delete: (id: string) => Promise<IpcResult>
    duplicate: (id: string) => Promise<IpcResult<Conversation>>
    search: (projectId: string, query: string) => Promise<IpcResult<Conversation[]>>
    clearMessages: (conversationId: string) => Promise<IpcResult>
  }
  messages: {
    list: (conversationId: string) => Promise<IpcResult<Message[]>>
    create: (conversationId: string, role: string, content: string) => Promise<IpcResult<Message>>
    update: (id: string, content: string) => Promise<IpcResult<Message>>
    delete: (id: string) => Promise<IpcResult>
  }
  chat: {
    stream: (
      conversationId: string,
      content: string,
      onChunk: (chunk: ChatStreamChunk) => void,
      onEnd: () => void,
      onError: (error: string) => void,
      options?: ChatStreamOptions
    ) => () => void
    regenerate: (
      conversationId: string,
      onChunk: (chunk: ChatStreamChunk) => void,
      onEnd: () => void,
      onError: (error: string) => void
    ) => () => void
    editMessage: (
      conversationId: string,
      messageId: string,
      newContent: string,
      onChunk: (chunk: ChatStreamChunk) => void,
      onEnd: () => void,
      onError: (error: string) => void
    ) => () => void
    abort: (conversationId: string) => Promise<IpcResult>
    generateRequirement: (input: GenerateRequirementInput) => Promise<IpcResult<Document>>
    editDocument: (input: EditDocumentInput) => Promise<IpcResult<string>>
    editSelection: (input: EditSelectionInput) => Promise<IpcResult<string>>
    editSection: (input: EditDocumentSectionInput) => Promise<IpcResult<EditDocumentSectionResult>>
  }
  contextEngine: {
    resolve: (input: {
      query: string
      projectId?: string | null
      model?: string
    }) => Promise<IpcResult<ContextEngineResult>>
  }
  agent: {
    run: (request: AgentRunRequest) => Promise<IpcResult<AgentRunSnapshot>>
    cancel: (runId: string) => Promise<IpcResult>
    pause: (runId: string) => Promise<IpcResult>
    resume: (runId: string) => Promise<IpcResult>
    confirm: (requestId: string, approved: boolean) => Promise<IpcResult>
    revertLast: () => Promise<IpcResult<AgentPatchRecord | null>>
    revertPatch: (id: string) => Promise<IpcResult<AgentPatchRecord | null>>
    acceptPatch: (id: string) => Promise<IpcResult<AgentPatchRecord | null>>
    acceptHunk: (id: string, hunkIndex: number) => Promise<IpcResult<AgentPatchRecord | null>>
    rejectHunk: (id: string, hunkIndex: number) => Promise<IpcResult<AgentPatchRecord | null>>
    acceptAllPatches: () => Promise<IpcResult<AgentPatchRecord[]>>
    restoreCheckpoint: (runId: string) => Promise<IpcResult<AgentCheckpointRestoreResult>>
    listPatches: () => Promise<IpcResult<AgentPatchRecord[]>>
    listTasks: () => Promise<IpcResult<AgentTaskRecord[]>>
    recallMemory: (query: string) => Promise<IpcResult<AgentMemoryFact[]>>
    mcpStatus: () => Promise<IpcResult<Array<{ id: string; command: string; ok: boolean; detail: string }>>>
    onEvent: (callback: (event: AgentEvent) => void) => () => void
  }
  documents: {
    list: (projectId: string) => Promise<IpcResult<Document[]>>
    listAll: () => Promise<IpcResult<DocumentWithProject[]>>
    get: (id: string) => Promise<IpcResult<Document>>
    create: (input: CreateDocumentInput) => Promise<IpcResult<Document>>
    update: (id: string, input: UpdateDocumentInput) => Promise<IpcResult<Document>>
    delete: (id: string) => Promise<IpcResult>
    duplicate: (id: string) => Promise<IpcResult<Document>>
    getVersions: (documentId: string) => Promise<IpcResult<DocumentVersion[]>>
    restoreVersion: (documentId: string, versionId: string) => Promise<IpcResult<Document>>
    saveVersion: (documentId: string, label: string) => Promise<IpcResult<DocumentVersion>>
    markReviewed: (documentId: string) => Promise<IpcResult<Document>>
    getSyncSuggestions: (projectId: string) => Promise<IpcResult<DocumentSyncSuggestion[]>>
    parseWord: (input: {
      fileName: string
      bytes: Uint8Array | number[]
    }) => Promise<IpcResult<{ html: string; text: string; title: string; savedFilePath: string }>>
    parsePdf: (input: {
      fileName: string
      bytes: Uint8Array | number[]
    }) => Promise<IpcResult<{ html: string; text: string; title: string; pageCount: number; savedFilePath: string }>>
    saveWord: (input: {
      documentId: string
      folderPath?: string
    }) => Promise<IpcResult<{ filePath: string }>>
  }
  search: {
    global: (projectId: string, query: string) => Promise<IpcResult<SearchResult[]>>
    reindex: (projectId: string) => Promise<IpcResult>
  }
  export: {
    document: (options: ExportOptions) => Promise<IpcResult<ExportResult>>
    selectPath: (format: 'docx' | 'pdf') => Promise<IpcResult<string>>
    selectFolder: () => Promise<IpcResult<string>>
    revealPath: (filePath: string) => Promise<IpcResult>
    /** Open a local file or folder with the OS default app (Word, PDF reader, Explorer). */
    openPath: (filePath: string) => Promise<IpcResult>
  }
  knowledge: {
    load: (projectId: string) => Promise<IpcResult<KnowledgeBundle>>
    getStats: (projectId: string) => Promise<IpcResult<KnowledgeStats>>
    getContext: (projectId: string) => Promise<IpcResult<KnowledgeContext>>
    search: (projectId: string, query: string) => Promise<IpcResult<KnowledgeSearchResult[]>>
    getSuggestions: (projectId: string) => Promise<IpcResult<KnowledgeSuggestion[]>>
    extract: (input: ExtractKnowledgeInput) => Promise<IpcResult<ExtractKnowledgeResult>>
    updateOverview: (
      projectId: string,
      data: Record<string, unknown>
    ) => Promise<IpcResult<unknown>>
    createItem: (
      entityType: string,
      projectId: string,
      data: Record<string, unknown>
    ) => Promise<IpcResult<unknown>>
    updateItem: (
      entityType: string,
      id: string,
      data: Record<string, unknown>
    ) => Promise<IpcResult<unknown>>
    deleteItem: (entityType: string, id: string) => Promise<IpcResult>
    syncSearch: (projectId: string) => Promise<IpcResult>
    seedSample: (projectId: string, force?: boolean) => Promise<IpcResult<KnowledgeSeedResult>>
  }
  flows: {
    list: (projectId: string) => Promise<IpcResult<FlowDiagram[]>>
    get: (id: string) => Promise<IpcResult<FlowDiagram>>
    create: (input: CreateFlowDiagramInput) => Promise<IpcResult<FlowDiagram>>
    update: (id: string, input: UpdateFlowDiagramInput) => Promise<IpcResult<FlowDiagram>>
    delete: (id: string) => Promise<IpcResult>
    duplicate: (id: string) => Promise<IpcResult<FlowDiagram>>
    generate: (input: GenerateFlowInput) => Promise<IpcResult<GeneratedFlowResult>>
    reverse: (input: ReverseFlowInput) => Promise<IpcResult<string>>
    aiAction: (input: FlowAIActionInput) => Promise<IpcResult<string>>
    analyze: (input: AnalyzeFlowInput) => Promise<IpcResult<FlowAnalysisResult>>
    explain: (input: ExplainFlowInput) => Promise<IpcResult<FlowExplanationResult>>
    architecture: (
      input: GenerateFlowArchitectureInput
    ) => Promise<IpcResult<FlowArchitectureResult>>
    requirementCoverage: (
      input: FlowRequirementCoverageInput
    ) => Promise<IpcResult<RequirementCoverageResult>>
  }
  architectures: {
    list: (projectId: string) => Promise<IpcResult<ArchitectureDiagram[]>>
    get: (id: string) => Promise<IpcResult<ArchitectureDiagram>>
    create: (input: CreateArchitectureDiagramInput) => Promise<IpcResult<ArchitectureDiagram>>
    update: (
      id: string,
      input: UpdateArchitectureDiagramInput
    ) => Promise<IpcResult<ArchitectureDiagram>>
    delete: (id: string) => Promise<IpcResult>
    duplicate: (id: string) => Promise<IpcResult<ArchitectureDiagram>>
    generate: (input: GenerateArchitectureInput) => Promise<IpcResult<GeneratedArchitectureResult>>
    assist: (input: ArchitectureAssistantInput) => Promise<IpcResult<ArchitectureAssistantResult>>
  }
  presentations: {
    list: (projectId: string) => Promise<IpcResult<Presentation[]>>
    get: (id: string) => Promise<IpcResult<Presentation>>
    create: (input: CreatePresentationInput) => Promise<IpcResult<Presentation>>
    update: (id: string, input: UpdatePresentationInput) => Promise<IpcResult<Presentation>>
    delete: (id: string) => Promise<IpcResult>
    duplicate: (id: string) => Promise<IpcResult<Presentation>>
    generate: (input: GeneratePresentationInput) => Promise<IpcResult<GeneratedPresentationResult>>
    assist: (input: PresentationAssistantInput) => Promise<IpcResult<PresentationAssistantResult>>
    exportPdf: (presentationId: string, outputPath?: string) => Promise<IpcResult<{ path: string }>>
    exportPptx: (
      presentationId: string,
      outputPath?: string
    ) => Promise<IpcResult<{ path: string }>>
    importAsset: (
      presentationId: string,
      name: string,
      dataUrl: string
    ) => Promise<IpcResult<{ src: string }>>
  }
  log: {
    write: (entry: Omit<LogEntry, 'timestamp'>) => Promise<void>
    getRecent: (limit?: number) => Promise<IpcResult<LogEntry[]>>
  }
  bugReports: {
    create: (input: CreateBugReportInput) => Promise<IpcResult<BugReport>>
    list: () => Promise<IpcResult<BugReport[]>>
  }
  vault: {
    getStatus: () => Promise<IpcResult<VaultStatus>>
    setup: (input: VaultSetupInput) => Promise<IpcResult>
    unlock: (input: VaultUnlockInput) => Promise<IpcResult>
    lock: () => Promise<IpcResult>
    updateSettings: (settings: Partial<VaultSettings>) => Promise<IpcResult<VaultSettings>>
    changeMasterPassword: (current: string, next: string) => Promise<IpcResult>
    listFolders: () => Promise<IpcResult<VaultFolder[]>>
    createFolder: (input: CreateVaultFolderInput) => Promise<IpcResult<VaultFolder>>
    updateFolder: (id: string, input: UpdateVaultFolderInput) => Promise<IpcResult<VaultFolder>>
    deleteFolder: (id: string) => Promise<IpcResult>
    reorderFolders: (orderedIds: string[]) => Promise<IpcResult>
    listTags: () => Promise<IpcResult<VaultTag[]>>
    listItems: (filter?: {
      folderId?: string | null
      view?: 'all' | 'favorites' | 'recent' | 'archive' | 'trash'
    }) => Promise<IpcResult<VaultItemListEntry[]>>
    getItem: (
      id: string,
      includeSecrets?: boolean
    ) => Promise<IpcResult<VaultItem | VaultItemListEntry>>
    createItem: (input: CreateVaultItemInput) => Promise<IpcResult<VaultItemListEntry>>
    updateItem: (id: string, input: UpdateVaultItemInput) => Promise<IpcResult<VaultItemListEntry>>
    archiveItem: (id: string) => Promise<IpcResult>
    restoreItem: (id: string) => Promise<IpcResult>
    trashItem: (id: string) => Promise<IpcResult>
    deleteItem: (id: string) => Promise<IpcResult>
    reorderItems: (orderedIds: string[]) => Promise<IpcResult>
    revealField: (
      itemId: string,
      field: keyof VaultItemSecrets
    ) => Promise<IpcResult<VaultRevealResult>>
    copyField: (
      itemId: string,
      field: keyof VaultItemSecrets
    ) => Promise<IpcResult<{ clearAfterSeconds: number }>>
    listHistory: (itemId: string) => Promise<IpcResult<VaultHistoryEntry[]>>
    restoreHistory: (itemId: string, historyId: string) => Promise<IpcResult>
    search: (query: VaultSearchQuery) => Promise<IpcResult<VaultSearchResult>>
    generatePassword: (
      options?: GeneratePasswordOptions
    ) => Promise<IpcResult<GeneratePasswordResult>>
    generateApiKey: () => Promise<IpcResult<{ apiKey: string }>>
    getDuplicates: () => Promise<IpcResult<VaultDuplicateGroup[]>>
    getSecurityReport: () => Promise<IpcResult<VaultSecurityReport>>
    getAiSuggestions: () => Promise<IpcResult<VaultAiSuggestion[]>>
    listActivity: () => Promise<IpcResult<VaultActivityLog[]>>
    export: (
      options: VaultExportOptions
    ) => Promise<IpcResult<{ saved: boolean; filePath?: string }>>
    import: (options: VaultImportOptions) => Promise<IpcResult<VaultImportResult>>
    getProjectCredentials: (projectId: string) => Promise<IpcResult<VaultProjectCredentialRef[]>>
  }
  vps: {
    listServers: () => Promise<IpcResult<VPSServer[]>>
    getServer: (id: string) => Promise<IpcResult<VPSServer | null>>
    createServer: (input: VPSServerInput) => Promise<IpcResult<VPSServer>>
    updateServer: (
      id: string,
      input: Partial<VPSServerInput>
    ) => Promise<IpcResult<VPSServer | null>>
    deleteServer: (id: string) => Promise<IpcResult<boolean>>
    pickKeyFile: (passphrase?: string) => Promise<IpcResult<VPSPickedKey | null>>
    inspectKey: (content: string, passphrase?: string) => Promise<IpcResult<VPSKeyInspectResult>>
    testConnection: (input: VPSServerInput) => Promise<IpcResult>
    connect: (serverId: string) => Promise<IpcResult>
    disconnect: (serverId: string) => Promise<IpcResult>
    reconnect: (serverId: string) => Promise<IpcResult>
    execute: (serverId: string, command: string) => Promise<IpcResult<CommandResult>>
    getSessions: () => Promise<IpcResult<VPSSessionInfo[]>>
    getMetrics: (serverId: string) => Promise<IpcResult<VPSServerMetrics>>
    getAuditLog: (serverId?: string) => Promise<IpcResult<AuditLogEntry[]>>
    listProjects: (serverId?: string) => Promise<IpcResult<VPSProject[]>>
    createProject: (input: VPSProjectInput) => Promise<IpcResult<VPSProject>>
    updateProject: (
      id: string,
      input: Partial<VPSProjectInput>
    ) => Promise<IpcResult<VPSProject | null>>
    deleteProject: (id: string) => Promise<IpcResult<boolean>>
    listPM2: (serverId: string) => Promise<IpcResult<PM2Process[]>>
    pm2Action: (
      serverId: string,
      action: 'restart' | 'reload' | 'stop' | 'delete',
      name: string
    ) => Promise<IpcResult<CommandResult>>
    streamPM2Logs: (serverId: string, name: string) => Promise<IpcResult>
    fetchEnv: (serverId: string, filePath: string) => Promise<IpcResult<EnvVariable[]>>
    updateEnv: (
      serverId: string,
      filePath: string,
      variables: EnvVariable[]
    ) => Promise<IpcResult<{ backupPath: string }>>
    listFiles: (serverId: string, dirPath: string) => Promise<IpcResult<FileEntry[]>>
    readFile: (serverId: string, filePath: string) => Promise<IpcResult<string>>
    writeFile: (serverId: string, filePath: string, content: string) => Promise<IpcResult>
    runDeploy: (serverId: string, projectId: string) => Promise<IpcResult<VPSDeployment>>
    getDeploy: (deploymentId: string) => Promise<IpcResult<VPSDeployment | undefined>>
    onLogChunk: (
      callback: (data: { serverId: string; chunk: string; stream: string }) => void
    ) => () => void
    onDeployUpdate: (callback: (deployment: VPSDeployment) => void) => () => void
    onDeployStepLog: (
      callback: (data: {
        deploymentId: string
        stepId: string
        chunk: string
        stream: string
      }) => void
    ) => () => void
    onStatusChange: (callback: (data: VPSStatusChange) => void) => () => void
  }
  clipboard: {
    list: () => Promise<IpcResult<ClipboardItem[]>>
    search: (query: ClipboardSearchQuery) => Promise<IpcResult<ClipboardItem[]>>
    copy: (id: string) => Promise<IpcResult>
    writeText: (text: string) => Promise<IpcResult>
    pin: (id: string) => Promise<IpcResult<ClipboardItem[]>>
    remove: (id: string) => Promise<IpcResult<ClipboardItem[]>>
    clearUnpinned: () => Promise<IpcResult<ClipboardItem[]>>
    openPanel: () => Promise<IpcResult>
    pickAndPaste: (id: string) => Promise<IpcResult>
    closePicker: () => Promise<IpcResult>
    onHistoryUpdate: (callback: (snapshot: ClipboardHistorySnapshot) => void) => () => void
    onOpenPanel: (callback: () => void) => () => void
  }
  quickNote: {
    close: () => Promise<IpcResult>
    notifySaved: () => Promise<IpcResult>
    onSaved: (callback: () => void) => () => void
  }
  notepad: {
    onCreateRequest: (
      callback: (payload: { requestId: string; title: string; content: string }) => void
    ) => () => void
    replyCreate: (payload: {
      requestId: string
      ok: boolean
      id?: string
      title?: string
      error?: string
    }) => void
    onQueryRequest: (
      callback: (payload: {
        requestId: string
        action: 'list' | 'get' | 'search'
        id?: string
        query?: string
      }) => void
    ) => () => void
    replyQuery: (payload: {
      requestId: string
      ok: boolean
      notes?: Array<{
        id: string
        title: string
        preview: string
        content?: string
        updatedAt: number
      }>
      error?: string
    }) => void
  }
  codeEditor: {
    openFolder: () => Promise<IpcResult<OpenedWorkspace | null>>
    openFolderPath: (path: string) => Promise<IpcResult<OpenedWorkspace | null>>
    closeWorkspace: () => Promise<IpcResult>
    getWorkspaceState: () => Promise<IpcResult<CodeEditorWorkspaceState>>
    saveWorkspaceState: (state: Partial<CodeEditorWorkspaceState>) => Promise<IpcResult>
    readDirectory: (
      path: string,
      options?: ReadDirectoryOptions
    ) => Promise<IpcResult<ReadDirectoryResult>>
    readFile: (path: string) => Promise<IpcResult<string>>
    writeFile: (path: string, content: string) => Promise<IpcResult>
    createEntry: (input: CreateEntryInput) => Promise<IpcResult<FileSystemEntry>>
    renameEntry: (input: RenameEntryInput) => Promise<IpcResult<FileSystemEntry>>
    deleteEntry: (path: string) => Promise<IpcResult>
    searchFiles: (query: string) => Promise<IpcResult<FileSearchHit[]>>
    importPaths: (
      sourcePaths: string[],
      destDir: string
    ) => Promise<IpcResult<{ copied: string[] }>>
    inspectPath: (
      path: string
    ) => Promise<IpcResult<{ path: string; name: string; isDirectory: boolean }>>
    copyEntry: (input: CopyMoveEntryInput) => Promise<IpcResult<FileSystemEntry>>
    moveEntry: (input: CopyMoveEntryInput) => Promise<IpcResult<FileSystemEntry>>
    revealInOs: (path: string) => Promise<IpcResult>
    getIgnoreRules: () => Promise<IpcResult<IgnoreRulesState>>
    setIgnoreRules: (patch: {
      customIgnoreNames?: string[]
      showIgnored?: boolean
    }) => Promise<IpcResult<IgnoreRulesState>>
    getContext: () => Promise<IpcResult<EditorContextSnapshot | null>>
    setContext: (snapshot: EditorContextSnapshot | null) => Promise<IpcResult>
    ai: {
      stream: (
        request: EditorAiRequest,
        onChunk: (chunk: EditorAiChunk) => void,
        onEnd: (chunk: EditorAiChunk) => void,
        onError: (requestId: string, error: string) => void
      ) => () => void
      abort: (requestId: string) => Promise<IpcResult>
    }
  }
  git: {
    status: () => Promise<IpcResult<GitSnapshot>>
    diff: (path: string, staged: boolean) => Promise<IpcResult<GitDiffResult>>
    log: (limit?: number) => Promise<IpcResult<GitLogEntry[]>>
    stage: (path: string) => Promise<IpcResult>
    unstage: (path: string) => Promise<IpcResult>
    commit: (input: GitCommitInput) => Promise<IpcResult>
    checkout: (input: GitCheckoutInput) => Promise<IpcResult>
    revert: (input: GitRevertInput) => Promise<IpcResult>
    fileAtHead: (path: string) => Promise<IpcResult<string | null>>
    fetch: () => Promise<IpcResult<GitCommandResult>>
    pull: () => Promise<IpcResult<GitCommandResult>>
    push: () => Promise<IpcResult<GitCommandResult>>
    stash: (message?: string) => Promise<IpcResult<GitCommandResult>>
    stashPop: () => Promise<IpcResult<GitCommandResult>>
    initialize: () => Promise<IpcResult>
    listStashes: () => Promise<IpcResult<GitStashEntry[]>>
    applyStash: (ref: string, pop?: boolean) => Promise<IpcResult<GitCommandResult>>
    dropStash: (ref: string) => Promise<IpcResult>
  }
  codeIndex: {
    start: () => Promise<IpcResult<IndexerStatus>>
    cancel: () => Promise<IpcResult<IndexerStatus>>
    getStatus: () => Promise<IpcResult<IndexerStatus>>
    searchText: (query: string, limit?: number) => Promise<IpcResult<CodeSearchHit[]>>
    searchRegex: (query: string, limit?: number) => Promise<IpcResult<CodeSearchHit[]>>
    searchSymbol: (query: string, limit?: number) => Promise<IpcResult<CodeSearchHit[]>>
    searchReference: (query: string, limit?: number) => Promise<IpcResult<CodeSearchHit[]>>
    fileSymbols: (path: string) => Promise<IpcResult<IndexedSymbol[]>>
    onProgress: (callback: (status: IndexerStatus) => void) => () => void
  }
  seoAudit: {
    run: () => Promise<IpcResult<import('../types/seo-audit').SeoAuditReport>>
    crawl: (options: import('../types/seo-audit').SeoCrawlOptions) => Promise<IpcResult<import('../types/seo-audit').SeoCrawlReport>>
  }
  language: {
    hover: (query: LanguageQuery) => Promise<IpcResult<LanguageHover | null>>
    definition: (query: LanguageQuery) => Promise<IpcResult<LanguageLocation[]>>
    references: (query: LanguageQuery) => Promise<IpcResult<LanguageLocation[]>>
    completions: (query: LanguageQuery) => Promise<IpcResult<LanguageCompletionResult | null>>
    diagnostics: (
      path: string,
      content?: string
    ) => Promise<IpcResult<import('../types/agent').DiagnosticHit[]>>
    updateBuffer: (path: string, content: string) => Promise<IpcResult>
    onDiagnostics: (
      callback: (payload: { path: string; items: import('../types/agent').DiagnosticHit[] }) => void
    ) => () => void
  }
  debug: {
    start: (input: DebugLaunchInput) => Promise<IpcResult<DebugSnapshot>>
    stop: () => Promise<IpcResult<DebugSnapshot>>
    continue: () => Promise<IpcResult>
    pause: () => Promise<IpcResult>
    stepOver: () => Promise<IpcResult>
    stepInto: () => Promise<IpcResult>
    stepOut: () => Promise<IpcResult>
    evaluate: (expression: string) => Promise<IpcResult<string>>
    setBreakpoints: (breakpoints: DebugBreakpoint[]) => Promise<IpcResult>
    snapshot: () => Promise<IpcResult<DebugSnapshot>>
    onEvent: (callback: (event: DebugEvent) => void) => () => void
  }
  apiStudio: {
    sendRequest: (request: ResolvedHttpRequest) => Promise<IpcResult<ApiExecutionResult>>
    cancelRequest: (clientRequestId: string) => Promise<IpcResult>
    runTests: (input: RunApiTestsInput) => Promise<IpcResult<ApiTestResult[]>>
    runPreRequest: (
      input: import('@shared/types/api-studio').RunPreRequestScriptInput
    ) => Promise<IpcResult<import('@shared/types/api-studio').PreRequestScriptResult>>
    saveResponse: (
      input: import('@shared/types/api-studio').SaveResponseFileInput
    ) => Promise<IpcResult<string>>
    pickImportCollection: () => Promise<IpcResult<string>>
    exportCollection: (
      input: import('@shared/types/api-studio').ExportCollectionFileInput
    ) => Promise<IpcResult<string>>
    oauth2: {
      authorize: (
        input: import('@shared/types/api-studio').OAuth2AuthorizeInput
      ) => Promise<IpcResult<{ code: string; state?: string }>>
      exchangeToken: (
        input: import('@shared/types/api-studio').OAuth2TokenInput
      ) => Promise<IpcResult<import('@shared/types/api-studio').OAuth2TokenResult>>
    }
    ai: {
      generateRequest: (
        input: GenerateApiRequestInput
      ) => Promise<IpcResult<GeneratedApiRequestResult>>
      explainResponse: (input: ExplainApiResponseInput) => Promise<IpcResult<string>>
      generateTests: (input: GenerateApiTestsInput) => Promise<IpcResult<string>>
      fixRequest: (input: FixApiRequestInput) => Promise<IpcResult<GeneratedApiRequestResult>>
      documentCollection: (input: GenerateCollectionDocumentInput) => Promise<IpcResult<string>>
      describeRequest: (input: DescribeApiRequestInput) => Promise<IpcResult<string>>
      enhance: (input: EnhanceApiRequestInput) => Promise<IpcResult<EnhanceApiRequestResult>>
    }
  }
  terminal: {
    create: (id: string, cwd: string, cols?: number, rows?: number) => Promise<IpcResult>
    write: (id: string, data: string) => Promise<IpcResult>
    resize: (id: string, cols: number, rows: number) => Promise<IpcResult>
    run: (id: string, command: string) => Promise<IpcResult>
    stop: (id: string) => Promise<IpcResult>
    dispose: (id: string) => Promise<IpcResult>
    getWorkspaceState: () => Promise<
      IpcResult<import('@shared/types/terminal').TerminalWorkspaceState>
    >
    saveWorkspaceState: (
      state: import('@shared/types/terminal').TerminalWorkspaceState
    ) => Promise<IpcResult>
    pickFolder: () => Promise<IpcResult<import('@shared/types/code-editor').OpenedWorkspace>>
    openFolderPath: (
      path: string
    ) => Promise<IpcResult<import('@shared/types/code-editor').OpenedWorkspace>>
    exec: (request: TerminalExecRequest) => Promise<IpcResult<TerminalExecResult>>
    cancelExec: (id: string) => Promise<IpcResult<boolean>>
    classifyCommand: (command: string) => Promise<IpcResult<CommandRiskResult>>
    onData: (callback: (event: TerminalDataEvent) => void) => () => void
    onExit: (callback: (event: TerminalExitEvent) => void) => () => void
  }
  dbWorkspace: {
    listProviders: () => Promise<
      IpcResult<
        import('@shared/types/database-workspace').DbProviderId extends string
          ? Array<{
              id: import('@shared/types/database-workspace').DbProviderId
              label: string
              driverVersion: string
              implemented: boolean
            }>
          : never
      >
    >
    listConnections: (filter?: {
      scope?: import('@shared/types/scope').AppScope
      projectId?: string | null
    }) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnection[]>>
    getConnection: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnection | null>>
    getConnectionSecrets: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnectionSecrets>>
    createConnection: (
      input: import('@shared/types/database-workspace').CreateDbConnectionInput
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnection>>
    updateConnection: (
      id: string,
      input: import('@shared/types/database-workspace').UpdateDbConnectionInput
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnection | null>>
    deleteConnection: (id: string) => Promise<IpcResult>
    duplicateConnection: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnection | null>>
    testConnection: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnectionTestResult>>
    testConnectionConfig: (
      input: import('@shared/types/database-workspace').CreateDbConnectionInput & { id?: string }
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnectionTestResult>>
    connect: (id: string) => Promise<IpcResult>
    disconnect: (id: string) => Promise<IpcResult>
    listDatabases: (connectionId: string) => Promise<IpcResult<string[]>>
    listSchemas: (connectionId: string, database: string) => Promise<IpcResult<string[]>>
    getExplorer: (
      connectionId: string,
      database?: string,
      schema?: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbExplorerNode[]>>
    getTableInfo: (
      connectionId: string,
      database: string,
      schema: string,
      table: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbTableInfo>>
    executeQuery: (
      options: import('@shared/types/database-workspace').DbQueryOptions
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbQueryResult>>
    fetchDataPage: (
      options: import('@shared/types/database-workspace').DbDataPageOptions
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbDataPageResult>>
    saveDataChanges: (
      input: import('@shared/types/database-workspace').DbSaveDataChangesInput
    ) => Promise<IpcResult<{ affectedRows: number }>>
    previewDdl: (
      input: import('@shared/types/database-workspace').DbDdlPreviewInput
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbDdlPreviewResult>>
    getSettings: () => Promise<
      IpcResult<import('@shared/types/database-workspace').DbWorkspaceSettings>
    >
    saveSettings: (
      settings: Partial<import('@shared/types/database-workspace').DbWorkspaceSettings>
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbWorkspaceSettings>>
    listQueryHistory: (
      connectionId?: string,
      limit?: number
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbQueryHistoryEntry[]>>
    listSavedQueries: (filter?: {
      scope?: import('@shared/types/scope').AppScope
      projectId?: string | null
    }) => Promise<IpcResult<import('@shared/types/database-workspace').DbSavedQuery[]>>
    saveQuery: (
      input: Omit<
        import('@shared/types/database-workspace').DbSavedQuery,
        'id' | 'createdAt' | 'updatedAt'
      > & { id?: string }
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbSavedQuery>>
    deleteSavedQuery: (id: string) => Promise<IpcResult>
    listTableLinks: (
      connectionId: string,
      table?: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbTableLink[]>>
    createTableLink: (
      input: Omit<import('@shared/types/database-workspace').DbTableLink, 'id' | 'createdAt'>
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbTableLink>>
    search: (
      query: string,
      connectionId?: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbSearchResult[]>>
    generateErDiagram: (
      connectionId: string,
      database: string,
      schema: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbErDiagram>>
    compareSchema: (
      input: import('@shared/types/database-workspace').DbSchemaCompareInput
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbSchemaDiff>>
    knowledgeSyncReport: (
      connectionId: string,
      projectId: string,
      database: string,
      schema: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbKnowledgeSyncReport>>
    ai: {
      run: (
        request: import('@shared/types/database-workspace').DbAiRequest
      ) => Promise<IpcResult<import('@shared/types/database-workspace').DbAiResponse>>
      getSchema: (
        connectionId: string,
        database: string,
        schema: string
      ) => Promise<
        IpcResult<import('@shared/types/database-workspace').DbAiSchemaSnapshotInfo | null>
      >
      resyncSchema: (
        connectionId: string,
        database: string,
        schema: string
      ) => Promise<
        IpcResult<import('@shared/types/database-workspace').DbAiSchemaSnapshotInfo | null>
      >
    }
    exportConnections: (
      connectionIds: string[],
      includeSecrets?: boolean
    ) => Promise<IpcResult<string>>
    importConnections: (
      payload: string,
      scope: import('@shared/types/scope').AppScope,
      projectId?: string | null
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnection[]>>
    createSnapshot: (
      connectionId: string,
      label: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbSchemaSnapshot>>
    listSnapshots: (
      connectionId: string
    ) => Promise<IpcResult<import('@shared/types/database-workspace').DbSchemaSnapshot[]>>
    listFolders: (filter?: {
      scope?: import('@shared/types/scope').AppScope
      projectId?: string | null
    }) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnectionFolder[]>>
    createFolder: (input: {
      name: string
      scope: import('@shared/types/scope').AppScope
      projectId?: string | null
      parentId?: string | null
    }) => Promise<IpcResult<import('@shared/types/database-workspace').DbConnectionFolder>>
    pickSqliteFile: () => Promise<IpcResult<string | null>>
  }
  vectorWorkspace: {
    listConnections: (filter?: {
      scope?: import('@shared/types/scope').AppScope
      projectId?: string | null
    }) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorConnection[]>>
    getConnection: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorConnection | null>>
    getConnectionSecrets: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorConnectionSecrets>>
    createConnection: (
      input: import('@shared/types/vector-workspace').CreateVectorConnectionInput
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorConnection>>
    updateConnection: (
      id: string,
      input: import('@shared/types/vector-workspace').UpdateVectorConnectionInput
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorConnection | null>>
    deleteConnection: (id: string) => Promise<IpcResult>
    duplicateConnection: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorConnection | null>>
    testConnection: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorConnectionTestResult>>
    testConnectionConfig: (
      input: import('@shared/types/vector-workspace').CreateVectorConnectionInput
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorConnectionTestResult>>
    connect: (id: string) => Promise<IpcResult>
    disconnect: (id: string) => Promise<IpcResult>
    getExplorer: (
      connectionId: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorExplorerNode[]>>
    getHealth: (
      connectionId: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorHealthInfo>>
    getVersion: (
      connectionId: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorVersionInfo>>
    getStats: (
      connectionId: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorDbStats>>
    listCollections: (connectionId: string) => Promise<IpcResult<string[]>>
    createCollection: (
      connectionId: string,
      input: import('@shared/types/vector-workspace').CreateVectorCollectionInput
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorCollectionStats>>
    deleteCollection: (connectionId: string, name: string) => Promise<IpcResult>
    renameCollection: (
      connectionId: string,
      name: string,
      newName: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorCollectionStats>>
    getCollectionStats: (
      connectionId: string,
      name: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorCollectionStats | null>>
    upsertVectors: (
      connectionId: string,
      input: import('@shared/types/vector-workspace').VectorUpsertInput
    ) => Promise<IpcResult<{ status: string; count: number }>>
    deleteVectors: (
      connectionId: string,
      input: import('@shared/types/vector-workspace').VectorDeleteInput
    ) => Promise<IpcResult<{ status: string; deleted: number }>>
    getVector: (
      connectionId: string,
      collection: string,
      id: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorRecord>>
    getVectors: (
      connectionId: string,
      input: import('@shared/types/vector-workspace').VectorGetInput
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorGetResult>>
    search: (
      connectionId: string,
      input: import('@shared/types/vector-workspace').VectorSearchInput
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorSearchResult>>
    searchWithText: (
      connectionId: string,
      input: import('@shared/types/vector-workspace').VectorTextSearchInput
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorSearchResult>>
    upsertWithText: (
      connectionId: string,
      input: import('@shared/types/vector-workspace').VectorTextUpsertInput
    ) => Promise<IpcResult<{ status: string; count: number }>>
    backup: (
      connectionId: string,
      destination: string
    ) => Promise<IpcResult<{ status: string; destination: string }>>
    restore: (
      connectionId: string,
      source: string
    ) => Promise<IpcResult<{ status: string; source: string }>>
    getSettings: () => Promise<
      IpcResult<import('@shared/types/vector-workspace').VectorWorkspaceSettings>
    >
    saveSettings: (
      settings: Partial<import('@shared/types/vector-workspace').VectorWorkspaceSettings>
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').VectorWorkspaceSettings>>
    ragIndex: (
      projectId: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').RagIndexResult>>
    ragStatus: (
      projectId: string
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').RagStatus>>
    ragRetrieve: (
      projectId: string,
      query: string,
      topK?: number
    ) => Promise<IpcResult<import('@shared/types/vector-workspace').RagRetrieveHit[]>>
  }
  ragTraining: {
    list: (filter?: {
      scope?: import('@shared/types/scope').AppScope
      projectId?: string | null
      enabledOnly?: boolean
    }) => Promise<IpcResult<import('@shared/types/rag-training').RagTrainingDocument[]>>
    get: (
      id: string
    ) => Promise<IpcResult<import('@shared/types/rag-training').RagTrainingDocument | null>>
    create: (
      input: import('@shared/types/rag-training').CreateRagTrainingDocumentInput
    ) => Promise<IpcResult<import('@shared/types/rag-training').RagTrainingDocument>>
    update: (
      id: string,
      input: import('@shared/types/rag-training').UpdateRagTrainingDocumentInput
    ) => Promise<IpcResult<import('@shared/types/rag-training').RagTrainingDocument | null>>
    delete: (id: string) => Promise<IpcResult>
    index: (
      scope: import('@shared/types/scope').AppScope,
      projectId?: string | null
    ) => Promise<IpcResult<import('@shared/types/rag-training').RagTrainingIndexResult>>
    indexStatus: (
      scope: import('@shared/types/scope').AppScope,
      projectId?: string | null
    ) => Promise<IpcResult<import('@shared/types/rag-training').RagTrainingIndexStatus>>
    getSettings: () => Promise<IpcResult<import('@shared/types/rag-training').RagTrainingSettings>>
    saveSettings: (
      settings: Partial<import('@shared/types/rag-training').RagTrainingSettings>
    ) => Promise<IpcResult<import('@shared/types/rag-training').RagTrainingSettings>>
  }
  voice: {
    getStatus: () => Promise<IpcResult<VoiceRuntimeStatus>>
    getSettings: () => Promise<IpcResult<VoiceAssistantSettings>>
    updateSettings: (
      patch: VoiceAssistantSettingsPatch
    ) => Promise<IpcResult<VoiceAssistantSettings>>
    getModelStatus: () => Promise<IpcResult<import('@shared/types/voice-assistant').VoiceLocalModelStatus[]>>
    downloadModel: (id: import('@shared/types/voice-assistant').VoiceLocalModelId) => Promise<IpcResult>
    cancelModelDownload: (id: import('@shared/types/voice-assistant').VoiceLocalModelId) => Promise<IpcResult>
    removeModel: (id: import('@shared/types/voice-assistant').VoiceLocalModelId) => Promise<IpcResult>
    listConversations: () => Promise<IpcResult<VoiceConversationSummary[]>>
    searchConversations: (query: string) => Promise<IpcResult<VoiceConversationSummary[]>>
    getConversation: (id: string) => Promise<IpcResult<VoiceConversation>>
    createConversation: (title?: string) => Promise<IpcResult<VoiceConversation>>
    renameConversation: (id: string, title: string) => Promise<IpcResult<VoiceConversation>>
    deleteConversation: (id: string) => Promise<IpcResult>
    startListening: () => Promise<IpcResult<VoiceRuntimeStatus>>
    transcribe: (audio: VoiceAudioPayload) => Promise<IpcResult<VoiceTranscript>>
    processTurn: (
      conversationId: string | null,
      transcript: VoiceTranscript
    ) => Promise<IpcResult<VoiceTurnResult>>
    synthesize: (text: string) => Promise<IpcResult<VoiceSynthesizeResult>>
    stopSpeech: () => Promise<IpcResult>
    finishSpeaking: () => Promise<IpcResult>
    cancel: () => Promise<IpcResult>
    confirmTool: (requestId: string, approved: boolean) => Promise<IpcResult>
    clearData: () => Promise<IpcResult>
    onEvent: (callback: (event: VoiceEngineEvent) => void) => () => void
  }
  events: {
    onConversationUpdate: (callback: (data: { id: string; title: string }) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
