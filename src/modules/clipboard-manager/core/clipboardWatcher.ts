import { clipboard } from 'electron'
import { normalizeClipboardText } from './clipboardEngine'

export type ClipboardChangeHandler = (content: string) => void

export interface ClipboardWatcherOptions {
  intervalMs?: number
  onChange: ClipboardChangeHandler
}

const TEXT_FORMAT_HINTS = ['text', 'utf8', 'string', 'plain']

export class ClipboardWatcher {
  private interval: ReturnType<typeof setInterval> | null = null
  private lastValue = ''
  private suppressNext = false
  private readonly intervalMs: number
  private readonly onChange: ClipboardChangeHandler

  constructor(options: ClipboardWatcherOptions) {
    this.intervalMs = options.intervalMs ?? 500
    this.onChange = options.onChange
  }

  start(): void {
    if (this.interval) return
    this.lastValue = ''
    this.interval = setInterval(() => this.poll(), this.intervalMs)
    this.poll()
  }

  stop(): void {
    if (!this.interval) return
    clearInterval(this.interval)
    this.interval = null
  }

  writeText(content: string): void {
    const normalized = normalizeClipboardText(content)
    clipboard.writeText(normalized)
    this.lastValue = normalized
    this.suppressNext = true
  }

  readCurrentText(): string {
    return this.readClipboard()
  }

  private readClipboard(): string {
    try {
      const primary = normalizeClipboardText(clipboard.readText('clipboard'))
      if (primary) return primary

      // X11 primary selection — Linux only. Skip elsewhere to avoid extra OS calls.
      if (process.platform === 'linux') {
        const selection = normalizeClipboardText(clipboard.readText('selection'))
        if (selection) return selection
      }

      const formats = clipboard.availableFormats('clipboard')
      for (const format of formats) {
        const lower = format.toLowerCase()
        const looksLikeText = TEXT_FORMAT_HINTS.some((hint) => lower.includes(hint))
        if (!looksLikeText) continue

        try {
          const value = normalizeClipboardText(clipboard.read(format))
          if (value) return value
        } catch {
          // Try the next clipboard format.
        }
      }

      return ''
    } catch {
      return ''
    }
  }

  private poll(): void {
    const current = this.readClipboard()
    if (!current) return

    if (this.suppressNext) {
      if (current === this.lastValue) {
        this.suppressNext = false
      }
      return
    }

    if (current === this.lastValue) return

    this.lastValue = current
    this.onChange(current)
  }
}
