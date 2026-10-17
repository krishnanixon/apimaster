/**
 * Re-scan → existing collection. Compares requests the scanner generated earlier (tagged with
 * `request.scan`) against a freshly generated collection:
 *  - added     — the code has an endpoint the collection doesn't
 *  - updated   — the code changed and the request wasn't edited: safe to update
 *  - conflict  — the code changed *and* the request's structure was edited by hand
 *  - removed   — the endpoint is gone from the code
 * Updates keep everything a person typed: parameter/header/body values, name, auth, scripts, notes.
 */
import { v4 as uuidv4 } from 'uuid'
import type { ApiCollection, ApiFolder, ApiRequest, KeyValuePair, RequestBody } from '../../types/api-studio'
import { requestStructure } from './fingerprint'
import { resourceKey } from './group'

export type MergeStatus = 'added' | 'updated' | 'conflict' | 'removed'

export interface MergeItem {
  key: string
  status: MergeStatus
  method: string
  name: string
  url: string
}

export interface MergePlan {
  items: MergeItem[]
  /** Scanned requests whose endpoint didn't change. */
  unchanged: number
  /** Requests you added by hand (no scan tag); never touched. */
  untracked: number
}

/** Which changes apply by default: new endpoints and safe updates; never overwrite edits or delete. */
export function defaultMergeSelection(plan: MergePlan): Set<string> {
  return new Set(plan.items.filter((i) => i.status === 'added' || i.status === 'updated').map((i) => i.key))
}

function byKey(requests: ApiRequest[]): Map<string, ApiRequest> {
  const map = new Map<string, ApiRequest>()
  for (const request of requests) if (request.scan && !map.has(request.scan.key)) map.set(request.scan.key, request)
  return map
}

export function planMerge(existing: ApiCollection, generated: ApiCollection): MergePlan {
  const current = byKey(existing.requests)
  const fresh = byKey(generated.requests)
  const items: MergeItem[] = []
  let unchanged = 0
  const describe = (r: ApiRequest, key: string, status: MergeStatus): MergeItem => ({ key, status, method: r.method, name: r.name, url: r.url })

  for (const [key, g] of fresh) {
    const r = current.get(key)
    if (!r) {
      items.push(describe(g, key, 'added'))
      continue
    }
    const codeChanged = g.scan!.structure !== r.scan!.structure
    if (!codeChanged) {
      unchanged++
      continue
    }
    const edited = requestStructure(r) !== r.scan!.structure
    items.push(describe(g, key, edited ? 'conflict' : 'updated'))
  }
  for (const [key, r] of current) if (!fresh.has(key)) items.push(describe(r, key, 'removed'))

  return { items, unchanged, untracked: existing.requests.filter((r) => !r.scan).length }
}

