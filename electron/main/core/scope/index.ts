/** Main-process scope helpers. Mirrors renderer scope model. */
export type AppScope = 'GLOBAL' | 'PROJECT'

export function normalizeProjectId(projectId?: string | null): string | null {
  if (!projectId || projectId.trim() === '') return null
  return projectId
}

export function resolveScope(projectId?: string | null): AppScope {
  return normalizeProjectId(projectId) ? 'PROJECT' : 'GLOBAL'
}
