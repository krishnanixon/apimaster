import { existsSync } from 'fs'
import { dirname } from 'path'
import { randomUUID } from 'crypto'
import {
  applySingleHunk,
  applyUnifiedDiff,
  createUnifiedDiff,
  pathFromDiff,
  rejectHunkFromDiff
} from '@shared/lib/unified-diff'
import type { AgentPatchRecord } from '@shared/types/agent'
import { codeEditorService } from '../code-editor/code-editor.service'
import { workspaceStateService } from '../code-editor/workspace-state.service'
import { workspaceSession } from '../security/workspace-session'

const history: AgentPatchRecord[] = []
const overlay = new Map<string, string>()
const deletedOverlay = new Set<string>()
const checkpointPatches = new Map<string, string[]>()
let hydratedRoot: string | null = null

export function beginPatchCheckpoint(runId: string): void {
  checkpointPatches.set(runId, [])
  persistPendingPatches()
}

export function trackCheckpointPatch(runId: string, patchId: string): void {
  const ids = checkpointPatches.get(runId) ?? []
  if (!ids.includes(patchId)) ids.push(patchId)
  checkpointPatches.set(runId, ids)
  persistPendingPatches()
}

export async function restorePatchCheckpoint(runId: string): Promise<AgentPatchRecord[]> {
  const ids = checkpointPatches.get(runId)
  if (!ids) throw new Error('Checkpoint is no longer available.')
  const restored: AgentPatchRecord[] = []
  for (const id of [...ids].reverse()) {
    const record = await revertPatchById(id)
    if (record) restored.push(record)
  }
  checkpointPatches.delete(runId)
  persistPendingPatches()
  return restored
}

function relPath(abs: string, fallback: string): string {
  const root = workspaceSession.requireRoot()
  return abs.replace(root, '').replace(/^[\\/]/, '').replace(/\\/g, '/') || fallback.replace(/\\/g, '/')
}

function overlayKey(abs: string): string {
  return abs.replace(/\\/g, '/').toLowerCase()
}

function pendingRecords(): AgentPatchRecord[] {
  return history.filter((item) => item.status === 'pending')
}

function persistPendingPatches(): void {
  const root = workspaceSession.getRoot()
  if (!root) return
  const current = workspaceStateService.get()
  const conversation = current.agentConversation
  const sameRoot =
    conversation?.workspaceRoot.replace(/\\/g, '/').toLowerCase() === root.replace(/\\/g, '/').toLowerCase()
  const checkpoints: Record<string, string[]> = {}
  for (const [runId, ids] of checkpointPatches) {
    if (ids.length > 0) checkpoints[runId] = [...ids]
  }
  workspaceStateService.save({
    agentConversation: {
      workspaceRoot: sameRoot && conversation ? conversation.workspaceRoot : root,
      activeConversationId: sameRoot ? conversation?.activeConversationId : undefined,
      conversations: sameRoot ? conversation?.conversations : undefined,
      mode: sameRoot ? conversation?.mode : undefined,
      thread: sameRoot ? conversation?.thread : undefined,
      attached: sameRoot ? conversation?.attached : undefined,
      updatedAt: new Date().toISOString(),
      pendingPatches: pendingRecords().map((record) => ({ ...record })),
      checkpointPatches: checkpoints
    }
  })
}

function remember(record: AgentPatchRecord): AgentPatchRecord {
  const existing = history.findIndex((item) => item.path === record.path && item.status === 'pending')
  if (existing >= 0) {
    history.splice(existing, 1)
  }
  history.unshift(record)
  persistPendingPatches()
  return record
}

async function diskContents(abs: string): Promise<string> {
  try {
    return await codeEditorService.readFile(abs)
  } catch {
    return ''
  }
}

export function pendingPatchCount(): number {
  return pendingRecords().length
}

export function clearPatchEngine(): void {
  history.length = 0
  overlay.clear()
  deletedOverlay.clear()
  checkpointPatches.clear()
  hydratedRoot = null
}

/** Restore staged overlays from workspace persistence after opening a folder. */
export function hydratePendingPatches(rootPath: string): AgentPatchRecord[] {
  const normalized = rootPath.replace(/\\/g, '/').toLowerCase()
  if (hydratedRoot === normalized) return pendingRecords()
  clearPatchEngine()
  hydratedRoot = normalized
  const saved = workspaceStateService.get().agentConversation
  if (!saved || saved.workspaceRoot.replace(/\\/g, '/').toLowerCase() !== normalized) {
    return []
  }
  const pending = Array.isArray(saved.pendingPatches) ? saved.pendingPatches : []
  for (const record of pending) {
    if (!record || record.status !== 'pending' || typeof record.path !== 'string') continue
    try {
      const abs = workspaceSession.resolve(record.path)
      const key = overlayKey(abs)
      if (record.deleted) {
        deletedOverlay.add(key)
      } else {
        overlay.set(key, record.next)
      }
      history.push({
        ...record,
        status: 'pending',
        path: relPath(abs, record.path)
      })
    } catch {
      // Skip patches that no longer resolve inside the workspace.
    }
  }
  const checkpoints = saved.checkpointPatches
  if (checkpoints && typeof checkpoints === 'object') {
    for (const [runId, ids] of Object.entries(checkpoints)) {
      if (Array.isArray(ids) && ids.length > 0) checkpointPatches.set(runId, [...ids])
    }
  }
  return pendingRecords()
}

