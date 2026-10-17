/**
 * Request/response comparison used by the API Studio "Compare" view.
 * Pure functions — no DOM, no IPC — so they are unit-testable and cheap to reuse.
 */
import type { ApiExecutionResult, ApiRequest, KeyValuePair } from '../types/api-studio'
import { deepEqual, formatJsonPath, type JsonPathSegment } from './json-path'

export type ChangeKind = 'added' | 'removed' | 'changed'

export interface FieldChange {
  key: string
  kind: ChangeKind
  before?: string
  after?: string
}

export interface JsonChange {
  path: string
  kind: ChangeKind
  before?: unknown
  after?: unknown
}

export type LineOp = { type: 'equal' | 'added' | 'removed'; text: string; leftLine?: number; rightLine?: number }

export interface BodyDiff {
  mode: 'json' | 'text' | 'binary' | 'identical'
  jsonChanges?: JsonChange[]
  lines?: LineOp[]
  /** True when the line diff was computed on a truncated body. */
  truncated?: boolean
  /** True when inputs were too large for an exact LCS and a coarse diff was used instead. */
  approximate?: boolean
}

export interface ResponseComparison {
  status: { before: number; after: number; changed: boolean; beforeText: string; afterText: string }
  timeMs: { before: number; after: number; delta: number }
  sizeBytes: { before: number; after: number; delta: number }
  contentType: { before: string; after: string; changed: boolean }
  headers: FieldChange[]
  body: BodyDiff
}

export interface RequestComparison {
  changes: FieldChange[]
}

/** Headers that differ on every call and only add noise to a diff. */
export const VOLATILE_HEADERS = new Set([
  'date',
  'age',
  'expires',
  'last-modified',
  'etag',
  'x-request-id',
  'x-amzn-requestid',
  'x-amz-cf-id',
  'x-correlation-id',
  'cf-ray',
  'x-runtime',
  'server-timing',
  'report-to',
  'nel'
])

const MAX_JSON_CHANGES = 2000
const MAX_DIFF_CHARS = 400_000
const MAX_LCS_CELLS = 4_000_000

export function diffRecords(
  before: Record<string, string>,
  after: Record<string, string>,
  options: { caseInsensitive?: boolean; ignore?: Set<string> } = {}
): FieldChange[] {
  const norm = (k: string) => (options.caseInsensitive ? k.toLowerCase() : k)
  const a = new Map(Object.entries(before).map(([k, v]) => [norm(k), v]))
  const b = new Map(Object.entries(after).map(([k, v]) => [norm(k), v]))
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort()
  const out: FieldChange[] = []
  for (const key of keys) {
    if (options.ignore?.has(key)) continue
    const av = a.get(key)
    const bv = b.get(key)
    if (av === undefined) out.push({ key, kind: 'added', after: bv })
    else if (bv === undefined) out.push({ key, kind: 'removed', before: av })
    else if (av !== bv) out.push({ key, kind: 'changed', before: av, after: bv })
  }
  return out
}

/** Structural JSON diff. Arrays compare index-by-index. */
export function diffJson(before: unknown, after: unknown, limit = MAX_JSON_CHANGES): JsonChange[] {
  const out: JsonChange[] = []
  const walk = (a: unknown, b: unknown, segments: JsonPathSegment[]) => {
    if (out.length >= limit) return
    if (deepEqual(a, b)) return
    const aObj = a !== null && typeof a === 'object'
    const bObj = b !== null && typeof b === 'object'
    if (aObj && bObj && Array.isArray(a) === Array.isArray(b)) {
      if (Array.isArray(a)) {
        const bArr = b as unknown[]
        const max = Math.max(a.length, bArr.length)
        for (let i = 0; i < max; i++) {
          if (i >= a.length) out.push({ path: formatJsonPath([...segments, i]), kind: 'added', after: bArr[i] })
          else if (i >= bArr.length) out.push({ path: formatJsonPath([...segments, i]), kind: 'removed', before: a[i] })
          else walk(a[i], bArr[i], [...segments, i])
          if (out.length >= limit) return
        }
        return
      }
      const aRec = a as Record<string, unknown>
      const bRec = b as Record<string, unknown>
      const keys = [...new Set([...Object.keys(aRec), ...Object.keys(bRec)])]
      for (const key of keys) {
        const inA = Object.prototype.hasOwnProperty.call(aRec, key)
        const inB = Object.prototype.hasOwnProperty.call(bRec, key)
        if (!inA) out.push({ path: formatJsonPath([...segments, key]), kind: 'added', after: bRec[key] })
        else if (!inB) out.push({ path: formatJsonPath([...segments, key]), kind: 'removed', before: aRec[key] })
        else walk(aRec[key], bRec[key], [...segments, key])
        if (out.length >= limit) return
      }
      return
    }
    out.push({ path: formatJsonPath(segments), kind: 'changed', before: a, after: b })
  }
  walk(before, after, [])
  return out
}

