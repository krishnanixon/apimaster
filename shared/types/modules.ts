import type { ModuleScope } from './scope'

/** Sidebar / settings grouping for modules */
export type ModuleCategoryId = 'workspace' | 'developer-tools' | 'project' | 'utility'

/** Tree depth in sidebar: 0 = flat, 1 = indented children, 2 = collapsible groups */
export type SidebarTreeDepth = 0 | 1 | 2

/** 1 = top-level module, 2 = nested under a parent */
export type ModuleTreeLevel = 1 | 2

export interface ModuleCategoryMeta {
  id: ModuleCategoryId
  label: string
  description: string
}

export interface ModuleDefinitionBase {
  id: string
  label: string
  description?: string
  category: ModuleCategoryId
  scope: ModuleScope
  treeLevel: ModuleTreeLevel
  parentId?: string
  /** Group headers have no route — they organize children in the sidebar */
  isGroup?: boolean
  /** Cannot be disabled (dashboard, projects, settings) */
  required?: boolean
  defaultEnabled: boolean
  showInSidebar?: boolean
  showInCommandPalette?: boolean
  secondary?: boolean
}

export interface ModulePreferences {
  /** moduleId → enabled; absent keys fall back to defaultEnabled */
  enabled: Record<string, boolean>
  sidebarTreeDepth: SidebarTreeDepth
}

export const DEFAULT_MODULE_PREFERENCES: ModulePreferences = {
  enabled: {},
  sidebarTreeDepth: 1
}

export const MODULE_CATEGORIES: ModuleCategoryMeta[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Home and projects'
  },
  {
    id: 'project',
    label: 'Project',
    description: 'Project-scoped modules shown when a project is open'
  },
  {
    id: 'developer-tools',
    label: 'Tools',
    description: 'Studio tools — enable or disable from Apps or Settings'
  },
  {
    id: 'utility',
    label: 'Utility',
    description: 'Application settings'
  }
]

export const SIDEBAR_TREE_DEPTH_OPTIONS: { value: SidebarTreeDepth; label: string; description: string }[] = [
  { value: 0, label: 'Flat', description: 'Top-level modules only' },
  { value: 1, label: 'Nested', description: 'Indented child modules under parents' },
  { value: 2, label: 'Full tree', description: 'Collapsible groups with nested children' }
]
