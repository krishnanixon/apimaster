import type { PresentationCard, PresentationBlock } from '@shared/types/presentation'
import { normalizePresentationDocument } from '@shared/lib/presentation-schema'
import {
  PRESENTATION_SCHEMA_VERSION,
  PRESENTATION_SLIDE_HEIGHT,
  PRESENTATION_SLIDE_WIDTH,
  type PresentationDocument,
  type PresentationSlide,
  type SlideElement,
  type TextElement
} from '@shared/types/presentation-document'

function base(id: string, x: number, y: number, width: number, height: number, zIndex: number) {
  return { id, x, y, width, height, rotation: 0, opacity: 1, zIndex, locked: false }
}

function textElement(block: Extract<PresentationBlock, { type: 'heading' | 'text' | 'callout' }>, index: number, y: number): TextElement {
  const heading = block.type === 'heading'
  return {
    ...base(block.id, 140, y, 1640, heading ? 150 : 180, index),
    type: 'text',
    content: block.text,
    fontFamily: 'Inter',
    fontSize: heading ? (block.level === 1 ? 72 : block.level === 3 ? 36 : 48) : 30,
    fontWeight: heading ? 700 : 400,
    fontStyle: 'normal',
    textDecoration: 'none',
    textColor: '#111827',
    backgroundColor: block.type === 'callout' ? '#eef2ff' : undefined,
    textAlign: 'left',
    verticalAlign: 'middle',
    lineHeight: 1.2,
    letterSpacing: 0
  }
}

function blockToElements(block: PresentationBlock, index: number, y: number): SlideElement[] {
  if (block.type === 'heading' || block.type === 'text' || block.type === 'callout') return [textElement(block, index, y)]
  if (block.type === 'bullets') return [textElement({ id: block.id, type: 'text', text: block.items.map((item) => `• ${item}`).join('\n') }, index, y)]
  if (block.type === 'columns') return block.columns.map((column, columnIndex) => ({ ...textElement({ id: `${block.id}-${columnIndex}`, type: 'text', text: [column.title, column.body].filter(Boolean).join('\n') }, index + columnIndex, y), x: 140 + columnIndex * (1640 / block.columns.length), width: 1640 / block.columns.length - 30 }))
  if (block.type === 'metric') return block.metrics.map((metric, metricIndex) => ({ ...textElement({ id: `${block.id}-${metricIndex}`, type: 'text', text: `${metric.value}\n${metric.label}` }, index + metricIndex, y), x: 140 + metricIndex * (1640 / block.metrics.length), width: 1640 / block.metrics.length - 30, textAlign: 'center' }))
  if (block.type === 'divider') return [{ ...base(block.id, 140, y + 20, 1640, 4, index), type: 'shape', shape: 'line', fill: 'transparent', stroke: '#d1d5db', strokeWidth: 4 }]
  return [{ ...base(block.id, 140, y, 1640, 500, index), type: 'image', src: block.src, alt: block.alt ?? '', objectFit: 'cover', borderWidth: 0, borderRadius: 16 }]
}

export function migrateLegacyCards(input: { id: string; projectId?: string; title: string; description?: string; themeId: string; cards: PresentationCard[]; createdAt?: string; updatedAt?: string }): PresentationDocument {
  const now = new Date().toISOString()
  const slides: PresentationSlide[] = input.cards.map((card, order) => {
    let y = 120
    const elements = card.blocks.flatMap((block, index) => {
      const result = blockToElements(block, index, y)
      y += block.type === 'image' ? 520 : block.type === 'divider' ? 60 : 190
      return result
    })
    return { id: card.id, order, layout: card.layout, background: { type: 'solid', color: '#ffffff' }, speakerNotes: card.notes, elements }
  })
  return normalizePresentationDocument({
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    themeId: input.themeId,
    logicalSize: { width: PRESENTATION_SLIDE_WIDTH, height: PRESENTATION_SLIDE_HEIGHT },
    slides,
    metadata: { description: input.description, legacyCards: input.cards },
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  })
}

export function createBlankPresentationDocument(input: { id?: string; projectId?: string; title?: string; themeId?: string } = {}): PresentationDocument {
  const now = new Date().toISOString()
  return {
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    id: input.id ?? crypto.randomUUID(),
    projectId: input.projectId,
    title: input.title ?? 'Untitled Presentation',
    themeId: input.themeId ?? 'professional',
    logicalSize: { width: PRESENTATION_SLIDE_WIDTH, height: PRESENTATION_SLIDE_HEIGHT },
    slides: [{ id: crypto.randomUUID(), order: 0, layout: 'blank', background: { type: 'solid', color: '#ffffff' }, elements: [] }],
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
}
