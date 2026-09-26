import type { ApiExecutionResult, ApiRequest, GraphQLResponseError, GraphQLResponseInfo } from '../../types/api.types'
import {
  blockingGraphQLIssues,
  GraphQLClientError,
  inspectGraphQL,
  schemaForRequest
} from './document'
import { friendlyTransportError, httpFailureMessage } from './schema'

function isAcceptableUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed || trimmed.includes('{{')) return false
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(withProtocol)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Turns a GraphQL request into the HTTP POST the shared client already sends. */
export function toGraphQLHttpRequest(request: ApiRequest): ApiRequest {
  if (request.requestType !== 'graphql') return request

  if (!request.url.trim()) {
    throw new GraphQLClientError('Enter a GraphQL endpoint first.')
  }
  if (!isAcceptableUrl(request.url)) {
    throw new GraphQLClientError(
      request.url.includes('{{')
        ? 'The endpoint still has an unresolved variable. Choose an environment or fill in the value.'
        : 'Enter a valid GraphQL endpoint, such as https://api.example.com/graphql.'
    )
  }

  const config = request.graphql ?? { query: '', variables: '' }
  const schema = schemaForRequest(config.schema)
  const inspection = inspectGraphQL({
    query: config.query,
    variablesText: config.variables,
    operationName: config.operationName,
    schema
  })
  const issues = blockingGraphQLIssues(inspection)
  if (issues.length > 0) {
    throw new GraphQLClientError(issues[0], issues)
  }

  const payload: Record<string, unknown> = {
    query: config.query,
    variables: inspection.parsedVariables
  }
  if (inspection.operationName) payload.operationName = inspection.operationName

  return {
    ...request,
    method: 'POST',
    body: { type: 'json', content: JSON.stringify(payload) }
  }
}

export function interpretGraphQLResult(result: ApiExecutionResult): ApiExecutionResult {
  const next: ApiExecutionResult = { ...result }
  if (next.status === 0 && next.error) {
    next.error = friendlyTransportError(next.error)
  }

  const info = readEnvelope(next)
  next.graphql = info
  if (info.hasErrors) {
    next.ok = false
    const first = info.errors[0]?.message ?? 'The GraphQL operation returned errors.'
    const summary = info.errors.length > 1 ? `${first} (+${info.errors.length - 1} more)` : first
    if (!next.error || next.status < 400) next.error = summary
  } else if (!info.parseError && next.status >= 400 && !next.error) {
    next.error = info.hint
  }
  return next
}

function readEnvelope(result: ApiExecutionResult): GraphQLResponseInfo {
  if (result.status === 0 || result.isBinary || !result.data.trim()) {
    return {
      data: null,
      errors: [],
      hasErrors: false,
      hint: result.status >= 400 ? httpFailureMessage(result.status, '') : undefined
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.data)
  } catch {
    return {
      data: null,
      errors: [],
      hasErrors: false,
      parseError: 'The response was not a GraphQL JSON payload.',
      hint: result.status >= 400 ? httpFailureMessage(result.status, '') : undefined
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      data: null,
      errors: [],
      hasErrors: false,
      parseError: 'The response was not a GraphQL JSON object.'
    }
  }

  const body = parsed as { data?: unknown; errors?: unknown }
  const errors = normalizeErrors(body.errors)
  const hint = errors.length === 0 && result.status >= 400 ? httpFailureMessage(result.status, '') : undefined
  return {
    data: body.data ?? null,
    errors,
    hasErrors: errors.length > 0,
    hint
  }
}

function normalizeErrors(value: unknown): GraphQLResponseError[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as { message?: unknown; path?: unknown; locations?: unknown }
      if (typeof record.message !== 'string' || !record.message.trim()) return null
      const error: GraphQLResponseError = { message: record.message }
      if (Array.isArray(record.path)) {
        error.path = record.path.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      }
      if (Array.isArray(record.locations)) {
        error.locations = record.locations
          .filter((location): location is { line: number; column: number } => {
            if (!location || typeof location !== 'object') return false
            const point = location as { line?: unknown; column?: unknown }
            return typeof point.line === 'number' && typeof point.column === 'number'
          })
      }
      return error
    })
    .filter((error): error is GraphQLResponseError => error !== null)
}
