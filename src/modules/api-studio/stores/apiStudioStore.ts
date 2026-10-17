import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { extensionForContentType } from '@shared/lib/response-content'
import { toast } from 'sonner'
import type {
  ApiCollection,
  ApiEnvironment,
  ApiExecutionResult,
  ApiFolder,
  ApiHistoryEntry,
  ApiRequest,
  ApiTestResult,
  CollectionRunnerOptions,
  CollectionRunnerReport,
  HttpMethod,
  KeyValuePair,
  RequestAuth,
  RequestTab,
  ResponseTab,
  WorkspaceSplit
} from '../types/api.types'
import { createEmptyKeyValue, createEmptyRequest, syncPathParams } from '../services/requestBuilder'
import { cancelRequest as cancelHttpRequest, executeResolved, finishExecution, prepareRequest } from '../services/apiClient'
import { applyVariableChanges, createEmptyEnvironment, enabledVariableMap } from '../services/environment'
import { parseCurl } from '../services/curlParser'
import { exportToPostmanCollection } from '../services/postman'
import { collectCollectionRequests, collectFolderRequests, runRequestList } from '../services/collectionRunner'
import { getDescendantFolderIds, isFolderDescendant } from '../services/folderTree'
import { generateSnippet } from '../services/codeGenerator'
import { applyParentInheritance, createInheritAuth } from '../services/inheritance'
import { workspaceStateStorage } from '../services/workspaceStorage'
import { prepareWorkspacePersistState } from '@shared/lib/workspace-document'
import { redactRequest } from '@shared/lib/redact-secrets'
import { formatGraphQL } from '../services/graphql/document'
import { migrateWorkspaceState, WORKSPACE_SCHEMA_VERSION } from '../services/graphql/migrate'
import { applyRequestType, createDefaultGraphQLConfig } from '../services/graphql/model'
import { buildIntrospectionRequest, readIntrospectionResult } from '../services/graphql/schema'
import { importCollectionJson } from '../services/collectionImport'

const MAX_HISTORY = 200

export interface WebSocketMessage {
  direction: 'sent' | 'received' | 'system'
  data: string
  timestamp: string
}

/** A request as sent plus the response it produced — the unit the Compare view diffs. */
export interface ResponseSnapshot {
  request: ApiRequest
  response: ApiExecutionResult
  capturedAt: string
  label: string
}

export interface TabState {
  id: string
  request: ApiRequest
  /** Origin, when this tab mirrors a saved request. Undefined for scratch/unsaved tabs. */
  collectionId?: string
  dirty: boolean
  requestView: RequestTab
  responseView: ResponseTab
  loading: boolean
  clientRequestId: string | null
  response: ApiExecutionResult | null
  testResults: ApiTestResult[]
  wsConnected: boolean
  wsConnecting: boolean
  wsMessages: WebSocketMessage[]
  graphqlSchemaLoading: boolean
  /** The run that produced `response`. In-memory only (never persisted). */
  lastRun?: ResponseSnapshot | null
  /** The run before `lastRun`, so "compare with previous" works without setup. */
  previousRun?: ResponseSnapshot | null
  /** A response the user pinned to compare later runs against. */
  baseline?: ResponseSnapshot | null
}

interface RunnerState {
  isRunning: boolean
  progress: { current: number; total: number; currentName: string } | null
  report: CollectionRunnerReport | null
}

/** Live WebSocket connections — not persisted. */
const wsSockets = new Map<string, WebSocket>()

interface ApiStudioState {
  collections: ApiCollection[]
  tabs: TabState[]
  activeTabId: string | null
  history: ApiHistoryEntry[]
  historyMethodFilter: HttpMethod | 'all'
  collectionSearch: string
  environments: ApiEnvironment[]
  activeEnvironmentId: string | null
  runner: RunnerState
  runnerAbort: boolean
  workspaceSplit: WorkspaceSplit
  setWorkspaceSplit: (split: WorkspaceSplit) => void

  // Environments
  createEnvironment: (name: string) => ApiEnvironment
  renameEnvironment: (id: string, name: string) => void
  deleteEnvironment: (id: string) => void
  duplicateEnvironment: (id: string) => void
  updateEnvironmentVariables: (id: string, variables: KeyValuePair[]) => void
  setActiveEnvironment: (id: string | null) => void

  // Collections / folders
  createCollection: (name: string, description?: string) => ApiCollection
  deleteCollection: (collectionId: string) => void
  renameCollection: (collectionId: string, name: string) => void
  createFolder: (collectionId: string, name: string, parentId?: string | null) => string
  renameFolder: (collectionId: string, folderId: string, name: string) => void
  deleteFolder: (collectionId: string, folderId: string) => void
  updateCollectionSettings: (
    collectionId: string,
    patch: { auth?: RequestAuth; headers?: KeyValuePair[]; preRequestScript?: string }
  ) => void
  updateFolderSettings: (
    collectionId: string,
    folderId: string,
    patch: { auth?: RequestAuth; headers?: KeyValuePair[]; preRequestScript?: string }
  ) => void
  /** Point direct child requests at parent auth (`auth.type: 'inherit'`). */
  switchChildRequestsToInherit: (collectionId: string, folderId: string | null) => void
  setCollectionSearch: (query: string) => void
  reorderCollections: (fromId: string, toId: string) => void
  reorderFolders: (collectionId: string, fromId: string, toId: string) => void
  /** Move a folder under another folder (or to collection root when `toParentId` is null). */
  moveFolder: (input: {
    collectionId: string
    folderId: string
    toParentId: string | null
    beforeFolderId?: string | null
  }) => void

