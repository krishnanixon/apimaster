import { describe, expect, it } from 'vitest'
import { isInsideRoot } from '../shared/lib/voice-path-safety'
import { join } from 'path'

describe('workspace path containment', () => {
  it('treats the root itself as inside', () => {
    const root = join('/workspace', 'app')
    expect(isInsideRoot(root, root)).toBe(true)
  })

  it('allows nested files and rejects parent traversal', () => {
    const root = join('/workspace', 'app')
    expect(isInsideRoot(join(root, 'src', 'index.ts'), root)).toBe(true)
    expect(isInsideRoot(join('/workspace', 'other'), root)).toBe(false)
  })
})
