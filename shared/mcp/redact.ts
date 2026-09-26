/**
 * Secret redaction for data sent to Claude over MCP, and the reverse merge so
 * a redacted placeholder written back by Claude keeps the stored secret.
 */
import type { ApiRequest, KeyValuePair, RequestAuth } from '../types/api-studio'
import { MCP_REDACTED } from './tools'

const SECRET_AUTH_FIELDS = [
  'bearerToken',
  'basicPassword',
  'apiKeyValue',
  'jwtSecret',
  'digestPassword',
  'oauth1ConsumerSecret',
  'oauth1Token',
  'oauth1TokenSecret',
  'oauth2ClientSecret',
  'oauth2Password',
  'oauth2AccessToken',
  'oauth2RefreshToken',
  'awsSecretKey',
  'awsSessionToken',
  'hawkKey'
] as const satisfies readonly (keyof RequestAuth)[]

const SENSITIVE_HEADER = /^(authorization|proxy-authorization|x-api-key|api-key|apikey|x-auth-token|cookie|set-cookie)$/i
const SENSITIVE_VARIABLE = /(token|secret|passw|pwd|api[-_]?key|credential|private[-_]?key|session|cookie|bearer|authorization|^auth$)/i
const VARIABLE_REFERENCE = /\{\{\s*[\w.-]+\s*\}\}/

/** Values built from `{{variables}}` reveal nothing and help Claude, so they stay visible. */
function shouldRedact(value: string | undefined): value is string {
  return Boolean(value && value.trim() && !VARIABLE_REFERENCE.test(value))
}

export function isSensitiveHeader(key: string): boolean {
  return SENSITIVE_HEADER.test(key.trim())
}

export function isSensitiveVariable(key: string): boolean {
  return SENSITIVE_VARIABLE.test(key.trim())
}

export function redactAuth(auth: RequestAuth): RequestAuth {
  const next: RequestAuth = { ...auth }
  for (const field of SECRET_AUTH_FIELDS) {
    if (shouldRedact(next[field])) next[field] = MCP_REDACTED
  }
  return next
}

export function redactPairs(pairs: KeyValuePair[], isSensitive: (key: string) => boolean): KeyValuePair[] {
  return pairs.map((p) => (isSensitive(p.key) && shouldRedact(p.value) ? { ...p, value: MCP_REDACTED } : p))
}

export function redactRequest(request: ApiRequest): ApiRequest {
  return {
    ...request,
    auth: redactAuth(request.auth),
    headers: redactPairs(request.headers, isSensitiveHeader)
  }
}

/** Replace placeholders in `incoming` auth with the matching stored secret. */
export function restoreRedactedAuth(incoming: RequestAuth, existing?: RequestAuth): RequestAuth {
  const next: RequestAuth = { ...incoming }
  for (const field of SECRET_AUTH_FIELDS) {
    if (next[field] !== MCP_REDACTED) continue
    const stored = existing?.[field]
    if (stored !== undefined) next[field] = stored
    else delete next[field]
  }
  return next
}

/** Replace placeholder values with the stored value of the pair with the same key. */
export function restoreRedactedPairs(
  incoming: KeyValuePair[],
  existing: KeyValuePair[] = [],
  caseInsensitive = false
): KeyValuePair[] {
  const norm = (key: string) => (caseInsensitive ? key.trim().toLowerCase() : key.trim())
  const byKey = new Map(existing.map((p) => [norm(p.key), p.value]))
  return incoming.map((p) => {
    if (p.value !== MCP_REDACTED) return p
    const stored = byKey.get(norm(p.key))
    return { ...p, value: stored ?? '' }
  })
}