/** New keys and structure from `next`, the values already filled in from `previous`. */
function mergePairs(previous: KeyValuePair[] | undefined, next: KeyValuePair[] | undefined): KeyValuePair[] {
  return (next ?? []).map((pair) => {
    const old = previous?.find((p) => p.key.trim() && p.key === pair.key)
    return old ? { ...pair, id: old.id, value: old.value || pair.value, enabled: old.enabled } : pair
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** The generated JSON's shape with the user's values wherever the shape still matches. */
function mergeJson(next: unknown, previous: unknown): unknown {
  if (isPlainObject(next)) {
    if (!isPlainObject(previous)) return next
    return Object.fromEntries(Object.entries(next).map(([k, v]) => [k, k in previous ? mergeJson(v, previous[k]) : v]))
  }
  if (Array.isArray(next)) {
    if (!Array.isArray(previous) || previous.length === 0) return next
    return isPlainObject(next[0]) ? previous.map((item) => mergeJson(next[0], item)) : previous
  }
  if (previous === undefined || previous === null) return next
  // Both plain values: keep what the person entered (the generated one is only a placeholder).
  return typeof previous === 'object' ? next : previous
}

function mergeBody(previous: RequestBody, next: RequestBody): RequestBody {
  if (previous.type !== next.type) return next
  if (next.type === 'json') {
    try {
      return { ...next, content: JSON.stringify(mergeJson(JSON.parse(next.content), JSON.parse(previous.content)), null, 2) }
    } catch {
      return next
    }
  }
  if (next.type === 'x-www-form-urlencoded') {
    const old = new Map(previous.content.split('\n').map((line) => [line.split('=')[0], line.slice(line.indexOf('=') + 1)]))
    return {
      ...next,
      content: next.content
        .split('\n')
        .map((line) => {
          const key = line.split('=')[0]
          return old.get(key) ? `${key}=${old.get(key)}` : line
        })
        .join('\n')
    }
  }
  return next
}

/** Applies the code's structure to a request while keeping what the user entered and configured. */
export function mergeRequest(previous: ApiRequest, next: ApiRequest, now = new Date().toISOString()): ApiRequest {
  return {
    ...previous,
    method: next.method,
    url: next.url,
    headers: mergePairs(previous.headers, next.headers),
    queryParams: mergePairs(previous.queryParams, next.queryParams),
    pathParams: mergePairs(previous.pathParams, next.pathParams),
    body: mergeBody(previous.body, next.body),
    requestType: next.requestType,
    graphql: next.graphql ? { ...next.graphql, variables: previous.graphql?.variables ?? next.graphql.variables } : previous.graphql,
    // Scripts are yours once written; a request that has none gets the generated one (e.g. the login token script).
    tests: previous.tests?.trim() ? previous.tests : next.tests,
    scan: next.scan,
    updatedAt: now
  }
}

export interface MergeOutcome {
  collection: ApiCollection
  counts: Record<MergeStatus, number>
}

export function applyMerge(
  existing: ApiCollection,
  generated: ApiCollection,
  plan: MergePlan,
  accepted: Set<string>,
  now = new Date().toISOString()
): MergeOutcome {
  const fresh = byKey(generated.requests)
  const statusOf = new Map(plan.items.map((i) => [i.key, i.status]))
  const counts: Record<MergeStatus, number> = { added: 0, updated: 0, conflict: 0, removed: 0 }
  const folders: ApiFolder[] = [...existing.folders]

  /**
   * Existing folder at the generated folder's path (`users` › `posts`), created where missing.
   * Each level matches by resource too, so a folder the user renamed (`users` → `Users`) keeps its requests.
   */
  const folderFor = (request: ApiRequest): string | null => {
    const path: string[] = []
    for (let f = generated.folders.find((x) => x.id === request.folderId); f; f = generated.folders.find((x) => x.id === f!.parentId)) {
      path.unshift(f.name)
      if (path.length > 10) break
    }
    let parentId: string | null = null
    for (const name of path) {
      const siblings = folders.filter((f) => (f.parentId ?? null) === parentId)
      let found = siblings.find((f) => f.name === name) ?? siblings.find((f) => resourceKey(f.name) === resourceKey(name))
      if (!found) {
        found = { id: uuidv4(), name, parentId, auth: { type: 'inherit' } }
        folders.push(found)
      }
      parentId = found.id
    }
    return parentId
  }

  const requests: ApiRequest[] = []
  const handled = new Set<string>()
  for (const request of existing.requests) {
    const key = request.scan?.key
    const status = key ? statusOf.get(key) : undefined
    if (!key || !status || !accepted.has(key) || handled.has(key)) {
      // Code moves even when the endpoint doesn't change; keep "where is this defined" current.
      const sources = key ? fresh.get(key)?.scan?.sources : undefined
      requests.push(sources && request.scan ? { ...request, scan: { ...request.scan, sources } } : request)
      continue
    }
    handled.add(key)
    if (status === 'removed') {
      counts.removed++
      continue
    }
    requests.push(mergeRequest(request, fresh.get(key)!, now))
    counts[status]++
  }
  for (const item of plan.items) {
    if (item.status !== 'added' || !accepted.has(item.key)) continue
    const request = fresh.get(item.key)!
    requests.push({ ...request, id: uuidv4(), folderId: folderFor(request), updatedAt: now })
    counts.added++
  }

  return {
    collection: {
      ...existing,
      folders,
      requests,
      // Keep auth you configured; adopt the detected scheme only if there was none.
      auth: existing.auth && existing.auth.type !== 'none' ? existing.auth : generated.auth,
      source: generated.source ?? existing.source,
      updatedAt: now
    },
    counts
  }
}
