import { v4 as uuidv4 } from 'uuid'
import type { ApiRequest, GraphQLRequestConfig, KeyValuePair, RequestType } from '../../types/api.types'

export const WORKSPACE_SCHEMA_VERSION = 2

export function createDefaultGraphQLConfig(): GraphQLRequestConfig {
  return {
    query: '',
    variables: '{\n}'
  }
}

export function ensureJsonContentType(headers: KeyValuePair[]): KeyValuePair[] {
  const hasType = headers.some((header) => header.enabled && header.key.trim().toLowerCase() === 'content-type')
  if (hasType) return headers
  const filled = headers.filter((header) => header.key.trim())
  const blanks = headers.filter((header) => !header.key.trim())
  return [
    ...filled,
    { id: uuidv4(), key: 'Content-Type', value: 'application/json', enabled: true },
    ...(blanks.length > 0 ? blanks : [{ id: uuidv4(), key: '', value: '', enabled: true }])
  ]
}

/** Switch request kind without dropping REST or GraphQL fields already entered. */
export function applyRequestType(request: ApiRequest, type: RequestType): Partial<ApiRequest> {
  if (type === 'graphql') {
    return {
      requestType: 'graphql',
      graphql: request.graphql ?? createDefaultGraphQLConfig(),
      headers: ensureJsonContentType(request.headers)
    }
  }
  return { requestType: type }
}

export function normalizeStoredRequest<T extends Partial<ApiRequest>>(request: T): T {
  if (!request || typeof request !== 'object') return request
  const rawType = request.requestType
  const requestType: RequestType =
    rawType === 'websocket' || rawType === 'graphql' || rawType === 'http' ? rawType : 'http'
  const next = { ...request, requestType }
  if (requestType === 'graphql') {
    const current = request.graphql
    next.graphql = {
      query: typeof current?.query === 'string' ? current.query : '',
      variables: typeof current?.variables === 'string' ? current.variables : '{\n}',
      ...(typeof current?.operationName === 'string' ? { operationName: current.operationName } : {}),
      ...(current?.schema ? { schema: current.schema } : {})
    }
  }
  return next
}
