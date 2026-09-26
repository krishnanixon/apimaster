import type { LucideIcon } from 'lucide-react'
import {
  Home,
  FolderKanban,
  Sparkles,
  Webhook,
  Database,
  Terminal,
  Code2,
  Server,
  GitBranch,
  KeyRound,
  ClipboardList,
  StickyNote,
  LayoutDashboard,
  Brain,
  FileText,
  MessageSquare,
  BookOpen,
  Settings,
  FolderCode,
  Boxes,
  BrainCircuit,
  Files,
  LayoutTemplate,
  AppWindow,
  Network,
  Presentation
} from 'lucide-react'
import type {
  ModuleCategoryId,
  ModuleDefinitionBase,
  ModulePreferences,
  ModuleTreeLevel
} from '@shared/types/modules'
import { MODULE_CATEGORIES } from '@shared/types/modules'

export interface ModuleDefinition extends ModuleDefinitionBase {
  icon: LucideIcon
  /** Static path or project-relative segment (e.g. "chat") */
  path: string
}

/** Master registry — single source of truth for all navigable modules */
export const MODULE_REGISTRY: ModuleDefinition[] = [
  // ── Workspace ──────────────────────────────────────────────
  {
    id: 'assistant',
    label: 'New Chat',
    description: 'Global AI for coding, research, and planning',
    category: 'workspace',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/assistant',
    icon: Sparkles,
    defaultEnabled: true
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Workbench home and quick actions',
    category: 'workspace',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/dashboard',
    icon: Home,
    required: true,
    defaultEnabled: true
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Create and manage project workspaces',
    category: 'workspace',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/projects',
    icon: FolderKanban,
    required: true,
    defaultEnabled: true
  },
  {
    id: 'document-library',
    label: 'Document Library',
    description: 'Browse, edit, and export documents from every project',
    category: 'workspace',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/document-library',
    icon: Files,
    defaultEnabled: true
  },
  {
    id: 'apps',
    label: 'Apps',
    description: 'Choose studio tools and review connected services',
    category: 'workspace',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/apps',
    icon: AppWindow,
    required: true,
    defaultEnabled: true
  },
  // ── Tools (flat — enable/disable from Apps hub) ──────────
  {
    id: 'api-studio',
    label: 'API Studio',
    description: 'HTTP client and API collections',
    category: 'developer-tools',
    scope: 'HYBRID',
    treeLevel: 1,
    path: '/api-studio',
    icon: Webhook,
    defaultEnabled: true
  },
  {
    id: 'database-studio',
    label: 'Database Workbench',
    description: 'Connect, query, design, and analyze databases with AI',
    category: 'developer-tools',
    scope: 'HYBRID',
    treeLevel: 1,
    path: '/database-studio',
    icon: Database,
    defaultEnabled: true
  },
  {
    id: 'vector-studio',
    label: 'Vector Studio',
    description: 'Connect to LiteChroma, manage collections, and run similarity search',
    category: 'developer-tools',
    scope: 'HYBRID',
    treeLevel: 1,
    path: '/vector-studio',
    icon: Boxes,
    defaultEnabled: true
  },
  {
    id: 'rag-studio',
    label: 'RAG Studio',
    description: 'Training corpus and model profile for RAG across all assistants',
    category: 'developer-tools',
    scope: 'HYBRID',
    treeLevel: 1,
    path: '/rag-studio',
    icon: BrainCircuit,
    defaultEnabled: true
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Local terminal with recent folder shortcuts',
    category: 'developer-tools',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/terminal',
    icon: Terminal,
    defaultEnabled: true
  },
  {
    id: 'code-editor',
    label: 'Code Editor',
    description: 'Local folder workspace with file tree and editor',
    category: 'developer-tools',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/code-editor',
    icon: Code2,
    defaultEnabled: true
  },
  {
    id: 'vps',
    label: 'VPS',
    description: 'SSH servers and deployments',
    category: 'developer-tools',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/vps',
    icon: Server,
    defaultEnabled: true
  },
  {
    id: 'vault',
    label: 'Vault',
    description: 'Encrypted password and credential storage',
    category: 'developer-tools',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/vault',
    icon: KeyRound,
    defaultEnabled: true
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Notepad with folders and tags',
    category: 'developer-tools',
    scope: 'HYBRID',
    treeLevel: 1,
    path: '/notepad',
    icon: StickyNote,
    defaultEnabled: true
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    description: 'Clipboard history manager',
    category: 'developer-tools',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/clipboard',
    icon: ClipboardList,
    defaultEnabled: true
  },
  // ── Project ────────────────────────────────────────────────
  {
    id: 'overview',
    label: 'Overview',
    description: 'Project hub and quick links',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 1,
    path: 'overview',
    icon: LayoutDashboard,
    required: true,
    defaultEnabled: true
  },
  {
    id: 'chat',
    label: 'Project AI',
    description: 'Context-aware AI assistant',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 1,
    path: 'chat',
    icon: MessageSquare,
    defaultEnabled: true
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    description: 'Modules, requirements, and context',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 1,
    path: 'knowledge',
    icon: Brain,
    defaultEnabled: true
  },
  {
    id: 'database',
    label: 'Data model',
    description: 'Entities and data model in project knowledge',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 2,
    parentId: 'knowledge',
    path: 'knowledge',
    icon: Database,
    defaultEnabled: true,
    showInSidebar: false,
    secondary: true
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Specs and deliverables for the selected project',
    category: 'project',
    scope: 'HYBRID',
    treeLevel: 1,
    path: '/documents',
    icon: FileText,
    defaultEnabled: true
  },
  {
    id: 'generate',
    label: 'Generate Document',
    description: 'AI document generation wizard',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 2,
    parentId: 'documents',
    path: 'generate',
    icon: Sparkles,
    defaultEnabled: true,
    showInSidebar: false,
    secondary: true
  },
  {
    id: 'templates',
    label: 'Templates',
    description: 'Predefined and saved document templates',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 2,
    parentId: 'documents',
    path: 'templates',
    icon: LayoutTemplate,
    defaultEnabled: true,
    showInSidebar: true
  },
  {
    id: 'flows',
    label: 'Flow Designer',
    description: 'Process and workflow diagrams',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 1,
    path: 'flows',
    icon: GitBranch,
    defaultEnabled: true
  },
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'System and architecture diagrams',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 2,
    parentId: 'flows',
    path: 'flows',
    icon: FolderCode,
    defaultEnabled: true,
    showInSidebar: false,
    secondary: true
  },
  {
    id: 'architecture-designer',
    label: 'Architecture Designer',
    description: 'Design, validate and document system architecture',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 1,
    path: 'architecture-designer',
    icon: Network,
    defaultEnabled: true
  },
  {
    id: 'presentations',
    label: 'Presentation Studio',
    description: 'AI-generated card decks from prompts and project docs',
    category: 'project',
    scope: 'PROJECT',
    treeLevel: 1,
    path: 'presentations',
    icon: Presentation,
    defaultEnabled: true
  },

  // ── Utility ────────────────────────────────────────────────
  {
    id: 'docs',
    label: 'Documentation',
    description: 'In-app product guide',
    category: 'utility',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/docs',
    icon: BookOpen,
    defaultEnabled: true,
    secondary: true,
    // Keep existing /docs links working without exposing Documentation in
    // the application navigation or command palette.
    showInSidebar: false,
    showInCommandPalette: false
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Application preferences and connected apps',
    category: 'utility',
    scope: 'GLOBAL',
    treeLevel: 1,
    path: '/settings',
    icon: Settings,
    required: true,
    defaultEnabled: true,
    secondary: true
  }
]

