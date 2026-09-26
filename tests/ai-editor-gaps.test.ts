import { describe, expect, it } from 'vitest'
import {
  applyHunks,
  applySingleHunk,
  createUnifiedDiff,
  parseUnifiedDiff,
  rejectHunkFromDiff
} from '../shared/lib/unified-diff'
import { assertSafeHttpUrl, assertSafeSeoCrawlUrl } from '../shared/lib/seo-crawl-url'

describe('unified hunk helpers', () => {
  it('applies and rejects individual hunks', () => {
    const previous = 'a\nb\nc\nd\n'
    const next = 'a\nB\nc\nD\n'
    const diff = createUnifiedDiff('file.ts', previous, next)
    const parsed = parseUnifiedDiff(diff)
    expect(parsed.hunks.length).toBeGreaterThan(0)

    const onlyFirst = applySingleHunk(previous, diff, 0)
    expect(onlyFirst.includes('B') || onlyFirst.includes('D')).toBe(true)

    if (parsed.hunks.length > 1) {
      const rejected = rejectHunkFromDiff('file.ts', previous, diff, 0)
      expect(rejected).not.toBeNull()
      expect(applyHunks(previous, parseUnifiedDiff(rejected!.diff).hunks)).toBe(rejected!.next)
    }
  })
})

describe('safe http url', () => {
  it('blocks private hosts for agent fetch', () => {
    expect(() => assertSafeHttpUrl('http://127.0.0.1/secret')).toThrow(/Private/)
    expect(() => assertSafeHttpUrl('http://169.254.169.254/latest')).toThrow()
  })

  it('allows localhost for SEO crawl helper', () => {
    expect(assertSafeSeoCrawlUrl('http://localhost:3000').hostname).toBe('localhost')
  })
})
