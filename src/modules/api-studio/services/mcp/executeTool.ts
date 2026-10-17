import { v4 as uuidv4 } from 'uuid'
import type { McpToolArgs, McpToolName } from '@shared/mcp/tools'
import { MCP_REDACTED } from '@shared/mcp/tools'
import { restoreRedactedAuth, restoreRedactedPairs } from '@shared/mcp/redact'
import { redactRequest as redactStoredRequest } from '@shared/lib/redact-secrets'
import type { ApiCollection, ApiEnvironment, ApiRequest, KeyValuePair, RequestAuth } from '../../types/api.types'
import { useApiStudioStore } from '../../stores/apiStudioStore'
import { createEmptyKeyValue, createEmptyRequest } from '../requestBuilder'
import { exportToPostmanCollection } from '../postman'
import { exportToOpenApi } from '../openapi'
import { generateSnippet, type SnippetLanguage } from '../codeGenerator'
import { importCollectionJson } from '../collectionImport'
import { parseCurl } from '../curlParser'
import { applyParentInheritance } from '../inheritance'
import { enabledVariableMap } from '../environment'
import { executeResolved, finishExecution, prepareRequest } from '../apiClient'
import { collectCollectionRequests, collectFolderRequests, runRequestList } from '../collectionRunner'
import { applyMcpRequestPatch, mcpPairsToStored, type McpPairInput, type McpRequestPatch } from './requestFields'
import {
  presentEnvironment,
  presentExecution,
  presentFolderTree,
  presentParentSettings,
  presentRequest,
  presentRequestSummary,
  redactCollection,
  type McpPresentOptions
} from './present'

export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}

function state() {
  return useApiStudioStore.getState()
}

function requireCollection(collectionId: string): ApiCollection {
  const collection = state().collections.find((item) => item.id === collectionId)
  if (!collection) throw new ToolError('Collection not found')
  return collection
}

function requireRequest(collectionId: string, requestId: string): { collection: ApiCollection; request: ApiRequest } {
  const collection = requireCollection(collectionId)
  const request = collection.requests.find((item) => item.id === requestId)
  if (!request) throw new ToolError('Request not found')
  return { collection, request }
}

function requireFolder(collection: ApiCollection, folderId: string) {
  const folder = collection.folders.find((item) => item.id === folderId)
  if (!folder) throw new ToolError('Folder not found')
  return folder
}

function environmentFor(id: string | null | undefined): ApiEnvironment | null {
  if (id === null) return null
  const current = state()
  const resolved = id === undefined ? current.activeEnvironmentId : id
  if (!resolved) return null
  const environment = current.environments.find((item) => item.id === resolved)
  if (!environment) throw new ToolError('Environment not found')
  return environment
}

function storedPairs(incoming: McpPairInput[] | undefined, existing: KeyValuePair[] = [], caseInsensitive = false): KeyValuePair[] | undefined {
  if (!incoming) return undefined
  const restored = restoreRedactedPairs(mcpPairsToStored(incoming), existing, caseInsensitive)
  if (restored.some((pair) => !pair.key.trim())) return restored
  return [...restored, createEmptyKeyValue()]
}

function saveRequest(collectionId: string, request: ApiRequest): { unsavedEditorKept: boolean } {
  const unsavedEditorKept = state().tabs.some(
    (tab) => tab.collectionId === collectionId && tab.request.id === request.id && tab.dirty
  )
  const now = new Date().toISOString()
  useApiStudioStore.setState((current) => ({
    collections: current.collections.map((collection) => {
      if (collection.id !== collectionId) return collection
      const exists = collection.requests.some((item) => item.id === request.id)
      return {
        ...collection,
        updatedAt: now,
        requests: exists
          ? collection.requests.map((item) => (item.id === request.id ? request : item))
          : [...collection.requests, request]
      }
    }),
    tabs: current.tabs.map((tab) =>
      tab.collectionId === collectionId && tab.request.id === request.id && !tab.dirty
        ? { ...tab, request }
        : tab
    )
  }))
  return { unsavedEditorKept }
}