export async function readWithOverlay(path: string): Promise<string> {
  const abs = workspaceSession.resolve(path)
  const key = overlayKey(abs)
  if (deletedOverlay.has(key)) {
    throw new Error(`File is staged for deletion: ${relPath(abs, path)}`)
  }
  const staged = overlay.get(key)
  if (staged !== undefined) return staged
  return codeEditorService.readFile(abs)
}

export async function stageAgentPatch(input: {
  path?: string
  diff: string
}): Promise<AgentPatchRecord> {
  const relative = input.path || pathFromDiff(input.diff)
  if (!relative) throw new Error('Patch is missing a file path.')
  const abs = workspaceSession.resolve(relative)
  const key = overlayKey(abs)
  deletedOverlay.delete(key)
  const previousOnDisk = await diskContents(abs)
  const pending = history.find((item) => item.path === relPath(abs, relative) && item.status === 'pending')
  const base = overlay.get(key) ?? previousOnDisk
  const next = applyUnifiedDiff(base, input.diff)
  overlay.set(key, next)
  return remember({
    id: pending?.id ?? randomUUID(),
    path: relPath(abs, relative),
    previous: pending?.previous ?? previousOnDisk,
    next,
    diff: createUnifiedDiff(relPath(abs, relative), pending?.previous ?? previousOnDisk, next),
    appliedAt: new Date().toISOString(),
    status: 'pending',
    created: pending?.created ?? !existsSync(abs),
    deleted: false
  })
}

export async function stageAgentWrite(path: string, content: string): Promise<AgentPatchRecord> {
  const abs = workspaceSession.resolve(path)
  const key = overlayKey(abs)
  deletedOverlay.delete(key)
  const previousOnDisk = await diskContents(abs)
  const pending = history.find((item) => item.path === relPath(abs, path) && item.status === 'pending')
  overlay.set(key, content)
  return remember({
    id: pending?.id ?? randomUUID(),
    path: relPath(abs, path),
    previous: pending?.previous ?? previousOnDisk,
    next: content,
    diff: createUnifiedDiff(relPath(abs, path), pending?.previous ?? previousOnDisk, content),
    appliedAt: new Date().toISOString(),
    status: 'pending',
    created: pending?.created ?? !existsSync(abs),
    deleted: false
  })
}

export async function stageAgentDelete(path: string): Promise<AgentPatchRecord> {
  const abs = workspaceSession.resolve(path)
  const key = overlayKey(abs)
  if (!existsSync(abs) && !overlay.has(key)) {
    throw new Error(`File not found: ${path}`)
  }
  const previousOnDisk = await diskContents(abs)
  const pending = history.find((item) => item.path === relPath(abs, path) && item.status === 'pending')
  const previous = pending?.previous ?? previousOnDisk
  overlay.delete(key)
  deletedOverlay.add(key)
  const rel = relPath(abs, path)
  return remember({
    id: pending?.id ?? randomUUID(),
    path: rel,
    previous,
    next: '',
    diff: createUnifiedDiff(rel, previous, ''),
    appliedAt: new Date().toISOString(),
    status: 'pending',
    created: false,
    deleted: true
  })
}

export async function commitPatch(id: string): Promise<AgentPatchRecord | null> {
  const record = history.find((item) => item.id === id)
  if (!record || record.status !== 'pending') return null
  const abs = workspaceSession.resolve(record.path)
  const key = overlayKey(abs)

  if (record.deleted) {
    if (existsSync(abs)) await codeEditorService.deleteEntry(abs)
    deletedOverlay.delete(key)
    record.status = 'applied'
    record.appliedAt = new Date().toISOString()
    persistPendingPatches()
    return record
  }

  if (!existsSync(abs)) {
    const parent = dirname(abs)
    try {
      await codeEditorService.createEntry({
        parentPath: parent,
        name: abs.replace(/\\/g, '/').split('/').pop() ?? record.path,
        kind: 'file'
      })
    } catch {
      // writeFile will create the file if the parent exists
    }
  }
  await codeEditorService.writeFile(abs, record.next)
  record.status = 'applied'
  record.appliedAt = new Date().toISOString()
  overlay.delete(key)
  persistPendingPatches()
  return record
}

