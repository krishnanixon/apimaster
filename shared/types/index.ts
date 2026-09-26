import type { ContextPackSummary } from './context-engine'

export type DocumentThemeId =
  | 'professional'
  | 'modern'
  | 'soft-ui'
  | 'corporate'
  | 'classic'
  | 'compact'
  | 'executive'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'lavender'
  | 'minimal'

export type LayoutPresetId =
  'normal' | 'narrow' | 'wide' | 'compact' | 'comfortable' | 'manuscript' | 'custom'

export interface DocumentPadding {
  top: number
  right: number
  bottom: number
  left: number
}

export type PageSizeId = 'a4' | 'letter' | 'legal'

export type PageOrientation = 'portrait' | 'landscape'

export interface DocumentPageSettings {
  pageSize: PageSizeId
  orientation: PageOrientation
  headerText: string
  footerText: string
  showPageNumbers: boolean
  differentFirstPage: boolean
  accentColor?: string
  pageColor?: string
  textColor?: string
  fontFamily?: string
  bodyFontSize?: number
  lineHeight?: number
  headingStyle?: 'theme' | 'accent' | 'underline' | 'plain'
  pageBorder?: 'none' | 'subtle' | 'accent'
  paragraphSpacing?: 'compact' | 'normal' | 'relaxed'
}

export interface DocumentCommentReply {
  id: string
  body: string
  author: string
  createdAt: string
}

export interface DocumentComment {
  id: string
  body: string
  author: string
  createdAt: string
  resolved: boolean
  quote: string
  replies: DocumentCommentReply[]
}

export type DocumentStyle = 'basic' | 'professional' | 'enterprise' | 'chatgpt'

export type DocumentStatus = 'draft' | 'review' | 'approved' | 'superseded'

export type DocumentLength = 'concise' | 'standard' | 'detailed' | 'comprehensive' | 'custom'

export type DocumentType =
  | 'discovery'
  | 'brd'
  | 'requirements'
  | 'functional'
  | 'non_functional'
  | 'scope'
  | 'product_definition'
  | 'prd'
  | 'user_stories'
  | 'ui_ux'
  | 'architecture'
  | 'system_design'
  | 'technical_design'
  | 'database_schema'
  | 'api_spec'
  | 'timeline'
  | 'risks'
  | 'testing'
  | 'uat'
  | 'deployment'
  | 'release_notes'
  | 'user_guide'
  | 'handover'
  | 'change_request'
  | 'contract'
  | 'proposal'
  | 'estimation_report'

export type ProjectStatus = 'active' | 'archived'

export type ThemeMode = 'light' | 'dark' | 'system'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface Project {
  id: string
  name: string
  description: string
  style: DocumentStyle
  status: ProjectStatus
  companyName: string
  companyLogo: string
  createdAt: string
  updatedAt: string
  lastOpenedAt: string
}

export interface ProjectSettings {
  id: string
  projectId: string
  aiModel: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  brandingPrimary: string
  brandingAccent: string
  /** Project-only rules for AI document generation. Empty = follow workspace/default. */
  documentGenerationRules: string
}

export interface Conversation {
  id: string
  scope: 'GLOBAL' | 'PROJECT'
  projectId: string | null
  title: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: string
}

export type ChatContextAttachmentType = 'document' | 'flow' | 'knowledge'

export interface ChatContextAttachment {
  type: ChatContextAttachmentType
  id: string
  title: string
}

export interface ChatStreamOptions {
  context?: ChatContextAttachment[]
  /** When chatting globally, optionally inject this project's knowledge and documents */
  linkedProjectId?: string | null
}

export interface Document {
  id: string
  projectId: string
  title: string
  type: DocumentType
  style: DocumentStyle
  pageTheme: DocumentThemeId
  layoutPreset: LayoutPresetId
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  pageSettings: DocumentPageSettings
  comments: DocumentComment[]
  content: string
  htmlContent: string
  isPinned: boolean
  status: DocumentStatus
  tags: string[]
  lastReviewedAt: string | null
  /** Local Word (.docx) copy path when saved beside the project. */
  exportedFilePath?: string | null
  createdAt: string
  updatedAt: string
}

