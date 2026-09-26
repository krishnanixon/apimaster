import type {
  ApiRequest,
  HttpMethod,
  KeyValuePair,
  RequestAuth,
  RequestBody,
  RequestBodyType,
  RequestType
} from '../../types/api.types'
import { createEmptyKeyValue, splitUrlAndParams, syncPathParams } from '../requestBuilder'
import { applyRequestType, createDefaultGraphQLConfig } from '../graphql/model'
import { restoreRedactedAuth, restoreRedactedPairs } from '@shared/mcp/redact'

export interface McpPairInput {
  key: string
  value: string
  enabled?: boolean
  description?: string
}

export interface McpBodyInput {
  type: RequestBodyType
  content?: string
  formData?: Array<{ key: string; value: string; enabled?: boolean }>
}

export interface McpRequestPatch {
  name?: string
  method?: HttpMethod
  url?: string
  headers?: McpPairInput[]
  queryParams?: McpPairInput[]
  pathParams?: McpPairInput[]
  body?: McpBodyInput
  auth?: RequestAuth
  tests?: string
  preRequestScript?: string
  description?: string
  requestType?: RequestType
  graphql?: { query: string; variables?: string; operationName?: string }
  timeoutMs?: number
}

export function mcpPairsToStored(list: McpPairInput[]): KeyValuePair[] {
  return list.map((pair) => ({
    id: crypto.randomUUID(),
    key: pair.key,
    value: pair.value,
    enabled: pair.enabled ?? true,
    description: pair.description
  }))
}

function withEditorRow(pairs: KeyValuePair[]): KeyValuePair[] {
  if (pairs.some((pair) => !pair.key.trim())) return pairs
  return [...pairs, createEmptyKeyValue()]
}

function mergePairs(primary: KeyValuePair[], extra: KeyValuePair[]): KeyValuePair[] {
  const merged = primary.filter((pair) => pair.key.trim())
  for (const pair of extra) {
    if (!pair.key.trim()) continue
    if (merged.some((item) => item.key === pair.key)) continue
    merged.push(pair)
  }
  return withEditorRow(merged)
}

function toBody(input: McpBodyInput): RequestBody {
  return {
    type: input.type,
    content: input.content ?? '',
    formData: input.formData?.map((field) => ({
      id: crypto.randomUUID(),
      key: field.key,
      value: field.value,
      enabled: field.enabled ?? true,
      type: 'text' as const
    }))
  }
}

/** Overlay an MCP request patch onto a stored request. `[REDACTED]` keeps the stored secret. */
export function applyMcpRequestPatch(base: ApiRequest, patch: McpRequestPatch): ApiRequest {
  let next: ApiRequest = { ...base, updatedAt: new Date().toISOString() }

  if (patch.name !== undefined) next.name = patch.name
  if (patch.method !== undefined) next.method = patch.method
  if (patch.tests !== undefined) next.tests = patch.tests
  if (patch.preRequestScript !== undefined) next.preRequestScript = patch.preRequestScript
  if (patch.description !== undefined) next.description = patch.description
  if (patch.timeoutMs !== undefined) next.timeoutMs = patch.timeoutMs

  if (patch.requestType !== undefined) {
    next = { ...next, ...applyRequestType(next, patch.requestType) }
  }

  if (patch.graphql) {
    const current = next.graphql ?? createDefaultGraphQLConfig()
    next = {
      ...next,
      requestType: 'graphql',
      graphql: {
        query: patch.graphql.query,
        variables: patch.graphql.variables ?? current.variables,
        operationName: patch.graphql.operationName,
        schema: current.schema
      }
    }
  }

  if (patch.headers) {
    next.headers = withEditorRow(restoreRedactedPairs(mcpPairsToStored(patch.headers), base.headers, true))
  }
  if (patch.body) next.body = toBody(patch.body)
  if (patch.auth) {
    next.auth = restoreRedactedAuth({ ...base.auth, ...patch.auth }, base.auth)
  }

  if (patch.url !== undefined || patch.queryParams || patch.pathParams) {
    const split = splitUrlAndParams(patch.url ?? next.url)
    next.url = split.base
    if (patch.queryParams) {
      const provided = restoreRedactedPairs(mcpPairsToStored(patch.queryParams), base.queryParams, false)
      next.queryParams = mergePairs(provided, split.params)
    } else if (split.params.length > 0) {
      next.queryParams = mergePairs(next.queryParams, split.params)
    }
    const pathSource = patch.pathParams ? mcpPairsToStored(patch.pathParams) : (next.pathParams ?? [])
    next.pathParams = syncPathParams(next.url, pathSource)
  }

  return next
}
