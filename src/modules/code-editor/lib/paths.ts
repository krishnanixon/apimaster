/** Path helpers shared by the workbench UI. Paths may be absolute (OS-native) or workspace-relative. */

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

export function fileNameOf(path: string): string {
  const parts = normalizePath(path).split('/')
  return parts[parts.length - 1] || path
}

export function dirNameOf(path: string): string {
  const normalized = normalizePath(path)
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '' : normalized.slice(0, index)
}

export function extensionOf(path: string): string {
  const name = fileNameOf(path).toLowerCase()
  const index = name.lastIndexOf('.')
  return index <= 0 ? '' : name.slice(index + 1)
}

export function relativeTo(rootPath: string | null, path: string): string {
  if (!rootPath) return normalizePath(path)
  const root = normalizePath(rootPath).replace(/\/$/, '')
  const target = normalizePath(path)
  return target.startsWith(`${root}/`) ? target.slice(root.length + 1) : target
}

export function joinPath(base: string, ...segments: string[]): string {
  return [normalizePath(base).replace(/\/$/, ''), ...segments].join('/')
}

/**
 * True when a diagnostic/search path refers to the same file as an absolute editor path.
 * Tool output is often relative to the workspace root, so we compare path suffixes.
 */
export function pathsMatch(absolutePath: string, candidate: string): boolean {
  const a = normalizePath(absolutePath).toLowerCase()
  const b = normalizePath(candidate).replace(/^\.\//, '').toLowerCase()
  if (!b) return false
  return a === b || a.endsWith(`/${b}`)
}