/** Cross-project library row — same document plus the owning project name. */
export interface DocumentWithProject extends Document {
  projectName: string
}

export interface DocumentVersion {
  id: string
  documentId: string
  version: number
  content: string
  htmlContent: string
  label: string
  createdAt: string
}

export type DocumentWorkflowMode = 'simple' | 'expert'

export interface AppSettings {
  id: string
  theme: ThemeMode
  aiModel: string
  temperature: number
  maxTokens: number
  autoSaveMs: number
  recentProjectIds: string
  documentWorkflowMode: DocumentWorkflowMode
  exportFolderPath: string
  exportDefaultFormat: 'pdf' | 'docx'
  exportIncludeCoverPage: boolean
  exportIncludeTableOfContents: boolean
  exportIncludePageNumbers: boolean
  exportIncludeHeaderFooter: boolean
  exportCoverStyle: ExportCoverStyle
  exportTocStyle: ExportTocStyle
  exportPageNumberStyle: ExportPageNumberStyle
  exportHeaderFooterStyle: ExportHeaderFooterStyle
  exportIncludeLogo: boolean
  exportCoverAccent: string
  exportCoverSubtitle: string
  exportPreparedBy: string
  exportIncludeWatermark: boolean
  exportWatermarkStyle: ExportWatermarkStyle
  exportWatermarkText: string
  exportClassification: ExportClassification
  exportPageSize: ExportPageSize
  exportOrientation: ExportOrientation
  exportCoverBackground: string
  exportCoverOverlay: number
  exportCoverFont: string
  exportImageQuality: ExportImageQuality
  /** Workspace rules for AI document generation. Empty = built-in default behavior. */
  documentGenerationRules: string
}

/** A single recorded OpenAI API call (token usage + estimated cost). */
export interface ApiUsageRecord {
  id: string
  projectId: string | null
  feature: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
  createdAt: string
}

export interface ApiUsageModelStat {
  model: string
  requests: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
}

export interface ApiUsageFeatureStat {
  feature: string
  requests: number
  totalTokens: number
  estimatedCost: number
}

export interface ApiUsageDailyStat {
  date: string
  requests: number
  totalTokens: number
  estimatedCost: number
}

export interface ApiUsageSummary {
  totalRequests: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalCost: number
  firstRecordedAt: string | null
  lastRecordedAt: string | null
  byModel: ApiUsageModelStat[]
  byFeature: ApiUsageFeatureStat[]
  daily: ApiUsageDailyStat[]
  recent: ApiUsageRecord[]
}

export interface SearchResult {
  id: string
  entityType: string
  entityId: string
  projectId: string
  title: string
  content: string
  updatedAt: string
  /** Search result scope — populated when global search is enabled */
  scope?: 'GLOBAL' | 'PROJECT'
  module?: string
}

export type { AppScope, ModuleScope, ScopedEntity, ScopeContext } from './scope'
export type {
  ModuleCategoryId,
  ModuleTreeLevel,
  SidebarTreeDepth,
  ModulePreferences,
  ModuleDefinitionBase
} from './modules'

export interface CreateProjectInput {
  name: string
  description?: string
  style?: DocumentStyle
  companyName?: string
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  style?: DocumentStyle
  status?: ProjectStatus
  companyName?: string
  companyLogo?: string
}

export interface UpdateProjectSettingsInput {
  documentGenerationRules?: string
}

export interface CreateDocumentInput {
  projectId: string
  title?: string
  type?: DocumentType
  style?: DocumentStyle
  content?: string
  htmlContent?: string
  status?: DocumentStatus
  tags?: string[]
  pageTheme?: DocumentThemeId
  layoutPreset?: LayoutPresetId
}

export interface UpdateDocumentInput {
  title?: string
  type?: DocumentType
  style?: DocumentStyle
  pageTheme?: DocumentThemeId
  layoutPreset?: LayoutPresetId
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  pageSettings?: DocumentPageSettings
  comments?: DocumentComment[]
  content?: string
  htmlContent?: string
  isPinned?: boolean
  status?: DocumentStatus
  tags?: string[]
  lastReviewedAt?: string | null
}

