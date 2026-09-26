import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  BrainCircuit,
  ClipboardList,
  Code2,
  Database,
  FileText,
  Files,
  KeyRound,
  Server,
  Sparkles,
  StickyNote,
  Terminal,
  Webhook
} from 'lucide-react'
import type {
  AppCatalogCategory,
  AppConnectionStatus,
  AppConnectionStatusId,
  AppDefinitionBase,
  AppKind
} from '@shared/types/apps'
import { APP_CATALOG_CATEGORIES } from '@shared/types/apps'
import type { SettingsTabId } from '@shared/settings'
import { resolveAppSettingsTab } from '@shared/settings'
import type { ModulePreferences } from '@shared/types/modules'
import { getModuleById, isModuleEnabled, MODULE_REGISTRY } from '@/shared/lib/module-registry'

export interface AppDefinition extends AppDefinitionBase {
  icon: LucideIcon
}

/** Resolve Settings deep-link tab from registry (optional per-app override) */
export function getAppSettingsTab(app: AppDefinition): SettingsTabId {
  return (
    resolveAppSettingsTab({
      moduleId: app.moduleId,
      integrationId: app.integrationId,
      settingsTab: app.settingsTab
    }) ?? 'apps'
  )
}

/** Built-in studio tools selectable from the Apps hub */
const BUILTIN_APPS: AppDefinition[] = [
  {
    id: 'app-api-studio',
    kind: 'builtin',
    moduleId: 'api-studio',
    label: 'API Studio',
    description: 'HTTP client and API collections',
    catalogCategory: 'development',
    openPath: '/api-studio',
    selectable: true,
    defaultEnabled: true,
    icon: Webhook
  },
  {
    id: 'app-database-studio',
    kind: 'builtin',
    moduleId: 'database-studio',
    label: 'Database Workbench',
    description: 'Connect, query, design, and analyze databases',
    catalogCategory: 'data',
    openPath: '/database-studio',
    selectable: true,
    defaultEnabled: true,
    icon: Database
  },
  {
    id: 'app-vector-studio',
    kind: 'builtin',
    moduleId: 'vector-studio',
    label: 'Vector Studio',
    description: 'Collections and similarity search',
    catalogCategory: 'data',
    openPath: '/vector-studio',
    selectable: true,
    defaultEnabled: true,
    icon: Boxes
  },
  {
    id: 'app-rag-studio',
    kind: 'builtin',
    moduleId: 'rag-studio',
    label: 'RAG Studio',
    description: 'Training corpus and RAG model profiles',
    catalogCategory: 'data',
    openPath: '/rag-studio',
    selectable: true,
    defaultEnabled: true,
    icon: BrainCircuit
  },
  {
    id: 'app-terminal',
    kind: 'builtin',
    moduleId: 'terminal',
    label: 'Terminal',
    description: 'Local terminal with folder shortcuts',
    catalogCategory: 'development',
    openPath: '/terminal',
    selectable: true,
    defaultEnabled: true,
    icon: Terminal
  },
  {
    id: 'app-code-editor',
    kind: 'builtin',
    moduleId: 'code-editor',
    label: 'Code Editor',
    description: 'Local folder workspace with file tree',
    catalogCategory: 'development',
    openPath: '/code-editor',
    selectable: true,
    defaultEnabled: true,
    icon: Code2
  },
  {
    id: 'app-vps',
    kind: 'builtin',
    moduleId: 'vps',
    label: 'VPS Manager',
    description: 'SSH servers and deployments',
    catalogCategory: 'ops',
    openPath: '/vps',
    selectable: true,
    defaultEnabled: true,
    icon: Server
  },
  {
    id: 'app-vault',
    kind: 'builtin',
    moduleId: 'vault',
    label: 'Vault',
    description: 'Encrypted password and credential storage',
    catalogCategory: 'ops',
    openPath: '/vault',
    selectable: true,
    defaultEnabled: true,
    icon: KeyRound
  },
  {
    id: 'app-notes',
    kind: 'builtin',
    moduleId: 'notes',
    label: 'Notes',
    description: 'Notepad with folders and tags',
    catalogCategory: 'productivity',
    openPath: '/notepad',
    selectable: true,
    defaultEnabled: true,
    icon: StickyNote
  },
  {
    id: 'app-clipboard',
    kind: 'builtin',
    moduleId: 'clipboard',
    label: 'Clipboard',
    description: 'Clipboard history manager',
    catalogCategory: 'productivity',
    openPath: '/clipboard',
    selectable: true,
    defaultEnabled: true,
    icon: ClipboardList
  },
  {
    id: 'app-documents',
    kind: 'builtin',
    moduleId: 'documents',
    label: 'Documents',
    description: 'Create and manage documents for the selected project',
    catalogCategory: 'productivity',
    openPath: '/documents',
    selectable: true,
    defaultEnabled: true,
    icon: FileText
  },
  {
    id: 'app-document-library',
    kind: 'builtin',
    moduleId: 'document-library',
    label: 'Document Library',
    description: 'Browse, edit, and export documents from every project',
    catalogCategory: 'productivity',
    openPath: '/document-library',
    selectable: true,
    defaultEnabled: true,
    icon: Files
  },
  {
    id: 'app-assistant',
    kind: 'builtin',
    moduleId: 'assistant',
    label: 'New Chat',
    description: 'Global AI for coding, research, and planning',
    catalogCategory: 'ai',
    openPath: '/assistant',
    selectable: true,
    defaultEnabled: true,
    icon: Sparkles
  }
]