export function getModuleById(id: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id)
}

export function getModulesByCategory(category: ModuleCategoryId): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.category === category)
}

/**
 * Project sidebar items the user can show/hide from Settings.
 * Includes nested children that appear in the sidebar (e.g. Templates).
 */
export function getSelectableProjectMenuModules(): ModuleDefinition[] {
  return MODULE_REGISTRY.filter(
    (m) =>
      m.category === 'project' &&
      !m.required &&
      !m.isGroup &&
      m.showInSidebar !== false
  ).sort((a, b) => {
    const aParent = a.parentId ? 1 : 0
    const bParent = b.parentId ? 1 : 0
    if (aParent !== bParent && a.parentId === b.id) return 1
    if (aParent !== bParent && b.parentId === a.id) return -1
    const order = MODULE_REGISTRY.map((m) => m.id)
    return order.indexOf(a.id) - order.indexOf(b.id)
  })
}

export function isModuleEnabled(
  module: ModuleDefinition,
  preferences: ModulePreferences
): boolean {
  if (module.required) return true
  if (module.id in preferences.enabled) return preferences.enabled[module.id]
  return module.defaultEnabled
}

/** Respects parent group/module visibility */
export function isModuleVisible(
  module: ModuleDefinition,
  preferences: ModulePreferences
): boolean {
  if (!isModuleEnabled(module, preferences)) return false
  if (module.parentId) {
    const parent = getModuleById(module.parentId)
    if (parent && !isModuleEnabled(parent, preferences)) return false
  }
  return true
}

/**
 * Absolute-path HYBRID modules that also mount under `/project/:id/<segment>`.
 * Keep in sync with App.tsx project routes.
 */
const HYBRID_PROJECT_ABSOLUTE_SEGMENTS = new Set([
  'database-studio',
  'vector-studio',
  'rag-studio',
  'api-studio',
  'documents'
])

