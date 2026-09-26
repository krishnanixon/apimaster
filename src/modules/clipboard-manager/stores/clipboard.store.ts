import { create } from 'zustand'
import { toast } from 'sonner'
import type { ClipboardItem, ClipboardSearchFilter } from '../types/clipboard.types'
import {
  clearUnpinnedClipboardItems,
  copyClipboardItem,
  listClipboardItems,
  pinClipboardItem,
  pickAndPasteClipboardItem,
  closeClipboardPicker,
  removeClipboardItem,
  searchClipboard,
  subscribeClipboardUpdates
} from '../services/clipboard.service'
import { openWebSearch } from '../services/webSearch.service'

interface ClipboardState {
  initialized: boolean
  isLoading: boolean
  loadError: string | null
  items: ClipboardItem[]
  filteredItems: ClipboardItem[]
  selectedId: string | null
  searchQuery: string
  filter: ClipboardSearchFilter
  init: () => Promise<void>
  refresh: () => Promise<void>
  setSearchQuery: (query: string) => void
  setFilter: (filter: ClipboardSearchFilter) => void
  selectItem: (id: string | null) => void
  copyItem: (id: string) => Promise<void>
  pickAndPaste: (id: string) => Promise<void>
  closePicker: () => Promise<void>
  togglePin: (id: string) => Promise<void>
  removeItem: (id: string) => Promise<void>
  clearUnpinned: () => Promise<void>
  searchWeb: (query: string) => Promise<void>
  subscribeLiveUpdates: () => () => void
}

let unsubscribeUpdates: (() => void) | null = null

async function applySearch(
  items: ClipboardItem[],
  query: string,
  filter: ClipboardSearchFilter
): Promise<ClipboardItem[]> {
  if (!query.trim() && filter === 'all') return items
  return searchClipboard({ query, filter })
}

async function loadItems(
  query: string,
  filter: ClipboardSearchFilter
): Promise<{ items: ClipboardItem[]; filteredItems: ClipboardItem[] }> {
  const items = await listClipboardItems()
  const filteredItems = await applySearch(items, query, filter)
  return { items, filteredItems }
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  initialized: false,
  isLoading: false,
  loadError: null,
  items: [],
  filteredItems: [],
  selectedId: null,
  searchQuery: '',
  filter: 'all',

  init: async () => {
    set({ isLoading: true, loadError: null })
    try {
      const { items, filteredItems } = await loadItems(get().searchQuery, get().filter)
      set({
        items,
        filteredItems,
        selectedId: filteredItems[0]?.id ?? null,
        initialized: true,
        isLoading: false,
        loadError: null
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load clipboard history'
      set({
        initialized: true,
        isLoading: false,
        loadError: message,
        items: [],
        filteredItems: [],
        selectedId: null
      })
      toast.error(message)
    }
  },

  subscribeLiveUpdates: () => {
    unsubscribeUpdates?.()
    try {
      unsubscribeUpdates = subscribeClipboardUpdates((items) => {
        void (async () => {
          const nextFiltered = await applySearch(items, get().searchQuery, get().filter)
          set((state) => ({
            items,
            filteredItems: nextFiltered,
            loadError: null,
            selectedId:
              state.selectedId && nextFiltered.some((item) => item.id === state.selectedId)
                ? state.selectedId
                : nextFiltered[0]?.id ?? null
          }))
        })()
      })
    } catch {
      // Polling fallback in the panel keeps the list fresh.
    }

    return () => {
      unsubscribeUpdates?.()
      unsubscribeUpdates = null
    }
  },

  refresh: async () => {
    try {
      const { items, filteredItems } = await loadItems(get().searchQuery, get().filter)
      set({
        items,
        filteredItems,
        loadError: null,
        selectedId:
          get().selectedId && filteredItems.some((item) => item.id === get().selectedId)
            ? get().selectedId
            : filteredItems[0]?.id ?? null
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh clipboard history'
      set({ loadError: message })
    }
  },

  setSearchQuery: (query) => {
    void (async () => {
      const filteredItems = await applySearch(get().items, query, get().filter)
      set({
        searchQuery: query,
        filteredItems,
        selectedId:
          get().selectedId && filteredItems.some((item) => item.id === get().selectedId)
            ? get().selectedId
            : filteredItems[0]?.id ?? null
      })
    })()
  },

  setFilter: (filter) => {
    void (async () => {
      const filteredItems = await applySearch(get().items, get().searchQuery, filter)
      set({
        filter,
        filteredItems,
        selectedId:
          get().selectedId && filteredItems.some((item) => item.id === get().selectedId)
            ? get().selectedId
            : filteredItems[0]?.id ?? null
      })
    })()
  },

  selectItem: (id) => set({ selectedId: id }),

  copyItem: async (id) => {
    try {
      await copyClipboardItem(id)
      toast.success('Copied to clipboard')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Copy failed')
    }
  },

  pickAndPaste: async (id) => {
    try {
      await pickAndPasteClipboardItem(id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Paste failed')
    }
  },

  closePicker: async () => {
    try {
      await closeClipboardPicker()
    } catch {
      // Picker may already be closed from blur.
    }
  },

  togglePin: async (id) => {
    try {
      const items = await pinClipboardItem(id)
      const filteredItems = await applySearch(items, get().searchQuery, get().filter)
      set({ items, filteredItems })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pin failed')
    }
  },

  removeItem: async (id) => {
    try {
      const items = await removeClipboardItem(id)
      const filteredItems = await applySearch(items, get().searchQuery, get().filter)
      set({
        items,
        filteredItems,
        selectedId:
          get().selectedId === id ? filteredItems[0]?.id ?? null : get().selectedId
      })
      toast.success('Removed from history')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed')
    }
  },

  clearUnpinned: async () => {
    try {
      const items = await clearUnpinnedClipboardItems()
      const filteredItems = await applySearch(items, get().searchQuery, get().filter)
      set({
        items,
        filteredItems,
        selectedId: filteredItems[0]?.id ?? null
      })
      toast.success('Cleared unpinned items')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Clear failed')
    }
  },

  searchWeb: async (query) => {
    const trimmed = query.trim()
    if (!trimmed) return

    try {
      await openWebSearch(trimmed)
      await get().closePicker()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Web search failed')
    }
  }
}))
