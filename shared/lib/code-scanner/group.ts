import type { DetectedEndpoint } from '../../types/code-scanner'
import { normalizeRoutePath, tagForPath } from './paths'

export interface EndpointSubgroup {
  name: string
  endpoints: DetectedEndpoint[]
}

export interface EndpointGroup {
  /** Canonical resource key: `/user/:id`, `/users` and an OpenAPI `Users` tag all share `user`. */
  key: string
  /** Folder name shown to the user. */
  name: string
  /** Every endpoint in the group, sub-resources included. */
  endpoints: DetectedEndpoint[]
  /** Nested resources with more than one endpoint (`/users/:id/posts`, `/users/:id/posts/:postId`). */
  subgroups: EndpointSubgroup[]
}

/** Login, sign-up, token and password routes live together, whatever their first segment is. */
const AUTH_KEYS = new Set([
  'auth',
  'authentication',
  'login',
  'logout',
  'signin',
  'signout',
  'signup',
  'register',
  'registration',
  'token',
  'refresh',
  'refresh-token',
  'access-token',
  'session',
  'password',
  'forgot-password',
  'reset-password',
  'verify-email',
  'oauth',
  'oauth2',
  'sso'
])

const IRREGULAR: Record<string, string> = { people: 'person', children: 'child', men: 'man', women: 'woman', data: 'data', media: 'media' }

/** `categories` → `category`, `addresses` → `address`, `users` → `user`; `status`, `analysis` unchanged. */
export function singularize(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word]
  if (word.length <= 3) return word
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`
  // `statuses`, `buses`, `boxes` — but `responses`, `courses`, `houses` only drop the `s`.
  if (/(ss|sh|ch|x|z)es$/.test(word) || /[^aeiou]uses$/.test(word)) return word.slice(0, -2)
  if (/(ss|us|is)$/.test(word)) return word
  return word.endsWith('s') ? word.slice(0, -1) : word
}

/** Words of a label in lower case: `userProfiles`, `user-profiles`, `User Profiles` → `user`, `profiles`. */
function words(label: string): string[] {
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

/** Canonical key for a folder label; singular, kebab-case. */
export function resourceKey(label: string): string {
  const parts = words(label)
  if (parts.length === 0) return 'root'
  parts[parts.length - 1] = singularize(parts[parts.length - 1])
  const key = parts.join('-')
  return AUTH_KEYS.has(key) || AUTH_KEYS.has(parts[0]) ? 'auth' : key
}

function rawLabel(endpoint: DetectedEndpoint): string {
  return endpoint.tags[0]?.trim() || tagForPath(endpoint.path)
}

/** Static path segments, without params, `api` / `v1` style prefixes. */
function staticSegments(path: string): string[] {
  return normalizeRoutePath(path)
    .split('/')
    .filter((s) => s && !s.startsWith(':') && !s.startsWith('{') && s !== '*')
}

/** `/users/login`, `/auth/token/refresh`: an action that signs in, whatever resource it sits under. */
export function isAuthAction(path: string): boolean {
  const last = staticSegments(path).at(-1)
  return last !== undefined && resourceKey(last) === 'auth'
}

/** Some segment of the path is about signing in (`/login/access-token`, `/api/auth/token`). */
export function hasAuthSegment(path: string): boolean {
  return staticSegments(path).some((segment) => resourceKey(segment) === 'auth')
}

function groupKey(endpoint: DetectedEndpoint): string {
  if (endpoint.graphql) return 'graphql'
  if (endpoint.host) return `host:${endpoint.host}`
  const key = resourceKey(rawLabel(endpoint))
  return key !== 'auth' && endpoint.origin !== 'openapi' && isAuthAction(endpoint.path) ? 'auth' : key
}

/**
 * Name of the nested resource an endpoint belongs to: the first static segment after a path
 * parameter that follows the group's own segment (`/users/:id/posts/:postId` → `posts`).
 */
function subresource(endpoint: DetectedEndpoint, key: string): string | null {
  const parts = normalizeRoutePath(endpoint.path).split('/').filter(Boolean)
  const own = parts.findIndex((p) => !p.startsWith(':') && !p.startsWith('{') && resourceKey(p) === key)
  if (own === -1) return null
  let sawParam = false
  for (const part of parts.slice(own + 1)) {
    if (part.startsWith(':') || part.startsWith('{')) sawParam = true
    else if (sawParam) return part
    else return null
  }
  return null
}

function subgroupsOf(key: string, endpoints: DetectedEndpoint[]): EndpointSubgroup[] {
  if (key === 'auth' || key === 'graphql' || key.startsWith('host:')) return []
  const byName = new Map<string, DetectedEndpoint[]>()
  for (const endpoint of endpoints) {
    const name = subresource(endpoint, key)
    if (!name) continue
    const sub = resourceKey(name)
    byName.set(sub, [...(byName.get(sub) ?? []), endpoint])
  }
  // A lone `/users/:id/avatar` stays with its parent; a folder for one request is noise.
  return [...byName.values()]
    .filter((list) => list.length > 1)
    .map((list) => ({ name: subresource(list[0], key)!, endpoints: list }))
}

/**
 * Name for a resource group: an OpenAPI tag when the project declares one, otherwise the
 * plural spelling the code uses most (`users` over `user`).
 */
function groupName(key: string, endpoints: DetectedEndpoint[]): string {
  const first = endpoints[0]
  if (first.graphql) return 'graphql'
  if (first.host) return first.host.replace(/^https?:\/\//, '')
  if (key === 'auth') return 'auth'
  const counts = new Map<string, number>()
  for (const e of endpoints) {
    const label = rawLabel(e)
    // Declared tags are written for people; prefer them over path segments.
    const weight = e.origin === 'openapi' && e.tags[0] ? 100 : 1
    counts.set(label, (counts.get(label) ?? 0) + weight)
  }
  const isPlural = (label: string) => {
    const last = words(label).at(-1) ?? ''
    return singularize(last) !== last
  }
  return [...counts].sort((a, b) => b[1] - a[1] || Number(isPlural(b[0])) - Number(isPlural(a[0])))[0][0]
}

/** Groups endpoints by resource, keeping the order in which each group first appears. */
export function groupEndpoints(endpoints: DetectedEndpoint[]): EndpointGroup[] {
  const byKey = new Map<string, DetectedEndpoint[]>()
  for (const endpoint of endpoints) {
    const key = groupKey(endpoint)
    const list = byKey.get(key)
    if (list) list.push(endpoint)
    else byKey.set(key, [endpoint])
  }
  return [...byKey].map(([key, list]) => ({ key, name: groupName(key, list), endpoints: list, subgroups: subgroupsOf(key, list) }))
}
