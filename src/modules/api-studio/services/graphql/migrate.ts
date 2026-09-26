import type { ApiHistoryEntry, ApiRequest } from '../../types/api.types'
import { WORKSPACE_SCHEMA_VERSION, normalizeStoredRequest } from './model'

export { WORKSPACE_SCHEMA_VERSION }

interface WorkspaceShape {
  collections?: { requests?: ApiRequest[] }[]
  tabs?: { request?: ApiRequest }[]
  history?: ApiHistoryEntry[]
}

function normalizeList(requests: ApiRequest[] | undefined): void {
  if (!Array.isArray(requests)) return
  for (let index = 0; index < requests.length; index += 1) {
    requests[index] = normalizeStoredRequest(requests[index])
  }
}

/**
 * Workspace migration for GraphQL requests.
 * Existing HTTP and WebSocket requests keep their fields. Safe to run more than once.
 */
export function migrateWorkspaceState<T>(persisted: T, version: number): T {
  if (version >= WORKSPACE_SCHEMA_VERSION) return persisted
  if (!persisted || typeof persisted !== 'object') return persisted

  const state = persisted as T & WorkspaceShape
  for (const collection of state.collections ?? []) {
    normalizeList(collection?.requests)
  }
  for (const tab of state.tabs ?? []) {
    if (tab?.request) tab.request = normalizeStoredRequest(tab.request)
  }
  for (const entry of state.history ?? []) {
    if (entry?.request) entry.request = normalizeStoredRequest(entry.request)
  }
  return state
}
