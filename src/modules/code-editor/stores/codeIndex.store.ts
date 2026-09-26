import { create } from 'zustand'
import type { CodeSearchHit, CodeSearchMode, IndexerStatus } from '@shared/types/code-intel'
import { getDesktopApi } from '@/shared/lib/desktop-api'

function codeIndexApi() {
  return getDesktopApi()?.codeIndex
}

interface CodeIndexState {
  status: IndexerStatus | null
  query: string
  mode: CodeSearchMode
  hits: CodeSearchHit[]
  searching: boolean
  error: string | null

  hydrate: () => Promise<void>
  subscribe: () => () => void
  setQuery: (query: string) => void
  setMode: (mode: CodeSearchMode) => void
  search: () => Promise<void>
  start: () => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
}

const idleStatus: IndexerStatus = {
  state: 'idle',
  rootPath: null,
  total: 0,
  processed: 0,
  skipped: 0,
  files: 0,
  symbols: 0
}

export const useCodeIndexStore = create<CodeIndexState>((set, get) => ({
  status: null,
  query: '',
  mode: 'text',
  hits: [],
  searching: false,
  error: null,

  reset: () =>
    set({
      status: idleStatus,
      query: '',
      mode: 'text',
      hits: [],
      searching: false,
      error: null
    }),

  hydrate: async () => {
    const api = codeIndexApi()
    if (!api) return
    const result = await api.getStatus()
    if (result.success && result.data) set({ status: result.data })
  },

  subscribe: () => {
    const api = codeIndexApi()
    if (!api?.onProgress) return () => undefined
    void get().hydrate()
    return api.onProgress((status) => {
      set({ status })
    })
  },

  setQuery: (query) => set({ query }),

  setMode: (mode) => set({ mode }),

  search: async () => {
    const { query, mode } = get()
    const trimmed = query.trim()
    if (!trimmed) {
      set({ hits: [], searching: false, error: null })
      return
    }
    set({ searching: true, error: null })
    const api = codeIndexApi()
    if (!api) {
      set({ searching: false, error: 'Code index is unavailable. Restart the app to load it.' })
      return
    }
    try {
      const result =
        mode === 'regex'
          ? await api.searchRegex(trimmed)
          : mode === 'symbol'
            ? await api.searchSymbol(trimmed)
            : mode === 'reference'
              ? await api.searchReference(trimmed)
              : await api.searchText(trimmed)
      if (!result.success) {
        set({ searching: false, hits: [], error: result.error ?? 'Search failed' })
        return
      }
      set({ searching: false, hits: result.data ?? [], error: null })
    } catch {
      set({ searching: false, error: 'Search failed' })
    }
  },

  start: async () => {
    const api = codeIndexApi()
    if (!api) {
      set({ error: 'Code index is unavailable. Restart the app to load it.' })
      return
    }
    const result = await api.start()
    if (result.success && result.data) set({ status: result.data, error: null })
    else set({ error: result.error ?? 'Failed to start indexing' })
  },

  cancel: async () => {
    const api = codeIndexApi()
    if (!api) return
    const result = await api.cancel()
    if (result.success && result.data) set({ status: result.data })
  }
}))
