import type { ApiHistoryEntry } from '../types/api-studio'
import { redactRequest } from './redact-secrets'

/** Hard cap for the serialized workspace sent over IPC and written to disk. */
export const WORKSPACE_PAYLOAD_MAX_CHARS = 20_000_000

export const WORKSPACE_FILE_NAME = 'workspace.json'

export interface WorkspaceLoadResult {
  payload: string | null
  source: 'primary' | 'backup' | 'none'
  restored: boolean
  encrypted: boolean
}

export interface WorkspaceSaveResult {
  encrypted: boolean
}

/** Drop file bytes. Names and content types stay so the UI can ask for a re-attach. */
export function stripFileBytes<T>(value: T): T {
  return walk(value) as T
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'fileBase64') continue
    out[key] = walk(child)
  }
  return out
}

/**
 * Shape written by Zustand persist: file bytes removed, history credentials removed.
 * Collections and environments keep their secrets; those live only in the workspace file.
 */
export function prepareWorkspacePersistState<T extends { history?: ApiHistoryEntry[] }>(state: T): T {
  const stripped = stripFileBytes(state)
  if (!Array.isArray(stripped.history)) return stripped
  return {
    ...stripped,
    history: stripped.history.map((entry) =>
      entry?.request ? { ...entry, request: redactRequest(entry.request) } : entry
    )
  }
}

/** Sanitize a Zustand `{ state, version }` blob before it is written. */
export function sanitizePersistBlob(blob: unknown): unknown {
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return blob
  const record = blob as { state?: { history?: ApiHistoryEntry[] } }
  if (!record.state || typeof record.state !== 'object' || Array.isArray(record.state)) {
    return stripFileBytes(blob)
  }
  return {
    ...record,
    state: prepareWorkspacePersistState(record.state)
  }
}
