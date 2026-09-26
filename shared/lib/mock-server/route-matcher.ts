import type { MockHttpMethod } from '../../types/mock-server'

export interface CompiledMockRoute {
  id: string
  method: MockHttpMethod
  /** Normalized path pattern, e.g. `/users/:id` */
  pattern: string
  segments: RouteSegment[]
  staticScore: number
}

export type RouteSegment =
  | { kind: 'static'; value: string }
  | { kind: 'param'; name: string }

export interface RouteMatchResult {
  routeId: string
  params: Record<string, string>
}

export function normalizeMockPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '/') return '/'
  let path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  path = path.replace(/\/+/g, '/')
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  return path
}

export function parseRouteSegments(pattern: string): RouteSegment[] {
  const normalized = normalizeMockPath(pattern)
  if (normalized === '/') return []
  return normalized
    .slice(1)
    .split('/')
    .map((part) => {
      if (part.startsWith(':') && part.length > 1) {
        return { kind: 'param' as const, name: part.slice(1) }
      }
      return { kind: 'static' as const, value: part }
    })
}

export function compileMockRoute(id: string, method: MockHttpMethod, pattern: string): CompiledMockRoute {
  const segments = parseRouteSegments(pattern)
  const staticScore = segments.filter((s) => s.kind === 'static').length
  return {
    id,
    method,
    pattern: normalizeMockPath(pattern),
    segments,
    staticScore
  }
}

export function routePatternKey(method: MockHttpMethod, pattern: string): string {
  const segs = parseRouteSegments(pattern)
  const normalized = segs
    .map((s) => (s.kind === 'static' ? s.value : `:${s.name}`))
    .join('/')
  return `${method}:/${normalized}`.toLowerCase()
}

/** Two patterns are ambiguous if they match the same request shapes (same param slot count & positions). */
export function areRoutePatternsAmbiguous(a: string, b: string): boolean {
  const sa = parseRouteSegments(a)
  const sb = parseRouteSegments(b)
  if (sa.length !== sb.length) return false
  for (let i = 0; i < sa.length; i++) {
    const pa = sa[i]
    const pb = sb[i]
    if (pa.kind === 'static' && pb.kind === 'static' && pa.value !== pb.value) return false
    if (pa.kind === 'param' && pb.kind === 'param' && pa.name !== pb.name) {
      // Same shape, different param names — ambiguous
      return true
    }
  }
  return false
}

function matchSegments(routeSegments: RouteSegment[], requestSegments: string[]): Record<string, string> | null {
  if (routeSegments.length !== requestSegments.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < routeSegments.length; i++) {
    const seg = routeSegments[i]
    const req = requestSegments[i]
    if (seg.kind === 'static') {
      if (seg.value !== req) return null
    } else {
      params[seg.name] = decodeURIComponent(req)
    }
  }
  return params
}

export function matchPath(compiled: CompiledMockRoute, requestPath: string): RouteMatchResult | null {
  const normalized = normalizeMockPath(requestPath)
  const requestSegments =
    normalized === '/' ? [] : normalized.slice(1).split('/').map((s) => s)
  const params = matchSegments(compiled.segments, requestSegments)
  if (!params) return null
  return { routeId: compiled.id, params }
}

export function sortCompiledRoutes(routes: CompiledMockRoute[]): CompiledMockRoute[] {
  return [...routes].sort((a, b) => {
    if (b.staticScore !== a.staticScore) return b.staticScore - a.staticScore
    if (b.segments.length !== a.segments.length) return b.segments.length - a.segments.length
    return a.pattern.localeCompare(b.pattern)
  })
}

export class MockRouteTable {
  private byMethod = new Map<MockHttpMethod, CompiledMockRoute[]>()

  constructor(routes: Array<{ id: string; method: MockHttpMethod; path: string; enabled: boolean }>) {
    for (const route of routes) {
      if (!route.enabled) continue
      const compiled = compileMockRoute(route.id, route.method, route.path)
      const list = this.byMethod.get(route.method) ?? []
      list.push(compiled)
      this.byMethod.set(route.method, list)
    }
    for (const [method, list] of this.byMethod) {
      this.byMethod.set(method, sortCompiledRoutes(list))
    }
  }

  match(method: MockHttpMethod, path: string): RouteMatchResult | null {
    const routes = this.byMethod.get(method) ?? []
    for (const route of routes) {
      const hit = matchPath(route, path)
      if (hit) return hit
    }
    return null
  }

  methodsForPath(path: string): MockHttpMethod[] {
    const methods: MockHttpMethod[] = []
    for (const [method, routes] of this.byMethod) {
      for (const route of routes) {
        if (matchPath(route, path)) {
          methods.push(method)
          break
        }
      }
    }
    return methods
  }

  allMethods(): MockHttpMethod[] {
    return [...this.byMethod.keys()]
  }
}
