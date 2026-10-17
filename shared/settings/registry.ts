import type { SettingsDomainDefinition, SettingsTabId } from './types'

/** Every setting domain in the app — single maintenance map */
export const SETTINGS_DOMAINS: SettingsDomainDefinition[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Your name, avatar, and a calendar of your activity.',
    storage: { kind: 'userData', userDataFile: 'data/profile.json' },
    centralized: true,
    settingsTab: 'profile'
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
    id: 'network',
    label: 'Network',
    description: 'Proxy, SSL certificates, client certificates, and the cookie jar.',
    storage: { kind: 'userData', userDataFile: 'data/network.json' },
    centralized: true,
    settingsTab: 'network'
  },
  {
    id: 'ai',
    label: 'AI',
    description: 'Provider mode, models, API keys, and fallbacks.',
    storage: { kind: 'userData', userDataFile: 'ai-provider-config.json' },
    centralized: true,
    settingsTab: 'ai'
  },
  {
    id: 'mcp',
    label: 'MCP',
    description: 'Let Claude, Cursor, and other agents use your live collections.',
    storage: { kind: 'userData', userDataFile: 'data/mcp-server.json' },
    centralized: true,
    settingsTab: 'mcp'
  },
  {
    id: 'usage',
    label: 'Usage',
    description: 'AI token usage and estimated cost.',
    storage: { kind: 'userData', userDataFile: 'usage.json' },
    centralized: true,
    settingsTab: 'usage'
  },
  {
    id: 'about',
    label: 'About',
    description: 'Product info and terms.',
    storage: { kind: 'userData', userDataFile: 'settings.json' },
    centralized: true,
    settingsTab: 'about'
  },
  {
    id: 'api-studio',
    label: 'Shurikly',
    description: 'Collections, requests, and environments.',
    storage: { kind: 'userData', userDataFile: 'data/workspace.json' },
    centralized: false
  }
]

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'profile'

export const SETTINGS_TAB_IDS: SettingsTabId[] = SETTINGS_DOMAINS.filter(
  (d) => d.centralized && d.settingsTab
).map((d) => d.settingsTab!)

export function isSettingsTabId(value: string | null | undefined): value is SettingsTabId {
  return value != null && SETTINGS_TAB_IDS.includes(value as SettingsTabId)
}

export function normalizeSettingsTab(value: string | null | undefined): SettingsTabId {
  return isSettingsTabId(value) ? value : DEFAULT_SETTINGS_TAB
}

export function getCentralizedSettingsDomains(): SettingsDomainDefinition[] {
  return SETTINGS_DOMAINS.filter((d) => d.centralized)
}

export function getSettingsTabMeta(tabId: SettingsTabId): SettingsDomainDefinition | undefined {
  return SETTINGS_DOMAINS.find((d) => d.settingsTab === tabId)
}
