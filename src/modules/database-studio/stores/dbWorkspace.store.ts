import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type {
  DbConnection,
  DbExplorerNode,
  DbQueryResult,
  DbTableInfo,
  DbWorkspaceSettings,
  DbWorkspaceTab,
  DbQueryHistoryEntry,
  DbSavedQuery,
  DbAiAction,
  DbAiResponse,
  DbAiChatMessage,
  DbAiLiveContext,
  DbAiSchemaSnapshotInfo,
  DbConnectionTestResult
} from '@shared/types/database-workspace'
import type { AppScope } from '@shared/types/scope'
import { DEFAULT_DB_WORKSPACE_SETTINGS, isDocumentProvider } from '@shared/types/database-workspace'
import { toast } from 'sonner'
import { sanitizeRowsForAi } from '../lib/aiContext'

export type DbLayoutSizes = {
  horizontal?: Record<string, number>
  vertical?: Record<string, number>
}

const MAX_AI_MESSAGES = 30

interface DbWorkspaceState {
  scope: AppScope
  projectId: string | null
  connections: DbConnection[]
  activeConnectionId: string | null
  explorerTree: DbExplorerNode[]
  explorerLoading: boolean
  tabs: DbWorkspaceTab[]
  activeTabId: string | null
  settings: DbWorkspaceSettings
  queryHistory: DbQueryHistoryEntry[]
  savedQueries: DbSavedQuery[]
  lastQueryResult: DbQueryResult | null
  lastQueryError: string | null
  queryRunning: boolean
  bottomPanelTab: 'results' | 'history' | 'saved' | 'messages' | 'problems'
  bottomPanelOpen: boolean
  aiPanelOpen: boolean
  /** @deprecated Prefer aiMessages */
  aiResponse: string | null
  aiMessages: DbAiChatMessage[]
  aiLoading: boolean
  searchQuery: string
  connectionManagerOpen: boolean
  availableDatabases: string[]
  activeDatabase: string | null
  explorerPanelOpen: boolean
  selectedExplorerNodeId: string | null
  aiModel: string | null
  layoutSizes: DbLayoutSizes
  aiLiveContext: DbAiLiveContext | null
  aiSchema: DbAiSchemaSnapshotInfo | null
  aiSchemaSyncing: boolean

