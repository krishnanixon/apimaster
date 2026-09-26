import { describe, expect, it } from 'vitest'
import { createStarterCards } from '@shared/lib/presentation-model'
import { applyPresentationCommands } from '@shared/lib/presentation-commands'
import { alignElements, computeCanvasFitZoom, getSlideScale, screenToSlideCoordinates } from '@shared/lib/presentation-geometry'
import { createBlankPresentationDocument, migrateLegacyCards } from '@shared/lib/presentation-migrations'
import { parsePresentationDocument, serializePresentationDocument } from '@shared/lib/presentation-schema'

describe('presentation document v1', () => {
  it('migrates legacy cards into deterministic positioned elements', () => {
    const document = migrateLegacyCards({ id: 'deck', projectId: 'project', title: 'Deck', themeId: 'professional', cards: createStarterCards() })
    expect(document.schemaVersion).toBe(1)
    expect(document.slides.length).toBeGreaterThan(0)
    expect(document.slides[0].elements[0]).toMatchObject({ type: 'text', x: 140, width: 1640 })
    expect(parsePresentationDocument(serializePresentationDocument(document))).toEqual(document)
  })

  it('applies slide and element commands without mutating the source', () => {
    const source = createBlankPresentationDocument({ id: 'deck' })
    const slideId = source.slides[0].id
    const element = { id: 'text', type: 'text' as const, x: 10, y: 20, width: 300, height: 100, rotation: 0, opacity: 1, zIndex: 0, locked: false, content: 'Hello', fontFamily: 'Inter', fontSize: 32, fontWeight: 400, fontStyle: 'normal' as const, textDecoration: 'none' as const, textColor: '#000', textAlign: 'left' as const, verticalAlign: 'top' as const, lineHeight: 1.2, letterSpacing: 0 }
    const next = applyPresentationCommands(source, [
      { type: 'ADD_ELEMENT', slideId, element },
      { type: 'MOVE_ELEMENTS', slideId, elementIds: ['text'], dx: 25, dy: -5 }
    ])
    expect(source.slides[0].elements).toHaveLength(0)
    expect(next.slides[0].elements[0]).toMatchObject({ x: 35, y: 15 })
  })

  it('converts coordinates and aligns in logical slide space', () => {
    expect(getSlideScale({ width: 960, height: 540 }, { width: 1920, height: 1080 })).toBe(0.5)
    expect(
      computeCanvasFitZoom({ width: 1008, height: 648 }, { width: 1920, height: 1080 })
    ).toBeCloseTo(0.5, 5)
    expect(screenToSlideCoordinates({ x: 110, y: 70 }, { x: 10, y: 20, width: 960, height: 540 }, 0.5)).toEqual({ x: 200, y: 100 })
    const elements = alignElements([
      { id: 'a', type: 'shape' as const, x: 10, y: 20, width: 20, height: 20, rotation: 0, opacity: 1, zIndex: 0, locked: false, shape: 'rectangle' as const, fill: '#fff', stroke: '#000', strokeWidth: 1 },
      { id: 'b', type: 'shape' as const, x: 80, y: 50, width: 40, height: 30, rotation: 0, opacity: 1, zIndex: 1, locked: false, shape: 'rectangle' as const, fill: '#fff', stroke: '#000', strokeWidth: 1 }
    ], 'left')
    expect(elements.map((element) => element.x)).toEqual([10, 10])
  })

  it('rejects malformed persisted documents', () => {
    expect(parsePresentationDocument('{"schemaVersion":1,"slides":"bad"}')).toBeNull()
  })

  it('applies theme customization to deterministic slide content', () => {
    const source = createBlankPresentationDocument({ id: 'deck' })
    const slideId = source.slides[0].id
    const text = { id: 'text', type: 'text' as const, x: 10, y: 20, width: 300, height: 100, rotation: 0, opacity: 1, zIndex: 0, locked: false, content: 'Hello', fontFamily: 'Inter', fontSize: 32, fontWeight: 400, fontStyle: 'normal' as const, textDecoration: 'none' as const, textColor: '#000000', textAlign: 'left' as const, verticalAlign: 'top' as const, lineHeight: 1.2, letterSpacing: 0 }
    const withText = applyPresentationCommands(source, [{ type: 'ADD_ELEMENT', slideId, element: text }])
    const themed = applyPresentationCommands(withText, [{ type: 'CUSTOMIZE_THEME', colors: { background: '#101010', text: '#f0f0f0', accent: '#ff0000' } }])
    expect(themed.slides[0].background.color).toBe('#101010')
    expect(themed.slides[0].elements[0]).toMatchObject({ textColor: '#f0f0f0' })
    expect(themed.themeOverrides?.colors?.accent).toBe('#ff0000')
  })
})
