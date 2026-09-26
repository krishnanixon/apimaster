/** Literal or regex replace with a match count. Invalid regex throws. */
export function applyTextReplace(
  content: string,
  query: string,
  replacement: string,
  options: { regex?: boolean; caseSensitive?: boolean } = {}
): { next: string; count: number } {
  if (!query) return { next: content, count: 0 }

  if (options.regex) {
    const flags = options.caseSensitive ? 'g' : 'gi'
    const re = new RegExp(query, flags)
    const matches = content.match(re)
    const count = matches?.length ?? 0
    return { next: count ? content.replace(re, replacement) : content, count }
  }

  const haystack = options.caseSensitive ? content : content.toLowerCase()
  const needle = options.caseSensitive ? query : query.toLowerCase()
  let count = 0
  let index = 0
  let next = ''
  let cursor = 0
  while (index <= haystack.length) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) break
    next += content.slice(cursor, found) + replacement
    cursor = found + query.length
    index = found + Math.max(query.length, 1)
    count += 1
    if (count > 50_000) break
  }
  if (count === 0) return { next: content, count: 0 }
  next += content.slice(cursor)
  return { next, count }
}

/** `file.ts` → `file copy.ts` → `file copy 2.ts` when the name is already taken. */
export function uniqueCopyName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((item) => item.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0
  const stem = hasExt ? name.slice(0, dot) : name
  const ext = hasExt ? name.slice(dot) : ''
  let i = 1
  while (true) {
    const candidate = i === 1 ? `${stem} copy${ext}` : `${stem} copy ${i}${ext}`
    if (!used.has(candidate.toLowerCase())) return candidate
    i += 1
  }
}