export async function commitAllPending(): Promise<AgentPatchRecord[]> {
  const pending = history.filter((item) => item.status === 'pending').slice().reverse()
  const committed: AgentPatchRecord[] = []
  for (const item of pending) {
    const record = await commitPatch(item.id)
    if (record) committed.push(record)
  }
  return committed
}

/** Accept one hunk: write that change to disk and keep remaining hunks staged. */
export async function acceptHunk(id: string, hunkIndex: number): Promise<AgentPatchRecord | null> {
  const record = history.find((item) => item.id === id)
  if (!record || record.status !== 'pending') return null
  if (record.deleted) return commitPatch(id)

  const abs = workspaceSession.resolve(record.path)
  const key = overlayKey(abs)
  const afterOne = applySingleHunk(record.previous, record.diff, hunkIndex)
  if (!existsSync(abs) && record.created) {
    try {
      await codeEditorService.createEntry({
        parentPath: dirname(abs),
        name: abs.replace(/\\/g, '/').split('/').pop() ?? record.path,
        kind: 'file'
      })
    } catch {
      // parent may already exist
    }
  }
  await codeEditorService.writeFile(abs, afterOne)

  const finalNext = record.next
  if (afterOne === finalNext) {
    record.previous = afterOne
    record.next = afterOne
    record.diff = createUnifiedDiff(record.path, afterOne, afterOne)
    record.status = 'applied'
    record.appliedAt = new Date().toISOString()
    overlay.delete(key)
    persistPendingPatches()
    return record
  }

  record.previous = afterOne
  record.next = finalNext
  record.diff = createUnifiedDiff(record.path, afterOne, finalNext)
  record.created = false
  overlay.set(key, finalNext)
  persistPendingPatches()
  return record
}

/** Drop one hunk from a pending patch without writing to disk. */
export async function rejectHunk(id: string, hunkIndex: number): Promise<AgentPatchRecord | null> {
  const index = history.findIndex((item) => item.id === id)
  if (index < 0) return null
  const record = history[index]
  if (!record || record.status !== 'pending') return null
  if (record.deleted) return revertPatchById(id)

  const abs = workspaceSession.resolve(record.path)
  const key = overlayKey(abs)
  const result = rejectHunkFromDiff(record.path, record.previous, record.diff, hunkIndex)
  if (!result) {
    overlay.delete(key)
    record.status = 'rejected'
    history.splice(index, 1)
    persistPendingPatches()
    return record
  }
  record.next = result.next
  record.diff = result.diff
  overlay.set(key, result.next)
  persistPendingPatches()
  return record
}

/** @deprecated use stageAgentPatch — kept so older call sites still type-check during the transition. */
export async function applyAgentPatch(input: { path?: string; diff: string }): Promise<AgentPatchRecord> {
  return stageAgentPatch(input)
}

/** @deprecated use stageAgentWrite */
export async function writeAgentFile(path: string, content: string): Promise<AgentPatchRecord> {
  return stageAgentWrite(path, content)
}

export async function revertLastPatch(): Promise<AgentPatchRecord | null> {
  const record = history.find((item) => item.status === 'pending' || item.status === 'applied')
  if (!record) return null
  return revertPatchById(record.id)
}

export async function revertPatchById(id: string): Promise<AgentPatchRecord | null> {
  const index = history.findIndex((item) => item.id === id)
  if (index < 0) return null
  const record = history[index]
  if (!record) return null
  const abs = workspaceSession.resolve(record.path)
  const key = overlayKey(abs)
  if (record.status === 'pending') {
    overlay.delete(key)
    deletedOverlay.delete(key)
    record.status = 'rejected'
    history.splice(index, 1)
    persistPendingPatches()
    return record
  }
  if (record.status !== 'applied') return null
  if (record.deleted) {
    // Restore deleted file contents.
    if (!existsSync(abs)) {
      try {
        await codeEditorService.createEntry({
          parentPath: dirname(abs),
          name: abs.replace(/\\/g, '/').split('/').pop() ?? record.path,
          kind: 'file'
        })
      } catch {
        // continue to write
      }
    }
    await codeEditorService.writeFile(abs, record.previous)
  } else if (record.created && existsSync(abs)) {
    await codeEditorService.deleteEntry(abs)
  } else {
    await codeEditorService.writeFile(abs, record.previous)
  }
  overlay.delete(key)
  deletedOverlay.delete(key)
  history.splice(index, 1)
  persistPendingPatches()
  return record
}

export function lastPatches(limit = 24): AgentPatchRecord[] {
  return history.filter((item) => item.status !== 'rejected').slice(0, limit)
}
