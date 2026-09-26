import type { SaveStatus } from '../types/note.types'

type SaveCallback = () => Promise<void>
type StatusListener = (status: SaveStatus, error?: string) => void

export class AutosaveService {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private pending = new Map<string, SaveCallback>()
  private listeners = new Map<string, Set<StatusListener>>()
  private debounceMs: number

  constructor(debounceMs = 3000) {
    this.debounceMs = debounceMs
  }

  schedule(noteId: string, saveFn: SaveCallback): void {
    this.pending.set(noteId, saveFn)
    this.notify(noteId, 'idle')

    const existing = this.timers.get(noteId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      void this.flush(noteId)
    }, this.debounceMs)

    this.timers.set(noteId, timer)
  }

  async flush(noteId: string): Promise<void> {
    const saveFn = this.pending.get(noteId)
    if (!saveFn) return

    this.notify(noteId, 'saving')

    try {
      await saveFn()
      this.pending.delete(noteId)
      this.notify(noteId, 'saved')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      this.notify(noteId, 'error', message)
    }
  }

  async flushAll(): Promise<void> {
    const ids = [...this.pending.keys()]
    await Promise.all(ids.map((id) => this.flush(id)))
  }

  cancel(noteId: string): void {
    const timer = this.timers.get(noteId)
    if (timer) clearTimeout(timer)
    this.timers.delete(noteId)
    this.pending.delete(noteId)
  }

  subscribe(noteId: string, listener: StatusListener): () => void {
    if (!this.listeners.has(noteId)) {
      this.listeners.set(noteId, new Set())
    }
    this.listeners.get(noteId)!.add(listener)

    return () => {
      this.listeners.get(noteId)?.delete(listener)
    }
  }

  private notify(noteId: string, status: SaveStatus, error?: string): void {
    for (const listener of this.listeners.get(noteId) ?? []) {
      listener(status, error)
    }
  }
}

export const autosaveService = new AutosaveService(3000)
