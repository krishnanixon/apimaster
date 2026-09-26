import { isAbsolute, normalize, relative, resolve, sep } from 'path'

const BLOCKED_SEGMENTS = new Set(['..'])

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafePathError'
  }
}

/**
 * Resolve `candidate` and require it to stay inside one of `allowedRoots`.
 * Rejects traversal, NUL bytes, and empty paths. Does not execute anything.
 */
export function assertSafePath(candidate: string, allowedRoots: string[]): string {
  if (!candidate || typeof candidate !== 'string') {
    throw new UnsafePathError('Path is required.')
  }
  if (candidate.includes('\0')) {
    throw new UnsafePathError('Path contains an invalid character.')
  }

  const normalizedCandidate = normalize(candidate)
  const parts = normalizedCandidate.split(/[\\/]/).filter(Boolean)
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part))) {
    throw new UnsafePathError('Path traversal is not allowed.')
  }

  const resolved = isAbsolute(normalizedCandidate)
    ? resolve(normalizedCandidate)
    : resolve(allowedRoots[0] ?? process.cwd(), normalizedCandidate)

  const inside = allowedRoots.some((root) => isInsideRoot(resolved, resolve(root)))
  if (!inside) {
    throw new UnsafePathError('Path is outside the allowed workspace.')
  }

  return resolved
}

export function isInsideRoot(target: string, root: string): boolean {
  const rel = relative(root, target)
  if (rel === '') return true
  return !rel.startsWith(`..${sep}`) && !rel.startsWith('..') && !isAbsolute(rel)
}

export function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  const base = trimmed.replace(/^\.+/, '').slice(0, 80)
  return base.length > 0 ? base : 'note'
}
