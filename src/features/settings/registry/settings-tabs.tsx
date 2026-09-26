import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Palette, Info, Sparkles, BarChart3, Cable } from 'lucide-react'
import type { SettingsTabId } from '@shared/settings'
import { getCentralizedSettingsDomains } from '@shared/settings'
import { AboutPanel } from '@/features/settings/panels/AboutPanel'
import { UsageDashboard } from '@/features/settings/components/UsageDashboard'
import { ThemeStudio } from '@/features/settings/components/ThemeStudio'
import { AISettings } from '@/features/ai/components/AISettings'
import { McpSettings } from '@/features/settings/components/McpSettings'

export type SettingsGroupId = 'workspace' | 'intelligence' | 'help'

export interface SettingsTabEntry {
  id: SettingsTabId
  label: string
  description: string
  group: SettingsGroupId
  icon: LucideIcon
  /** Extra search terms so users can find a setting without knowing its tab */
  keywords: string[]
  Panel: ComponentType<{ global?: boolean }>
}

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'intelligence', label: 'AI' },
  { id: 'help', label: 'Help' }
]

const TAB_META: Record<
  SettingsTabId,
  {
    icon: LucideIcon
    group: SettingsGroupId
    keywords: string[]
    Panel: ComponentType<{ global?: boolean }>
  }
> = {
  appearance: {
    icon: Palette,
    group: 'workspace',
    keywords: [
      'theme',
      'dark',
      'light',
      'color',
      'accent',
      'font',
      'density',
      'motion',
      'contrast'
    ],
    Panel: () => <ThemeStudio />
  },
  ai: {
    icon: Sparkles,
    group: 'intelligence',
    keywords: [
      'api key',
      'openai',
      'anthropic',
      'claude',
      'gemini',
      'ollama',
      'model',
      'temperature',
      'tokens',
      'provider'
    ],
    Panel: () => <AISettings />
  },
  mcp: {
    icon: Cable,
    group: 'intelligence',
    keywords: [
      'mcp',
      'claude',
      'cursor',
      'agent',
      'model context protocol',
      'desktop',
      'tool'
    ],
    Panel: () => <McpSettings />
  },
  usage: {
    icon: BarChart3,
    group: 'intelligence',
    keywords: ['cost', 'spend', 'tokens', 'billing', 'requests'],
    Panel: () => <UsageDashboard />
  },
  about: {
    icon: Info,
    group: 'help',
    keywords: ['version', 'terms', 'license', 'privacy'],
    Panel: AboutPanel
  }
}

/** Renderer tab registry — icons + panels wired to shared/settings metadata */
export const SETTINGS_TABS: SettingsTabEntry[] = getCentralizedSettingsDomains()
  .filter(
    (domain): domain is typeof domain & { settingsTab: SettingsTabId } => domain.settingsTab != null
  )
  .map((domain) => ({
    id: domain.settingsTab,
    label: domain.label,
    description: domain.description ?? '',
    ...TAB_META[domain.settingsTab]
  }))
  // Keep sidebar order stable by group, then by registry order within a group
  .sort(
    (a, b) =>
      SETTINGS_GROUPS.findIndex((g) => g.id === a.group) -
      SETTINGS_GROUPS.findIndex((g) => g.id === b.group)
  )

export function getSettingsTabEntry(id: SettingsTabId): SettingsTabEntry | undefined {
  return SETTINGS_TABS.find((tab) => tab.id === id)
}

export function searchSettingsTabs(query: string): SettingsTabEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return SETTINGS_TABS
  return SETTINGS_TABS.filter((tab) =>
    [tab.label, tab.description, ...tab.keywords].some((text) => text.toLowerCase().includes(q))
  )
}
