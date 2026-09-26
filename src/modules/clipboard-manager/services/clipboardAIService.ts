import type { ClipboardItem } from '../types/clipboard.types'

export async function summarizeClipboard(_items: ClipboardItem[]): Promise<string> {
  return 'AI summarization is not enabled yet.'
}

export async function groupSimilarItems(_items: ClipboardItem[]): Promise<ClipboardItem[][]> {
  return []
}

export async function detectSensitiveContent(content: string): Promise<boolean> {
  const { isSensitiveContent } = await import('../core/clipboardEngine')
  return isSensitiveContent(content)
}
