import { create } from 'zustand'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { parseDiagnostics } from '@shared/lib/diagnostics-parse'
import type { DiagnosticHit } from '@shared/types/agent'
import { pathsMatch } from '../lib/paths'

interface ProblemsState {
  items: DiagnosticHit[]
  languageItems: DiagnosticHit[]
  otherItems: DiagnosticHit[]
  loading: boolean
  error: string | null
  lastRunAt: string | null
  ingestOutput: (output: string) => void
  setLanguageItems: (path: string, items: DiagnosticHit[]) => void
  refresh: (cwd: string) => Promise<void>
  subscribeLanguage: () => () => void
  clear: () => void
}

function mergeItems(languageItems: DiagnosticHit[], otherItems: DiagnosticHit[]): DiagnosticHit[] {
  return [...languageItems, ...otherItems]
}

export const useProblemsStore = create<ProblemsState>((set, get) => ({
  items: [],
  languageItems: [],
  otherItems: [],
  loading: false,
  error: null,
  lastRunAt: null,

  ingestOutput: (output) => {
    const otherItems = parseDiagnostics(output)
    if (otherItems.length === 0) return
    const languageItems = get().languageItems
    set({
      otherItems,
      items: mergeItems(languageItems, otherItems),
      error: null,
      lastRunAt: new Date().toISOString()
    })
  },

  setLanguageItems: (path, incoming) => {
    const rest = get().languageItems.filter((item) => !item.file || !pathsMatch(path, item.file))
    const languageItems = [...rest, ...incoming]
    set({
      languageItems,
      items: mergeItems(languageItems, get().otherItems),
      lastRunAt: new Date().toISOString()
    })
  },

  subscribeLanguage: () => {
    const api = window.electronAPI?.language
    if (!api?.onDiagnostics) return () => undefined
    return api.onDiagnostics(({ path, items }) => {
      get().setLanguageItems(path, items)
    })
  },

  refresh: async (cwd) => {
    const api = await waitForDesktopApi()
    if (!cwd || !api?.terminal?.exec) return
    set({ loading: true, error: null })
    const result = await api.terminal.exec({
      id: `diag-${Date.now()}`,
      command: 'npx tsc --pretty false --noEmit --incremental false',
      cwd,
      timeoutMs: 120_000
    })
    if (!result.success || !result.data) {
      set({ loading: false, error: result.error ?? 'Failed to run diagnostics' })
      return
    }
    if (result.data.blocked) {
      set({ loading: false, error: result.data.stderr || 'Diagnostics command was blocked' })
      return
    }
    const output = `${result.data.stdout}\n${result.data.stderr}`
    const otherItems = parseDiagnostics(output)
    const languageItems = get().languageItems
    set({
      otherItems,
      items: mergeItems(languageItems, otherItems),
      loading: false,
      error:
        result.data.exitCode && result.data.exitCode !== 0 && otherItems.length === 0
          ? 'No parseable diagnostics'
          : null,
      lastRunAt: new Date().toISOString()
    })
  },

  clear: () =>
    set({ items: [], languageItems: [], otherItems: [], error: null, lastRunAt: null })
}))
