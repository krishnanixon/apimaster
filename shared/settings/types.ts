/** Settings tabs shown in the global Settings UI */
export type SettingsTabId = 'profile' | 'appearance' | 'ai' | 'mcp' | 'usage' | 'about'

export type SettingsStorageKind = 'localStorage' | 'userData' | 'ipc'

export interface SettingsStorageRef {
  kind: SettingsStorageKind
  /** localStorage key for Zustand persist */
  localStorageKey?: string
  /** userData JSON filename (main process) */
  userDataFile?: string
}

export interface SettingsDomainDefinition {
  id: string
  label: string
  description?: string
  storage: SettingsStorageRef
  /** When true, surfaced in /settings */
  centralized: boolean
  settingsTab?: SettingsTabId
}
