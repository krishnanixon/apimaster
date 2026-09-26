import { relative, sep } from 'path'

/** Default directory/file names hidden from the explorer and indexer. */
export const DEFAULT_IGNORE_NAMES = [
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  'release',
  '.cache',
  'tmp'
] as const

export interface IgnoreRuleSet {
  names: string[]
}

export function defaultIgnoreRuleSet(): IgnoreRuleSet {
  return { names: [...DEFAULT_IGNORE_NAMES] }
}

export function mergeIgnoreNames(custom: string[] | undefined | null): IgnoreRuleSet {
  const extras = (custom ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name !== '.' && name !== '..' && !name.includes(sep) && !name.includes('/'))
  const names = [...new Set([...DEFAULT_IGNORE_NAMES, ...extras])]
  return { names }
}

function nameMatches(entryName: string, pattern: string): boolean {
  if (pattern === entryName) return true
  if (!pattern.includes('*')) return pattern.toLowerCase() === entryName.toLowerCase()
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i').test(entryName)
}

/** True when any path segment under `rootPath` matches an ignore rule. */
export function isIgnoredPath(rootPath: string, targetPath: string, rules: IgnoreRuleSet): boolean {
  const rel = relative(rootPath, targetPath)
  if (!rel || rel === '') return false
  if (rel.startsWith('..')) return false
  const segments = rel.split(/[\\/]/).filter(Boolean)
  return segments.some((segment) => rules.names.some((pattern) => nameMatches(segment, pattern)))
}

export function isIgnoredName(name: string, rules: IgnoreRuleSet): boolean {
  return rules.names.some((pattern) => nameMatches(name, pattern))
}
