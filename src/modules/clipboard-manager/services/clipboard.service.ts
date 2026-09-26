import type { ClipboardItem, ClipboardSearchQuery } from '../types/clipboard.types'

function ensureApi() {
  if (typeof window === 'undefined' || !window.electronAPI?.clipboard) {
    throw new Error('Clipboard API is unavailable. Restart the desktop app to load the latest build.')
  }
  return window.electronAPI.clipboard
}

export async function listClipboardItems(): Promise<ClipboardItem[]> {
  const result = await ensureApi().list()
  if (!result.success) throw new Error(result.error ?? 'Failed to load clipboard history')
  return result.data ?? []
}

export async function searchClipboard(query: ClipboardSearchQuery): Promise<ClipboardItem[]> {
  const result = await ensureApi().search(query)
  if (!result.success) throw new Error(result.error ?? 'Clipboard search failed')
  return result.data ?? []
}

export async function copyClipboardItem(id: string): Promise<void> {
  const result = await ensureApi().copy(id)
  if (!result.success) throw new Error(result.error ?? 'Failed to copy item')
}

export async function pinClipboardItem(id: string): Promise<ClipboardItem[]> {
  const result = await ensureApi().pin(id)
  if (!result.success) throw new Error(result.error ?? 'Failed to pin item')
  return result.data ?? []
}

export async function removeClipboardItem(id: string): Promise<ClipboardItem[]> {
  const result = await ensureApi().remove(id)
  if (!result.success) throw new Error(result.error ?? 'Failed to remove item')
  return result.data ?? []
}

export async function clearUnpinnedClipboardItems(): Promise<ClipboardItem[]> {
  const result = await ensureApi().clearUnpinned()
  if (!result.success) throw new Error(result.error ?? 'Failed to clear clipboard history')
  return result.data ?? []
}

export async function pickAndPasteClipboardItem(id: string): Promise<void> {
  const result = await ensureApi().pickAndPaste(id)
  if (!result.success) throw new Error(result.error ?? 'Failed to paste item')
}

export async function closeClipboardPicker(): Promise<void> {
  const result = await ensureApi().closePicker()
  if (!result.success) throw new Error(result.error ?? 'Failed to close picker')
}

export function subscribeClipboardUpdates(
  callback: (items: ClipboardItem[]) => void
): () => void {
  return ensureApi().onHistoryUpdate((snapshot) => callback(snapshot.items))
}

export function subscribeOpenPanel(callback: () => void): () => void {
  return ensureApi().onOpenPanel(callback)
}