/** Existing provider integrations — configure in Settings, status shown in Apps */
const INTEGRATION_APPS: AppDefinition[] = [
  {
    id: 'integration-ai',
    kind: 'integration',
    integrationId: 'ai',
    label: 'AI Providers',
    description: 'OpenAI and Ollama model providers used across the studio',
    catalogCategory: 'connections',
    openPath: '/assistant',
    selectable: false,
    icon: Sparkles
  },
  {
    id: 'integration-database',
    kind: 'integration',
    integrationId: 'database',
    label: 'Databases (SQL & NoSQL)',
    description: 'PostgreSQL, MySQL, MariaDB, SQL Server, CockroachDB, SQLite and MongoDB connection profiles',
    catalogCategory: 'connections',
    openPath: '/database-studio',
    selectable: false,
    icon: Database
  },
  {
    id: 'integration-vector',
    kind: 'integration',
    integrationId: 'vector',
    label: 'Vector Database',
    description: 'LiteChroma connection profiles for embeddings and search',
    catalogCategory: 'connections',
    openPath: '/vector-studio',
    selectable: false,
    icon: Boxes
  },
  {
    id: 'integration-vps',
    kind: 'integration',
    integrationId: 'vps',
    label: 'VPS / SSH',
    description: 'Remote servers managed through the VPS Manager',
    catalogCategory: 'connections',
    openPath: '/vps',
    selectable: false,
    icon: Server
  }
]

export const APP_CATALOG: AppDefinition[] = [...BUILTIN_APPS, ...INTEGRATION_APPS]

export function getAppById(id: string): AppDefinition | undefined {
  return APP_CATALOG.find((app) => app.id === id)
}

export function getAppsByKind(kind: AppKind): AppDefinition[] {
  return APP_CATALOG.filter((app) => app.kind === kind)
}

export function getAppsByCatalogCategory(category: AppCatalogCategory): AppDefinition[] {
  return APP_CATALOG.filter((app) => app.catalogCategory === category)
}

export function isBuiltinAppEnabled(
  app: AppDefinition,
  preferences: ModulePreferences
): boolean {
  if (app.kind !== 'builtin' || !app.moduleId) return false
  const mod = getModuleById(app.moduleId)
  if (!mod) return false
  return isModuleEnabled(mod, preferences)
}

export function filterAppCatalog(options: {
  query?: string
  kind?: AppKind | 'all'
  category?: AppCatalogCategory | 'all'
  enabledOnly?: boolean
  preferences?: ModulePreferences
}): AppDefinition[] {
  const q = options.query?.trim().toLowerCase() ?? ''
  return APP_CATALOG.filter((app) => {
    if (options.kind && options.kind !== 'all' && app.kind !== options.kind) return false
    if (options.category && options.category !== 'all' && app.catalogCategory !== options.category) {
      return false
    }
    if (options.enabledOnly && options.preferences) {
      if (app.kind === 'integration') return true
      if (!isBuiltinAppEnabled(app, options.preferences)) return false
    }
    if (!q) return true
    return (
      app.label.toLowerCase().includes(q) ||
      app.description.toLowerCase().includes(q) ||
      app.catalogCategory.includes(q)
    )
  })
}

