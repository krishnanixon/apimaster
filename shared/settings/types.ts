/** Settings tabs shown in the global Settings UI */
export type SettingsTabId =
  | 'general'
  | 'apps'
  | 'database'
  | 'vector'
  | 'ai'
  | 'voice'
  | 'usage'
  | 'appearance'
  | 'export'
  | 'about'

/** Legacy alias — redirects to apps */
export type LegacySettingsTabId = SettingsTabId | 'modules'

export type SettingsStorageKind = 'sqlite' | 'localStorage' | 'userData' | 'ipc'

export interface SettingsStorageRef {
  kind: SettingsStorageKind
  /** SQLite table or Prisma model name */
  table?: string
  /** localStorage key for Zustand persist */
  localStorageKey?: string
  /** userData JSON filename (main process) */
  userDataFile?: string
}

export interface SettingsDomainDefinition {
  /** Tab id for centralized domains; module id for in-place domains */
  id: string
  label: string
  description?: string
  storage: SettingsStorageRef
  /** Owning module when settings live in a studio tool */
  moduleId?: string
  /** When true, surfaced in /settings */
  centralized: boolean
  /** Deep-link tab for Apps hub (centralized domains only) */
  settingsTab?: SettingsTabId
}

export interface SettingsTabDefinition {
  id: SettingsTabId
  label: string
  description: string
  maxWidth?: 'xl' | '3xl' | 'full'
}