  setScope: (scope: AppScope, projectId: string | null) => void
  loadConnections: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (patch: Partial<DbWorkspaceSettings>) => Promise<void>
  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<DbConnectionTestResult | null>
  refreshExplorer: (connectionId?: string, database?: string) => Promise<void>
  setActiveConnection: (id: string | null) => void
  openTableTab: (connectionId: string, database: string, schema: string, table: string) => void
  openQueryTab: (connectionId: string, sql?: string, title?: string) => void
  openErDiagramTab: (connectionId: string, database: string, schema: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  updateTab: (id: string, patch: Partial<DbWorkspaceTab>) => void
  executeQuery: (connectionId: string, sql: string) => Promise<void>
  loadQueryHistory: (connectionId?: string) => Promise<void>
  loadSavedQueries: () => Promise<void>
  saveQuery: (input: { name: string; sql: string; connectionId?: string | null }) => Promise<void>
  deleteSavedQuery: (id: string) => Promise<void>
  runAi: (
    connectionId: string,
    action: DbAiAction,
    opts?: { table?: string; sql?: string; prompt?: string; database?: string; schema?: string; userLabel?: string }
  ) => Promise<void>
  setAiLiveContext: (ctx: DbAiLiveContext | null) => void
  loadAiSchema: (connectionId?: string, database?: string, schema?: string) => Promise<void>
  resyncAiSchema: (connectionId?: string) => Promise<void>
  clearAiMessages: () => void
  setBottomPanelTab: (tab: DbWorkspaceState['bottomPanelTab']) => void
  toggleBottomPanel: (open?: boolean) => void
  toggleAiPanel: (open?: boolean) => void
  toggleExplorerPanel: (open?: boolean) => void
  setSelectedExplorerNode: (id: string | null) => void
  setAiModel: (model: string | null) => void
  setSearchQuery: (q: string) => void
  setConnectionManagerOpen: (open: boolean) => void
  setLayoutSizes: (group: keyof DbLayoutSizes, layout: Record<string, number>) => void
  getTableInfo: (connectionId: string, database: string, schema: string, table: string) => Promise<DbTableInfo | null>
  selectDatabase: (connectionId: string, database: string) => Promise<void>
  loadDatabases: (connectionId: string) => Promise<string[]>
}

async function ipc<T>(fn: () => Promise<{ success: boolean; data?: T; error?: string }>): Promise<T | null> {
  const res = await fn()
  if (!res.success) {
    toast.error(res.error ?? 'Request failed')
    return null
  }
  return res.data ?? (null as T)
}

function resolveConnectionSchema(
  conn: Pick<DbConnection, 'provider' | 'config'> | undefined,
  settingsDefaultSchema: string,
  database?: string | null
): string {
  // Document databases have no schemas — the database itself is the namespace
  if (conn && isDocumentProvider(conn.provider)) return database || conn.config.database || 'test'
  return (conn?.config.schema ?? conn?.config.defaultSchema ?? settingsDefaultSchema) || 'public'
}

function resolvePreferredDatabase(
  conn: { config: { database?: string } } | undefined,
  available: string[],
  current: string | null
): string | null {
  const configured = conn?.config.database?.trim() || null
  if (configured && (available.length === 0 || available.includes(configured))) {
    return configured
  }
  if (current && available.includes(current)) return current
  if (available.length > 0) {
    return (
      available.find((d) => !['information_schema', 'mysql', 'performance_schema', 'sys', 'postgres'].includes(d)) ??
      available[0]
    )
  }
  return configured
}

function actionUserLabel(action: DbAiAction, opts?: { prompt?: string; userLabel?: string; table?: string }): string {
  if (opts?.userLabel) return opts.userLabel
  if (action === 'natural_language' && opts?.prompt) return opts.prompt
  if (opts?.table) return `${action.replace(/_/g, ' ')} · ${opts.table}`
  return action.replace(/_/g, ' ')
}

export const useDbWorkspaceStore = create<DbWorkspaceState>()(
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
      settings: DEFAULT_DB_WORKSPACE_SETTINGS,
      queryHistory: [],
      savedQueries: [],
      lastQueryResult: null,
      lastQueryError: null,
      queryRunning: false,
      bottomPanelTab: 'results',
      bottomPanelOpen: true,
      aiPanelOpen: true,
      aiResponse: null,
      aiMessages: [],
      aiLoading: false,
      searchQuery: '',
      connectionManagerOpen: false,
      availableDatabases: [],
      activeDatabase: null,
      explorerPanelOpen: true,
      selectedExplorerNodeId: null,
      aiModel: null,
      layoutSizes: {},
      aiLiveContext: null,
      aiSchema: null,
      aiSchemaSyncing: false,

      setScope(scope, projectId) {
        set({ scope, projectId })
        void get().loadConnections()
        void get().loadSavedQueries()
      },

      async loadConnections() {
        const { scope, projectId } = get()
        const filter =
          scope === 'PROJECT' && projectId
            ? { scope: 'PROJECT' as AppScope, projectId }
            : scope === 'GLOBAL'
              ? { scope: 'GLOBAL' as AppScope, projectId: null }
              : undefined
        const data = await ipc(() => window.electronAPI.dbWorkspace.listConnections(filter))
        if (data) set({ connections: data })
      },

      async loadSettings() {
        const data = await ipc(() => window.electronAPI.dbWorkspace.getSettings())
        if (data) set({ settings: data })
      },

      async saveSettings(patch) {
        const data = await ipc(() => window.electronAPI.dbWorkspace.saveSettings(patch))
        if (data) {
          set({ settings: data })
          toast.success('Database Workbench settings saved')
        }
      },

      async connect(id) {
        const res = await window.electronAPI.dbWorkspace.connect(id)
        if (!res.success) {
          toast.error(res.error ?? 'Failed to connect')
          if (get().activeConnectionId === id) {
            set({
              activeConnectionId: null,
              explorerTree: [],
              availableDatabases: [],
              activeDatabase: null,
              aiSchema: null
            })
          }
          return
        }
        set({ activeConnectionId: id })
        const name = get().connections.find((c) => c.id === id)?.name
        toast.success(name ? `Connected to ${name}` : 'Connected')
        void get().loadConnections()
        await get().loadDatabases(id)
      },

      async loadDatabases(connectionId) {
        const dbs = await ipc(() => window.electronAPI.dbWorkspace.listDatabases(connectionId))
        const list = dbs ?? []
        const conn = get().connections.find((c) => c.id === connectionId)
        const activeDb = resolvePreferredDatabase(conn, list, get().activeDatabase)
        set({ availableDatabases: list, activeDatabase: activeDb })
        await get().refreshExplorer(connectionId, activeDb ?? undefined)
        return list
      },

      async selectDatabase(connectionId, database) {
        set({ activeDatabase: database })
        const conn = get().connections.find((c) => c.id === connectionId)
        if (conn && conn.config.database !== database) {
          await window.electronAPI.dbWorkspace.updateConnection(connectionId, {
            config: { ...conn.config, database }
          })
          void get().loadConnections()
        }
        await get().refreshExplorer(connectionId, database)
      },

      async disconnect(id) {
        await window.electronAPI.dbWorkspace.disconnect(id)
        if (get().activeConnectionId === id) {
          set({ activeConnectionId: null, explorerTree: [], availableDatabases: [], activeDatabase: null, aiSchema: null })
        }
        void get().loadConnections()
      },

      async testConnection(id) {
        return ipc(() => window.electronAPI.dbWorkspace.testConnection(id))
      },

      async refreshExplorer(connectionId, database?) {
        const id = connectionId ?? get().activeConnectionId
        if (!id) return
        set({ explorerLoading: true })
        const conn = get().connections.find((c) => c.id === id)
        const db = database ?? get().activeDatabase ?? conn?.config.database
        const schema = resolveConnectionSchema(conn, get().settings.defaultSchema, db)
        const tree = await ipc(() =>
          window.electronAPI.dbWorkspace.getExplorer(id, db || undefined, schema)
        )
        set({ explorerTree: tree ?? [], explorerLoading: false })
        void get().loadAiSchema(id, db || undefined, schema)
      },

      setActiveConnection(id) {
        if (id === get().activeConnectionId) return
        if (!id) {
          const previous = get().activeConnectionId
          set({
            activeConnectionId: null,
            explorerTree: [],
            availableDatabases: [],
            activeDatabase: null,
            aiSchema: null
          })
          if (previous) void window.electronAPI.dbWorkspace.disconnect(previous)
          return
        }
        void get().connect(id)
      },

      openTableTab(connectionId, database, schema, table) {
        const tabId = `table:${connectionId}:${database}:${schema}:${table}`
        const existing = get().tabs.find((t) => t.id === tabId)
        if (existing) {
          set({ activeTabId: tabId })
          return
        }
        const tab: DbWorkspaceTab = {
          id: tabId,
          type: 'table',
          title: table,
          connectionId,
          database,
          schema,
          table,
          subTab: 'data'
        }
        set({ tabs: [...get().tabs, tab], activeTabId: tabId })
      },

      openQueryTab(connectionId, sql = '', title = 'Query') {
        const tabId = `query:${uuidv4()}`
        const tab: DbWorkspaceTab = {
          id: tabId,
          type: 'query',
          title,
          connectionId,
          sql
        }
        set({ tabs: [...get().tabs, tab], activeTabId: tabId })
      },

      openErDiagramTab(connectionId, database, schema) {
        const tabId = `er:${connectionId}:${database}:${schema}`
        if (get().tabs.some((t) => t.id === tabId)) {
          set({ activeTabId: tabId })
          return
        }
        const tab: DbWorkspaceTab = {
          id: tabId,
          type: 'er-diagram',
          title: 'ER Diagram',
          connectionId,
          database,
          schema
        }
        set({ tabs: [...get().tabs, tab], activeTabId: tabId })
      },

      closeTab(id) {
        const tabs = get().tabs.filter((t) => t.id !== id)
        const activeTabId = get().activeTabId === id ? tabs[tabs.length - 1]?.id ?? null : get().activeTabId
        set({ tabs, activeTabId })
      },

      setActiveTab(id) {
        set({ activeTabId: id })
      },

      updateTab(id, patch) {
        set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
      },

      async executeQuery(connectionId, sql) {
        set({ lastQueryError: null, bottomPanelOpen: true, bottomPanelTab: 'results', queryRunning: true })
        const { settings, activeDatabase, activeConnectionId } = get()
        const conn = get().connections.find((c) => c.id === connectionId)
        const res = await window.electronAPI.dbWorkspace.executeQuery({
          connectionId,
          sql,
          // Document queries run against the database selected in the explorer
          database:
            conn && isDocumentProvider(conn.provider)
              ? (activeConnectionId === connectionId ? activeDatabase : null) ?? conn.config.database ?? undefined
              : undefined,
          maxRows: settings.maxRows,
          timeoutMs: conn?.config.queryTimeoutMs ?? settings.queryTimeoutMs
        })
        set({ queryRunning: false })
        if (!res.success) {
          set({ lastQueryError: res.error ?? 'Query failed', lastQueryResult: null })
          toast.error(res.error ?? 'Query failed')
        } else if (res.data) {
          set({ lastQueryResult: res.data })
        }
        void get().loadQueryHistory(connectionId)
      },

      async loadQueryHistory(connectionId) {
        const data = await ipc(() =>
          window.electronAPI.dbWorkspace.listQueryHistory(connectionId, get().settings.queryHistoryLimit)
        )
        if (data) set({ queryHistory: data })
      },

      async loadSavedQueries() {
        const { scope, projectId } = get()
        const filter =
          scope === 'PROJECT' && projectId
            ? { scope: 'PROJECT' as AppScope, projectId }
            : { scope: 'GLOBAL' as AppScope, projectId: null }
        const data = await ipc(() => window.electronAPI.dbWorkspace.listSavedQueries(filter))
        if (data) set({ savedQueries: data })
      },

      async saveQuery({ name, sql, connectionId }) {
        const { scope, projectId } = get()
        const data = await ipc(() =>
          window.electronAPI.dbWorkspace.saveQuery({
            name: name.trim() || 'Untitled query',
            sql,
            connectionId: connectionId ?? get().activeConnectionId,
            scope: scope === 'PROJECT' && projectId ? 'PROJECT' : 'GLOBAL',
            projectId: scope === 'PROJECT' ? projectId : null,
            folderId: null,
            tags: [],
            isFavorite: false,
            isPinned: false,
            sortOrder: 0
          })
        )
        if (data) {
          toast.success('Query saved')
          void get().loadSavedQueries()
          set({ bottomPanelOpen: true, bottomPanelTab: 'saved' })
        }
      },

      async deleteSavedQuery(id) {
        const res = await window.electronAPI.dbWorkspace.deleteSavedQuery(id)
        if (!res.success) {
          toast.error(res.error ?? 'Failed to delete query')
          return
        }
        toast.success('Saved query deleted')
        void get().loadSavedQueries()
      },

      setAiLiveContext(ctx) {
        set({ aiLiveContext: ctx })
      },

      async loadAiSchema(connectionId, database, schemaName) {
        const id = connectionId ?? get().activeConnectionId
        if (!id) {
          set({ aiSchema: null, aiSchemaSyncing: false })
          return
        }
        const conn = get().connections.find((c) => c.id === id)
        const db = database ?? get().activeDatabase ?? conn?.config.database
        const schema = schemaName ?? resolveConnectionSchema(conn, get().settings.defaultSchema, db)
        if (!db) {
          set({ aiSchema: null, aiSchemaSyncing: false })
          return
        }
        set({ aiSchemaSyncing: true })
        const data = await window.electronAPI.dbWorkspace.ai.getSchema(id, db, schema)
        set({
          aiSchemaSyncing: false,
          aiSchema: data.success ? data.data ?? null : get().aiSchema
        })
      },

      async resyncAiSchema(connectionId) {
        const id = connectionId ?? get().activeConnectionId
        if (!id) return
        const conn = get().connections.find((c) => c.id === id)
        const db = get().activeDatabase ?? conn?.config.database
        const schema = resolveConnectionSchema(conn, get().settings.defaultSchema, db)
        if (!db) {
          toast.error('Select a database first')
          return
        }
        set({ aiSchemaSyncing: true })
        const captured = await window.electronAPI.dbWorkspace.ai.resyncSchema(id, db, schema)
        set({ aiSchemaSyncing: false })
        if (!captured.success) {
          toast.error(captured.error ?? 'Failed to resync schema')
          return
        }
        set({ aiSchema: captured.data ?? null })
        const count = captured.data?.tableCount ?? 0
        toast.success(count > 0 ? `Schema saved · ${count} tables` : 'Schema snapshot saved')
      },

      async runAi(connectionId, action, opts) {
        const userMsg: DbAiChatMessage = {
          id: uuidv4(),
          role: 'user',
          content: actionUserLabel(action, opts),
          action,
          at: new Date().toISOString()
        }
        set({
          aiLoading: true,
          aiPanelOpen: true,
          aiMessages: [...get().aiMessages, userMsg].slice(-MAX_AI_MESSAGES)
        })
        const { projectId, aiModel, activeDatabase, settings, aiLiveContext, lastQueryResult, tabs, activeTabId } =
          get()
        const conn = get().connections.find((c) => c.id === connectionId)
        const activeTab = tabs.find((t) => t.id === activeTabId)
        const live = aiLiveContext?.connectionId === connectionId ? aiLiveContext : null
        const conversation = get()
          .aiMessages.slice(0, -1)
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }))
        const querySql = opts?.sql ?? (activeTab?.type === 'query' ? activeTab.sql : undefined)
        const res = await window.electronAPI.dbWorkspace.ai.run({
          action,
          connectionId,
          table: opts?.table ?? live?.table ?? (activeTab?.type === 'table' ? activeTab.table : undefined),
          sql: querySql,
          prompt: opts?.prompt,
          projectId: projectId ?? undefined,
          database:
            opts?.database ??
            live?.database ??
            activeTab?.database ??
            activeDatabase ??
            conn?.config.database ??
            undefined,
          schema:
            opts?.schema ??
            live?.schema ??
            activeTab?.schema ??
            resolveConnectionSchema(conn, settings.defaultSchema, activeDatabase),
          model: aiModel ?? undefined,
          selectedRows: live?.selectedRows?.length ? sanitizeRowsForAi(live.selectedRows, 40) : undefined,
          rowSample: live?.loadedSample?.length ? sanitizeRowsForAi(live.loadedSample, 20) : undefined,
          queryResult:
            lastQueryResult && activeTab?.type === 'query'
              ? {
                  sql: querySql,
                  columns: lastQueryResult.columns.map((c) => c.name),
                  rows: sanitizeRowsForAi(lastQueryResult.rows, 30),
                  rowCount: lastQueryResult.rowCount
                }
              : undefined,
          conversation: conversation.length ? conversation : undefined
        })
        if (!res.success) {
          toast.error(res.error ?? 'AI request failed')
          const errMsg: DbAiChatMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: `Error: ${res.error ?? 'AI request failed'}`,
            action,
            at: new Date().toISOString()
          }
          set({
            aiLoading: false,
            aiMessages: [...get().aiMessages, errMsg].slice(-MAX_AI_MESSAGES)
          })
          return
        }
        const content = (res.data as DbAiResponse)?.content ?? String(res.data)
        const assistantMsg: DbAiChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          content,
          action,
          at: new Date().toISOString()
        }
        set({
          aiResponse: content,
          aiLoading: false,
          aiMessages: [...get().aiMessages, assistantMsg].slice(-MAX_AI_MESSAGES)
        })
      },

      clearAiMessages() {
        set({ aiMessages: [], aiResponse: null })
      },

      setBottomPanelTab(tab) {
        set({ bottomPanelTab: tab, bottomPanelOpen: true })
      },

      toggleBottomPanel(open) {
        set({ bottomPanelOpen: open ?? !get().bottomPanelOpen })
      },

      toggleAiPanel(open) {
        set({ aiPanelOpen: open ?? !get().aiPanelOpen })
      },

      toggleExplorerPanel(open) {
        set({ explorerPanelOpen: open ?? !get().explorerPanelOpen })
      },

      setSelectedExplorerNode(id) {
        set({ selectedExplorerNodeId: id })
      },

      setAiModel(model) {
        set({ aiModel: model })
      },

      setSearchQuery(q) {
        set({ searchQuery: q })
      },

      setConnectionManagerOpen(open) {
        set({ connectionManagerOpen: open })
      },

      setLayoutSizes(group, layout) {
        set({ layoutSizes: { ...get().layoutSizes, [group]: layout } })
      },

      async getTableInfo(connectionId, database, schema, table) {
        return ipc(() => window.electronAPI.dbWorkspace.getTableInfo(connectionId, database, schema, table))
      }
    }),
    {
      name: 'ai-workbench-db-workspace',
      partialize: (s) => ({
        activeConnectionId: s.activeConnectionId,
        activeDatabase: s.activeDatabase,
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        bottomPanelOpen: s.bottomPanelOpen,
        bottomPanelTab: s.bottomPanelTab,
        aiPanelOpen: s.aiPanelOpen,
        explorerPanelOpen: s.explorerPanelOpen,
        aiModel: s.aiModel,
        layoutSizes: s.layoutSizes,
        aiMessages: s.aiMessages.slice(-MAX_AI_MESSAGES)
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<DbWorkspaceState>
        const tabs = Array.isArray(saved.tabs) ? saved.tabs : current.tabs
        const activeTabId =
          saved.activeTabId && tabs.some((t) => t.id === saved.activeTabId) ? saved.activeTabId : tabs.at(-1)?.id ?? null
        const aiMessages = Array.isArray(saved.aiMessages) ? saved.aiMessages.slice(-MAX_AI_MESSAGES) : current.aiMessages

        return {
          ...current,
          ...saved,
          tabs,
          activeTabId,
          aiMessages,
          layoutSizes: saved.layoutSizes ?? current.layoutSizes,
          bottomPanelOpen: saved.bottomPanelOpen ?? true,
          aiPanelOpen: saved.aiPanelOpen ?? true,
          explorerPanelOpen: saved.explorerPanelOpen ?? true,
          bottomPanelTab:
            saved.bottomPanelTab === 'results' ||
            saved.bottomPanelTab === 'history' ||
            saved.bottomPanelTab === 'saved' ||
            saved.bottomPanelTab === 'messages' ||
            saved.bottomPanelTab === 'problems'
              ? saved.bottomPanelTab
              : current.bottomPanelTab
        }
      }
    }
  )
)
