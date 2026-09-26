import type { SettingsDomainDefinition, SettingsTabId } from './types'

/** Centralized + in-place setting domains — single maintenance map */
export const SETTINGS_DOMAINS: SettingsDomainDefinition[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Application-wide editor behavior and data preferences.',
    storage: { kind: 'sqlite', table: 'AppSettings' },
    centralized: true,
    settingsTab: 'general'
  },
  {
    id: 'apps',
    label: 'Apps & connections',
    description: 'Toggle project menus and studio tools; view integration status.',
    storage: { kind: 'localStorage', localStorageKey: 'ai-workbench-modules' },
    centralized: true,
    settingsTab: 'apps'
  },
  {
    id: 'database',
    label: 'Database Workbench',
    description: 'Connection profiles, query defaults, and workspace behavior.',
    storage: { kind: 'sqlite', table: 'DbWorkspaceSettings' },
    moduleId: 'database-studio',
    centralized: true,
    settingsTab: 'database'
  },
  {
    id: 'vector',
    label: 'Vector Database',
    description: 'LiteChroma connections and search defaults.',
    storage: { kind: 'sqlite', table: 'VectorWorkspaceSettings' },
    moduleId: 'vector-studio',
    centralized: true,
    settingsTab: 'vector'
  },
  {
    id: 'ai',
    label: 'AI',
    description: 'Provider mode, models, API keys, and fallbacks.',
    storage: { kind: 'userData', userDataFile: 'ai-provider-config.json' },
    moduleId: 'assistant',
    centralized: true,
    settingsTab: 'ai'
  },
  {
    id: 'voice',
    label: 'Voice & Tess',
    description: 'Tess, dictation, speech models, playback, and memory.',
    storage: { kind: 'userData', userDataFile: 'voice-assistant-settings.json' },
    centralized: true,
    settingsTab: 'voice'
  },
  {
    id: 'usage',
    label: 'Usage',
    description: 'OpenAI API token usage and estimated cost.',
    storage: { kind: 'sqlite', table: 'ApiUsageRecord' },
    centralized: true,
    settingsTab: 'usage'
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme mode, accent, layout, and visual customization.',
    storage: { kind: 'localStorage', localStorageKey: 'ai-studio-ui' },
    centralized: true,
    settingsTab: 'appearance'
  },
  {
    id: 'export',
    label: 'Export',
    description: 'Default options for PDF and DOCX exports.',
    storage: { kind: 'sqlite', table: 'AppSettings' },
    centralized: true,
    settingsTab: 'export'
  },
  {
    id: 'about',
    label: 'About',
    description: 'Product info and terms.',
    storage: { kind: 'sqlite', table: 'AppSettings' },
    centralized: true,
    settingsTab: 'about'
  },
  // ── In-place (quick update — stay in module) ─────────────────
  {
    id: 'code-editor',
    label: 'Code Editor',
    description: 'Font, wrap, minimap, and AI completions.',
    storage: { kind: 'localStorage', localStorageKey: 'workbench-editor-settings' },
    moduleId: 'code-editor',
    centralized: false
  },
  {
    id: 'api-studio',
    label: 'API Studio',
    description: 'Collections, requests, and environments.',
    storage: { kind: 'localStorage', localStorageKey: 'api-studio' },
    moduleId: 'api-studio',
    centralized: false
  },
  {
    id: 'architecture-designer',
    label: 'Architecture Designer',
    description: 'Panel layout persistence.',
    storage: { kind: 'localStorage', localStorageKey: 'architecture-designer-layout' },
    moduleId: 'architecture-designer',
    centralized: false
  },
  {
    id: 'project',
    label: 'Project settings',
    description: 'Per-project AI model, branding, and generation rules.',
    storage: { kind: 'sqlite', table: 'ProjectSettings' },
    centralized: false
  }
]

const MODULE_SETTINGS_TAB: Partial<Record<string, SettingsTabId>> = {
  assistant: 'ai',
  'database-studio': 'database',
  'vector-studio': 'vector'
}

const INTEGRATION_SETTINGS_TAB: Record<string, SettingsTabId> = {
  ai: 'ai',
  database: 'database',
  vector: 'vector',
  vps: 'apps'
}

export const SETTINGS_TAB_IDS: SettingsTabId[] = SETTINGS_DOMAINS.filter(
  (d) => d.centralized && d.settingsTab
).map((d) => d.settingsTab!)

export function isSettingsTabId(value: string | null | undefined): value is SettingsTabId {
  return value != null && SETTINGS_TAB_IDS.includes(value as SettingsTabId)
}

/** Normalize legacy ?tab=modules to apps */
export function normalizeSettingsTab(value: string | null | undefined): SettingsTabId {
  if (value === 'modules') return 'apps'
  return isSettingsTabId(value) ? value : 'general'
}

export function getCentralizedSettingsDomains(): SettingsDomainDefinition[] {
  return SETTINGS_DOMAINS.filter((d) => d.centralized)
}

export function getInPlaceSettingsDomains(): SettingsDomainDefinition[] {
  return SETTINGS_DOMAINS.filter((d) => !d.centralized)
}

export function getSettingsDomainById(id: string): SettingsDomainDefinition | undefined {
  return SETTINGS_DOMAINS.find((d) => d.id === id)
}

export function getSettingsTabForModule(moduleId: string): SettingsTabId {
  return MODULE_SETTINGS_TAB[moduleId] ?? 'apps'
}

export function getSettingsTabForIntegration(
  integrationId: 'ai' | 'database' | 'vector' | 'vps'
): SettingsTabId {
  return INTEGRATION_SETTINGS_TAB[integrationId] ?? 'apps'
}

/** Resolve deep-link tab for Apps catalog entries */
export function resolveAppSettingsTab(input: {
  moduleId?: string
  integrationId?: 'ai' | 'database' | 'vector' | 'vps'
  settingsTab?: SettingsTabId | 'modules'
}): SettingsTabId | undefined {
  if (input.settingsTab) {
    return input.settingsTab === 'modules' ? 'apps' : input.settingsTab
  }
  if (input.integrationId) return getSettingsTabForIntegration(input.integrationId)
  if (input.moduleId) return getSettingsTabForModule(input.moduleId)
  return undefined
}

export function getSettingsTabMeta(tabId: SettingsTabId): SettingsDomainDefinition | undefined {
  return SETTINGS_DOMAINS.find((d) => d.settingsTab === tabId)
}
