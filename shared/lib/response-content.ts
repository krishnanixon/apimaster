/**
 * Classifies HTTP response payloads so the viewer can choose the right
 * renderer (tree, text, image, PDF, media, hex) and a sensible file extension.
 */

export type ResponseKind = 'json' | 'html' | 'xml' | 'svg' | 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'binary'

/** Above this size the JSON tree is not rendered until the user opts in. */
export const LARGE_TREE_BYTES = 1_000_000
/** Above this size the raw editor shows a truncated prefix until the user opts in. */
export const LARGE_TEXT_BYTES = 2_000_000
/** Above this size we do not attempt to parse JSON at all without an explicit request. */
export const HUGE_PARSE_BYTES = 25_000_000

function mimeOf(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function classifyResponse(contentType: string, isBinary: boolean, body = ''): ResponseKind {
  const mime = mimeOf(contentType)
  if (mime === 'image/svg+xml') return 'svg'
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (isBinary) return 'binary'
  if (mime.includes('json')) return 'json'
  if (mime.includes('html')) return 'html'
  if (mime.includes('xml')) return 'xml'
  // Untyped bodies that look like JSON are still inspectable as JSON.
  if (!mime || mime === 'text/plain') {
    const trimmed = body.trimStart()
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && looksLikeJson(body)) return 'json'
  }
  return 'text'
}

function looksLikeJson(body: string): boolean {
  if (body.length > HUGE_PARSE_BYTES) return false
  try {
    JSON.parse(body)
    return true
  } catch {
    return false
  }
}

const EXTENSIONS: Record<string, string> = {
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'html',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/css': 'css',
  'application/javascript': 'js',
  'text/javascript': 'js',
  'application/yaml': 'yaml',
  'application/x-yaml': 'yaml',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/gzip': 'gz',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
}

export function extensionForContentType(contentType: string, isBinary: boolean): string {
  const mime = mimeOf(contentType)
  if (EXTENSIONS[mime]) return EXTENSIONS[mime]
  if (mime.endsWith('+json')) return 'json'
  if (mime.endsWith('+xml')) return 'xml'
  return isBinary ? 'bin' : 'txt'
}

/** `xxd`-style hex dump of the first `maxBytes` bytes. */
export function hexDump(bytes: Uint8Array, maxBytes = 4096): string {
  const lines: string[] = []
  const limit = Math.min(bytes.length, maxBytes)
  for (let offset = 0; offset < limit; offset += 16) {
    const chunk = bytes.subarray(offset, Math.min(offset + 16, limit))
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0'))
    const grouped = [hex.slice(0, 8).join(' '), hex.slice(8).join(' ')].join('  ').padEnd(49, ' ')
    const ascii = Array.from(chunk, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${grouped} |${ascii}|`)
  }
  return lines.join('\n')
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Count case-insensitive, non-overlapping occurrences of `needle`. Capped to keep typing responsive. */
export function countMatches(haystack: string, needle: string, cap = 10_000): number {
  if (!needle) return 0
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  let count = 0
  let idx = h.indexOf(n)
  while (idx !== -1 && count < cap) {
    count++
    idx = h.indexOf(n, idx + n.length)
  }
  return count
}
