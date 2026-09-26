import type { StateStorage } from 'zustand/middleware'
import { sanitizePersistBlob, type WorkspaceLoadResult } from '@shared/lib/workspace-document'

const SAVE_DELAY_MS = 400

let allowSave = false
let timer: ReturnType<typeof setTimeout> | null = null
let pending: string | null = null
let revision = 0
let chain: Promise<void> = Promise.resolve()
let lastLoad: WorkspaceLoadResult | null = null
let unloadBound = false

export function consumeWorkspaceLoadMeta(): WorkspaceLoadResult | null {
  const meta = lastLoad
  lastLoad = null
  return meta
}

function flushAsync(): void {
  if (pending == null || !allowSave) return
  const value = pending
  const rev = ++revision
  pending = null
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const api = window.electronAPI?.workspace
  if (!api) {
    localStorage.setItem('api-studio', value)
    return
  }
  chain = chain
    .catch(() => undefined)
    .then(async () => {
      if (rev !== revision) return
      const res = await api.save(value)
      if (!res.success) console.error(res.error ?? 'Failed to save workspace')
    })
}

function bindUnloadFlush(): void {
  if (unloadBound || typeof window === 'undefined') return
  unloadBound = true
  window.addEventListener('beforeunload', () => {
    if (!allowSave || pending == null) return
    const value = pending
    pending = null
    if (timer) clearTimeout(timer)
    timer = null
    revision += 1
    const api = window.electronAPI?.workspace
    if (api?.saveSync) api.saveSync(value)
    else localStorage.setItem('api-studio', value)
  })
}

/** Zustand storage. Disk writes are debounced and flushed on quit. */
export const workspaceStateStorage: StateStorage = {
  async getItem(name) {
    bindUnloadFlush()
    const api = typeof window !== 'undefined' ? window.electronAPI?.workspace : undefined
    if (!api) {
      allowSave = true
      return localStorage.getItem(name)
    }

    const res = await api.load()
    if (!res.success || !res.data) {
      allowSave = false
      throw new Error(res.error ?? 'Failed to load workspace')
    }
    lastLoad = res.data

    if (res.data.payload) {
      allowSave = true
      localStorage.removeItem(name)
      return res.data.payload
    }

    const legacy = localStorage.getItem(name)
    if (legacy) {
      try {
        const sanitized = JSON.stringify(sanitizePersistBlob(JSON.parse(legacy)))
        const saved = await api.save(sanitized)
        if (!saved.success) throw new Error(saved.error ?? 'Failed to migrate workspace')
        localStorage.removeItem(name)
        lastLoad = {
          ...res.data,
          source: 'primary',
          encrypted: saved.data?.encrypted ?? res.data.encrypted
        }
        allowSave = true
        return sanitized
      } catch (error) {
        allowSave = false
        throw error instanceof Error ? error : new Error('Failed to migrate workspace')
      }
    }

    allowSave = true
    return null
  },

  setItem(_name, value) {
    if (!allowSave) return
    pending = value
    if (timer) clearTimeout(timer)
    timer = setTimeout(flushAsync, SAVE_DELAY_MS)
  },

  removeItem(name) {
    pending = null
    if (typeof localStorage !== 'undefined') localStorage.removeItem(name)
  }
}
