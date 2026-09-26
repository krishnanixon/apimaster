import { describe, expect, it } from 'vitest'
import { applyTextReplace, uniqueCopyName } from '../shared/lib/text-replace'

describe('applyTextReplace', () => {
  it('replaces literal matches and reports the count', () => {
    const result = applyTextReplace('foo bar foo', 'foo', 'baz')
    expect(result).toEqual({ next: 'baz bar baz', count: 2 })
  })

  it('replaces with a regex', () => {
    const result = applyTextReplace('Alpha beta ALPHA', 'alpha', 'ok', { regex: true })
    expect(result.count).toBe(2)
    expect(result.next).toBe('ok beta ok')
  })
})

describe('uniqueCopyName', () => {
  it('keeps the name when it is free', () => {
    expect(uniqueCopyName('app.ts', ['other.ts'])).toBe('app.ts')
  })

  it('appends copy, then numbered copies', () => {
    expect(uniqueCopyName('app.ts', ['app.ts'])).toBe('app copy.ts')
    expect(uniqueCopyName('app.ts', ['app.ts', 'app copy.ts'])).toBe('app copy 2.ts')
  })
})