function parentUpdate(
  args: { auth?: RequestAuth; headers?: McpPairInput[]; preRequestScript?: string },
  existing?: { auth?: RequestAuth; headers?: KeyValuePair[] }
) {
  const patch: { auth?: RequestAuth; headers?: KeyValuePair[]; preRequestScript?: string } = {}
  if (args.auth) {
    patch.auth = restoreRedactedAuth({ ...(existing?.auth ?? { type: 'none' }), ...args.auth }, existing?.auth)
  }
  const headers = storedPairs(args.headers, existing?.headers, true)
  if (headers) patch.headers = headers
  if (args.preRequestScript !== undefined) patch.preRequestScript = args.preRequestScript
  return patch
}

async function resolveSendVariables(
  environment: ApiEnvironment | null,
  request: ApiRequest,
  extra?: Record<string, string>
): Promise<Record<string, string> | undefined> {
  let variables = environment ? enabledVariableMap(environment.variables) : {}
  if (extra) variables = { ...variables, ...extra }
  if (!request.preRequestScript?.trim()) return Object.keys(variables).length > 0 ? variables : undefined

  const res = await window.electronAPI.apiStudio.runPreRequest({ script: request.preRequestScript, variables })
  if (!res.success || !res.data) throw new ToolError(res.error ?? 'Pre-request script failed')
  if (res.data.error) throw new ToolError(res.data.error)
  variables = res.data.variables
  if (environment) {
    state().updateEnvironmentVariables(
      environment.id,
      environment.variables.map((variable) => ({
        ...variable,
        value: variables[variable.key] ?? variable.value
      }))
    )
  }
  return Object.keys(variables).length > 0 ? variables : undefined
}

