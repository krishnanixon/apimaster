export interface UnifiedHunkLine {
  kind: ' ' | '+' | '-'
  text: string
}

export interface UnifiedHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: UnifiedHunkLine[]
}

export interface ParsedUnifiedDiff {
  oldPath?: string
  newPath?: string
  hunks: UnifiedHunk[]
}

function splitLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function findSequence(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return 0
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false
        break
      }
    }
    if (ok) return i
  }
  return -1
}

export function parseUnifiedDiff(diff: string): ParsedUnifiedDiff {
  const lines = diff.replace(/\r\n/g, '\n').split('\n')
  let oldPath: string | undefined
  let newPath: string | undefined
  const hunks: UnifiedHunk[] = []
  let current: UnifiedHunk | null = null

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      oldPath = line.slice(4).replace(/^[ab]\//, '').trim()
      continue
    }
    if (line.startsWith('+++ ')) {
      newPath = line.slice(4).replace(/^[ab]\//, '').trim()
      continue
    }
    const header = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (header) {
      current = {
        oldStart: Number(header[1]),
        oldCount: header[2] ? Number(header[2]) : 1,
        newStart: Number(header[3]),
        newCount: header[4] ? Number(header[4]) : 1,
        lines: []
      }
      hunks.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('+')) current.lines.push({ kind: '+', text: line.slice(1) })
    else if (line.startsWith('-')) current.lines.push({ kind: '-', text: line.slice(1) })
    else if (line.startsWith(' ')) current.lines.push({ kind: ' ', text: line.slice(1) })
    else if (line.startsWith('\\')) continue
    else if (line === '') continue
  }

  if (hunks.length === 0) {
    throw new Error('Patch is not a unified diff (no hunks found).')
  }
  return { oldPath, newPath, hunks }
}

export function applyUnifiedDiff(original: string, diff: string): string {
  const parsed = parseUnifiedDiff(diff)
  return applyHunks(original, parsed.hunks)
}

export function applyHunks(original: string, hunks: UnifiedHunk[]): string {
  const result = splitLines(original)
  const keepFinalNewline = original.endsWith('\n')

  for (const hunk of [...hunks].reverse()) {
    const oldLines = hunk.lines.filter((line) => line.kind !== '+').map((line) => line.text)
    const newLines = hunk.lines.filter((line) => line.kind !== '-').map((line) => line.text)
    let index = hunk.oldStart > 0 ? hunk.oldStart - 1 : 0
    const window = result.slice(index, index + oldLines.length)
    if (oldLines.length > 0 && window.join('\n') !== oldLines.join('\n')) {
      const found = findSequence(result, oldLines)
      if (found < 0) {
        throw new Error(`Patch does not apply: hunk at line ${hunk.oldStart} did not match the file.`)
      }
      index = found
    }
    result.splice(index, oldLines.length, ...newLines)
  }

  const joined = result.join('\n')
  if (keepFinalNewline && (joined.length > 0 || original.length > 0)) return `${joined}\n`
  return joined
}

export function applySingleHunk(original: string, diff: string, hunkIndex: number): string {
  const parsed = parseUnifiedDiff(diff)
  const hunk = parsed.hunks[hunkIndex]
  if (!hunk) throw new Error(`Hunk ${hunkIndex} not found in patch.`)
  return applyHunks(original, [hunk])
}

export function rejectHunkFromDiff(
  path: string,
  previous: string,
  diff: string,
  hunkIndex: number
): { next: string; diff: string } | null {
  const parsed = parseUnifiedDiff(diff)
  if (hunkIndex < 0 || hunkIndex >= parsed.hunks.length) {
    throw new Error(`Hunk ${hunkIndex} not found in patch.`)
  }
  const remaining = parsed.hunks.filter((_, index) => index !== hunkIndex)
  if (remaining.length === 0) return null
  const next = applyHunks(previous, remaining)
  return { next, diff: createUnifiedDiff(path, previous, next) }
}

export function hunkCount(diff: string): number {
  try {
    return parseUnifiedDiff(diff).hunks.length
  } catch {
    return 0
  }
}

export function pathFromDiff(diff: string, fallback?: string): string | undefined {
  try {
    const parsed = parseUnifiedDiff(diff)
    const path = parsed.newPath && parsed.newPath !== '/dev/null' ? parsed.newPath : parsed.oldPath
    return path && path !== '/dev/null' ? path : fallback
  } catch {
    return fallback
  }
}

/** Full-file unified diff used when the agent rewrites a file instead of sending a hunk. */
export function createUnifiedDiff(path: string, previous: string, next: string): string {
  const rel = path.replace(/\\/g, '/')
  const oldLines = splitLines(previous)
  const newLines = splitLines(next)
  if (oldLines.length === 0) {
    const body = newLines.map((line) => `+${line}`).join('\n')
    return `--- /dev/null\n+++ b/${rel}\n@@ -0,0 +1,${newLines.length} @@\n${body}${body ? '\n' : ''}`
  }
  const removed = oldLines.map((line) => `-${line}`).join('\n')
  const added = newLines.map((line) => `+${line}`).join('\n')
  return `--- a/${rel}\n+++ b/${rel}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${removed}\n${added}\n`
}
