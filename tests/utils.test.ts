import { describe, it, expect } from 'vitest'
import { cn, formatRelativeTime } from '../src/shared/lib/utils'

describe('utils', () => {
  it('cn merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('formatRelativeTime returns readable time', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now)).toBe('Just now')
  })
})
