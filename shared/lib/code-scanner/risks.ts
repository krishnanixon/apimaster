/**
 * Things worth a second look, from what the scan already knows: which routes are protected, what
 * they change, whether the frontend uses them and whether their input is validated. These are
 * prompts for review, not proof of a vulnerability: auth applied in ways the scanner can't see
 * (a gateway, global middleware in another package) makes a route look open.
 */
import type { DetectedEndpoint } from '../../types/code-scanner'
import { hasAuthSegment } from './group'
import { normalizeRoutePath } from './paths'

export type RiskSeverity = 'high' | 'medium' | 'low'

export interface RiskFinding {
  id: 'open-write' | 'open-admin' | 'open-sensitive-read' | 'broken-call' | 'unused-route' | 'unvalidated-body'
  severity: RiskSeverity
  title: string
  detail: string
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const ADMIN_SEGMENT = /^(admin|internal|debug|ops|management|actuator|_debug|superuser|staff)$/i
const SENSITIVE_SEGMENT = /^(users?|accounts?|profiles?|customers?|orders?|payments?|invoices?|billing|transactions?|wallets?|cards?|addresses|messages?|subscriptions?)$/i
/** Routes that are public on purpose. */
const PUBLIC_BY_DESIGN = /^(health|healthz|ready|readyz|live|livez|ping|status|version|metrics|webhooks?|callback|contact|newsletter|feedback)$/i

const SEVERITY_RANK: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 }

function staticSegments(path: string): string[] {
  return normalizeRoutePath(path)
    .split('/')
    .filter((s) => s && !s.startsWith(':') && !s.startsWith('{'))
}

function hasPathParam(path: string): boolean {
  return /\/(:|\{)/.test(path)
}

/**
 * Findings for each endpoint, by id. Open-route checks run only when the scan saw some protected
 * routes; otherwise auth is probably applied somewhere the scanner doesn't read.
 */
export function assessRisks(endpoints: DetectedEndpoint[]): Map<string, RiskFinding[]> {
  const own = endpoints.filter((e) => !e.host && !e.graphql)
  const authKnown = own.some((e) => e.securityRequired)
  const out = new Map<string, RiskFinding[]>()

  for (const e of own) {
    const findings: RiskFinding[] = []
    const segments = staticSegments(e.path)
    const isServerRoute = e.origin !== 'frontend'
    const publicByDesign = hasAuthSegment(e.path) || segments.some((s) => PUBLIC_BY_DESIGN.test(s))

    if (isServerRoute && authKnown && !e.securityRequired && !publicByDesign) {
      if (segments.some((s) => ADMIN_SEGMENT.test(s))) {
        findings.push({
          id: 'open-admin',
          severity: 'high',
          title: 'Admin route without auth',
          detail: 'An admin/internal route has no authentication the scanner could find. Check that it is not reachable without signing in.'
        })
      } else if (WRITE_METHODS.has(e.method)) {
        findings.push({
          id: 'open-write',
          severity: e.method === 'POST' ? 'medium' : 'high',
          title: `${e.method} without auth`,
          detail: `This route changes data but no authentication was found, while other routes in the project require it.`
        })
      } else if (hasPathParam(e.path) && segments.some((s) => SENSITIVE_SEGMENT.test(s))) {
        findings.push({
          id: 'open-sensitive-read',
          severity: 'medium',
          title: 'Personal data by id without auth',
          detail: 'Anyone could read records by changing the id. Check that this data is meant to be public.'
        })
      }
    }
    if (isServerRoute && WRITE_METHODS.has(e.method) && e.method !== 'DELETE' && e.requestBody?.example !== undefined && !e.requestBody.schema && e.origin === 'backend') {
      findings.push({
        id: 'unvalidated-body',
        severity: 'low',
        title: 'No body validation found',
        detail: 'The handler reads a request body, but no schema or validator (zod, joi, class-validator, Pydantic, …) was found for it.'
      })
    }
    if (e.crossCheck === 'no-backend') {
      findings.push({
        id: 'broken-call',
        severity: 'medium',
        title: 'Frontend calls a missing route',
        detail: 'The frontend calls this, but no backend route matches it; it will likely fail with a 404.'
      })
    } else if (e.crossCheck === 'not-called') {
      findings.push({
        id: 'unused-route',
        severity: 'low',
        title: 'Not called by the frontend',
        detail: 'No frontend call to this route was found. It may be unused, or used by another client.'
      })
    }
    if (findings.length) out.set(e.id, findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]))
  }
  return out
}

export function riskCounts(findings: Map<string, RiskFinding[]>): Record<RiskSeverity, number> {
  const counts: Record<RiskSeverity, number> = { high: 0, medium: 0, low: 0 }
  for (const list of findings.values()) for (const f of list) counts[f.severity]++
  return counts
}
