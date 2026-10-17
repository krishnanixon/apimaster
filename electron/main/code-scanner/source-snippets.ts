import { scrubCode } from '@shared/lib/code-scanner/enrich'
import { lineReader } from './code-scanner-ai.service'

const LINES_BEFORE = 5
const LINES_AFTER = 45
const MAX_LOCATIONS = 3

export interface SourceSnippet {
  file: string
  /** First line of `code`. */
  line: number
  code: string
}

/** Code around each location, read only inside `root` and with credentials redacted. */
export function readSourceSnippets(root: string, locations: Array<{ file: string; line: number }>): SourceSnippet[] {
  const read = lineReader(root)
  const out: SourceSnippet[] = []
  for (const { file, line } of locations.slice(0, MAX_LOCATIONS)) {
    const lines = read(file)
    if (!lines) continue
    const from = Math.max(0, line - 1 - LINES_BEFORE)
    out.push({ file, line: from + 1, code: scrubCode(lines.slice(from, line - 1 + LINES_AFTER).join('\n')) })
  }
  return out
}
