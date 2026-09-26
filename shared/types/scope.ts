/** Application scope system — every module belongs to GLOBAL, PROJECT, or HYBRID. */

export type AppScope = 'GLOBAL' | 'PROJECT'

/** Module classification for navigation and data access rules. */
export type ModuleScope = AppScope | 'HYBRID'

export interface ScopedEntity {
  id: string
  scope: AppScope
  /** null when scope is GLOBAL */
  projectId: string | null
  createdAt: string
  updatedAt: string
  createdBy?: string
  modifiedBy?: string
}

export interface ScopeContext {
  scope: AppScope
  projectId: string | null
  isProjectScoped: boolean
}

export function createScopeContext(projectId?: string | null): ScopeContext {
  const id = projectId ?? null
  return {
    scope: id ? 'PROJECT' : 'GLOBAL',
    projectId: id,
    isProjectScoped: Boolean(id)
  }
}

export function scopedProjectId(scope: AppScope, projectId?: string | null): string | null {
  if (scope === 'GLOBAL') return null
  return projectId ?? null
}

export function isValidScopePair(scope: AppScope, projectId: string | null): boolean {
  if (scope === 'GLOBAL') return projectId === null
  return projectId !== null
}