export interface ChatStreamChunk {
  conversationId: string
  messageId: string
  content: string
  done: boolean
  contextPack?: ContextPackSummary
}

export type ExportCoverStyle =
  'minimal' | 'modern' | 'corporate' | 'split' | 'editorial' | 'classic' | 'bold'
export type ExportTocStyle = 'classic' | 'compact' | 'numbered'
export type ExportPageNumberStyle = 'page-total' | 'page' | 'number'
export type ExportHeaderFooterStyle = 'standard' | 'minimal' | 'branded'
export type ExportWatermarkStyle = 'confidential' | 'draft' | 'internal' | 'custom'
export type ExportClassification = 'none' | 'confidential' | 'internal' | 'draft' | 'public'
export type ExportPageSize = 'letter' | 'a4'
export type ExportOrientation = 'portrait' | 'landscape'
export type ExportImageQuality = 'high' | 'standard' | 'compact'

export interface ExportOptions {
  documentId: string
  format: 'docx' | 'pdf'
  includeCoverPage?: boolean
  includeTableOfContents?: boolean
  includePageNumbers?: boolean
  includeHeaderFooter?: boolean
  coverStyle?: ExportCoverStyle
  tocStyle?: ExportTocStyle
  pageNumberStyle?: ExportPageNumberStyle
  headerFooterStyle?: ExportHeaderFooterStyle
  includeLogo?: boolean
  coverAccent?: string
  coverSubtitle?: string
  preparedBy?: string
  includeWatermark?: boolean
  watermarkStyle?: ExportWatermarkStyle
  watermarkText?: string
  classification?: ExportClassification
  pageSize?: ExportPageSize
  orientation?: ExportOrientation
  coverBackground?: string
  coverOverlay?: number
  coverFont?: string
  imageQuality?: ExportImageQuality
  pdfPassword?: string
}

export interface ExportResult {
  success: boolean
  filePath?: string
  error?: string
}

export type ApiKeyStorageState =
  | 'not-set'
  | 'secure'
  | 'legacy-secure'
  | 'legacy-plaintext'
  | 'secure-storage-unavailable'
  | 'unreadable'

export interface ApiKeyStatus {
  isSet: boolean
  isEncryptionAvailable: boolean
  isReadable: boolean
  storageState: ApiKeyStorageState
  migrationRequired: boolean
}

export interface GenerateRequirementInput {
  projectId: string
  type: DocumentType
  style: DocumentStyle
  prompt: string
  title?: string
  conversationId?: string
  documentLength?: DocumentLength
  customWordCount?: number
  /** Approximate total word count the generated document should reach. */
  wordTarget?: number
  maxTokens?: number
  /** Prompt already includes Knowledge; skip a second full KB dump in the system prompt. */
  knowledgeAlreadyInPrompt?: boolean
}

export interface EditDocumentInput {
  htmlContent: string
  instruction: string
  title?: string
  style?: DocumentStyle
  type?: DocumentType
  projectId?: string
}

export interface EditSelectionInput {
  selectedText: string
  instruction: string
  style?: DocumentStyle
  type?: DocumentType
  projectId?: string
}

export interface EditDocumentSectionInput {
  htmlContent: string
  sectionTitle: string
  instruction: string
  title?: string
  style?: DocumentStyle
  type?: DocumentType
  projectId?: string
}

export interface EditDocumentSectionResult {
  fullHtml: string
  sectionHtml: string
}

export interface DocumentSyncSuggestion {
  documentId: string
  documentTitle: string
  documentType: DocumentType
  reason: string
  changedItems: string[]
  severity: 'low' | 'medium' | 'high'
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: string
  context?: string
}

export interface IpcResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export * from './knowledge'
export * from './flow'
export * from './flow-intelligence'
export * from './architecture'
export * from './presentation'
export * from './ai'
export * from './vault'
export * from './api-studio'
export * from './database-workspace'
export * from './diagnostics'
export * from './vector-workspace'
export * from './rag-training'
export * from './voice-assistant'
export * from './code-intel'
export * from './debug'
export * from './context-engine'
export * from './agent'