  // Requests (persisted)
  createRequest: (collectionId: string, folderId?: string | null, requestType?: ApiRequest['requestType']) => void
  deleteRequest: (collectionId: string, requestId: string) => void
  duplicateRequest: (collectionId: string, requestId: string) => void
  renameRequest: (collectionId: string, requestId: string, name: string) => void
  moveRequestToFolder: (collectionId: string, requestId: string, folderId: string | null) => void
  /**
   * Drag-and-drop move: relocates a request within/between collections and
   * folders, optionally inserting it immediately before `beforeRequestId`.
   * When `beforeRequestId` is omitted the request is appended to the target group.
   */
  moveRequest: (input: {
    requestId: string
    fromCollectionId: string
    toCollectionId: string
    toFolderId: string | null
    beforeRequestId?: string | null
  }) => void

  // Tabs
  openRequestTab: (collectionId: string, requestId: string) => void
  openScratchTab: (seed?: Partial<ApiRequest>) => string
  openHistoryEntry: (entry: ApiHistoryEntry) => void
  duplicateTab: (tabId: string) => string
  closeTab: (tabId: string) => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateDraft: (tabId: string, patch: Partial<ApiRequest>) => void
  setRequestView: (tabId: string, view: RequestTab) => void
  setResponseView: (tabId: string, view: ResponseTab) => void
  copyTabAsCurl: (tabId: string) => Promise<void>

  // WebSocket
  connectWebSocket: (tabId: string) => Promise<void>
  disconnectWebSocket: (tabId: string) => void
  sendWebSocketMessage: (tabId: string, message: string) => void
  clearWebSocketMessages: (tabId: string) => void

  // Response actions
  saveResponseToFile: (tabId: string) => Promise<void>
  pinResponseBaseline: (tabId: string) => void
  clearResponseBaseline: (tabId: string) => void

  // Collection runner
  runCollection: (collectionId: string, options: CollectionRunnerOptions) => Promise<void>
  runFolder: (collectionId: string, folderId: string, options: CollectionRunnerOptions) => Promise<void>
  cancelRunner: () => void
  clearRunnerReport: () => void

  // Save
  saveTab: (tabId: string) => void
  saveTabAs: (tabId: string, collectionId: string, folderId?: string | null, name?: string) => void

  // Execution
  sendTabRequest: (tabId: string) => Promise<void>
  fetchGraphQLSchema: (tabId: string) => Promise<void>
  formatGraphQLQuery: (tabId: string) => void
  cancelTabRequest: (tabId: string) => Promise<void>
  runTabTests: (tabId: string) => Promise<void>

  // History
  clearHistory: () => void
  setHistoryMethodFilter: (method: HttpMethod | 'all') => void

  // Import / export
  importCollection: (json: string) => string | null
  /** Adds a collection built elsewhere (e.g. by the Code Scanner). */
  addCollection: (collection: ApiCollection) => void
  /** Replaces a collection by id (e.g. after a Code Scanner re-scan); unedited open tabs follow. */
  replaceCollection: (collection: ApiCollection) => void
  exportCollection: (collectionId: string) => string
  importCurlAsTab: (curl: string) => boolean
}

function findRequest(collections: ApiCollection[], collectionId: string, requestId: string): ApiRequest | undefined {
  return collections.find((c) => c.id === collectionId)?.requests.find((r) => r.id === requestId)
}

function createTabState(request: ApiRequest, collectionId?: string): TabState {
  return {
    id: uuidv4(),
    request: { requestType: 'http', preRequestScript: '', ...request },
    collectionId,
    dirty: false,
    responseView: 'body',
    loading: false,
    clientRequestId: null,
    response: null,
    testResults: [],
    wsConnected: false,
    wsConnecting: false,
    wsMessages: [],
    graphqlSchemaLoading: false,
    requestView: request.requestType === 'graphql' ? 'query' : 'params'
  }
}

function closeWebSocketForTab(tabId: string): void {
  const socket = wsSockets.get(tabId)
  if (socket) {
    socket.close()
    wsSockets.delete(tabId)
  }
}

function findCollection(collections: ApiCollection[], collectionId?: string): ApiCollection | undefined {
  if (!collectionId) return undefined
  return collections.find((c) => c.id === collectionId)
}

async function resolveVariables(get: () => ApiStudioState, request: ApiRequest): Promise<Record<string, string> | undefined> {
  const activeEnv = get().environments.find((e) => e.id === get().activeEnvironmentId)
  let variables = activeEnv ? enabledVariableMap(activeEnv.variables) : {}

  if (request.preRequestScript?.trim()) {
    const res = await window.electronAPI.apiStudio.runPreRequest({
      script: request.preRequestScript,
      variables
    })
    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Pre-request script failed')
    }
    if (res.data.error) throw new Error(res.data.error)
    variables = res.data.variables
    if (activeEnv) {
      get().updateEnvironmentVariables(
        activeEnv.id,
        activeEnv.variables.map((v) => ({
          ...v,
          value: res.data!.variables[v.key] ?? v.value
        }))
      )
    }
  }

  return Object.keys(variables).length > 0 ? variables : undefined
}

