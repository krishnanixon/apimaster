import type { ClipboardItem, ClipboardSearchFilter, ClipboardSearchQuery } from '../types/clipboard.types'

function matchesQuery(item: ClipboardItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return item.content.toLowerCase().includes(needle)
}

function matchesFilter(item: ClipboardItem, filter: ClipboardSearchFilter): boolean {
  switch (filter) {
    case 'pinned':
      return item.pinned
    case 'text':
      return item.type === 'text'
    case 'code':
      return item.type === 'code'
    case 'url':
      return item.type === 'url'
    default:
      return true
  }
}

export function searchClipboardItems(
  items: ClipboardItem[],
  { query = '', filter = 'all' }: ClipboardSearchQuery
): ClipboardItem[] {
  return items.filter(
    (item) => matchesFilter(item, filter) && matchesQuery(item, query)
  )
}

export function fuzzyScore(text: string, query: string): number {
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase().trim()
  if (!needle) return 1

  let score = 0
  let fromIndex = 0

  for (const char of needle) {
    const index = haystack.indexOf(char, fromIndex)
    if (index === -1) return 0
    score += 1 / (index + 1)
    fromIndex = index + 1
  }

  return score
}

export function searchClipboardItemsFuzzy(
  items: ClipboardItem[],
  query: ClipboardSearchQuery
): ClipboardItem[] {
  const base = searchClipboardItems(items, { ...query, query: '' })
  const needle = query.query?.trim()
  if (!needle) return base

  return base
    .map((item) => ({ item, score: fuzzyScore(item.content, needle) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}
