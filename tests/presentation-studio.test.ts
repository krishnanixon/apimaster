import { describe, expect, it } from 'vitest'
import {
  applyPresentationActions,
  createStarterCards,
  parseCards,
  serializeCards,
  serializeViewState
} from '../shared/lib/presentation-model'
import { buildPresentationPrintHtml } from '../electron/main/presentation/presentation-export.service'
import { exportPresentationPptx } from '../electron/main/presentation/presentation-pptx.service'
import type { Presentation } from '../shared/types/presentation'
import { createBlankPresentationDocument } from '../shared/lib/presentation-migrations'
import { serializePresentationDocument } from '../shared/lib/presentation-schema'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function presentation(overrides: Partial<Presentation> = {}): Presentation {
  return {
    id: 'deck-1',
    projectId: 'project-1',
    title: 'Roadmap',
    description: '',
    themeId: 'professional',
    cards: serializeCards(createStarterCards()),
    viewState: '{}',
    versions: '[]',
    documentJson: '',
    schemaVersion: 0,
    templateId: '',
    isFavorite: false,
    deletedAt: null,
    isPinned: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides
  }
}

describe('Presentation Studio model', () => {
  it('rejects malformed persisted cards before they reach renderers', () => {
    const cards = createStarterCards()
    const malformed = {
      id: 'bad',
      layout: 'content',
      blocks: [{ id: 'x', type: 'bullets', items: 'not-an-array' }]
    }
    expect(parseCards(JSON.stringify([...cards, malformed]))).toEqual(cards)
  })

  it('applies card movement without mutating the original deck', () => {
    const cards = createStarterCards()
    const moved = applyPresentationActions(cards, [
      { type: 'MOVE_CARD', cardId: cards[1].id, toIndex: 0 }
    ])
    expect(moved.cards[0].id).toBe(cards[1].id)
    expect(cards[0].layout).toBe('title')
  })
})

describe('Presentation Studio PDF rendering', () => {
  it('applies persisted theme overrides and layout-specific print styles', () => {
    const deck = presentation({
      viewState: serializeViewState({ themeOverrides: { colors: { accent: '#123456' } } })
    })
    const html = buildPresentationPrintHtml(deck)
    expect(html).toContain('#123456')
    expect(html).toContain('.card.layout-media-left')
    expect(html).toContain('13.333in 7.5in')
  })

  it('escapes user-authored content in the generated HTML', () => {
    const cards = createStarterCards()
    cards[0].blocks[0] = {
      id: 'heading',
      type: 'heading',
      text: '<script>alert(1)</script>',
      level: 1
    }
    const html = buildPresentationPrintHtml(presentation({ cards: serializeCards(cards) }))
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('renders a versioned fixed-coordinate document for PDF export', () => {
    const document = createBlankPresentationDocument({ id: 'deck-1' })
    document.slides[0].elements.push({
      id: 'text', type: 'text', x: 100, y: 120, width: 600, height: 100,
      rotation: 0, opacity: 1, zIndex: 2, locked: false, content: 'Fixed slide text',
      fontFamily: 'Inter', fontSize: 48, fontWeight: 700, fontStyle: 'normal',
      textDecoration: 'none', textColor: '#111827', textAlign: 'left',
      verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0
    })
    const html = buildPresentationPrintHtml(presentation({ documentJson: serializePresentationDocument(document), schemaVersion: 1 }))
    expect(html).toContain('document-slide-inner')
    expect(html).toContain('left:100px;top:120px')
    expect(html).toContain('Fixed slide text')
  })

  it('writes a real PowerPoint package', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'presentation-studio-'))
    const output = join(directory, 'roadmap.pptx')
    try {
      await exportPresentationPptx(presentation(), null, output)
      const bytes = await readFile(output)
      expect(bytes.subarray(0, 2).toString()).toBe('PK')
      expect(bytes.length).toBeGreaterThan(5_000)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