export function groupAppsByCatalogCategory(
  apps: AppDefinition[]
): { category: (typeof APP_CATALOG_CATEGORIES)[number]; apps: AppDefinition[] }[] {
  return APP_CATALOG_CATEGORIES.map((category) => ({
    category,
    apps: apps.filter((app) => app.catalogCategory === category.id)
  })).filter((group) => group.apps.length > 0)
}

const STATUS_META: Record<
  AppConnectionStatusId,
  Pick<AppConnectionStatus, 'label' | 'tone'>
> = {
  'not-configured': { label: 'Not configured', tone: 'neutral' },
  configured: { label: 'Configured', tone: 'info' },
  available: { label: 'Available', tone: 'success' },
  'last-check-healthy': { label: 'Last check healthy', tone: 'success' },
  'last-check-offline': { label: 'Last check offline', tone: 'warning' },
  selected: { label: 'Selected', tone: 'info' },
  'connected-reported': { label: 'Connected (reported)', tone: 'success' },
  connecting: { label: 'Connecting', tone: 'info' },
  disconnected: { label: 'Disconnected', tone: 'neutral' },
  error: { label: 'Error', tone: 'destructive' }
}

export function makeConnectionStatus(
  id: AppConnectionStatusId,
  detail?: string
): AppConnectionStatus {
  return { id, ...STATUS_META[id], detail }
}

/** Map AI provider store snapshot into a truthful status */
export function mapAiIntegrationStatus(input: {
  providers: Array<{ configured?: boolean; online?: boolean; implemented?: boolean }>
  hasApiKey?: boolean
}): AppConnectionStatus {
  const implemented = input.providers.filter((p) => p.implemented !== false)
  const configured =
    implemented.some((p) => p.configured) || Boolean(input.hasApiKey)
  if (!configured) return makeConnectionStatus('not-configured', 'Add an API key or start Ollama')
  const online = implemented.some((p) => p.online)
  if (online) return makeConnectionStatus('available', 'Provider health check succeeded recently')
  return makeConnectionStatus('configured', 'Provider configured — run a health check to verify')
}

/** Map DB/Vector connection lists into a truthful status */
export function mapProfileIntegrationStatus(input: {
  profileCount: number
  activeConnectionId?: string | null
  healthyCount?: number
  offlineCount?: number
}): AppConnectionStatus {
  if (input.profileCount <= 0) {
    return makeConnectionStatus('not-configured', 'No connection profiles yet')
  }
  if (input.activeConnectionId) {
    return makeConnectionStatus(
      'selected',
      'A profile is selected in this workspace (may need reconnect after restart)'
    )
  }
  if ((input.healthyCount ?? 0) > 0) {
    return makeConnectionStatus(
      'last-check-healthy',
      `${input.healthyCount} profile(s) passed the last health check`
    )
  }
  if ((input.offlineCount ?? 0) > 0) {
    return makeConnectionStatus(
      'last-check-offline',
      `${input.offlineCount} profile(s) failed the last health check`
    )
  }
  return makeConnectionStatus('configured', `${input.profileCount} profile(s) saved`)
}

/** Map VPS server list into a truthful status */
export function mapVpsIntegrationStatus(input: {
  serverCount: number
  connectedCount?: number
  connectingCount?: number
  errorCount?: number
}): AppConnectionStatus {
  if (input.serverCount <= 0) {
    return makeConnectionStatus('not-configured', 'No SSH servers configured')
  }
  if ((input.connectingCount ?? 0) > 0) {
    return makeConnectionStatus('connecting', 'A connection attempt is in progress')
  }
  if ((input.connectedCount ?? 0) > 0) {
    return makeConnectionStatus(
      'connected-reported',
      `${input.connectedCount} server(s) report connected`
    )
  }
  if ((input.errorCount ?? 0) > 0) {
    return makeConnectionStatus('error', `${input.errorCount} server(s) reported an error`)
  }
  return makeConnectionStatus('configured', `${input.serverCount} server(s) configured`)
}

/** Developer-tool module ids that appear under Tools when enabled */
export function getSelectableToolModuleIds(): string[] {
  return BUILTIN_APPS.filter((a) => a.selectable && a.moduleId && a.moduleId !== 'assistant').map(
    (a) => a.moduleId!
  )
}

export function getEnabledToolModules(preferences: ModulePreferences) {
  return getSelectableToolModuleIds()
    .map((id) => getModuleById(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m) && isModuleEnabled(m!, preferences))
}

export { APP_CATALOG_CATEGORIES, MODULE_REGISTRY }