export const useApiStudioStore = create<ApiStudioState>()(
  persist(
    (set, get) => ({
      collections: [],
      tabs: [],
      activeTabId: null,
      history: [],
      historyMethodFilter: 'all',
      collectionSearch: '',
      environments: [],
      activeEnvironmentId: null,
      runner: { isRunning: false, progress: null, report: null },
      runnerAbort: false,
      workspaceSplit: 'vertical',

      setWorkspaceSplit: (split) => set({ workspaceSplit: split }),

      createEnvironment: (name) => {
        const environment: ApiEnvironment = { id: uuidv4(), ...createEmptyEnvironment(name.trim() || 'New Environment') }
        set((state) => ({ environments: [...state.environments, environment] }))
        return environment
      },

      renameEnvironment: (id, name) => {
        set((state) => ({
          environments: state.environments.map((e) => (e.id === id ? { ...e, name, updatedAt: new Date().toISOString() } : e))
        }))
      },

      deleteEnvironment: (id) => {
        set((state) => ({
          environments: state.environments.filter((e) => e.id !== id),
          activeEnvironmentId: state.activeEnvironmentId === id ? null : state.activeEnvironmentId
        }))
      },

      duplicateEnvironment: (id) => {
        const original = get().environments.find((e) => e.id === id)
        if (!original) return
        const copy: ApiEnvironment = {
          ...original,
          id: uuidv4(),
          name: `${original.name} (copy)`,
          variables: original.variables.map((v) => ({ ...v, id: uuidv4() })),
          updatedAt: new Date().toISOString()
        }
        set((state) => ({ environments: [...state.environments, copy] }))
      },

      updateEnvironmentVariables: (id, variables) => {
        set((state) => ({
          environments: state.environments.map((e) => (e.id === id ? { ...e, variables, updatedAt: new Date().toISOString() } : e))
        }))
      },

      setActiveEnvironment: (id) => set({ activeEnvironmentId: id }),

      createCollection: (name, description = '') => {
        const now = new Date().toISOString()
        const collection: ApiCollection = {
          id: uuidv4(),
          name: name.trim() || 'New Collection',
          description,
          folders: [],
          requests: [],
          auth: { type: 'none' },
          headers: [createEmptyKeyValue()],
          preRequestScript: '',
          createdAt: now,
          updatedAt: now
        }
        set((state) => ({ collections: [...state.collections, collection] }))
        return collection
      },

      deleteCollection: (collectionId) => {
        set((state) => ({
          collections: state.collections.filter((c) => c.id !== collectionId),
          tabs: state.tabs.filter((t) => t.collectionId !== collectionId)
        }))
      },

      renameCollection: (collectionId, name) => {
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId ? { ...c, name, updatedAt: new Date().toISOString() } : c
          )
        }))
      },

      createFolder: (collectionId, name, parentId = null) => {
        const folder: ApiFolder = {
          id: uuidv4(),
          name: name.trim() || 'New Folder',
          parentId: parentId ?? null,
          auth: createInheritAuth(),
          headers: [createEmptyKeyValue()],
          preRequestScript: ''
        }
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? { ...c, folders: [...c.folders, folder], updatedAt: new Date().toISOString() }
              : c
          )
        }))
        return folder.id
      },

      updateCollectionSettings: (collectionId, patch) => {
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
          )
        }))
      },

      updateFolderSettings: (collectionId, folderId, patch) => {
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  folders: c.folders.map((f) => (f.id === folderId ? { ...f, ...patch } : f)),
                  updatedAt: new Date().toISOString()
                }
              : c
          )
        }))
      },

      switchChildRequestsToInherit: (collectionId, folderId) => {
        const inherit = createInheritAuth()
        set((state) => ({
          collections: state.collections.map((c) => {
            if (c.id !== collectionId) return c
            return {
              ...c,
              requests: c.requests.map((r) =>
                (r.folderId ?? null) === folderId ? { ...r, auth: inherit, updatedAt: new Date().toISOString() } : r
              ),
              updatedAt: new Date().toISOString()
            }
          }),
          tabs: state.tabs.map((t) =>
            t.collectionId === collectionId && (t.request.folderId ?? null) === folderId
              ? { ...t, request: { ...t.request, auth: inherit }, dirty: true }
              : t
          )
        }))
        toast.success('Child requests now inherit parent authorization')
      },

      renameFolder: (collectionId, folderId, name) => {
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  folders: c.folders.map((f) => (f.id === folderId ? { ...f, name } : f)),
                  updatedAt: new Date().toISOString()
                }
              : c
          )
        }))
      },

      deleteFolder: (collectionId, folderId) => {
        set((state) => ({
          collections: state.collections.map((c) => {
            if (c.id !== collectionId) return c
            const removeIds = getDescendantFolderIds(c.folders, folderId)
            return {
              ...c,
              folders: c.folders.filter((f) => !removeIds.has(f.id)),
              requests: c.requests.map((r) =>
                r.folderId && removeIds.has(r.folderId) ? { ...r, folderId: null } : r
              ),
              updatedAt: new Date().toISOString()
            }
          })
        }))
      },

      setCollectionSearch: (query) => set({ collectionSearch: query }),

      reorderCollections: (fromId, toId) => {
        if (fromId === toId) return
        set((state) => {
          const fromIndex = state.collections.findIndex((c) => c.id === fromId)
          const toIndex = state.collections.findIndex((c) => c.id === toId)
          if (fromIndex === -1 || toIndex === -1) return state
          const collections = [...state.collections]
          const [moved] = collections.splice(fromIndex, 1)
          collections.splice(toIndex, 0, moved)
          return { collections }
        })
      },

      reorderFolders: (collectionId, fromId, toId) => {
        if (fromId === toId) return
        set((state) => ({
          collections: state.collections.map((c) => {
            if (c.id !== collectionId) return c
            const fromIndex = c.folders.findIndex((f) => f.id === fromId)
            const toIndex = c.folders.findIndex((f) => f.id === toId)
            if (fromIndex === -1 || toIndex === -1) return c
            // Keep siblings under the same parent when reordering
            const from = c.folders[fromIndex]
            const to = c.folders[toIndex]
            if ((from.parentId ?? null) !== (to.parentId ?? null)) return c
            const folders = [...c.folders]
            const [moved] = folders.splice(fromIndex, 1)
            folders.splice(toIndex, 0, moved)
            return { ...c, folders, updatedAt: new Date().toISOString() }
          })
        }))
      },

      moveFolder: ({ collectionId, folderId, toParentId, beforeFolderId = null }) => {
        if (folderId === toParentId) return
        set((state) => ({
          collections: state.collections.map((c) => {
            if (c.id !== collectionId) return c
            if (toParentId && isFolderDescendant(c.folders, folderId, toParentId)) {
              return c
            }
            const without = c.folders.filter((f) => f.id !== folderId)
            const source = c.folders.find((f) => f.id === folderId)
            if (!source) return c
            const moved: ApiFolder = { ...source, parentId: toParentId }
            let insertAt = without.length
            if (beforeFolderId) {
              const idx = without.findIndex((f) => f.id === beforeFolderId)
              if (idx !== -1) insertAt = idx
            }
            const folders = [...without.slice(0, insertAt), moved, ...without.slice(insertAt)]
            return { ...c, folders, updatedAt: new Date().toISOString() }
          })
        }))
      },

      createRequest: (collectionId, folderId = null, requestType = 'http') => {
        const blank = createEmptyRequest(requestType === 'graphql' ? 'New GraphQL request' : 'New Request', {
          inheritAuth: true
        })
        const request = {
          ...blank,
          ...applyRequestType(blank, requestType),
          folderId,
          ...(requestType === 'graphql' ? { method: 'POST' as const } : {})
        }
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: [...c.requests, request], updatedAt: new Date().toISOString() }
              : c
          )
        }))
        get().openRequestTab(collectionId, request.id)
      },

      deleteRequest: (collectionId, requestId) => {
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId ? { ...c, requests: c.requests.filter((r) => r.id !== requestId) } : c
          ),
          tabs: state.tabs.filter((t) => !(t.collectionId === collectionId && t.request.id === requestId))
        }))
      },

      duplicateRequest: (collectionId, requestId) => {
        const original = findRequest(get().collections, collectionId, requestId)
        if (!original) return
        const copy: ApiRequest = { ...original, id: uuidv4(), name: `${original.name} (copy)`, updatedAt: new Date().toISOString() }
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId ? { ...c, requests: [...c.requests, copy] } : c
          )
        }))
      },

      renameRequest: (collectionId, requestId, name) => {
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: c.requests.map((r) => (r.id === requestId ? { ...r, name } : r)) }
              : c
          ),
          tabs: state.tabs.map((t) =>
            t.collectionId === collectionId && t.request.id === requestId
              ? { ...t, request: { ...t.request, name } }
              : t
          )
        }))
      },

      moveRequestToFolder: (collectionId, requestId, folderId) => {
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: c.requests.map((r) => (r.id === requestId ? { ...r, folderId } : r)) }
              : c
          )
        }))
      },

      moveRequest: ({ requestId, fromCollectionId, toCollectionId, toFolderId, beforeRequestId }) => {
        set((state) => {
          const fromCollection = state.collections.find((c) => c.id === fromCollectionId)
          const original = fromCollection?.requests.find((r) => r.id === requestId)
          if (!original) return state

          const moved = { ...original, folderId: toFolderId, updatedAt: new Date().toISOString() }
          const now = new Date().toISOString()

          function insert(requests: ApiRequest[]): ApiRequest[] {
            const idx = beforeRequestId ? requests.findIndex((r) => r.id === beforeRequestId) : -1
            const at = idx === -1 ? requests.length : idx
            return [...requests.slice(0, at), moved, ...requests.slice(at)]
          }

          const collections = state.collections.map((c) => {
            if (c.id === fromCollectionId && c.id === toCollectionId) {
              const without = c.requests.filter((r) => r.id !== requestId)
              return { ...c, requests: insert(without), updatedAt: now }
            }
            if (c.id === fromCollectionId) {
              return { ...c, requests: c.requests.filter((r) => r.id !== requestId), updatedAt: now }
            }
            if (c.id === toCollectionId) {
              return { ...c, requests: insert(c.requests), updatedAt: now }
            }
            return c
          })

          const tabs = state.tabs.map((t) =>
            t.collectionId === fromCollectionId && t.request.id === requestId
              ? { ...t, collectionId: toCollectionId, request: { ...t.request, folderId: toFolderId } }
              : t
          )

          return { collections, tabs }
        })
      },

      openRequestTab: (collectionId, requestId) => {
        const existingTab = get().tabs.find((t) => t.collectionId === collectionId && t.request.id === requestId)
        if (existingTab) {
          set({ activeTabId: existingTab.id })
          return
        }
        const request = findRequest(get().collections, collectionId, requestId)
        if (!request) return
        const tab = createTabState({ ...request }, collectionId)
        set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }))
      },

      openScratchTab: (seed) => {
        const request = { ...createEmptyRequest('Untitled Request'), ...seed }
        const tab = createTabState(request)
        set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }))
        return tab.id
      },

      openHistoryEntry: (entry) => {
        const request = { ...entry.request, id: uuidv4(), name: `${entry.request.name} (history)` }
        const tab = createTabState(request)
        set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }))
      },

      duplicateTab: (tabId) => {
        const source = get().tabs.find((t) => t.id === tabId)
        if (!source) return tabId
        const request = {
          ...source.request,
          id: uuidv4(),
          name: `${source.request.name} (copy)`,
          updatedAt: new Date().toISOString()
        }
        const tab = createTabState(request, source.collectionId)
        tab.dirty = true
        set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }))
        return tab.id
      },

      closeTab: (tabId) => {
        closeWebSocketForTab(tabId)
        set((state) => {
          const remaining = state.tabs.filter((t) => t.id !== tabId)
          let activeTabId = state.activeTabId
          if (activeTabId === tabId) {
            const closedIndex = state.tabs.findIndex((t) => t.id === tabId)
            activeTabId = remaining[Math.min(closedIndex, remaining.length - 1)]?.id ?? null
          }
          return { tabs: remaining, activeTabId }
        })
      },

      closeOtherTabs: (tabId) => {
        get().tabs.forEach((t) => {
          if (t.id !== tabId) closeWebSocketForTab(t.id)
        })
        set((state) => ({
          tabs: state.tabs.filter((t) => t.id === tabId),
          activeTabId: tabId
        }))
      },

      closeTabsToRight: (tabId) => {
        const index = get().tabs.findIndex((t) => t.id === tabId)
        if (index === -1) return
        get().tabs.slice(index + 1).forEach((t) => closeWebSocketForTab(t.id))
        set((state) => {
          const tabs = state.tabs.slice(0, index + 1)
          return { tabs, activeTabId: state.activeTabId && tabs.some((t) => t.id === state.activeTabId) ? state.activeTabId : tabId }
        })
      },

      copyTabAsCurl: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab) return
        const collection = findCollection(get().collections, tab.collectionId)
        try {
          const curl = generateSnippet(tab.request, 'curl', collection)
          await navigator.clipboard.writeText(curl)
          toast.success('cURL copied to clipboard')
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not copy cURL')
        }
      },

      setActiveTab: (tabId) => set({ activeTabId: tabId }),

      updateDraft: (tabId, patch) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t
            const request = { ...t.request, ...patch, updatedAt: new Date().toISOString() }
            if (patch.url !== undefined) {
              request.pathParams = syncPathParams(patch.url, patch.pathParams ?? t.request.pathParams)
            }
            return { ...t, dirty: true, request }
          })
        }))
      },

      setRequestView: (tabId, view) => {
        set((state) => ({ tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, requestView: view } : t)) }))
      },

      setResponseView: (tabId, view) => {
        set((state) => ({ tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, responseView: view } : t)) }))
      },

      saveTab: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab) return
        if (!tab.collectionId) {
          toast.error('Choose a collection to save this request into')
          return
        }
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === tab.collectionId
              ? {
                  ...c,
                  requests: c.requests.some((r) => r.id === tab.request.id)
                    ? c.requests.map((r) => (r.id === tab.request.id ? tab.request : r))
                    : [...c.requests, tab.request],
                  updatedAt: new Date().toISOString()
                }
              : c
          ),
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, dirty: false } : t))
        }))
        toast.success('Request saved')
      },

      saveTabAs: (tabId, collectionId, folderId = null, name) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab) return
        const saved: ApiRequest = {
          ...tab.request,
          id: uuidv4(),
          name: name?.trim() || tab.request.name,
          folderId,
          updatedAt: new Date().toISOString()
        }
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId ? { ...c, requests: [...c.requests, saved] } : c
          ),
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, request: saved, collectionId, dirty: false } : t))
        }))
        toast.success('Request saved')
      },

      sendTabRequest: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab) return
        if (tab.request.requestType === 'websocket') {
          toast.error('Use Connect for WebSocket requests')
          return
        }
        if (!tab.request.url.trim()) {
          toast.error(tab.request.requestType === 'graphql' ? 'Enter a GraphQL endpoint first' : 'Enter a URL first')
          return
        }

        if (tab.loading && tab.clientRequestId) {
          await cancelHttpRequest(tab.clientRequestId)
        }

        let variables: Record<string, string> | undefined
        const collection = findCollection(get().collections, tab.collectionId)
        try {
          variables = await resolveVariables(get, applyParentInheritance(tab.request, collection))
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Pre-request script failed')
          return
        }

        let resolved
        try {
          resolved = prepareRequest(tab.request, {
            variables,
            timeoutMs: tab.request.timeoutMs,
            collection
          })
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not prepare the request')
          return
        }

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, loading: true, clientRequestId: resolved.clientRequestId, response: null, testResults: [] } : t
          )
        }))

        const started = performance.now()
        const result = finishExecution(tab.request, await executeResolved(resolved))
        const durationMs = Math.round(performance.now() - started)

        // If another send has started for this tab since we began, this
        // response is stale — discard it instead of overwriting newer state.
        const current = get().tabs.find((t) => t.id === tabId)
        if (!current || current.clientRequestId !== resolved.clientRequestId) return

        const snapshot: ResponseSnapshot = {
          request: structuredClone(tab.request),
          response: result,
          capturedAt: new Date().toISOString(),
          label: `${result.status || 'Error'} · ${new Date().toLocaleTimeString()}`
        }
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  loading: false,
                  response: result,
                  previousRun: t.lastRun ?? t.previousRun ?? null,
                  lastRun: snapshot
                }
              : t
          )
        }))

        const historyEntry: ApiHistoryEntry = {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          request: redactRequest(tab.request),
          response: {
            ok: result.ok,
            status: result.status,
            statusText: result.statusText,
            sizeBytes: result.sizeBytes,
            timeMs: result.timeMs,
            error: result.error
          },
          durationMs
        }
        set((state) => ({ history: [historyEntry, ...state.history].slice(0, MAX_HISTORY) }))

        if (result.error && !result.aborted) {
          toast.error(result.error)
        }

        if (tab.request.tests?.trim()) {
          await get().runTabTests(tabId)
        }
      },

      fetchGraphQLSchema: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.request.requestType !== 'graphql') {
          toast.error('Open a GraphQL request to fetch a schema')
          return
        }
        if (!tab.request.url.trim()) {
          toast.error('Enter a GraphQL endpoint first')
          return
        }

        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, graphqlSchemaLoading: true } : t))
        }))

        const fail = (message: string) => {
          toast.error(message)
          set((state) => ({
            tabs: state.tabs.map((t) => {
              if (t.id !== tabId) return t
              const graphql = t.request.graphql ?? createDefaultGraphQLConfig()
              if (graphql.schema?.introspection) return { ...t, graphqlSchemaLoading: false }
              return {
                ...t,
                graphqlSchemaLoading: false,
                request: {
                  ...t.request,
                  graphql: { ...graphql, schema: { ...graphql.schema, error: message } }
                }
              }
            })
          }))
        }

        try {
          const collection = findCollection(get().collections, tab.collectionId)
          const variables = await resolveVariables(get, applyParentInheritance(tab.request, collection))
          const resolved = prepareRequest(buildIntrospectionRequest(tab.request), {
            variables,
            timeoutMs: tab.request.timeoutMs,
            collection
          })
          const result = await executeResolved(resolved)
          const current = get().tabs.find((t) => t.id === tabId)
          if (!current) {
            set((state) => ({
              tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, graphqlSchemaLoading: false } : t))
            }))
            return
          }
          const read = readIntrospectionResult(result)
          if (!read.introspection) {
            fail(read.error ?? 'Schema introspection failed')
            return
          }
          const graphql = current.request.graphql ?? createDefaultGraphQLConfig()
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    dirty: true,
                    graphqlSchemaLoading: false,
                    request: {
                      ...t.request,
                      updatedAt: new Date().toISOString(),
                      graphql: {
                        ...graphql,
                        schema: {
                          introspection: read.introspection,
                          fetchedAt: new Date().toISOString(),
                          endpoint: current.request.url.trim()
                        }
                      }
                    }
                  }
                : t
            )
          }))
          toast.success('Schema fetched')
        } catch (error) {
          fail(error instanceof Error ? error.message : 'Schema introspection failed')
        }
      },

      formatGraphQLQuery: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.request.requestType !== 'graphql') return
        const graphql = tab.request.graphql ?? createDefaultGraphQLConfig()
        if (!graphql.query.trim()) {
          toast.error('Nothing to format')
          return
        }
        try {
          const query = formatGraphQL(graphql.query)
          if (query !== graphql.query) {
            get().updateDraft(tabId, { graphql: { ...graphql, query } })
          }
          toast.success('Query formatted')
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not format the query')
        }
      },

      cancelTabRequest: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab?.clientRequestId) return
        await cancelHttpRequest(tab.clientRequestId)
      },

      runTabTests: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab?.response || !tab.request.tests?.trim()) return
        const activeEnv = get().environments.find((e) => e.id === get().activeEnvironmentId)
        const variables = activeEnv ? enabledVariableMap(activeEnv.variables) : undefined
        const response = await window.electronAPI.apiStudio.runTests({
          script: tab.request.tests,
          request: tab.request,
          response: tab.response,
          variables
        })
        if (response.success && response.data) {
          const { results, variables: after } = response.data
          set((state) => ({
            tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, testResults: results } : t))
          }))
          // Test scripts can save values for later requests, e.g. the token a login returns.
          const updated = activeEnv && variables && after ? applyVariableChanges(activeEnv.variables, variables, after) : null
          if (activeEnv && updated) get().updateEnvironmentVariables(activeEnv.id, updated)
        }
      },

      clearHistory: () => set({ history: [] }),
      setHistoryMethodFilter: (method) => set({ historyMethodFilter: method }),

      importCollection: (json) => {
        try {
          const { collection, warnings } = importCollectionJson(json)
          set((state) => ({ collections: [...state.collections, collection] }))
          toast.success(`Imported "${collection.name}" (${collection.requests.length} requests)`)
          warnings.forEach((w) => toast.warning(w))
          return collection.id
        } catch {
          toast.error('Invalid Postman collection JSON')
          return null
        }
      },

      addCollection: (collection) => {
        set((state) => ({ collections: [...state.collections, collection] }))
      },

      replaceCollection: (collection) => {
        const byId = new Map(collection.requests.map((r) => [r.id, r]))
        set((state) => ({
          collections: state.collections.map((c) => (c.id === collection.id ? collection : c)),
          // Tabs with unsaved edits keep them; clean tabs show the updated request.
          tabs: state.tabs.map((t) =>
            t.collectionId === collection.id && !t.dirty && byId.has(t.request.id) ? { ...t, request: byId.get(t.request.id)! } : t
          )
        }))
      },

      exportCollection: (collectionId) => {
        const collection = get().collections.find((c) => c.id === collectionId)
        if (!collection) return ''
        return exportToPostmanCollection(collection)
      },

      importCurlAsTab: (curl) => {
        try {
          const request = parseCurl(curl)
          if (!request.url.trim()) {
            toast.error('Could not parse a URL from that cURL command')
            return false
          }
          const tab = createTabState(request)
          set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }))
          toast.success('Imported request from cURL')
          return true
        } catch {
          toast.error('Could not parse cURL command')
          return false
        }
      },

      connectWebSocket: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab) return
        if (!tab.request.url.trim()) {
          toast.error('Enter a WebSocket URL first')
          return
        }

        closeWebSocketForTab(tabId)
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, wsConnecting: true, wsConnected: false } : t
          )
        }))

        let url = tab.request.url.trim()
        if (!/^wss?:\/\//i.test(url)) {
          url = `ws://${url.replace(/^https?:\/\//i, '')}`
        }

        try {
          let variables: Record<string, string> | undefined
          try {
            const collection = findCollection(get().collections, tab.collectionId)
            variables = await resolveVariables(get, applyParentInheritance(tab.request, collection))
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Pre-request script failed')
            set((state) => ({
              tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, wsConnecting: false } : t))
            }))
            return
          }

          const withVars = variables
            ? prepareRequest(tab.request, {
                variables,
                collection: findCollection(get().collections, tab.collectionId)
              }).url
            : url
          const socket = new WebSocket(withVars)

          socket.onopen = () => {
            wsSockets.set(tabId, socket)
            set((state) => ({
              tabs: state.tabs.map((t) =>
                t.id === tabId
                  ? {
                      ...t,
                      wsConnecting: false,
                      wsConnected: true,
                      wsMessages: [
                        ...t.wsMessages,
                        { direction: 'system', data: 'Connected', timestamp: new Date().toISOString() }
                      ]
                    }
                  : t
              )
            }))
          }

          socket.onmessage = (event) => {
            set((state) => ({
              tabs: state.tabs.map((t) =>
                t.id === tabId
                  ? {
                      ...t,
                      wsMessages: [
                        ...t.wsMessages,
                        { direction: 'received', data: String(event.data), timestamp: new Date().toISOString() }
                      ]
                    }
                  : t
              )
            }))
          }

          socket.onerror = () => {
            toast.error('WebSocket error')
          }

          socket.onclose = () => {
            wsSockets.delete(tabId)
            set((state) => ({
              tabs: state.tabs.map((t) =>
                t.id === tabId
                  ? {
                      ...t,
                      wsConnecting: false,
                      wsConnected: false,
                      wsMessages: [
                        ...t.wsMessages,
                        { direction: 'system', data: 'Disconnected', timestamp: new Date().toISOString() }
                      ]
                    }
                  : t
              )
            }))
          }
        } catch {
          set((state) => ({
            tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, wsConnecting: false } : t))
          }))
          toast.error('Failed to connect WebSocket')
        }
      },

      disconnectWebSocket: (tabId) => {
        closeWebSocketForTab(tabId)
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, wsConnecting: false, wsConnected: false } : t
          )
        }))
      },

      sendWebSocketMessage: (tabId, message) => {
        const socket = wsSockets.get(tabId)
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          toast.error('WebSocket is not connected')
          return
        }
        socket.send(message)
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  wsMessages: [
                    ...t.wsMessages,
                    { direction: 'sent', data: message, timestamp: new Date().toISOString() }
                  ]
                }
              : t
          )
        }))
      },

      clearWebSocketMessages: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, wsMessages: [] } : t))
        }))
      },

      saveResponseToFile: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab?.response) return
        const res = await window.electronAPI.apiStudio.saveResponse({
          defaultName: `${tab.request.name || 'response'}.${extensionForContentType(tab.response.contentType, tab.response.isBinary)}`,
          content: tab.response.isBinary ? (tab.response.dataBase64 ?? '') : tab.response.data,
          isBase64: tab.response.isBinary,
          contentType: tab.response.contentType
        })
        if (res.success && res.data) toast.success(`Saved to ${res.data}`)
        else if (res.error && res.error !== 'Save cancelled') toast.error(res.error)
      },

      pinResponseBaseline: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab?.response) return
        const baseline: ResponseSnapshot = tab.lastRun
          ? { ...tab.lastRun, label: `Baseline · ${tab.lastRun.label}` }
          : {
              request: structuredClone(tab.request),
              response: tab.response,
              capturedAt: new Date().toISOString(),
              label: `Baseline · ${tab.response.status}`
            }
        set((state) => ({ tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, baseline } : t)) }))
        toast.success('Response pinned as baseline')
      },

      clearResponseBaseline: (tabId) => {
        set((state) => ({ tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, baseline: null } : t)) }))
      },

      runCollection: async (collectionId, options) => {
        const collection = get().collections.find((c) => c.id === collectionId)
        if (!collection) return
        const requests = collectCollectionRequests(collection)
        if (requests.length === 0) {
          toast.error('No requests in collection')
          return
        }
        set({ runner: { isRunning: true, progress: null, report: null }, runnerAbort: false })
        const activeEnv = get().environments.find((e) => e.id === get().activeEnvironmentId)
        const variables = activeEnv ? enabledVariableMap(activeEnv.variables) : undefined
        try {
          const report = await runRequestList(requests, {
            ...options,
            collectionName: collection.name,
            scopeLabel: 'Entire collection',
            variables,
            collection,
            onProgress: (progress) => set({ runner: { isRunning: true, progress, report: null } }),
            shouldAbort: () => get().runnerAbort
          })
          set({ runner: { isRunning: false, progress: null, report } })
          toast.success(`Runner finished: ${report.passed} passed, ${report.failed} failed`)
        } catch {
          set({ runner: { isRunning: false, progress: null, report: null } })
          toast.error('Collection run failed')
        }
      },

      runFolder: async (collectionId, folderId, options) => {
        const collection = get().collections.find((c) => c.id === collectionId)
        if (!collection) return
        const folder = collection.folders.find((f) => f.id === folderId)
        const requests = collectFolderRequests(collection, folderId)
        if (requests.length === 0) {
          toast.error('No requests in folder')
          return
        }
        set({ runner: { isRunning: true, progress: null, report: null }, runnerAbort: false })
        const activeEnv = get().environments.find((e) => e.id === get().activeEnvironmentId)
        const variables = activeEnv ? enabledVariableMap(activeEnv.variables) : undefined
        try {
          const report = await runRequestList(requests, {
            ...options,
            collectionName: collection.name,
            scopeLabel: folder?.name ?? 'Folder',
            variables,
            collection,
            onProgress: (progress) => set({ runner: { isRunning: true, progress, report: null } }),
            shouldAbort: () => get().runnerAbort
          })
          set({ runner: { isRunning: false, progress: null, report } })
          toast.success(`Runner finished: ${report.passed} passed, ${report.failed} failed`)
        } catch {
          set({ runner: { isRunning: false, progress: null, report: null } })
          toast.error('Folder run failed')
        }
      },

      cancelRunner: () => set({ runnerAbort: true }),
      clearRunnerReport: () => set({ runner: { isRunning: false, progress: null, report: null } })
    }),
    {
      name: 'api-studio',
      version: WORKSPACE_SCHEMA_VERSION,
      storage: createJSONStorage(() => workspaceStateStorage),
      migrate: (persisted, version) =>
        prepareWorkspacePersistState(migrateWorkspaceState(persisted, version) as { history?: ApiHistoryEntry[] }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) toast.error(error instanceof Error ? error.message : 'Could not load the workspace')
      },
      partialize: (state) =>
        prepareWorkspacePersistState({
          collections: state.collections,
          history: state.history,
          environments: state.environments,
          activeEnvironmentId: state.activeEnvironmentId,
          activeTabId: state.activeTabId,
          workspaceSplit: state.workspaceSplit,
          // Persist drafts across restarts, but never transient in-flight state.
          tabs: state.tabs.map((t) => ({
            ...t,
            loading: false,
            clientRequestId: null,
            response: null,
            testResults: [],
            wsConnected: false,
            wsConnecting: false,
            wsMessages: [],
            graphqlSchemaLoading: false,
            lastRun: null,
            previousRun: null,
            baseline: null
          }))
        })
    }
  )
)
