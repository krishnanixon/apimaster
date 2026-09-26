import { randomUUID } from 'crypto'
import type { ClipboardItem, ClipboardItemType } from '../types/clipboard.types'

const URL_PATTERN =
  /^(https?:\/\/|ftp:\/\/|www\.)[\w\-._~:/?#[\]@!$&'()*+,;=%]+$/i

const CODE_INDICATORS = [
  /^\s*(import|export|const|let|var|function|class|interface|type|enum)\s/m,
  /^\s*(def|async def|class)\s+\w+/m,
  /^\s*(public|private|protected)\s+(static\s+)?(void|int|string|bool)/m,
  /[{}\[\]();].*[{}\[\]();]/,
  /^\s*<\?php/m,
  /^\s*#include\s*</m,
  /^\s*package\s+\w+/m,
  /```[\s\S]*```/,
  /^\s*SELECT\s+.+\s+FROM\s+/im,
  /^\s*CREATE\s+TABLE\s+/im
]

const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*\S+/i,
  /api[_-]?key\s*[:=]\s*\S+/i,
  /secret\s*[:=]\s*\S+/i,
  /token\s*[:=]\s*\S+/i,
  /bearer\s+[a-z0-9._\-+/=]{20,}/i,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
  /sk-[a-zA-Z0-9]{20,}/,
  /xox[baprs]-[a-zA-Z0-9-]+/
]

export function normalizeClipboardText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

export function isSensitiveContent(content: string): boolean {
  const normalized = content.trim()
  if (normalized.length < 8) return false
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function classifyClipboardContent(content: string): ClipboardItemType {
  const trimmed = content.trim()
  if (!trimmed) return 'text'

  if (URL_PATTERN.test(trimmed) || /^https?:\/\/\S+$/i.test(trimmed)) {
    return 'url'
  }

  const lineCount = trimmed.split('\n').length
  const hasCodeSignal = CODE_INDICATORS.some((pattern) => pattern.test(trimmed))

  if (hasCodeSignal || (lineCount >= 3 && /[{}();=<>]/.test(trimmed))) {
    return 'code'
  }

  return 'text'
}

export function isDuplicateEntry(content: string, items: ClipboardItem[]): boolean {
  const normalized = normalizeClipboardText(content)
  if (!normalized) return true
  return items.some((item) => normalizeClipboardText(item.content) === normalized)
}

export function createClipboardEntry(content: string, sourceApp?: string): ClipboardItem | null {
  const normalized = normalizeClipboardText(content)
  if (!normalized || normalized.length > 100_000) return null
  if (isSensitiveContent(normalized)) return null

  const trimmedSource = sourceApp?.trim()

  return {
    id: randomUUID(),
    content: normalized,
    type: classifyClipboardContent(normalized),
    timestamp: Date.now(),
    pinned: false,
    ...(trimmedSource ? { sourceApp: trimmedSource } : {})
  }
}

export function sanitizeForDisplay(content: string, maxLength = 500): string {
  if (content.length <= maxLength) return content
  return `${content.slice(0, maxLength)}…`
}
