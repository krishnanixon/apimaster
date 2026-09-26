type Handler<T> = (payload: T) => void

export interface PlatformEvents {
  PROJECT_OPENED: { rootPath: string; rootName: string }
  PROJECT_CLOSED: { rootPath: string | null }
  FILE_CHANGED: {
    path: string
    kind: 'write' | 'create' | 'rename' | 'delete'
    previousPath?: string
  }
  IGNORE_RULES_CHANGED: { customIgnoreNames: string[] }
  PROJECT_INDEX_STARTED: { rootPath: string }
  PROJECT_INDEX_PROGRESS: { status: import('@shared/types/code-intel').IndexerStatus }
  PROJECT_INDEX_COMPLETED: { rootPath: string; files: number; symbols: number }
  TERMINAL_STARTED: { id: string; command: string; cwd: string }
  TERMINAL_EXITED: { id: string; exitCode: number; durationMs: number }
}

/**
 * In-process event bus for main-process platform services.
 * Renderer traffic still goes through typed IPC.
 */
class MainEventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>()

  on<K extends keyof PlatformEvents>(event: K, handler: Handler<PlatformEvents[K]>): () => void {
    const set = this.handlers.get(event) ?? new Set()
    set.add(handler as Handler<unknown>)
    this.handlers.set(event, set)
    return () => set.delete(handler as Handler<unknown>)
  }

  emit<K extends keyof PlatformEvents>(event: K, payload: PlatformEvents[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) {
      try {
        handler(payload)
      } catch {
        // listeners must not break the emitter
      }
    }
  }
}

export const mainEventBus = new MainEventBus()
