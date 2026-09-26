import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface NavHistoryEntry {
  moduleId: string
  path: string
  label: string
  description?: string
  projectId?: string
  projectName?: string
  visitedAt: number
}

const MAX_ENTRIES = 14

interface NavHistoryState {
  entries: NavHistoryEntry[]
  recordVisit: (entry: Omit<NavHistoryEntry, 'visitedAt'>) => void
  clearHistory: () => void
}

export const useNavHistoryStore = create<NavHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      recordVisit: (entry) => {
        const visitedAt = Date.now()
        const next: NavHistoryEntry = { ...entry, visitedAt }
        const filtered = get().entries.filter(
          (e) => !(e.path === next.path && e.projectId === next.projectId)
        )
        set({ entries: [next, ...filtered].slice(0, MAX_ENTRIES) })
      },

      clearHistory: () => set({ entries: [] })
    }),
    {
      name: 'ai-workbench-nav-history',
      partialize: (s) => ({ entries: s.entries }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<NavHistoryState>),
        entries: Array.isArray((persisted as NavHistoryState | undefined)?.entries)
          ? (persisted as NavHistoryState).entries
          : []
      })
    }
  )
)
