import type {
  ApiCollection,
  ApiEnvironment,
  ApiExecutionResult,
  ApiFolder,
  ApiRequest,
  KeyValuePair,
  RequestAuth
} from '../../types/api.types'
import { resolveInheritedAuth } from '../inheritance'
import { isSensitiveHeader, isSensitiveVariable, redactAuth, redactPairs, redactRequest } from '@shared/mcp/redact'
import { MCP_REDACTED } from '@shared/mcp/tools'

export interface McpPresentOptions {
  redactSecrets: boolean
  /** The user allowed agents to read scanned source code (MCP settings). */
  allowSourceCode?: boolean
  maxBodyChars?: number
}

function blank(value: string | undefined): boolean {
  return !value || !value.trim() || /\{\{\s*[\w.-]+\s*\}\}/.test(value)
}

function showAuth(auth: RequestAuth | undefined, redact: boolean): RequestAuth | undefined {
  if (!auth) return undefined
  return redact ? redactAuth(auth) : auth
}

function showPairs(pairs: KeyValuePair[] | undefined, redact: boolean, sensitive: boolean) {
  const source = redact && sensitive ? redactPairs(pairs ?? [], isSensitiveHeader) : (pairs ?? [])
  return source
    .filter((pair) => pair.key.trim())
    .map((pair) => ({
      key: pair.key,
      value: pair.value,
      enabled: pair.enabled,
      ...(pair.description ? { description: pair.description } : {})
    }))
}

export function presentRequestSummary(request: ApiRequest) {
  return {
    id: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    requestType: request.requestType ?? 'http',
    folderId: request.folderId ?? null
  }
}

export function presentRequest(request: ApiRequest, collection: ApiCollection | undefined, options: McpPresentOptions) {
  const shown = options.redactSecrets ? redactRequest(request) : request
  const inherited =
    request.auth?.type === 'inherit' ? resolveInheritedAuth(request, collection) : null
  return {
    id: shown.id,
    name: shown.name,
    method: shown.method,
    url: shown.url,
    requestType: shown.requestType ?? 'http',
    folderId: shown.folderId ?? null,
    folderName: collection?.folders.find((folder) => folder.id === shown.folderId)?.name ?? null,
    headers: showPairs(shown.headers, false, false),
    queryParams: showPairs(shown.queryParams, false, false),
    pathParams: showPairs(shown.pathParams, false, false),
    body: {
      type: shown.body.type,
      content: shown.body.type === 'form-data' ? undefined : shown.body.content,
      formData:
        shown.body.type === 'form-data'
          ? (shown.body.formData ?? [])
              .filter((field) => field.key.trim())
              .map((field) => ({
                key: field.key,
                value: field.type === 'file' ? `[file:${field.fileName ?? 'file'}]` : field.value,
                enabled: field.enabled
              }))
          : undefined
    },
    auth: shown.auth,
    inheritedFrom: inherited
      ? {
          source: inherited.source,
          name: inherited.sourceName,
          auth: showAuth(inherited.auth, options.redactSecrets)
        }
      : undefined,
    tests: shown.tests ?? '',
    preRequestScript: shown.preRequestScript ?? '',
    description: shown.description ?? '',
    graphql: shown.graphql
      ? {
          query: shown.graphql.query,
          variables: shown.graphql.variables,
          operationName: shown.graphql.operationName
        }
      : undefined,
    timeoutMs: shown.timeoutMs ?? 30_000
  }
}

export function presentParentSettings(
  node: { auth?: RequestAuth; headers?: KeyValuePair[]; preRequestScript?: string },
  redact: boolean
) {
  return {
    auth: showAuth(node.auth, redact),
    headers: showPairs(node.headers, redact, true),
    preRequestScript: node.preRequestScript ?? ''
  }
}

export function presentFolderTree(collection: ApiCollection, parentId: string | null, redact: boolean, seen = new Set<string>): unknown[] {
  return collection.folders
    .filter((folder) => (folder.parentId ?? null) === parentId && !seen.has(folder.id))
    .map((folder) => {
      seen.add(folder.id)
      return {
        id: folder.id,
        name: folder.name,
        ...presentParentSettings(folder, redact),
        requests: collection.requests
          .filter((request) => (request.folderId ?? null) === folder.id)
          .map(presentRequestSummary),
        folders: presentFolderTree(collection, folder.id, redact, seen)
      }
    })
}

export function presentEnvironment(environment: ApiEnvironment, activeId: string | null, redact: boolean) {
  return {
    id: environment.id,
    name: environment.name,
    active: environment.id === activeId,
    variables: environment.variables
      .filter((variable) => variable.key.trim())
      .map((variable) => ({
        key: variable.key,
        value:
          redact && isSensitiveVariable(variable.key) && !blank(variable.value) ? MCP_REDACTED : variable.value,
        enabled: variable.enabled
      }))
  }
}

export function presentExecution(result: ApiExecutionResult, options: McpPresentOptions) {
  const max = options.maxBodyChars ?? 20_000
  const raw = result.isBinary ? '' : result.data
  const truncated = !result.isBinary && raw.length > max
  const headers = { ...result.headers }
  if (options.redactSecrets) {
    for (const key of Object.keys(headers)) {
      if (isSensitiveHeader(key) && !blank(headers[key])) headers[key] = MCP_REDACTED
    }
  }
  return {
    ok: result.ok,
    status: result.status,
    statusText: result.statusText,
    timeMs: result.timeMs,
    sizeBytes: result.sizeBytes,
    contentType: result.contentType,
    isBinary: result.isBinary,
    error: result.error,
    headers,
    body: result.isBinary ? `[binary ${result.sizeBytes} bytes]` : raw.slice(0, max),
    truncated,
    graphql: result.graphql
      ? {
          hasErrors: result.graphql.hasErrors,
          errors: result.graphql.errors,
          parseError: result.graphql.parseError
        }
      : undefined
  }
}

export function redactCollection(collection: ApiCollection): ApiCollection {
  const redactFolder = (folder: ApiFolder): ApiFolder => ({
    ...folder,
    auth: folder.auth ? redactAuth(folder.auth) : folder.auth,
    headers: redactPairs(folder.headers ?? [], isSensitiveHeader)
  })
  return {
    ...collection,
    auth: collection.auth ? redactAuth(collection.auth) : collection.auth,
    headers: redactPairs(collection.headers ?? [], isSensitiveHeader),
    folders: collection.folders.map(redactFolder),
    requests: collection.requests.map(redactRequest)
  }
}
