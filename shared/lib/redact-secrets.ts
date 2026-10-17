import type { ApiCollection, ApiExecutionResult, ApiRequest, KeyValuePair, RequestAuth } from '../types/api-studio'

export const REDACTED = '[REDACTED]'

const SENSITIVE_HEADER =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token|x-access-token)$/i

/** Header names and field names that carry credentials. */
const SENSITIVE_NAME = /(pass(word)?|secret|token|api[-_]?key|credential|session)/i

export const AUTH_SECRET_FIELDS = [
  'bearerToken',
  'basicPassword',
  'apiKeyValue',
  'jwtSecret',
  'digestPassword',
  'oauth1ConsumerSecret',
  'oauth1TokenSecret',
  'oauth2ClientSecret',
  'oauth2Password',
  'oauth2AccessToken',
  'oauth2RefreshToken',
  'awsSecretKey',
  'awsSessionToken',
  'hawkKey'
] as const satisfies readonly (keyof RequestAuth)[]

export function isSensitiveKey(key: string): boolean {
  const trimmed = key.trim()
  return SENSITIVE_HEADER.test(trimmed) || SENSITIVE_NAME.test(trimmed)
}

/**
 * Scrub credential-shaped text. Applied to logs, diagnostics, and bug reports.
 * `Authorization: Bearer <token>` is fully removed, not just the word Bearer.
 */
export function redactText(value: string): string {
  return value
    .replace(
      /(authorization\s*[:=]\s*)(?:bearer|basic|digest|negotiate)\s+\S+/gi,
      `$1${REDACTED}`
    )
    .replace(
      /((?:api[-_ ]?key|authorization|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|password|secret|token)\s*["']?\s*[:=]\s*["']?)([^\s,"'}&]+)/gi,
      `$1${REDACTED}`
    )
    .replace(
      /((?:[?&])(?:token|password|secret|api_key|apikey|access_token|refresh_token|client_secret)=)[^&\s#]+/gi,
      `$1${REDACTED}`
    )
}

export function redactHeaderMap(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactText(value)
  }
  return out
}

export function redactAuth(auth: RequestAuth): RequestAuth {
  const next: RequestAuth = { ...auth }
  for (const field of AUTH_SECRET_FIELDS) {
    if (next[field]) next[field] = REDACTED
  }
  return next
}

export function redactPairs(pairs: KeyValuePair[]): KeyValuePair[] {
  return pairs.map((pair) => (isSensitiveKey(pair.key) ? { ...pair, value: REDACTED } : { ...pair }))
}

function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactJson(child)
  }
  return out
}

export function redactBodyContent(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return content
  try {
    return JSON.stringify(redactJson(JSON.parse(content)), null, 2)
  } catch {
    return redactText(content)
  }
}

export function redactRequest(request: ApiRequest): ApiRequest {
  return {
    ...request,
    url: redactText(request.url),
    headers: redactPairs(request.headers ?? []),
    queryParams: redactPairs(request.queryParams ?? []),
    pathParams: request.pathParams ? redactPairs(request.pathParams) : request.pathParams,
    auth: request.auth ? redactAuth(request.auth) : request.auth,
    body: {
      ...request.body,
      content: request.body?.content ? redactBodyContent(request.body.content) : request.body?.content ?? '',
      formData: request.body?.formData?.map((field) => ({
        ...field,
        value: isSensitiveKey(field.key) ? REDACTED : field.value,
        fileBase64: undefined
      }))
    },
    graphql: request.graphql
      ? {
          ...request.graphql,
          query: redactText(request.graphql.query),
          variables: redactBodyContent(request.graphql.variables)
        }
      : request.graphql
  }
}

export function redactExecutionResult(result: ApiExecutionResult): ApiExecutionResult {
  return {
    ...result,
    headers: redactHeaderMap(result.headers),
    data: result.isBinary ? '[binary]' : redactBodyContent(result.data ?? '')
  }
}

export function redactCollection(collection: ApiCollection): ApiCollection {
  return {
    ...collection,
    auth: collection.auth ? redactAuth(collection.auth) : collection.auth,
    headers: collection.headers ? redactPairs(collection.headers) : collection.headers,
    folders: collection.folders.map((folder) => ({
      ...folder,
      auth: folder.auth ? redactAuth(folder.auth) : folder.auth,
      headers: folder.headers ? redactPairs(folder.headers) : folder.headers
    })),
    requests: collection.requests.map(redactRequest)
  }
}
