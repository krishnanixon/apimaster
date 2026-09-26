import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  VectorConnection,
  VectorExplorerNode,
  VectorWorkspaceSettings,
  VectorWorkspaceTab,
  VectorConnectionTestResult,
  VectorSearchResult,
  VectorDbStats,
  VectorCollectionStats,
  CreateVectorCollectionInput,
  VectorUpsertInput,
  VectorSearchInput,
  VectorGetInput,
  VectorGetResult,
  VectorTextSearchInput,
  VectorTextUpsertInput,
  RagIndexResult,
  RagStatus,
  RagRetrieveHit
} from '@shared/types/vector-workspace'
import type { AppScope } from '@shared/types/scope'
import { DEFAULT_VECTOR_WORKSPACE_SETTINGS } from '@shared/types/vector-workspace'
import { toast } from 'sonner'

interface VectorWorkspaceState {
  scope: AppScope
  projectId: string | null
  connections: VectorConnection[]
  activeConnectionId: string | null
  explorerTree: VectorExplorerNode[]
  explorerLoading: boolean
  tabs: VectorWorkspaceTab[]
  activeTabId: string | null
  settings: VectorWorkspaceSettings
  /** @deprecated prefer per-tab searchResult */
  lastSearchResult: VectorSearchResult | null
  lastSearchError: string | null
  dbStats: VectorDbStats | null
  connectionManagerOpen: boolean
  explorerPanelOpen: boolean
  bottomPanelOpen: boolean
  selectedExplorerNodeId: string | null

