import type { SettingsTabId } from '@shared/settings'

/** Unified catalog kinds for the Apps hub */
export type AppKind = 'builtin' | 'integration'

/** High-level grouping shown in the Apps catalog */
export type AppCatalogCategory =
  | 'workspace'
  | 'development'
  | 'data'
  | 'ops'
  | 'productivity'
  | 'ai'
  | 'connections'

/**
 * Truthful connection / configuration vocabulary.
 * Avoid claiming live connectivity from stale persisted IDs alone.
 */
export type AppConnectionStatusId =
  | 'not-configured'
  | 'configured'
  | 'available'
  | 'last-check-healthy'
  | 'last-check-offline'
  | 'selected'
  | 'connected-reported'
  | 'connecting'
  | 'disconnected'
  | 'error'

export interface AppConnectionStatus {
  id: AppConnectionStatusId
  label: string
  detail?: string
  /** Visual tone for badges */
  tone: 'neutral' | 'success' | 'warning' | 'info' | 'destructive'
}

export interface AppDefinitionBase {
  id: string
  kind: AppKind
  label: string
  description: string
  catalogCategory: AppCatalogCategory
  /** Built-in modules map to MODULE_REGISTRY ids */
  moduleId?: string
  /** Integration keys (ai, database, vector, vps) */
  integrationId?: 'ai' | 'database' | 'vector' | 'vps'
  /** Open the tool / workspace */
  openPath?: string
  /** Optional override — defaults resolved via @shared/settings registry */
  settingsTab?: SettingsTabId | 'modules'
  /** Can be enabled/disabled via modules store */
  selectable?: boolean
  required?: boolean
  defaultEnabled?: boolean
}

export const APP_CATALOG_CATEGORIES: {
  id: AppCatalogCategory
  label: string
  description: string
}[] = [
  { id: 'workspace', label: 'Workspace', description: 'Home, projects, and studio shell' },
  { id: 'development', label: 'Development', description: 'API, code, and terminal tools' },
  { id: 'data', label: 'Data', description: 'Databases, vectors, and RAG' },
  { id: 'ops', label: 'Operations', description: 'Servers and secrets' },
  { id: 'productivity', label: 'Productivity', description: 'Notes and clipboard' },
  { id: 'ai', label: 'AI', description: 'Assistants and model providers' },
  { id: 'connections', label: 'Connections', description: 'External services and providers' }
]
