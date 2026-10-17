/**
 * What changed in an API between two scans (two moments, or two git branches): added and removed
 * endpoints, and changes to what a client must send. Changes that break existing clients are
 * flagged, so the result reads as a changelog for a pull request.
 */
import type { DetectedEndpoint } from '../../types/code-scanner'
import { endpointKey } from './fingerprint'

export interface EndpointChange {
  endpoint: DetectedEndpoint
  changes: Array<{ text: string; breaking: boolean }>
}

export interface ScanDiff {
  added: DetectedEndpoint[]
  removed: DetectedEndpoint[]
  changed: EndpointChange[]
  breakingCount: number
}

const label = (e: DetectedEndpoint) => `${e.graphql ? 'GQL' : e.method} ${e.host ?? ''}${e.path}`

function bodyFields(e: DetectedEndpoint): Set<string> {
  const props = e.requestBody?.schema?.properties
  if (props) return new Set(Object.keys(props))
  const example = e.requestBody?.example
  return new Set(example && typeof example === 'object' && !Array.isArray(example) ? Object.keys(example) : [])
}

const requiredFields = (e: DetectedEndpoint) => new Set(e.requestBody?.schema?.required ?? [])
const params = (e: DetectedEndpoint, where: 'query' | 'header') =>
  new Map(e.parameters.filter((p) => p.in === where).map((p) => [p.name, p.required]))

function compare(before: DetectedEndpoint, after: DetectedEndpoint): EndpointChange['changes'] {
  const out: EndpointChange['changes'] = []
  if (!before.securityRequired && after.securityRequired) out.push({ text: 'now requires authentication', breaking: true })
  if (before.securityRequired && !after.securityRequired) out.push({ text: 'no longer requires authentication', breaking: false })

  const [oldFields, newFields] = [bodyFields(before), bodyFields(after)]
  const [oldRequired, newRequired] = [requiredFields(before), requiredFields(after)]
  for (const field of newFields) {
    if (oldFields.has(field)) continue
    const required = newRequired.has(field)
    out.push({ text: `body field \`${field}\` added${required ? ' (required)' : ''}`, breaking: required })
  }
  for (const field of oldFields) if (!newFields.has(field)) out.push({ text: `body field \`${field}\` removed`, breaking: false })
  for (const field of newRequired) {
    if (oldFields.has(field) && !oldRequired.has(field)) out.push({ text: `body field \`${field}\` is now required`, breaking: true })
  }
  for (const where of ['query', 'header'] as const) {
    const [was, now] = [params(before, where), params(after, where)]
    for (const [name, required] of now) if (!was.has(name)) out.push({ text: `${where} parameter \`${name}\` added${required ? ' (required)' : ''}`, breaking: required })
    for (const name of was.keys()) if (!now.has(name)) out.push({ text: `${where} parameter \`${name}\` removed`, breaking: false })
  }
  return out
}

/** Compares scans by method + path shape; frontend-only calls are left out (they are not the API). */
export function diffScans(before: DetectedEndpoint[], after: DetectedEndpoint[]): ScanDiff {
  const api = (list: DetectedEndpoint[]) => new Map(list.filter((e) => e.origin !== 'frontend' && !e.host).map((e) => [endpointKey(e), e]))
  const [was, now] = [api(before), api(after)]
  const added = [...now].filter(([key]) => !was.has(key)).map(([, e]) => e)
  const removed = [...was].filter(([key]) => !now.has(key)).map(([, e]) => e)
  const changed: EndpointChange[] = []
  for (const [key, endpoint] of now) {
    const previous = was.get(key)
    if (!previous) continue
    const changes = compare(previous, endpoint)
    if (changes.length) changed.push({ endpoint, changes })
  }
  const breakingCount = removed.length + changed.reduce((n, c) => n + c.changes.filter((x) => x.breaking).length, 0)
  return { added, removed, changed, breakingCount }
}

export function isEmptyDiff(diff: ScanDiff): boolean {
  return diff.added.length + diff.removed.length + diff.changed.length === 0
}

/** Markdown changelog, e.g. for a pull request description. */
export function diffToMarkdown(diff: ScanDiff, title: string): string {
  if (isEmptyDiff(diff)) return `## ${title}\n\nNo API changes.\n`
  const lines = [`## ${title}`, '']
  if (diff.breakingCount) lines.push(`**${diff.breakingCount} breaking ${diff.breakingCount === 1 ? 'change' : 'changes'}**`, '')
  if (diff.removed.length) {
    lines.push('### Removed (breaking)', ...diff.removed.map((e) => `- \`${label(e)}\``), '')
  }
  if (diff.added.length) lines.push('### Added', ...diff.added.map((e) => `- \`${label(e)}\``), '')
  if (diff.changed.length) {
    lines.push('### Changed')
    for (const { endpoint, changes } of diff.changed) {
      lines.push(`- \`${label(endpoint)}\``, ...changes.map((c) => `  - ${c.breaking ? '**Breaking:** ' : ''}${c.text}`))
    }
    lines.push('')
  }
  return lines.join('\n')
}
