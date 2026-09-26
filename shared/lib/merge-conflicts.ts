export interface ConflictHunk {
  /** 1-based line of the `<<<<<<<` marker. */
  startLine: number
  /** 1-based line of the `=======` separator. */
  midLine: number
  /** 1-based line of the `>>>>>>>` marker. */
  endLine: number
  currentLabel: string
  incomingLabel: string
  current: string
  incoming: string
}

export type ConflictResolution = 'current' | 'incoming' | 'both'

const START = /^<<<<<<<(?:\s+(.*))?$/
const MID = /^=======\s*$/
const END = /^>>>>>>>(?:\s+(.*))?$/

export function hasConflictMarkers(text: string): boolean {
  return text.includes('<<<<<<<') && text.includes('>>>>>>>')
}

export function parseConflictMarkers(text: string): ConflictHunk[] {
  const lines = text.split(/\r?\n/)
  const hunks: ConflictHunk[] = []
  let i = 0
  while (i < lines.length) {
    const startMatch = START.exec(lines[i] ?? '')
    if (!startMatch) {
      i += 1
      continue
    }
    const startLine = i + 1
    const currentLabel = startMatch[1]?.trim() || 'HEAD'
    i += 1
    const currentLines: string[] = []
    while (i < lines.length && !MID.test(lines[i] ?? '')) {
      if (START.test(lines[i] ?? '') || END.test(lines[i] ?? '')) break
      currentLines.push(lines[i] ?? '')
      i += 1
    }
    if (!MID.test(lines[i] ?? '')) {
      i = startLine
      continue
    }
    const midLine = i + 1
    i += 1
    const incomingLines: string[] = []
    while (i < lines.length && !END.test(lines[i] ?? '')) {
      if (START.test(lines[i] ?? '') || MID.test(lines[i] ?? '')) break
      incomingLines.push(lines[i] ?? '')
      i += 1
    }
    const endMatch = END.exec(lines[i] ?? '')
    if (!endMatch) {
      i = startLine
      continue
    }
    hunks.push({
      startLine,
      midLine,
      endLine: i + 1,
      currentLabel,
      incomingLabel: endMatch[1]?.trim() || 'incoming',
      current: currentLines.join('\n'),
      incoming: incomingLines.join('\n')
    })
    i += 1
  }
  return hunks
}

export function resolveConflictHunk(hunk: ConflictHunk, mode: ConflictResolution): string {
  if (mode === 'current') return hunk.current
  if (mode === 'incoming') return hunk.incoming
  if (!hunk.current) return hunk.incoming
  if (!hunk.incoming) return hunk.current
  return `${hunk.current}\n${hunk.incoming}`
}

export function applyConflictResolution(
  text: string,
  hunk: ConflictHunk,
  mode: ConflictResolution
): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const replacement = resolveConflictHunk(hunk, mode)
  const replacementLines = replacement === '' ? [] : replacement.split('\n')
  const next = [
    ...lines.slice(0, hunk.startLine - 1),
    ...replacementLines,
    ...lines.slice(hunk.endLine)
  ]
  return next.join(newline)
}

export function applyAllConflictResolutions(text: string, mode: ConflictResolution): string {
  let next = text
  let hunks = parseConflictMarkers(next)
  while (hunks.length > 0) {
    next = applyConflictResolution(next, hunks[0]!, mode)
    hunks = parseConflictMarkers(next)
  }
  return next
}
