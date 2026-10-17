import { v4 as uuidv4 } from 'uuid'
import type {
  ApiCollection,
  ApiRequest,
  HttpMethod,
  KeyValuePair,
  RequestAuth,
  RequestBody,
  ResolvedHttpRequest
} from '../types/api.types'
import { isSignedAuthType } from '../types/api.types'
import { applyAuth, enabledEntries } from './authHandler'
import { applyParentInheritance, createInheritAuth } from './inheritance'
import { toGraphQLHttpRequest } from './graphql/prepare'

export function createEmptyKeyValue(): KeyValuePair {
  return { id: uuidv4(), key: '', value: '', enabled: true }
}

export function createDefaultAuth(): RequestAuth {
  return { type: 'none' }
}

export function createDefaultBody(): RequestBody {
  return { type: 'none', content: '' }
}

export function createEmptyRequest(name = 'New Request', options?: { inheritAuth?: boolean }): ApiRequest {
  return {
    id: uuidv4(),
    name,
    method: 'GET',
    url: '',
    headers: [createEmptyKeyValue()],
    queryParams: [createEmptyKeyValue()],
    pathParams: [],
    body: createDefaultBody(),
    auth: options?.inheritAuth ? createInheritAuth() : createDefaultAuth(),
    tests: '',
    preRequestScript: '',
    description: '',
    requestType: 'http',
    folderId: null,
    timeoutMs: 30_000,
    updatedAt: new Date().toISOString()
  }
}

/** Splits a raw URL into a base (no query string) and its parsed query params. */
export function splitUrlAndParams(url: string): { base: string; params: KeyValuePair[] } {
  const queryIndex = url.indexOf('?')
  if (queryIndex === -1) return { base: url, params: [] }

  const base = url.slice(0, queryIndex)
  const query = url.slice(queryIndex + 1)
  const params: KeyValuePair[] = []
  for (const part of query.split('&')) {
    if (!part) continue
    const [key, value = ''] = part.split('=')
    params.push({
      id: uuidv4(),
      key: decodeURIComponent(key),
      value: decodeURIComponent(value),
      enabled: true
    })
  }
  return { base, params }
}

/** Builds the display-only `base?a=1&b=2` URL for the URL bar preview. */
export function buildDisplayUrl(base: string, params: KeyValuePair[]): string {
  const enabled = params.filter((p) => p.enabled && p.key.trim())
  if (enabled.length === 0) return base
  const qs = enabled.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
  return `${base}${base.includes('?') ? '&' : '?'}${qs}`
}

export interface ResolveOptions {
  timeoutMs?: number
  /** When provided, request auth/headers inherit from collection and parent folders. */
  collection?: ApiCollection | null
}

/**
 * Implements the buildRequest() pipeline: attach headers -> attach auth ->
 * serialize body -> ready for execute(). Produces a fully-resolved request
 * with a fresh client id for cancellation tracking.
 */
export function resolveRequest(request: ApiRequest, options?: ResolveOptions): ResolvedHttpRequest {
  const effective = applyParentInheritance(request, options?.collection)
  const wire = toGraphQLHttpRequest(effective)
  const baseHeaders = enabledEntries(wire.headers)
  const baseParams = enabledEntries(wire.queryParams)
  const { headers, params } = applyAuth(wire.auth, baseHeaders, baseParams)

  return {
    clientRequestId: uuidv4(),
    method: wire.method as HttpMethod,
    url: applyPathParams(wire.url.split('?')[0], wire.pathParams ?? []),
    headers,
    params,
    body: wire.method === 'GET' || wire.method === 'HEAD' ? createDefaultBody() : wire.body,
    timeoutMs: options?.timeoutMs ?? wire.timeoutMs,
    auth: isSignedAuthType(wire.auth.type) ? wire.auth : undefined,
    network: wire.network
  }
}

const COLON_PATH_PARAM = /(?<=\/):([A-Za-z_][\w]*)/g
const BRACE_PATH_PARAM = /(?<!\{)\{([A-Za-z_][\w]*)\}(?!\})/g

/** Keys for `:id` and `{id}` tokens in a URL path (ignores `{{env}}` variables). */
export function extractPathParamKeys(url: string): string[] {
  const path = url.split('?')[0]
  const keys: string[] = []
  const seen = new Set<string>()
  for (const pattern of [COLON_PATH_PARAM, BRACE_PATH_PARAM]) {
    pattern.lastIndex = 0
    for (const match of path.matchAll(pattern)) {
      if (!seen.has(match[1])) {
        seen.add(match[1])
        keys.push(match[1])
      }
    }
  }
  return keys
}

/** Keep existing path-param values when the URL's `:id` / `{id}` tokens change. */
export function syncPathParams(url: string, existing: KeyValuePair[] = []): KeyValuePair[] {
  const keys = extractPathParamKeys(url)
  const byKey = new Map(existing.filter((p) => p.key.trim()).map((p) => [p.key, p]))
  return keys.map((key) => byKey.get(key) ?? { id: uuidv4(), key, value: '', enabled: true })
}

/** Substitute enabled path-param values into `:id` / `{id}` tokens. */
export function applyPathParams(url: string, pathParams: KeyValuePair[]): string {
  let result = url
  for (const pair of pathParams) {
    if (!pair.enabled || !pair.key.trim()) continue
    const value = encodeURIComponent(pair.value)
    const key = pair.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(?<=/):${key}(?=/|$)`, 'g'), value)
    result = result.replace(new RegExp(`(?<!\\{)\\{${key}\\}(?!\\})`, 'g'), value)
  }
  return result
}

export function parseUrlEncoded(content: string): KeyValuePair[] {
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length === 0) return [createEmptyKeyValue()]
  return lines.map((line) => {
    const idx = line.indexOf('=')
    return {
      id: uuidv4(),
      key: idx === -1 ? line : line.slice(0, idx),
      value: idx === -1 ? '' : line.slice(idx + 1),
      enabled: true
    }
  })
}

export function stringifyUrlEncoded(pairs: KeyValuePair[]): string {
  return pairs
    .filter((p) => p.enabled && p.key.trim())
    .map((p) => `${p.key}=${p.value}`)
    .join('\n')
}

export function isValidUrl(url: string): boolean {
  if (!url.trim()) return false
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`
    new URL(withProtocol)
    return true
  } catch {
    return false
  }
}