/**
 * Line diff via LCS. Common prefix/suffix are trimmed first so typical API
 * responses (small edits in a large body) stay well under the cell budget.
 */
export function diffLines(before: string, after: string): { lines: LineOp[]; approximate: boolean } {
  const a = before.split('\n')
  const b = after.split('\n')
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++
  }

  const ops: LineOp[] = []
  for (let i = 0; i < prefix; i++) ops.push({ type: 'equal', text: a[i], leftLine: i + 1, rightLine: i + 1 })

  const midA = a.slice(prefix, a.length - suffix)
  const midB = b.slice(prefix, b.length - suffix)
  let approximate = false

  if (midA.length * midB.length > MAX_LCS_CELLS) {
    approximate = true
    midA.forEach((text, i) => ops.push({ type: 'removed', text, leftLine: prefix + i + 1 }))
    midB.forEach((text, i) => ops.push({ type: 'added', text, rightLine: prefix + i + 1 }))
  } else {
    const n = midA.length
    const m = midB.length
    // lcs[i][j] = LCS length of midA[i..] and midB[j..], stored row-major.
    const lcs = new Uint32Array((n + 1) * (m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * (m + 1) + j] =
          midA[i] === midB[j]
            ? lcs[(i + 1) * (m + 1) + j + 1] + 1
            : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push({ type: 'equal', text: midA[i], leftLine: prefix + i + 1, rightLine: prefix + j + 1 })
        i++
        j++
      } else if (lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1]) {
        ops.push({ type: 'removed', text: midA[i], leftLine: prefix + i + 1 })
        i++
      } else {
        ops.push({ type: 'added', text: midB[j], rightLine: prefix + j + 1 })
        j++
      }
    }
    for (; i < n; i++) ops.push({ type: 'removed', text: midA[i], leftLine: prefix + i + 1 })
    for (; j < m; j++) ops.push({ type: 'added', text: midB[j], rightLine: prefix + j + 1 })
  }

  for (let k = 0; k < suffix; k++) {
    ops.push({
      type: 'equal',
      text: a[a.length - suffix + k],
      leftLine: a.length - suffix + k + 1,
      rightLine: b.length - suffix + k + 1
    })
  }
  return { lines: ops, approximate }
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (!text.trim()) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function prettyIfJson(text: string): string {
  const parsed = tryParseJson(text)
  return parsed.ok ? JSON.stringify(parsed.value, null, 2) : text
}

/** Text used for body comparison; GraphQL responses compare their `data`. */
function bodyText(res: ApiExecutionResult): string {
  if (res.graphql && !res.graphql.parseError) return JSON.stringify({ data: res.graphql.data, errors: res.graphql.errors })
  return res.data
}

export function diffBodies(before: ApiExecutionResult, after: ApiExecutionResult): BodyDiff {
  if (before.isBinary || after.isBinary) {
    const same = before.isBinary && after.isBinary && before.dataBase64 === after.dataBase64
    return { mode: same ? 'identical' : 'binary' }
  }
  const aText = bodyText(before)
  const bText = bodyText(after)
  if (aText === bText) return { mode: 'identical' }

  const aJson = tryParseJson(aText)
  const bJson = tryParseJson(bText)
  if (aJson.ok && bJson.ok) {
    const jsonChanges = diffJson(aJson.value, bJson.value)
    if (jsonChanges.length === 0) return { mode: 'identical' }
    const left = JSON.stringify(aJson.value, null, 2)
    const right = JSON.stringify(bJson.value, null, 2)
    const truncated = left.length > MAX_DIFF_CHARS || right.length > MAX_DIFF_CHARS
    const { lines, approximate } = diffLines(left.slice(0, MAX_DIFF_CHARS), right.slice(0, MAX_DIFF_CHARS))
    return { mode: 'json', jsonChanges, lines, truncated, approximate }
  }

  const left = prettyIfJson(aText)
  const right = prettyIfJson(bText)
  const truncated = left.length > MAX_DIFF_CHARS || right.length > MAX_DIFF_CHARS
  const { lines, approximate } = diffLines(left.slice(0, MAX_DIFF_CHARS), right.slice(0, MAX_DIFF_CHARS))
  return { mode: 'text', lines, truncated, approximate }
}

