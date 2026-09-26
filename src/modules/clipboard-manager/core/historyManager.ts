import type { ClipboardItem } from '../types/clipboard.types'
import { CLIPBOARD_MAX_ITEMS } from '../types/clipboard.types'
import { isDuplicateEntry, normalizeClipboardText } from './clipboardEngine'

export function sortClipboardItems(items: ClipboardItem[]): ClipboardItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.timestamp - a.timestamp
  })
}

export function enforceHistoryLimit(items: ClipboardItem[], maxItems = CLIPBOARD_MAX_ITEMS): ClipboardItem[] {
  const sorted = sortClipboardItems(items)
  const pinned = sorted.filter((item) => item.pinned)
  const unpinned = sorted.filter((item) => !item.pinned)

  const slotsForUnpinned = Math.max(0, maxItems - pinned.length)
  const keptUnpinned = unpinned.slice(0, slotsForUnpinned)

  return sortClipboardItems([...pinned, ...keptUnpinned])
}

export function addHistoryItem(items: ClipboardItem[], entry: ClipboardItem): ClipboardItem[] {
  if (isDuplicateEntry(entry.content, items)) {
    const normalized = normalizeClipboardText(entry.content)
    const existing = items.find((item) => normalizeClipboardText(item.content) === normalized)
    if (!existing) return items

    const refreshed = items.map((item) =>
      item.id === existing.id
        ? {
            ...item,
            timestamp: Date.now(),
            sourceApp: entry.sourceApp ?? item.sourceApp
          }
        : item
    )
    return enforceHistoryLimit(sortClipboardItems(refreshed))
  }

  return enforceHistoryLimit(sortClipboardItems([entry, ...items]))
}

export function togglePinItem(items: ClipboardItem[], id: string): ClipboardItem[] {
  return sortClipboardItems(
    items.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item))
  )
}

export function removeHistoryItem(items: ClipboardItem[], id: string): ClipboardItem[] {
  return items.filter((item) => item.id !== id)
}

export function clearUnpinnedItems(items: ClipboardItem[]): ClipboardItem[] {
  return sortClipboardItems(items.filter((item) => item.pinned))
}