  setScope: (scope: AppScope, projectId: string | null) => void
  loadConnections: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (patch: Partial<VectorWorkspaceSettings>) => Promise<void>
  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<VectorConnectionTestResult | null>
  refreshExplorer: (connectionId?: string) => Promise<void>
  setActiveConnection: (id: string | null) => void
  openCollectionTab: (connectionId: string, collection: string) => void
  openSearchTab: (connectionId: string, collection?: string) => void
  openUpsertTab: (connectionId: string, collection?: string) => void
  openStatsTab: (connectionId: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  updateTab: (id: string, patch: Partial<VectorWorkspaceTab>) => void
  createCollection: (connectionId: string, input: CreateVectorCollectionInput) => Promise<VectorCollectionStats | null>
  deleteCollection: (connectionId: string, name: string) => Promise<boolean>
  renameCollection: (connectionId: string, name: string, newName: string) => Promise<boolean>
  upsertVectors: (connectionId: string, input: VectorUpsertInput) => Promise<boolean>
  upsertWithText: (connectionId: string, input: VectorTextUpsertInput) => Promise<boolean>
  deleteVectors: (connectionId: string, collection: string, ids: string[]) => Promise<boolean>
  getVector: (connectionId: string, collection: string, id: string) => Promise<unknown>
  getVectors: (connectionId: string, input: VectorGetInput) => Promise<VectorGetResult | null>
  search: (connectionId: string, input: VectorSearchInput, tabId?: string) => Promise<void>
  searchWithText: (connectionId: string, input: VectorTextSearchInput, tabId?: string) => Promise<void>
  loadStats: (connectionId: string) => Promise<void>
  setConnectionManagerOpen: (open: boolean) => void
  toggleExplorerPanel: (open?: boolean) => void
  toggleBottomPanel: (open?: boolean) => void
  setSelectedExplorerNode: (id: string | null) => void
  ragIndex: (projectId: string) => Promise<RagIndexResult | null>
  ragStatus: (projectId: string) => Promise<RagStatus | null>
  ragRetrieve: (projectId: string, query: string, topK?: number) => Promise<RagRetrieveHit[] | null>
}

async function ipc<T>(fn: () => Promise<{ success: boolean; data?: T; error?: string }>): Promise<T | null> {
  const res = await fn()
  if (!res.success) {
    toast.error(res.error ?? 'Request failed')
    return null
  }
  return res.data ?? (null as T)
}

export const useVectorWorkspaceStore = create<VectorWorkspaceState>()(
  persist(
    (set, get) => ({
      scope: 'GLOBAL',
      projectId: null,
      connections: [],
      activeConnectionId: null,
      explorerTree: [],
      explorerLoading: false,
      tabs: [],
      activeTabId: null,
      settings: DEFAULT_VECTOR_WORKSPACE_SETTINGS,
      lastSearchResult: null,
      lastSearchError: null,
      dbStats: null,
      connectionManagerOpen: false,
      explorerPanelOpen: true,
      bottomPanelOpen: true,
      selectedExplorerNodeId: null,

      setScope(scope, projectId) {
        set({ scope, projectId })
      },

      async loadConnections() {
        const { scope, projectId } = get()
        const data = await ipc(() =>
          window.electronAPI.vectorWorkspace.listConnections(
            scope === 'PROJECT' && projectId
              ? { scope: 'PROJECT', projectId }
              : { scope: 'GLOBAL', projectId: null }
          )
        )
        if (data) set({ connections: data })
      },

      async loadSettings() {
        const data = await ipc(() => window.electronAPI.vectorWorkspace.getSettings())
        if (data) set({ settings: data })
      },

      async saveSettings(patch) {
        const data = await ipc(() => window.electronAPI.vectorWorkspace.saveSettings(patch))
        if (data) {
          set({ settings: data })
          toast.success('Settings saved')
        }
      },

      async connect(id) {
        const res = await window.electronAPI.vectorWorkspace.connect(id)
        if (!res.success) {
          toast.error(res.error ?? 'Failed to connect')
          return
        }
        set({ activeConnectionId: id })
        toast.success('Connected')
        await get().refreshExplorer(id)
        await get().loadConnections()
      },

      async disconnect(id) {
        await ipc(() => window.electronAPI.vectorWorkspace.disconnect(id))
        if (get().activeConnectionId === id) {
          set({ activeConnectionId: null, explorerTree: [], dbStats: null })
        }
      },

      async testConnection(id) {
        return ipc(() => window.electronAPI.vectorWorkspace.testConnection(id))
      },

      async refreshExplorer(connectionId?) {
        const id = connectionId ?? get().activeConnectionId
        if (!id) {
          set({ explorerTree: [] })
          return
        }
        set({ explorerLoading: true })
        const tree = await ipc(() => window.electronAPI.vectorWorkspace.getExplorer(id))
        set({ explorerTree: tree ?? [], explorerLoading: false })
      },

      setActiveConnection(id) {
        set({ activeConnectionId: id })
      },

      openCollectionTab(connectionId, collection) {
        const tabId = `collection:${connectionId}:${collection}`
        const existing = get().tabs.find((t) => t.id === tabId)
        if (existing) {
          set({ activeTabId: tabId })
          return
        }
        const tab: VectorWorkspaceTab = {
          id: tabId,
          type: 'collection',
          title: collection,
          connectionId,
          collection
        }
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tabId }))
      },

      openSearchTab(connectionId, collection) {
        const tabId = `search:${connectionId}:${collection ?? 'any'}`
        const existing = get().tabs.find((t) => t.id === tabId)
        if (existing) {
          set({ activeTabId: tabId })
          return
        }
        const settings = get().settings
        const draft = JSON.stringify(
          {
            collection: collection ?? '',
            query_embeddings: [[0.1, 0.2, 0.3]],
            top_k: settings.defaultTopK,
            where: null,
            include_metadata: settings.includeMetadata,
            include_documents: settings.includeDocuments,
            include_distances: settings.includeDistances,
            include_embeddings: settings.includeEmbeddings
          },
          null,
          2
        )
        const tab: VectorWorkspaceTab = {
          id: tabId,
          type: 'search',
          title: collection ? `Search · ${collection}` : 'Search',
          connectionId,
          collection,
          draft,
          queryText: '',
          editorMode: 'form',
          searchResult: null,
          searchError: null
        }
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tabId }))
      },

      openUpsertTab(connectionId, collection) {
        const tabId = `upsert:${connectionId}:${collection ?? 'new'}`
        const existing = get().tabs.find((t) => t.id === tabId)
        if (existing) {
          set({ activeTabId: tabId })
          return
        }
        const draft = JSON.stringify(
          {
            collection: collection ?? '',
            ids: ['doc-1'],
            embeddings: [[0.1, 0.2, 0.3]],
            documents: ['Sample document text'],
            metadatas: [{ source: 'studio' }]
          },
          null,
          2
        )
        const tab: VectorWorkspaceTab = {
          id: tabId,
          type: 'upsert',
          title: collection ? `Upsert · ${collection}` : 'Upsert vectors',
          connectionId,
          collection,
          draft,
          editorMode: 'form'
        }
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tabId }))
      },

      openStatsTab(connectionId) {
        const tabId = `stats:${connectionId}`
        const existing = get().tabs.find((t) => t.id === tabId)
        if (existing) {
          set({ activeTabId: tabId })
          void get().loadStats(connectionId)
          return
        }
        const tab: VectorWorkspaceTab = {
          id: tabId,
          type: 'stats',
          title: 'Database stats',
          connectionId
        }
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tabId }))
        void get().loadStats(connectionId)
      },

      closeTab(id) {
        const tabs = get().tabs.filter((t) => t.id !== id)
        const activeTabId =
          get().activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : get().activeTabId
        set({ tabs, activeTabId })
      },

      setActiveTab(id) {
        set({ activeTabId: id })
      },

      updateTab(id, patch) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t))
        }))
      },

      async createCollection(connectionId, input) {
        const data = await ipc(() =>
          window.electronAPI.vectorWorkspace.createCollection(connectionId, input)
        )
        if (data) {
          toast.success(`Collection “${data.name}” created`)
          await get().refreshExplorer(connectionId)
        }
        return data
      },

      async deleteCollection(connectionId, name) {
        const res = await window.electronAPI.vectorWorkspace.deleteCollection(connectionId, name)
        if (!res.success) {
          toast.error(res.error ?? 'Failed to delete collection')
          return false
        }
        toast.success(`Deleted “${name}”`)
        const tabs = get().tabs.filter(
          (t) => !(t.connectionId === connectionId && t.collection === name)
        )
        set({
          tabs,
          activeTabId: tabs.find((t) => t.id === get().activeTabId)?.id ?? tabs[tabs.length - 1]?.id ?? null
        })
        await get().refreshExplorer(connectionId)
        return true
      },

      async renameCollection(connectionId, name, newName) {
        const data = await ipc(() =>
          window.electronAPI.vectorWorkspace.renameCollection(connectionId, name, newName)
        )
        if (!data) return false
        toast.success(`Renamed to “${newName}”`)
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.connectionId === connectionId && t.collection === name
              ? {
                  ...t,
                  collection: newName,
                  title: t.type === 'collection' ? newName : t.title.replace(name, newName),
                  id: t.id.replace(`:${name}`, `:${newName}`)
                }
              : t
          )
        }))
        await get().refreshExplorer(connectionId)
        return true
      },

      async upsertVectors(connectionId, input) {
        const data = await ipc(() =>
          window.electronAPI.vectorWorkspace.upsertVectors(connectionId, input)
        )
        if (data) {
          toast.success(`Upserted ${data.count} vector(s)`)
          await get().refreshExplorer(connectionId)
          return true
        }
        return false
      },

      async upsertWithText(connectionId, input) {
        const data = await ipc(() =>
          window.electronAPI.vectorWorkspace.upsertWithText(connectionId, input)
        )
        if (data) {
          toast.success(`Embedded & upserted ${data.count} vector(s)`)
          await get().refreshExplorer(connectionId)
          return true
        }
        return false
      },

      async deleteVectors(connectionId, collection, ids) {
        const data = await ipc(() =>
          window.electronAPI.vectorWorkspace.deleteVectors(connectionId, { collection, ids })
        )
        if (data) {
          toast.success(`Deleted ${data.deleted} vector(s)`)
          await get().refreshExplorer(connectionId)
          return true
        }
        return false
      },

      async getVector(connectionId, collection, id) {
        return ipc(() => window.electronAPI.vectorWorkspace.getVector(connectionId, collection, id))
      },

      async getVectors(connectionId, input) {
        return ipc(() => window.electronAPI.vectorWorkspace.getVectors(connectionId, input))
      },

      async search(connectionId, input, tabId?) {
        set({ lastSearchError: null })
        if (tabId) {
          get().updateTab(tabId, { searchError: null })
        }
        const res = await window.electronAPI.vectorWorkspace.search(connectionId, input)
        if (!res.success) {
          const err = res.error ?? 'Search failed'
          set({ lastSearchError: err, lastSearchResult: null })
          if (tabId) get().updateTab(tabId, { searchError: err, searchResult: null })
          toast.error(err)
          return
        }
        set({ lastSearchResult: res.data ?? null, bottomPanelOpen: true })
        if (tabId) {
          get().updateTab(tabId, { searchResult: res.data ?? null, searchError: null })
        }
      },

      async searchWithText(connectionId, input, tabId?) {
        set({ lastSearchError: null })
        if (tabId) {
          get().updateTab(tabId, { searchError: null })
        }
        const res = await window.electronAPI.vectorWorkspace.searchWithText(connectionId, input)
        if (!res.success) {
          const err = res.error ?? 'Text search failed'
          set({ lastSearchError: err, lastSearchResult: null })
          if (tabId) get().updateTab(tabId, { searchError: err, searchResult: null })
          toast.error(err)
          return
        }
        set({ lastSearchResult: res.data ?? null, bottomPanelOpen: true })
        if (tabId) {
          get().updateTab(tabId, { searchResult: res.data ?? null, searchError: null })
        }
      },

      async loadStats(connectionId) {
        const data = await ipc(() => window.electronAPI.vectorWorkspace.getStats(connectionId))
        if (data) set({ dbStats: data })
      },

      setConnectionManagerOpen(open) {
        set({ connectionManagerOpen: open })
      },

      toggleExplorerPanel(open) {
        set((s) => ({ explorerPanelOpen: open ?? !s.explorerPanelOpen }))
      },

      toggleBottomPanel(open) {
        set((s) => ({ bottomPanelOpen: open ?? !s.bottomPanelOpen }))
      },

      setSelectedExplorerNode(id) {
        set({ selectedExplorerNodeId: id })
      },

      async ragIndex(projectId) {
        const data = await ipc(() => window.electronAPI.vectorWorkspace.ragIndex(projectId))
        if (data) {
          toast.success(
            `Indexed ${data.chunkCount} chunks into ${data.collection} (${data.embeddingProvider}/${data.embeddingModel})`
          )
        }
        return data
      },

      async ragStatus(projectId) {
        return ipc(() => window.electronAPI.vectorWorkspace.ragStatus(projectId))
      },

      async ragRetrieve(projectId, query, topK) {
        return ipc(() => window.electronAPI.vectorWorkspace.ragRetrieve(projectId, query, topK))
      }
    }),
    {
      name: 'ai-workbench-vector-workspace',
      partialize: (s) => ({
        activeConnectionId: s.activeConnectionId,
        tabs: s.tabs.map(({ searchResult: _sr, searchError: _se, ...rest }) => rest),
        activeTabId: s.activeTabId,
        explorerPanelOpen: s.explorerPanelOpen,
        bottomPanelOpen: s.bottomPanelOpen
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<VectorWorkspaceState> | undefined
        const tabs = p?.tabs ?? current.tabs
        const activeTabId =
          p?.activeTabId && tabs.some((t) => t.id === p.activeTabId)
            ? p.activeTabId
            : current.activeTabId
        return {
          ...current,
          ...p,
          tabs,
          activeTabId
        }
      }
    }
  )
)
