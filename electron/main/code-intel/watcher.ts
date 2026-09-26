import { watch, type FSWatcher } from 'fs'
import { isAbsolute, join, relative } from 'path'
import type { IgnoreRuleSet } from '@shared/lib/ignore-rules'
import { isIgnoredPath } from '@shared/lib/ignore-rules'
import { isIndexableSourceFile } from '@shared/lib/language-detect'

type WatchHandler = (path: string, kind: 'change' | 'rename') => void

/**
 * Debounced recursive watcher. Uses fs.watch({ recursive }) which is supported
 * on Windows and macOS. Linux falls back to watching the root only.
 */
export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  start(rootPath: string, rules: IgnoreRuleSet, onChange: WatchHandler, debounceMs = 400): void {
    this.stop()
    const recursive = process.platform === 'win32' || process.platform === 'darwin'
    try {
      this.watcher = watch(rootPath, { recursive }, (_event, filename) => {
        if (!filename) return
        const full = isAbsolute(filename) ? filename : join(rootPath, filename.toString())
        const rel = relative(rootPath, full)
        if (rel.startsWith('..')) return
        if (isIgnoredPath(rootPath, full, rules)) return
        if (!isIndexableSourceFile(full) && _event !== 'rename') return
        const existing = this.timers.get(full)
        if (existing) clearTimeout(existing)
        this.timers.set(
          full,
          setTimeout(() => {
            this.timers.delete(full)
            onChange(full, _event === 'rename' ? 'rename' : 'change')
          }, debounceMs)
        )
      })
    } catch {
      this.watcher = null
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.watcher?.close()
    this.watcher = null
  }
}
