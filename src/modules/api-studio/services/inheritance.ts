import type { ApiCollection, ApiFolder, ApiRequest, KeyValuePair, RequestAuth } from '../types/api.types'
import { getFolderAncestors } from './folderTree'

export interface InheritedAuthResolution {
  auth: RequestAuth
  /** Where the concrete (non-inherit) auth was found. */
  source: 'request' | 'folder' | 'collection' | 'none'
  sourceName: string
}

export interface InheritedHeader extends KeyValuePair {
  sourceName: string
}

export function createInheritAuth(): RequestAuth {
  return { type: 'inherit' }
}

export function isInheritAuth(auth?: RequestAuth | null): boolean {
  return !auth || auth.type === 'inherit'
}

export function isAuthConfigured(auth?: RequestAuth | null): boolean {
  return Boolean(auth && auth.type !== 'inherit' && auth.type !== 'none')
}

function firstConcreteAuth(
  auth: RequestAuth | undefined,
  source: InheritedAuthResolution['source'],
  sourceName: string
): InheritedAuthResolution | null {
  if (!auth || auth.type === 'inherit') return null
  if (auth.type === 'none') return { auth, source: 'none', sourceName }
  return { auth, source, sourceName }
}

/**
 * Walks request → parent folders (nearest first) → collection and returns
 * the first non-`inherit` auth. Matches Postman/Thunder Client behavior.
 */
export function resolveInheritedAuth(
  request: ApiRequest,
  collection?: ApiCollection | null
): InheritedAuthResolution {
  const own = firstConcreteAuth(request.auth, 'request', 'this request')
  if (own) return own

  if (!collection) {
    return { auth: { type: 'none' }, source: 'none', sourceName: '' }
  }

  const ancestors = getFolderAncestors(collection.folders, request.folderId)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const folder = ancestors[i]
    const resolved = firstConcreteAuth(folder.auth, 'folder', folder.name)
    if (resolved) return resolved
  }

  const fromCollection = firstConcreteAuth(collection.auth, 'collection', collection.name)
  if (fromCollection) return fromCollection

  return { auth: { type: 'none' }, source: 'none', sourceName: collection.name }
}

/** Label for the Auth tab when the request uses Inherit from parent. */
export function describeInheritParent(
  request: ApiRequest,
  collection?: ApiCollection | null
): string {
  if (!collection) return 'No parent collection'
  const ancestors = getFolderAncestors(collection.folders, request.folderId)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const folder = ancestors[i]
    if (!isInheritAuth(folder.auth)) return `folder "${folder.name}"`
  }
  return `collection "${collection.name}"`
}

/** Parent auth for a folder that itself uses Inherit (skips the folder's own auth). */
export function resolveFolderParentAuth(
  folder: ApiFolder,
  collection: ApiCollection
): InheritedAuthResolution {
  const ancestors = getFolderAncestors(collection.folders, folder.parentId ?? null)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const parent = ancestors[i]
    const resolved = firstConcreteAuth(parent.auth, 'folder', parent.name)
    if (resolved) return resolved
  }
  const fromCollection = firstConcreteAuth(collection.auth, 'collection', collection.name)
  if (fromCollection) return fromCollection
  return { auth: { type: 'none' }, source: 'none', sourceName: collection.name }
}

export function describeFolderInheritParent(folder: ApiFolder, collection: ApiCollection): string {
  const ancestors = getFolderAncestors(collection.folders, folder.parentId ?? null)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const parent = ancestors[i]
    if (!isInheritAuth(parent.auth)) return `folder "${parent.name}"`
  }
  return `collection "${collection.name}"`
}

function enabledNamedPairs(pairs: KeyValuePair[] | undefined): KeyValuePair[] {
  if (!pairs) return []
  return pairs.filter((p) => p.enabled && p.key.trim())
}

/**
 * Parent headers first, then child. Duplicate keys (case-insensitive) keep the
 * nearest child's value — request wins over folder, folder over collection.
 */
