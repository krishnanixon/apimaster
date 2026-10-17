export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppSettings {
  id: string
  theme: ThemeMode
  aiModel: string
  temperature: number
  maxTokens: number
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

export * from './ai'
export * from './api-studio'
export * from './diagnostics'
export * from './mock-server'
export * from './ai-engineer'
export * from './profile'
export * from './code-scanner'
