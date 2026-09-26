import { describe, expect, it } from 'vitest'
import { fitPopupToDisplay } from '../electron/main/clipboard-manager/popup-geometry'
import {
  classifyClipboardContent,
  createClipboardEntry,
  isSensitiveContent,
  normalizeClipboardText
} from '../src/modules/clipboard-manager/core/clipboardEngine'
import { addHistoryItem } from '../src/modules/clipboard-manager/core/historyManager'
import { searchClipboardItemsFuzzy } from '../src/modules/clipboard-manager/services/search.service'
import type { ClipboardItem } from '../src/modules/clipboard-manager/types/clipboard.types'

function item(partial: Partial<ClipboardItem> & Pick<ClipboardItem, 'id' | 'content'>): ClipboardItem {
  return {
    type: 'text',
    timestamp: Date.now(),
    pinned: false,
    ...partial
  }
}

describe('clipboard popup geometry', () => {
  it('keeps the popup inside a typical MacBook work area', () => {
    const next = fitPopupToDisplay({
      cursor: { x: 900, y: 700 },
      workArea: { x: 0, y: 38, width: 1440, height: 822 },
      bounds: { x: 0, y: 0, width: 1440, height: 900 }
    })

    expect(next.width).toBeLessThanOrEqual(340)
    expect(next.height).toBeLessThanOrEqual(420)
    expect(next.x).toBeGreaterThanOrEqual(12)
    expect(next.y).toBeGreaterThanOrEqual(50)
    expect(next.x + next.width).toBeLessThanOrEqual(1440 - 12)
    expect(next.y + next.height).toBeLessThanOrEqual(38 + 822 - 12)
  })

  it('shrinks to fit a small split-view / fullscreen work area', () => {
    const next = fitPopupToDisplay({
      cursor: { x: 200, y: 200 },
      workArea: { x: 0, y: 0, width: 300, height: 240 },
      bounds: { x: 0, y: 0, width: 300, height: 240 }
    })

    expect(next.width).toBeLessThanOrEqual(300 - 24)
    expect(next.height).toBeLessThanOrEqual(240 - 24)
    expect(next.x).toBeGreaterThanOrEqual(0)
    expect(next.y).toBeGreaterThanOrEqual(0)
    expect(next.x + next.width).toBeLessThanOrEqual(300)
    expect(next.y + next.height).toBeLessThanOrEqual(240)
  })

  it('uses full bounds when workArea is too small for the minimum popup', () => {
    const next = fitPopupToDisplay({
      cursor: { x: 100, y: 40 },
      workArea: { x: 0, y: 0, width: 200, height: 180 },
      bounds: { x: 0, y: 0, width: 1280, height: 800 }
    })

    expect(next.width).toBe(340)
    expect(next.height).toBe(420)
    expect(next.x + next.width).toBeLessThanOrEqual(1280)
    expect(next.y + next.height).toBeLessThanOrEqual(800)
  })
})

describe('clipboard classification', () => {
  it('classifies urls, code, and text', () => {
    expect(classifyClipboardContent('https://example.com/path')).toBe('url')
    expect(classifyClipboardContent('const value = 1\nexport function run() {}')).toBe('code')
    expect(classifyClipboardContent('hello world')).toBe('text')
  })

  it('skips empty and sensitive content', () => {
    expect(createClipboardEntry('   ')).toBeNull()
    expect(isSensitiveContent('api_key=sk-abcdefghijklmnopqrstuvwxyz')).toBe(true)
    expect(createClipboardEntry('password: hunter2secret')).toBeNull()
  })

  it('stores source app on new entries', () => {
    const entry = createClipboardEntry(normalizeClipboardText('copied snippet'), 'Safari')
    expect(entry?.sourceApp).toBe('Safari')
    expect(entry?.type).toBe('text')
  })
})

describe('clipboard search and history', () => {
  it('ranks fuzzy matches ahead of weaker ones', () => {
    const items = [
      item({ id: '1', content: 'the quick brown fox' }),
      item({ id: '2', content: 'qbf utility' }),
      item({ id: '3', content: 'unrelated note' })
    ]

    const ranked = searchClipboardItemsFuzzy(items, { query: 'qbf' })
    expect(ranked.map((entry) => entry.id)).toEqual(['2', '1'])
  })

  it('refreshes timestamp and source on duplicate paste', () => {
    const first = item({ id: 'a', content: 'same text', sourceApp: 'Notes', timestamp: 1 })
    const next = addHistoryItem(
      [first],
      item({ id: 'b', content: 'same text', sourceApp: 'Safari', timestamp: 99 })
    )

    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('a')
    expect(next[0].sourceApp).toBe('Safari')
    expect(next[0].timestamp).toBeGreaterThan(1)
  })
})
