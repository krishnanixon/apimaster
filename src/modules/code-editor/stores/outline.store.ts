import { create } from 'zustand'
import type { IndexedSymbol } from '@shared/types/code-intel'
import { getDesktopApi } from '@/shared/lib/desktop-api'

interface OutlineState {
  path: string | null
  symbols: IndexedSymbol[]
  loading: boolean
  load: (path: string | null) => Promise<void>
  clear: () => void
  /** Innermost symbol enclosing the given 1-based line, used by the breadcrumb bar. */
  symbolAtLine: (line: number) => IndexedSymbol | null
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  path: null,
  symbols: [],
  loading: false,

  load: async (path) => {
    if (!path) {
      set({ path: null, symbols: [], loading: false })
      return
    }
    const api = getDesktopApi()?.codeIndex
    if (!api?.fileSymbols) return
    set({ path, loading: true })
    const result = await api.fileSymbols(path)
    if (get().path !== path) return
    set({ symbols: result.success ? (result.data ?? []) : [], loading: false })
  },

  clear: () => set({ path: null, symbols: [], loading: false }),

  symbolAtLine: (line) => {
    let best: IndexedSymbol | null = null
    for (const symbol of get().symbols) {
      if (symbol.startLine > line || symbol.endLine < line) continue
      if (!best || symbol.endLine - symbol.startLine < best.endLine - best.startLine) best = symbol
    }
    return best
  }
}))
