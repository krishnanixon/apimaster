import type { CodeSearchHit, SourceLanguage } from '../types/code-intel'

export function isIndexedFileUnchanged(
  existing: { hash: string; mtimeMs: number; size: number } | null,
  file: { mtimeMs: number; size: number },
  contentHash: string
): boolean {
  if (!existing) return false
  if (existing.mtimeMs === file.mtimeMs && existing.size === file.size) return true
  return existing.hash === contentHash
}

export function buildFtsQuery(query: string): string | null {
  const escaped = query.replace(/["']/g, ' ').trim()
  if (!escaped) return null
  const tokens = escaped
    .split(/\s+/)
    .map((token) => token.replace(/"/g, ''))
    .filter(Boolean)
  if (tokens.length === 0) return null
  return tokens.map((token) => `"${token}"`).join(' AND ')
}

export function lineFromOffset(content: string, index: number): number {
  let line = 1
  const end = Math.min(index, content.length)
  for (let i = 0; i < end; i++) {
    if (content[i] === '\n') line += 1
  }
  return line
}

export function snippetAround(content: string, index: number, length: number): string {
  const start = Math.max(0, index - 80)
  const end = Math.min(content.length, index + Math.max(length, 1) + 80)
  return content.slice(start, end).replace(/\s+/g, ' ').trim()
}

export function hitFromContent(
  row: { path: string; relativePath: string; language: SourceLanguage; content: string },
  query: string,
  score: number
): CodeSearchHit {
  const idx = row.content.toLowerCase().indexOf(query.toLowerCase())
  return {
    path: row.path,
    relativePath: row.relativePath,
    language: row.language,
    startLine: idx >= 0 ? lineFromOffset(row.content, idx) : 1,
    snippet: snippetAround(row.content, idx >= 0 ? idx : 0, query.length),
    score
  }
}

export function regexSearchContent(
  rows: Array<{ path: string; relativePath: string; language: SourceLanguage; content: string }>,
  pattern: string,
  limit: number
): CodeSearchHit[] {
  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'm')
  } catch {
    return []
  }
  const hits: CodeSearchHit[] = []
  for (const row of rows) {
    const match = regex.exec(row.content)
    if (!match) continue
    hits.push({
      path: row.path,
      relativePath: row.relativePath,
      language: row.language,
      startLine: lineFromOffset(row.content, match.index),
      snippet: snippetAround(row.content, match.index, match[0].length),
      score: 1
    })
    if (hits.length >= limit) break
  }
  return hits
}

export function scoreSymbolHit(name: string, query: string): number {
  return name.toLowerCase() === query.toLowerCase() ? 2 : 1
}