export async function executeMcpTool(
  tool: McpToolName,
  raw: Record<string, unknown>,
  options: McpPresentOptions
): Promise<unknown> {
  switch (tool) {
    case 'list_collections': {
      const current = state()
      const active = current.environments.find((item) => item.id === current.activeEnvironmentId)
      return {
        activeEnvironmentId: current.activeEnvironmentId,
        activeEnvironmentName: active?.name ?? null,
        collections: current.collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          description: collection.description,
          requestCount: collection.requests.length,
          folderCount: collection.folders.length
        }))
      }
    }
    case 'get_collection': {
      const args = raw as McpToolArgs<'get_collection'>
      const collection = requireCollection(args.collectionId)
      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        ...presentParentSettings(collection, options.redactSecrets),
        rootRequests: collection.requests
          .filter((request) => (request.folderId ?? null) === null)
          .map(presentRequestSummary),
        folders: presentFolderTree(collection, null, options.redactSecrets)
      }
    }
    case 'get_request': {
      const args = raw as McpToolArgs<'get_request'>
      const { collection, request } = requireRequest(args.collectionId, args.requestId)
      return presentRequest(request, collection, options)
    }
    case 'get_request_source': {
      const args = raw as McpToolArgs<'get_request_source'>
      const { collection, request } = requireRequest(args.collectionId, args.requestId)
      if (!options.allowSourceCode) {
        throw new ToolError('Reading source code is off. The user can turn on "Share scanned source code" in Shurikly Settings → MCP.')
      }
      const rootPath = collection.source?.kind === 'code-scanner' ? collection.source.rootPath : null
      const locations = request.scan?.sources ?? []
      if (!rootPath || locations.length === 0) {
        throw new ToolError('This request was not created by the Code Scanner (or was created before it recorded source locations); re-scan the project to add them.')
      }
      const res = await window.electronAPI.codeScanner.readSource({ rootPath, locations })
      if (!res.success || !res.data) throw new ToolError(res.error ?? 'Could not read the source')
      return { method: request.method, url: request.url, rootPath, snippets: res.data }
    }
    case 'search_requests': {
      const args = raw as McpToolArgs<'search_requests'>
      const query = (args.query ?? '').trim().toLowerCase()
      const limit = args.limit ?? 50
      const matches = []
      for (const collection of state().collections) {
        for (const request of collection.requests) {
          if (args.method && request.method !== args.method) continue
          const haystack = `${request.name}\n${request.url}\n${request.description ?? ''}`.toLowerCase()
          if (query && !haystack.includes(query)) continue
          matches.push({
            collectionId: collection.id,
            collectionName: collection.name,
            ...presentRequestSummary(request)
          })
          if (matches.length >= limit) return { requests: matches }
        }
      }
      return { requests: matches }
    }
    case 'list_environments': {
      const current = state()
      return {
        activeEnvironmentId: current.activeEnvironmentId,
        environments: current.environments.map((environment) =>
          presentEnvironment(environment, current.activeEnvironmentId, options.redactSecrets)
        )
      }
    }
    case 'list_history': {
      const args = raw as McpToolArgs<'list_history'>
      const limit = args.limit ?? 20
      let entries = state().history
      if (args.method) entries = entries.filter((entry) => entry.request.method === args.method)
      if (args.failedOnly) {
        entries = entries.filter((entry) => Boolean(entry.response.error) || entry.response.status >= 400)
      }
      return {
        entries: entries.slice(0, limit).map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          durationMs: entry.durationMs,
          request: presentRequestSummary(entry.request),
          response: entry.response
        }))
      }
    }
    case 'get_active_tab': {
      const args = raw as McpToolArgs<'get_active_tab'>
      const current = state()
      const active = current.tabs.find((tab) => tab.id === current.activeTabId) ?? null
      const collection = active?.collectionId
        ? current.collections.find((item) => item.id === active.collectionId)
        : undefined
      return {
        active: active
          ? {
              tabId: active.id,
              collectionId: active.collectionId ?? null,
              dirty: active.dirty,
              loading: active.loading,
              request: presentRequest(active.request, collection, options),
              response: active.response
                ? presentExecution(active.response, { ...options, maxBodyChars: args.maxBodyChars })
                : null,
              testResults: active.testResults
            }
          : null,
        tabs: current.tabs.map((tab) => ({
          tabId: tab.id,
          collectionId: tab.collectionId ?? null,
          dirty: tab.dirty,
          active: tab.id === current.activeTabId,
          ...presentRequestSummary(tab.request)
        }))
      }
    }
    case 'export_collection': {
      const args = raw as McpToolArgs<'export_collection'>
      const collection = requireCollection(args.collectionId)
      const format = args.format ?? 'postman'
      const source = options.redactSecrets ? redactCollection(collection) : collection
      const text = format === 'openapi' ? exportToOpenApi(source) : exportToPostmanCollection(source)
      return { format, text }
    }
    case 'generate_code_snippet': {
      const args = raw as McpToolArgs<'generate_code_snippet'>
      const { collection, request } = requireRequest(args.collectionId, args.requestId)
      const language = args.language as SnippetLanguage
      if (!options.redactSecrets) return { language, code: generateSnippet(request, language, collection) }
      const effective = applyParentInheritance(request, collection)
      const shown = presentRequest(effective, undefined, options)
      const code = generateSnippet(
        {
          ...effective,
          auth: shown.auth ?? effective.auth,
          headers: effective.headers.map((header) => {
            const match = shown.headers.find((item) => item.key.toLowerCase() === header.key.toLowerCase())
            return match ? { ...header, value: match.value } : header
          })
        },
        language
      )
      return { language, code }
    }
    case 'create_collection': {
      const args = raw as McpToolArgs<'create_collection'>
      const collection = state().createCollection(args.name, args.description ?? '')
      const patch = parentUpdate(args)
      if (Object.keys(patch).length > 0) state().updateCollectionSettings(collection.id, patch)
      const saved = requireCollection(collection.id)
      return {
        id: saved.id,
        name: saved.name,
        description: saved.description,
        ...presentParentSettings(saved, options.redactSecrets)
      }
    }
    case 'update_collection': {
      const args = raw as McpToolArgs<'update_collection'>
      const collection = requireCollection(args.collectionId)
      if (args.name) state().renameCollection(collection.id, args.name)
      if (args.description !== undefined) {
        useApiStudioStore.setState((current) => ({
          collections: current.collections.map((item) =>
            item.id === collection.id ? { ...item, description: args.description ?? '', updatedAt: new Date().toISOString() } : item
          )
        }))
      }
      const patch = parentUpdate(args, collection)
      if (Object.keys(patch).length > 0) state().updateCollectionSettings(collection.id, patch)
      const saved = requireCollection(collection.id)
      return {
        id: saved.id,
        name: saved.name,
        description: saved.description,
        ...presentParentSettings(saved, options.redactSecrets)
      }
    }
    case 'delete_collection': {
      const args = raw as McpToolArgs<'delete_collection'>
      requireCollection(args.collectionId)
      state().deleteCollection(args.collectionId)
      return { deleted: true }
    }
    case 'create_folder': {
      const args = raw as McpToolArgs<'create_folder'>
      const collection = requireCollection(args.collectionId)
      if (args.parentFolderId) requireFolder(collection, args.parentFolderId)
      const folderId = state().createFolder(collection.id, args.name, args.parentFolderId ?? null)
      const patch = parentUpdate(args, { auth: { type: 'inherit' } })
      if (Object.keys(patch).length > 0) state().updateFolderSettings(collection.id, folderId, patch)
      const saved = requireFolder(requireCollection(collection.id), folderId)
      return { id: saved.id, name: saved.name, parentFolderId: saved.parentId ?? null, ...presentParentSettings(saved, options.redactSecrets) }
    }
    case 'update_folder': {
      const args = raw as McpToolArgs<'update_folder'>
      const collection = requireCollection(args.collectionId)
      const folder = requireFolder(collection, args.folderId)
      if (args.parentFolderId !== undefined && (folder.parentId ?? null) !== args.parentFolderId) {
        if (args.parentFolderId) requireFolder(collection, args.parentFolderId)
        state().moveFolder({ collectionId: collection.id, folderId: folder.id, toParentId: args.parentFolderId })
        const moved = requireFolder(requireCollection(collection.id), folder.id)
        if ((moved.parentId ?? null) !== args.parentFolderId) {
          throw new ToolError('Cannot move a folder into itself or one of its sub-folders')
        }
      }
      if (args.name) state().renameFolder(collection.id, folder.id, args.name)
      const patch = parentUpdate(args, folder)
      if (Object.keys(patch).length > 0) state().updateFolderSettings(collection.id, folder.id, patch)
      const saved = requireFolder(requireCollection(collection.id), folder.id)
      return { id: saved.id, name: saved.name, parentFolderId: saved.parentId ?? null, ...presentParentSettings(saved, options.redactSecrets) }
    }
    case 'delete_folder': {
      const args = raw as McpToolArgs<'delete_folder'>
      const collection = requireCollection(args.collectionId)
      requireFolder(collection, args.folderId)
      state().deleteFolder(collection.id, args.folderId)
      return { deleted: true }
    }
    case 'create_request': {
      const args = raw as McpToolArgs<'create_request'>
      const collection = requireCollection(args.collectionId)
      if (args.folderId) requireFolder(collection, args.folderId)
      const blank = createEmptyRequest(args.name, { inheritAuth: true })
      const request = applyMcpRequestPatch(
        { ...blank, folderId: args.folderId ?? null },
        args as McpRequestPatch
      )
      request.id = blank.id
      saveRequest(collection.id, request)
      if (args.openInApp) state().openRequestTab(collection.id, request.id)
      return presentRequest(request, requireCollection(collection.id), options)
    }
    case 'update_request': {
      const args = raw as McpToolArgs<'update_request'>
      const { collection, request } = requireRequest(args.collectionId, args.requestId)
      if (args.folderId) requireFolder(collection, args.folderId)
      const next = applyMcpRequestPatch(request, { ...args, folderId: undefined } as McpRequestPatch)
      if (args.folderId !== undefined) next.folderId = args.folderId
      const saved = saveRequest(collection.id, next)
      return { ...presentRequest(next, requireCollection(collection.id), options), ...saved }
    }
    case 'delete_request': {
      const args = raw as McpToolArgs<'delete_request'>
      requireRequest(args.collectionId, args.requestId)
      state().deleteRequest(args.collectionId, args.requestId)
      return { deleted: true }
    }
    case 'create_environment': {
      const args = raw as McpToolArgs<'create_environment'>
      const environment = state().createEnvironment(args.name)
      if (args.variables?.length) {
        state().updateEnvironmentVariables(
          environment.id,
          args.variables.map((variable) => ({
            id: uuidv4(),
            key: variable.key,
            value: variable.value,
            enabled: variable.enabled ?? true
          }))
        )
      }
      if (args.activate) state().setActiveEnvironment(environment.id)
      const saved = state().environments.find((item) => item.id === environment.id)
      if (!saved) throw new ToolError('Environment was not created')
      return presentEnvironment(saved, state().activeEnvironmentId, options.redactSecrets)
    }
    case 'update_environment': {
      const args = raw as McpToolArgs<'update_environment'>
      const environment = state().environments.find((item) => item.id === args.environmentId)
      if (!environment) throw new ToolError('Environment not found')
      if (args.name) state().renameEnvironment(environment.id, args.name)
      let variables = [...environment.variables]
      for (const key of args.remove ?? []) variables = variables.filter((variable) => variable.key !== key)
      for (const item of args.set ?? []) {
        const index = variables.findIndex((variable) => variable.key === item.key)
        const stored = index >= 0 ? variables[index].value : ''
        const value = item.value === MCP_REDACTED && index >= 0 ? stored : item.value
        const next = {
          id: index >= 0 ? variables[index].id : uuidv4(),
          key: item.key,
          value,
          enabled: item.enabled ?? (index >= 0 ? variables[index].enabled : true)
        }
        if (index >= 0) variables[index] = next
        else variables.push(next)
      }
      if (args.set || args.remove) state().updateEnvironmentVariables(environment.id, variables)
      const saved = state().environments.find((item) => item.id === environment.id)
      if (!saved) throw new ToolError('Environment not found')
      return presentEnvironment(saved, state().activeEnvironmentId, options.redactSecrets)
    }
    case 'delete_environment': {
      const args = raw as McpToolArgs<'delete_environment'>
      if (!state().environments.some((item) => item.id === args.environmentId)) throw new ToolError('Environment not found')
      state().deleteEnvironment(args.environmentId)
      return { deleted: true }
    }
    case 'set_active_environment': {
      const args = raw as McpToolArgs<'set_active_environment'>
      if (args.environmentId && !state().environments.some((item) => item.id === args.environmentId)) {
        throw new ToolError('Environment not found')
      }
      state().setActiveEnvironment(args.environmentId)
      return { activeEnvironmentId: args.environmentId }
    }
    case 'import_collection': {
      const args = raw as McpToolArgs<'import_collection'>
      let imported
      try {
        imported = importCollectionJson(args.json)
      } catch {
        throw new ToolError('Invalid Postman collection JSON')
      }
      const now = new Date().toISOString()
      const collection = { ...imported.collection, id: uuidv4(), createdAt: now, updatedAt: now }
      useApiStudioStore.setState((current) => ({ collections: [...current.collections, collection] }))
      return {
        collectionId: collection.id,
        name: collection.name,
        requestCount: collection.requests.length,
        warnings: imported.warnings
      }
    }
    case 'import_curl': {
      const args = raw as McpToolArgs<'import_curl'>
      let parsed: ApiRequest
      try {
        parsed = parseCurl(args.curl)
      } catch {
        throw new ToolError('Could not parse that cURL command')
      }
      if (!parsed.url.trim()) throw new ToolError('Could not parse a URL from that cURL command')
      if (args.name) parsed = { ...parsed, name: args.name }
      if (args.collectionId) {
        const collection = requireCollection(args.collectionId)
        if (args.folderId) requireFolder(collection, args.folderId)
        parsed = { ...parsed, id: uuidv4(), folderId: args.folderId ?? null, updatedAt: new Date().toISOString() }
        saveRequest(collection.id, parsed)
        return presentRequest(parsed, requireCollection(collection.id), options)
      }
      const tabId = state().openScratchTab(parsed)
      const tab = state().tabs.find((item) => item.id === tabId)
      return { opened: true, tabId, request: tab ? presentRequest(tab.request, undefined, options) : null }
    }
    case 'send_request': {
      const args = raw as McpToolArgs<'send_request'>
      let request: ApiRequest
      let collection: ApiCollection | undefined
      if (args.requestId) {
        if (!args.collectionId) throw new ToolError('collectionId is required when sending a saved request')
        const found = requireRequest(args.collectionId, args.requestId)
        request = found.request
        collection = found.collection
      } else if (args.request?.url) {
        collection = args.collectionId ? requireCollection(args.collectionId) : undefined
        const blank = createEmptyRequest(args.request.name ?? 'Ad-hoc request', { inheritAuth: Boolean(collection) })
        request = applyMcpRequestPatch(blank, args.request as McpRequestPatch)
        request.id = blank.id
      } else {
        throw new ToolError('Pass collectionId + requestId, or a request with a url')
      }
      if ((request.requestType ?? 'http') === 'websocket') {
        throw new ToolError('WebSocket requests cannot be sent with send_request')
      }
      const environment = environmentFor(args.environmentId)
      const inherited = applyParentInheritance(request, collection)
      const variables = await resolveSendVariables(environment, inherited, args.variables)
      let resolved
      try {
        resolved = prepareRequest(request, { variables, timeoutMs: request.timeoutMs, collection })
      } catch (error) {
        throw new ToolError(error instanceof Error ? error.message : 'Could not prepare the request')
      }
      const started = performance.now()
      const result = finishExecution(request, await executeResolved(resolved))
      const durationMs = Math.round(performance.now() - started)
      useApiStudioStore.setState((current) => ({
        history: [
          {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            request: redactStoredRequest(request),
            response: {
              ok: result.ok,
              status: result.status,
              statusText: result.statusText,
              sizeBytes: result.sizeBytes,
              timeMs: result.timeMs,
              error: result.error
            },
            durationMs
          },
          ...current.history
        ].slice(0, 200)
      }))
      let testResults: { name: string; passed: boolean; error?: string }[] = []
      if (request.tests?.trim()) {
        const tests = await window.electronAPI.apiStudio.runTests({ script: request.tests, request, response: result })
        if (tests.success && tests.data) testResults = tests.data.results
      }
      return {
        ...presentExecution(result, { ...options, maxBodyChars: args.maxBodyChars }),
        testResults
      }
    }
    case 'run_collection': {
      const args = raw as McpToolArgs<'run_collection'>
      const collection = requireCollection(args.collectionId)
      if (args.folderId) requireFolder(collection, args.folderId)
      if (state().runner.isRunning) throw new ToolError('A collection run is already in progress')
      const requests = args.folderId
        ? collectFolderRequests(collection, args.folderId)
        : collectCollectionRequests(collection)
      if (requests.length === 0) throw new ToolError('No requests to run')
      const environment = environmentFor(args.environmentId)
      const variables = environment ? enabledVariableMap(environment.variables) : undefined
      const folder = args.folderId ? collection.folders.find((item) => item.id === args.folderId) : undefined
      useApiStudioStore.setState({ runner: { isRunning: true, progress: null, report: null }, runnerAbort: false })
      try {
        const report = await runRequestList(requests, {
          delayMs: args.delayMs ?? 0,
          stopOnFail: args.stopOnFail ?? false,
          collectionName: collection.name,
          scopeLabel: folder?.name ?? 'Entire collection',
          variables,
          collection,
          onProgress: (progress) =>
            useApiStudioStore.setState({ runner: { isRunning: true, progress, report: null } }),
          shouldAbort: () => state().runnerAbort
        })
        useApiStudioStore.setState({ runner: { isRunning: false, progress: null, report } })
        return report
      } catch (error) {
        useApiStudioStore.setState({ runner: { isRunning: false, progress: null, report: null } })
        throw error instanceof ToolError ? error : new ToolError(error instanceof Error ? error.message : 'Collection run failed')
      }
    }
    case 'open_request': {
      const args = raw as McpToolArgs<'open_request'>
      requireRequest(args.collectionId, args.requestId)
      state().openRequestTab(args.collectionId, args.requestId)
      const tab = state().tabs.find(
        (item) => item.collectionId === args.collectionId && item.request.id === args.requestId
      )
      return { opened: true, tabId: tab?.id ?? null }
    }
    default:
      throw new ToolError(`Unknown tool: ${tool}`)
  }
}
