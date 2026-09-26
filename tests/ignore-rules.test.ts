import { describe, expect, it } from 'vitest'
import { join } from 'path'
import {
  DEFAULT_IGNORE_NAMES,
  isIgnoredName,
  isIgnoredPath,
  mergeIgnoreNames
} from '../shared/lib/ignore-rules'

describe('ignore-rules', () => {
  it('includes the default excluded directories', () => {
    expect(DEFAULT_IGNORE_NAMES).toEqual(
      expect.arrayContaining(['node_modules', '.git', 'dist', 'build', 'coverage', 'release', '.cache', 'tmp'])
    )
  })

  it('merges custom names and ignores path separators', () => {
    const rules = mergeIgnoreNames(['vendor', 'foo/bar', '..', 'out'])
    expect(rules.names).toContain('vendor')
    expect(rules.names).toContain('out')
    expect(rules.names).not.toContain('foo/bar')
    expect(rules.names).not.toContain('..')
  })

  it('matches ignored path segments under a workspace root', () => {
    const root = join('C:', 'work', 'app')
    const rules = mergeIgnoreNames([])
    expect(isIgnoredPath(root, join(root, 'node_modules', 'react'), rules)).toBe(true)
    expect(isIgnoredPath(root, join(root, 'src', 'index.ts'), rules)).toBe(false)
    expect(isIgnoredName('dist', rules)).toBe(true)
    expect(isIgnoredName('src', rules)).toBe(false)
  })

  it('supports simple glob names', () => {
    const rules = mergeIgnoreNames(['*.log'])
    expect(isIgnoredName('debug.log', rules)).toBe(true)
    expect(isIgnoredName('debug.txt', rules)).toBe(false)
  })
})