export function resolveModulePath(module: ModuleDefinition, projectId?: string): string {
  if (module.isGroup || !module.path) return ''
  if (module.path.startsWith('/')) {
    if (projectId && module.scope === 'HYBRID') {
      const segment = module.path.replace(/^\//, '').split('/')[0]
      if (segment && HYBRID_PROJECT_ABSOLUTE_SEGMENTS.has(segment)) {
        return `/project/${projectId}/${segment}`
      }
    }
    return module.path
  }
  if (projectId) return `/project/${projectId}/${module.path}`
  return `/${module.path}`
}

export interface NavTreeNode {
  module: ModuleDefinition
  children: NavTreeNode[]
}

function hasEnabledDescendant(node: NavTreeNode, preferences: ModulePreferences): boolean {
  if (!node.module.isGroup && isModuleEnabled(node.module, preferences)) return true
  return node.children.some((c) => hasEnabledDescendant(c, preferences))
}

function isSidebarModule(module: ModuleDefinition): boolean {
  return module.showInSidebar !== false
}

function buildTreeForCategory(
  category: ModuleCategoryId,
  preferences: ModulePreferences,
  _projectId?: string
): NavTreeNode[] {
  const modules = getModulesByCategory(category).filter(
    (m) => isModuleVisible(m, preferences) && isSidebarModule(m)
  )

  const level1 = modules.filter((m) => m.treeLevel === 1)

  function attachChildren(parent: ModuleDefinition): NavTreeNode[] {
    const children = modules
      .filter((m) => m.parentId === parent.id)
      .map((m) => ({ module: m, children: attachChildren(m) }))
      .filter((n) => hasEnabledDescendant(n, preferences))

    return children
  }

  return level1
    .map((m) => ({ module: m, children: attachChildren(m) }))
    .filter((n) => hasEnabledDescendant(n, preferences))
}

/** Flat list of routable modules for command palette */
export function getEnabledModules(
  preferences: ModulePreferences,
  options?: { category?: ModuleCategoryId; projectId?: string; commandPalette?: boolean }
): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => {
    if (m.isGroup) return false
    if (!isModuleVisible(m, preferences)) return false
    if (options?.category && m.category !== options.category) return false
    if (options?.commandPalette === true && m.showInCommandPalette === false) return false
    if (m.category === 'project' && !options?.projectId) return false
    return true
  })
}

/** Sidebar tree: Workspace → Project → Tools → Assistant → Utility (no duplicates) */
export function buildSidebarNav(
  preferences: ModulePreferences,
  options: { projectId?: string }
): { category: ModuleCategoryMeta; nodes: NavTreeNode[] }[] {
  const depth = preferences.sidebarTreeDepth
  const tree = (categoryId: ModuleCategoryId) =>
    flattenForDepth(buildTreeForCategory(categoryId, preferences, options.projectId), depth)

  const workspaceMeta = MODULE_CATEGORIES.find((c) => c.id === 'workspace')!
  const toolsMeta = MODULE_CATEGORIES.find((c) => c.id === 'developer-tools')!
  const projectMeta = MODULE_CATEGORIES.find((c) => c.id === 'project')!
  const utilityMeta = MODULE_CATEGORIES.find((c) => c.id === 'utility')!

  const workspaceNodes = tree('workspace')
  // Keep New Chat above the main Workspace items, then show project and tools.
  const primaryWorkspace = workspaceNodes.filter((n) => n.module.id !== 'assistant')
  const assistantNodes = workspaceNodes.filter((n) => n.module.id === 'assistant')
  const toolsNodes = tree('developer-tools')
  const projectNodes = options.projectId ? tree('project') : []
  const utilityNodes = tree('utility')

  const sections: { category: ModuleCategoryMeta; nodes: NavTreeNode[] }[] = []

  if (assistantNodes.length > 0) {
    sections.push({
      category: { id: 'workspace', label: '', description: 'AI assistant' },
      nodes: assistantNodes
    })
  }
  if (primaryWorkspace.length > 0) {
    sections.push({ category: workspaceMeta, nodes: primaryWorkspace })
  }
  if (projectNodes.length > 0) {
    sections.push({ category: projectMeta, nodes: projectNodes })
  }
  if (toolsNodes.length > 0) {
    sections.push({ category: toolsMeta, nodes: toolsNodes })
  }
  if (utilityNodes.length > 0) {
    sections.push({ category: utilityMeta, nodes: utilityNodes })
  }

  return sections
}

function flattenForDepth(nodes: NavTreeNode[], depth: ModulePreferences['sidebarTreeDepth']): NavTreeNode[] {
  if (depth === 0) {
    return nodes.flatMap((n) => {
      const routable: NavTreeNode[] = []
      if (!n.module.isGroup) routable.push({ module: n.module, children: [] })
      for (const c of n.children) {
        if (!c.module.isGroup) routable.push({ module: c.module, children: [] })
        else routable.push(...c.children.map((gc) => ({ module: gc.module, children: [] })))
      }
      return routable
    })
  }
  return nodes
}

export function getCategoryLabel(id: ModuleCategoryId): string {
  return MODULE_CATEGORIES.find((c) => c.id === id)?.label ?? id
}

export function getModulesForSettingsTree(category: ModuleCategoryId): ModuleDefinition[] {
  const items = getModulesByCategory(category)
  const result: ModuleDefinition[] = []

  function walk(parentId: string | undefined, level: ModuleTreeLevel) {
    const siblings = items.filter((m) => m.parentId === parentId && m.treeLevel === level)
    for (const m of siblings) {
      result.push(m)
      walk(m.id, 2)
    }
  }

  walk(undefined, 1)
  return result
}
