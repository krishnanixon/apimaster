/**
 * Identity and structure fingerprints that let a re-scan update a collection without losing edits.
 * The structure covers what code decides (method, URL, parameter and body *field names*); values
 * people type in (ids, tokens, example text) are left out, so filling them in isn't an "edit".
 */
import type { ApiRequest } from '../../types/api-studio'
import type { DetectedEndpoint } from '../../types/code-scanner'
import { routeKey } from './paths'

/** Stable identity of an endpoint across scans. */
export function endpointKey(endpoint: DetectedEndpoint): string {
  if (endpoint.graphql) return `GQL ${endpoint.graphql.operationName ?? endpoint.graphql.query}`
  // Third-party calls (api.github.com/users) never collide with the project's own /users.
  return `${endpoint.host ?? ''} ${routeKey(endpoint.method, endpoint.path)}`
}

/** FNV-1a, 32-bit — short and deterministic; collisions only cost a spurious "changed". */
export function hashText(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Shape of a JSON value: object keys and nesting only. Primitive types are left out because the
 * scanner's placeholders (`""`) don't know them — typing `120` into a field isn't an edit.
 */
function jsonShape(value: unknown): unknown {
  if (Array.isArray(value)) return [value.length ? jsonShape(value[0]) : null]
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, jsonShape((value as Record<string, unknown>)[k])])
    )
  }
  return 'value'
}

function bodyShape(request: ApiRequest): unknown {
  const { type, content } = request.body
  if (type === 'json') {
    try {
      return jsonShape(JSON.parse(content))
    } catch {
      return content
    }
  }
  if (type === 'x-www-form-urlencoded') {
    return content
      .split('\n')
      .map((line) => line.split('=')[0].trim())
      .filter(Boolean)
      .sort()
  }
  if (type === 'form-data') return (request.body.formData ?? []).map((f) => f.key).filter(Boolean).sort()
  return type === 'none' ? null : content
}

const keys = (pairs: Array<{ key: string }> | undefined) => (pairs ?? []).map((p) => p.key.trim()).filter(Boolean).sort()

/** Fingerprint of the parts of a request the scanner generates. */
export function requestStructure(request: ApiRequest): string {
  return hashText(
    JSON.stringify({
      method: request.method,
      url: request.url.trim(),
      type: request.requestType ?? 'http',
      query: keys(request.queryParams),
      headers: keys(request.headers),
      path: keys(request.pathParams),
      body: request.body.type,
      shape: bodyShape(request),
      graphql: request.graphql?.query.trim() ?? null
    })
  )
}