export function mergeInheritedHeaders(
  request: ApiRequest,
  collection?: ApiCollection | null
): KeyValuePair[] {
  if (!collection) return request.headers

  const byKey = new Map<string, KeyValuePair>()
  const order: string[] = []

  function consume(pairs: KeyValuePair[] | undefined) {
    for (const pair of pairs ?? []) {
      const key = pair.key.trim()
      if (!key) continue
      const lookup = key.toLowerCase()
      if (!byKey.has(lookup)) order.push(lookup)
      byKey.set(lookup, pair)
    }
  }

  consume(collection.headers)
  for (const folder of getFolderAncestors(collection.folders, request.folderId)) {
    consume(folder.headers)
  }
  consume(request.headers)

  const merged = order.map((key) => byKey.get(key)!)
  const trailing = (request.headers ?? []).filter((p) => !p.key.trim())
  return trailing.length > 0 ? [...merged, ...trailing] : merged
}

/** Enabled parent headers that the request does not already override. */
export function listInheritedHeaders(
  request: ApiRequest,
  collection?: ApiCollection | null
): InheritedHeader[] {
  if (!collection) return []

  const requestKeys = new Set(
    (request.headers ?? []).filter((p) => p.key.trim()).map((p) => p.key.trim().toLowerCase())
  )
  const byKey = new Map<string, InheritedHeader>()
  const order: string[] = []

  function consume(pairs: KeyValuePair[] | undefined, sourceName: string) {
    for (const pair of enabledNamedPairs(pairs)) {
      const lookup = pair.key.trim().toLowerCase()
      if (requestKeys.has(lookup)) continue
      if (!byKey.has(lookup)) order.push(lookup)
      byKey.set(lookup, { ...pair, sourceName })
    }
  }

  consume(collection.headers, collection.name)
  for (const folder of getFolderAncestors(collection.folders, request.folderId)) {
    consume(folder.headers, folder.name)
  }

  return order.map((key) => byKey.get(key)!)
}

function joinScripts(parts: Array<string | undefined>): string {
  return parts
    .map((s) => s?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
}

export function mergeInheritedPreRequestScript(
  request: ApiRequest,
  collection?: ApiCollection | null
): string {
  if (!collection) return request.preRequestScript ?? ''
  const folderScripts = getFolderAncestors(collection.folders, request.folderId).map((f) => f.preRequestScript)
  return joinScripts([collection.preRequestScript, ...folderScripts, request.preRequestScript])
}

export function parentPreRequestScripts(
  request: ApiRequest,
  collection?: ApiCollection | null
): { sourceName: string; script: string }[] {
  if (!collection) return []
  const parts: { sourceName: string; script: string }[] = []
  if (collection.preRequestScript?.trim()) {
    parts.push({ sourceName: collection.name, script: collection.preRequestScript })
  }
  for (const folder of getFolderAncestors(collection.folders, request.folderId)) {
    if (folder.preRequestScript?.trim()) {
      parts.push({ sourceName: folder.name, script: folder.preRequestScript })
    }
  }
  return parts
}

/** Request copy with parent auth/headers/scripts already applied — ready to send. */
export function applyParentInheritance(request: ApiRequest, collection?: ApiCollection | null): ApiRequest {
  if (!collection) {
    if (request.auth?.type === 'inherit') return { ...request, auth: { type: 'none' } }
    return request
  }
  return {
    ...request,
    auth: resolveInheritedAuth(request, collection).auth,
    headers: mergeInheritedHeaders(request, collection),
    preRequestScript: mergeInheritedPreRequestScript(request, collection)
  }
}

export function folderHasOwnSettings(folder: ApiFolder): boolean {
  return (
    isAuthConfigured(folder.auth) ||
    Boolean(enabledNamedPairs(folder.headers).length) ||
    Boolean(folder.preRequestScript?.trim())
  )
}

export function collectionHasOwnSettings(collection: ApiCollection): boolean {
  return (
    isAuthConfigured(collection.auth) ||
    Boolean(enabledNamedPairs(collection.headers).length) ||
    Boolean(collection.preRequestScript?.trim())
  )
}