export function compareResponses(
  before: ApiExecutionResult,
  after: ApiExecutionResult,
  options: { ignoreVolatileHeaders?: boolean } = {}
): ResponseComparison {
  return {
    status: {
      before: before.status,
      after: after.status,
      beforeText: before.statusText,
      afterText: after.statusText,
      changed: before.status !== after.status
    },
    timeMs: { before: before.timeMs, after: after.timeMs, delta: after.timeMs - before.timeMs },
    sizeBytes: { before: before.sizeBytes, after: after.sizeBytes, delta: after.sizeBytes - before.sizeBytes },
    contentType: {
      before: before.contentType,
      after: after.contentType,
      changed: before.contentType !== after.contentType
    },
    headers: diffRecords(before.headers, after.headers, {
      caseInsensitive: true,
      ignore: options.ignoreVolatileHeaders ? VOLATILE_HEADERS : undefined
    }),
    body: diffBodies(before, after)
  }
}

function pairsToRecord(pairs: KeyValuePair[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs ?? []) {
    if (p.enabled && p.key.trim()) out[p.key] = p.value
  }
  return out
}

function requestBodyText(req: ApiRequest): string {
  if (req.requestType === 'graphql') {
    return `${req.graphql?.query ?? ''}\n---\n${req.graphql?.variables ?? ''}`
  }
  if (req.body.type === 'form-data') {
    return (req.body.formData ?? [])
      .filter((f) => f.enabled && f.key)
      .map((f) => `${f.key}=${f.type === 'file' ? `<file ${f.fileName ?? ''}>` : f.value}`)
      .join('\n')
  }
  return req.body.type === 'none' ? '' : prettyIfJson(req.body.content)
}

/** Field-level request diff. Secrets are compared but never shown — only whether they changed. */
export function compareRequests(before: ApiRequest, after: ApiRequest): RequestComparison {
  const changes: FieldChange[] = []
  const scalar = (key: string, a: string, b: string) => {
    if (a !== b) changes.push({ key, kind: 'changed', before: a, after: b })
  }
  scalar('type', before.requestType ?? 'http', after.requestType ?? 'http')
  scalar('method', before.method, after.method)
  scalar('url', before.url, after.url)
  for (const c of diffRecords(pairsToRecord(before.queryParams), pairsToRecord(after.queryParams))) {
    changes.push({ ...c, key: `query.${c.key}` })
  }
  for (const c of diffRecords(pairsToRecord(before.pathParams), pairsToRecord(after.pathParams))) {
    changes.push({ ...c, key: `path.${c.key}` })
  }
  for (const c of diffRecords(pairsToRecord(before.headers), pairsToRecord(after.headers), { caseInsensitive: true })) {
    changes.push({ ...c, key: `header.${c.key}` })
  }
  scalar('auth', before.auth.type, after.auth.type)
  if (before.auth.type === after.auth.type && !deepEqual(before.auth, after.auth)) {
    changes.push({ key: 'auth.credentials', kind: 'changed', before: '••••', after: '•••• (changed)' })
  }
  scalar('body.type', before.requestType === 'graphql' ? 'graphql' : before.body.type, after.requestType === 'graphql' ? 'graphql' : after.body.type)
  const aBody = requestBodyText(before)
  const bBody = requestBodyText(after)
  if (aBody !== bBody) changes.push({ key: 'body', kind: 'changed', before: aBody, after: bBody })
  return { changes }
}

export function formatSignedDelta(delta: number, unit: string): string {
  if (delta === 0) return `±0${unit}`
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}${unit}`
}
