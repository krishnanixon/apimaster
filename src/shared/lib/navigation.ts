/**
 * Navigation helpers — backed by the module registry and user preferences.
 * @see module-registry.ts for the master module list.
 */
import type { LucideIcon } from 'lucide-react'
import type { ModuleScope } from '@shared/types/scope'
import type { ModulePreferences } from '@shared/types/modules'
import {
  MODULE_REGISTRY,
  buildSidebarNav,
  getEnabledModules,
  resolveModulePath,
  type ModuleDefinition,
  type NavTreeNode
} from '@/shared/lib/module-registry'
import { MODULE_CATEGORIES } from '@shared/types/modules'

export interface NavItem {
  id: string
  to: string
  icon: LucideIcon
  label: string
  desc?: string
  scope: ModuleScope
  secondary?: boolean
}

function toNavItem(module: ModuleDefinition, projectId?: string): NavItem {
  return {
    id: module.id,
    to: resolveModulePath(module, projectId),
    icon: module.icon,
    label: module.label,
    desc: module.description,
    scope: module.scope,
    secondary: module.secondary
  }
}

/** @deprecated Use buildSidebarNav with module preferences */
export const workspaceNav: NavItem[] = MODULE_REGISTRY.filter((m) => m.category === 'workspace' && !m.isGroup).map(
  (m) => toNavItem(m)
)

/** @deprecated Use buildSidebarNav with module preferences */
export const developerToolsNav: NavItem[] = MODULE_REGISTRY.filter(
  (m) => m.category === 'developer-tools' && !m.isGroup
).map((m) => toNavItem(m))

/** @deprecated Use buildSidebarNav with module preferences */
export function projectNav(projectId: string): NavItem[] {
  return MODULE_REGISTRY.filter((m) => m.category === 'project' && !m.isGroup && !m.secondary).map((m) =>
    toNavItem(m, projectId)
  )
}

/** @deprecated Use getEnabledModules with commandPalette option */
export function projectSecondaryNav(projectId: string): NavItem[] {
  return MODULE_REGISTRY.filter((m) => m.category === 'project' && m.secondary && !m.isGroup).map((m) =>
    toNavItem(m, projectId)
  )
}

/** @deprecated Use buildSidebarNav with module preferences */
export const utilityNav: NavItem[] = MODULE_REGISTRY.filter((m) => m.category === 'utility' && !m.isGroup).map(
  (m) => toNavItem(m)
)

export function getSidebarNavigation(
  preferences: ModulePreferences,
  projectId?: string
): { categoryId: string; categoryLabel: string; nodes: NavTreeNode[] }[] {
  return buildSidebarNav(preferences, { projectId }).map(({ category, nodes }) => ({
    categoryId: category.id,
    categoryLabel: category.label,
    nodes
  }))
}

/** Project workspace windows only list project modules. */
export function getProjectWindowNavigation(
  preferences: ModulePreferences,
  projectId: string
): { categoryId: string; categoryLabel: string; nodes: NavTreeNode[] }[] {
  return buildSidebarNav(preferences, { projectId })
    .filter((section) => section.category.id === 'project')
    .map(({ category, nodes }) => ({
      categoryId: category.id,
      categoryLabel: category.label,
      nodes
    }))
}

export function getCommandPaletteByCategory(
  preferences: ModulePreferences,
  projectId?: string
): { categoryLabel: string; categoryId: string; items: NavItem[] }[] {
  const categories = MODULE_CATEGORIES.filter((c) => {
    if (c.id === 'project') return Boolean(projectId)
    return true
  })

  return categories
    .map((cat) => ({
      categoryLabel: cat.label,
      categoryId: cat.id,
      items: getEnabledModules(preferences, { category: cat.id, projectId, commandPalette: true }).map((m) =>
        toNavItem(m, projectId)
      )
    }))
    .filter((g) => g.items.length > 0)
}

export function getProjectCommandPalette(
  preferences: ModulePreferences,
  projectId: string
): { categoryLabel: string; categoryId: string; items: NavItem[] }[] {
  return [
    {
      categoryLabel: 'Project',
      categoryId: 'project',
      items: getEnabledModules(preferences, { category: 'project', projectId, commandPalette: true }).map((m) =>
        toNavItem(m, projectId)
      )
    }
  ].filter((g) => g.items.length > 0)
}

export function getCommandPaletteModules(
  preferences: ModulePreferences,
  projectId?: string
): NavItem[] {
  const categories = projectId
    ? (['workspace', 'project', 'developer-tools', 'utility'] as const)
    : (['workspace', 'developer-tools', 'utility'] as const)

  return categories.flatMap((cat) =>
    getEnabledModules(preferences, { category: cat, projectId, commandPalette: true }).map((m) =>
      toNavItem(m, projectId)
    )
  )
}

export function resolveNavPath(item: NavItem, projectId?: string): string {
  if (item.to.includes(':projectId') && projectId) {
    return item.to.replace(':projectId', projectId)
  }
  return item.to
}

export type { NavTreeNode, ModuleDefinition }
