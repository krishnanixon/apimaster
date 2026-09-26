import {
  buildClientSchema,
  getIntrospectionQuery,
  type GraphQLSchema,
  type IntrospectionQuery
} from 'graphql'
import type { ApiExecutionResult, ApiRequest, GraphQLSchemaMetadata } from '../../types/api.types'

export type GraphQLSchemaStatus = 'available' | 'unavailable' | 'loading' | 'outdated'

const INTROSPECTION_QUERY = getIntrospectionQuery()

export function introspectionQuery(): string {
  return INTROSPECTION_QUERY
}

export function schemaFromIntrospection(value: unknown): GraphQLSchema | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (!('__schema' in value)) return null
  try {
    return buildClientSchema(value as unknown as IntrospectionQuery)
  } catch {
    return null
  }
}

export function graphQLSchemaStatus(
  url: string,
  metadata: GraphQLSchemaMetadata | undefined,
  loading: boolean
): GraphQLSchemaStatus {
  if (loading) return 'loading'
  if (!metadata?.introspection || !schemaFromIntrospection(metadata.introspection)) return 'unavailable'
  if ((metadata.endpoint ?? '') !== url.trim()) return 'outdated'
  return 'available'
}

export function schemaStatusLabel(status: GraphQLSchemaStatus): string {
  switch (status) {
    case 'available':
      return 'Schema available'
    case 'loading':
      return 'Schema loading'
    case 'outdated':
      return 'Schema outdated'
    default:
      return 'Schema unavailable'
  }
}

/** HTTP request that reuses the GraphQL call's auth, headers, and endpoint. */
export function buildIntrospectionRequest(request: ApiRequest): ApiRequest {
  const headers = request.headers.map((header) => ({ ...header }))
  const hasContentType = headers.some((header) => header.enabled && header.key.toLowerCase() === 'content-type' && header.key.trim())
  return {
    ...request,
    requestType: 'http',
    method: 'POST',
    graphql: undefined,
    headers: hasContentType
      ? headers
      : [
          ...headers.filter((header) => header.key.trim()),
          { id: 'introspection-content-type', key: 'Content-Type', value: 'application/json', enabled: true }
        ],
    body: {
      type: 'json',
      content: JSON.stringify({ query: INTROSPECTION_QUERY })
    }
  }
}

export function readIntrospectionResult(result: ApiExecutionResult): {
  introspection?: Record<string, unknown>
  error?: string
} {
  if (result.status === 0) {
    return { error: friendlyTransportError(result.error ?? 'Could not reach the GraphQL endpoint.') }
  }
  if (!result.data.trim()) {
    return { error: httpFailureMessage(result.status, 'Schema introspection returned an empty body.') }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.data)
  } catch {
    return { error: httpFailureMessage(result.status, 'Schema introspection did not return JSON.') }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { error: 'Schema introspection returned an unexpected payload.' }
  }

  const body = parsed as { data?: { __schema?: unknown }; errors?: { message?: string }[] }
  const errorText = Array.isArray(body.errors)
    ? body.errors.map((error) => error?.message).filter((message): message is string => Boolean(message)).join('\n')
    : ''

  if (!body.data?.__schema) {
    if (result.status === 401 || result.status === 403) {
      return { error: httpFailureMessage(result.status, errorText || 'The server refused introspection.') }
    }
    return { error: errorText || httpFailureMessage(result.status, 'The server did not return a GraphQL schema.') }
  }

  if (!schemaFromIntrospection(body.data)) {
    return { error: 'The introspection result is not a valid GraphQL schema.' }
  }

  return { introspection: body.data as unknown as Record<string, unknown> }
}

export function friendlyTransportError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('timeout') || lower.includes('econnaborted')) {
    return 'The request timed out. Raise the timeout in Settings, or check that the server is responding.'
  }
  if (lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('getaddrinfo')) {
    return 'Could not resolve that endpoint. Check the host name.'
  }
  if (lower.includes('econnrefused')) {
    return 'The server refused the connection. Check that the endpoint is running.'
  }
  if (lower.includes('econnreset')) {
    return 'The connection closed before a response arrived.'
  }
  if (lower.includes('certificate') || lower.includes('unable to verify')) {
    return 'TLS certificate verification failed for this endpoint.'
  }
  if (lower.includes('network error') || lower.includes('failed to fetch')) {
    return 'Network request failed. Check the endpoint and your connection.'
  }
  return message
}

export function httpFailureMessage(status: number, fallback: string): string {
  switch (status) {
    case 400:
      return 'The server rejected the request (400).'
    case 401:
      return 'Authentication failed (401). Check the Auth tab.'
    case 403:
      return 'Access was forbidden (403). These credentials may lack permission.'
    case 404:
      return 'Endpoint not found (404). Check the GraphQL URL.'
    case 500:
    case 502:
    case 503:
    case 504:
      return `The server failed while handling the request (${status}).`
    default:
      return status >= 400 ? `The request failed (${status}).` : fallback
  }
}
