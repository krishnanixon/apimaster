import type { HttpMethod } from '../../types/api-studio'

/** Leading slash, single slashes, no trailing slash (except root). */
export function normalizeRoutePath(path: string): string {
  let out = `/${path.trim()}`.replace(/\/{2,}/g, '/')
  // Express optional params (`:id?`) — the request still needs the segment.
  out = out.replace(/(:[A-Za-z0-9_]+)\?/g, '$1')
  if (out.length > 1) out = out.replace(/\/+$/, '')
  return out
}

export function joinRoutePaths(...parts: string[]): string {
  const segments = parts.map((p) => p.trim()).filter((p) => p && p !== '/')
  return normalizeRoutePath(segments.join('/'))
}

/** Names of `:id` and `{id}` path params, in order, without duplicates. */
export function pathParamNames(path: string): string[] {
  const names: string[] = []
  for (const match of path.matchAll(/:([A-Za-z0-9_]+)|\{([A-Za-z0-9_.-]+)\}/g)) {
    const name = match[1] ?? match[2]
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** Rewrites OpenAPI `{id}` params as `:id` so every imported request uses one style. */
export function toColonParams(path: string): string {
  return path.replace(/\{([A-Za-z0-9_.-]+)\}/g, ':$1')
}

/** Identity for de-duplication: param names don't matter, only their positions. */
export function routeKey(method: HttpMethod, path: string): string {
  const shape = normalizeRoutePath(path)
    .replace(/:[A-Za-z0-9_]+/g, '{}')
    .replace(/\{[^}]*\}/g, '{}')
  return `${method} ${shape}`
}

const GENERIC_SEGMENTS = new Set(['api', 'rest', 'public', 'private', 'internal'])

/** Folder name for an endpoint: the first meaningful path segment (`/api/v1/users/:id` → `users`). */
export function tagForPath(path: string): string {
  for (const segment of normalizeRoutePath(path).split('/')) {
    if (!segment || segment.startsWith(':') || segment.startsWith('{') || segment === '*') continue
    if (GENERIC_SEGMENTS.has(segment.toLowerCase()) || /^v\d+$/i.test(segment)) continue
    return segment
  }
  return 'root'
}

/**
 * Joins URL parts exactly as frameworks that don't normalize do (FastAPI, Flask, Django):
 * a trailing slash on the last part is kept, because `/users/` and `/users` are different routes there.
 */
export function joinExactPaths(...parts: string[]): string {
  let out = ''
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    out = out.replace(/\/+$/, '') + (part.startsWith('/') ? part : `/${part}`)
  }
  out = out.replace(/\/{2,}/g, '/')
  return out.startsWith('/') ? out || '/' : `/${out}`
}
