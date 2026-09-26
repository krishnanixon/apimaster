export type LineChangeKind = 'added' | 'modified' | 'deleted'

export interface LineChange {
  /** 1-based line number in the current document. */
  line: number
  kind: LineChangeKind
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}

/**
 * Longest-common-subsequence line diff used for the editor's git change gutter.
 * Falls back to marking every line as modified for very large files, where a full
 * LCS table would be too expensive to build on each keystroke.
 */
const MAX_LCS_CELLS = 4_000_000

export function diffLines(original: string, current: string): LineChange[] {
  const a = splitLines(original)
  const b = splitLines(current)

  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const aMid = a.slice(prefix, a.length - suffix)
  const bMid = b.slice(prefix, b.length - suffix)
  if (aMid.length === 0 && bMid.length === 0) return []

  if (aMid.length * bMid.length > MAX_LCS_CELLS) {
    return bMid.map((_, index) => ({ line: prefix + index + 1, kind: 'modified' as const }))
  }

  // LCS table over the differing middle section only.
  const rows = aMid.length + 1
  const cols = bMid.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = aMid.length - 1; i >= 0; i -= 1) {
    for (let j = bMid.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        aMid[i] === bMid[j]
          ? table[(i + 1) * cols + (j + 1)] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + (j + 1)])
    }
  }

  const changes: LineChange[] = []
  let i = 0
  let j = 0
  let pendingRemovals = 0

  const flushRemovals = (line: number) => {
    if (pendingRemovals === 0) return
    changes.push({ line, kind: 'deleted' })
    pendingRemovals = 0
  }

  while (i < aMid.length && j < bMid.length) {
    if (aMid[i] === bMid[j]) {
      flushRemovals(prefix + j + 1)
      i += 1
      j += 1
      continue
    }
    if (table[(i + 1) * cols + j] >= table[i * cols + (j + 1)]) {
      pendingRemovals += 1
      i += 1
      continue
    }
    changes.push({ line: prefix + j + 1, kind: pendingRemovals > 0 ? 'modified' : 'added' })
    if (pendingRemovals > 0) pendingRemovals -= 1
    j += 1
  }

  while (j < bMid.length) {
    changes.push({ line: prefix + j + 1, kind: pendingRemovals > 0 ? 'modified' : 'added' })
    if (pendingRemovals > 0) pendingRemovals -= 1
    j += 1
  }

  if (i < aMid.length || pendingRemovals > 0) {
    changes.push({ line: Math.max(1, prefix + bMid.length), kind: 'deleted' })
  }

  return changes
}

export function summarizeChanges(changes: LineChange[]): {
  added: number
  modified: number
  deleted: number
} {
  let added = 0
  let modified = 0
  let deleted = 0
  for (const change of changes) {
    if (change.kind === 'added') added += 1
    else if (change.kind === 'modified') modified += 1
    else deleted += 1
  }
  return { added, modified, deleted }
}
