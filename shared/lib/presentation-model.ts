/**
 * Shared helpers for Presentation Studio cards / themes / AI patches.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  PresentationAction,
  PresentationActionProposal,
  PresentationBlock,
  PresentationCard,
  PresentationLayoutId,
  PresentationTheme,
  PresentationThemeId,
  PresentationThemeOverrides,
  PresentationViewState,
  PresentationVersion
} from '@shared/types/presentation'

export const PRESENTATION_FONT_OPTIONS: Array<{ id: string; label: string; value: string }> = [
  { id: 'segoe', label: 'Segoe UI', value: '"Segoe UI", system-ui, sans-serif' },
  { id: 'inter', label: 'Inter', value: 'Inter, "Segoe UI", system-ui, sans-serif' },
  { id: 'georgia', label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { id: 'garamond', label: 'Garamond', value: 'Garamond, "Times New Roman", serif' },
  { id: 'arial', label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { id: 'mono', label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
]

export const PRESENTATION_THEMES: PresentationTheme[] = [
  {
    id: 'professional',
    name: 'Professional',
    description: 'Clean blues for stakeholder decks',
    colors: {
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      muted: '#64748b',
      accent: '#2563eb',
      accentText: '#ffffff',
      border: '#e2e8f0'
    },
    fonts: {
      heading: '"Segoe UI", system-ui, sans-serif',
      body: '"Segoe UI", system-ui, sans-serif'
    },
    density: 'comfortable'
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'High contrast with sharp accents',
    colors: {
      background: '#fafafa',
      surface: '#ffffff',
      text: '#171717',
      muted: '#737373',
      accent: '#0d9488',
      accentText: '#ffffff',
      border: '#e5e5e5'
    },
    fonts: {
      heading: 'Georgia, "Times New Roman", serif',
      body: '"Segoe UI", system-ui, sans-serif'
    },
    density: 'comfortable'
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Strong accent surfaces for pitches',
    colors: {
      background: '#fff7ed',
      surface: '#ffffff',
      text: '#1c1917',
      muted: '#78716c',
      accent: '#ea580c',
      accentText: '#ffffff',
      border: '#fed7aa'
    },
    fonts: {
      heading: '"Segoe UI", system-ui, sans-serif',
      body: '"Segoe UI", system-ui, sans-serif'
    },
    density: 'spacious'
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Sparse typography-first cards',
    colors: {
      background: '#ffffff',
      surface: '#ffffff',
      text: '#111111',
      muted: '#666666',
      accent: '#111111',
      accentText: '#ffffff',
      border: '#eeeeee'
    },
    fonts: {
      heading: '"Segoe UI", system-ui, sans-serif',
      body: '"Segoe UI", system-ui, sans-serif'
    },
    density: 'compact'
  },
  {
    id: 'warm',
    name: 'Warm',
    description: 'Soft neutrals for narrative decks',
    colors: {
      background: '#faf6f1',
      surface: '#fffdfb',
      text: '#292524',
      muted: '#78716c',
      accent: '#b45309',
      accentText: '#ffffff',
      border: '#e7e5e4'
    },
    fonts: {
      heading: 'Georgia, "Times New Roman", serif',
      body: '"Segoe UI", system-ui, sans-serif'
    },
    density: 'comfortable'
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Presentation-ready dark theme',
    colors: {
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f8fafc',
      muted: '#94a3b8',
      accent: '#38bdf8',
      accentText: '#0f172a',
      border: '#334155'
    },
    fonts: {
      heading: '"Segoe UI", system-ui, sans-serif',
      body: '"Segoe UI", system-ui, sans-serif'
    },
    density: 'comfortable'
  },
  {
    id: 'coral',
    name: 'Coral Pop',
    description: 'Canva-style bright marketing look',
    colors: {
      background: '#fff1f2',
      surface: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280',
      accent: '#f43f5e',
      accentText: '#ffffff',
      border: '#fecdd3'
    },
    fonts: {
      heading: 'Inter, "Segoe UI", system-ui, sans-serif',
      body: 'Inter, "Segoe UI", system-ui, sans-serif'
    },
    density: 'spacious'
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Calm green boardroom theme',
    colors: {
      background: '#f0fdf4',
      surface: '#ffffff',
      text: '#14532d',
      muted: '#4d7c5a',
      accent: '#15803d',
      accentText: '#ffffff',
      border: '#bbf7d0'
    },
    fonts: {
      heading: 'Georgia, "Times New Roman", serif',
      body: '"Segoe UI", system-ui, sans-serif'
    },
    density: 'comfortable'
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep slide stage for demos',
    colors: {
      background: '#020617',
      surface: '#0f172a',
      text: '#e2e8f0',
      muted: '#94a3b8',
      accent: '#f59e0b',
      accentText: '#111827',
      border: '#1e293b'
    },
    fonts: {
      heading: 'Inter, "Segoe UI", system-ui, sans-serif',
      body: '"Segoe UI", system-ui, sans-serif'
    },
    density: 'comfortable'
  },
  {
    id: 'canvas',
    name: 'Canvas Soft',
    description: 'Light design-board canvas feel',
    colors: {
      background: '#f4f4f5',
      surface: '#ffffff',
      text: '#18181b',
      muted: '#71717a',
      accent: '#0891b2',
      accentText: '#ffffff',
      border: '#e4e4e7'
    },
    fonts: {
      heading: 'Inter, "Segoe UI", system-ui, sans-serif',
      body: 'Inter, "Segoe UI", system-ui, sans-serif'
    },
    density: 'comfortable'
  }
]

export function getPresentationTheme(
  themeId: string | undefined,
  overrides?: PresentationThemeOverrides | null
): PresentationTheme {
  const base = PRESENTATION_THEMES.find((theme) => theme.id === themeId) ?? PRESENTATION_THEMES[0]
  if (!overrides) return base
  return {
    ...base,
    colors: { ...base.colors, ...overrides.colors },
    fonts: { ...base.fonts, ...overrides.fonts },
    density: overrides.density ?? base.density
  }
}

export function newBlockId(): string {
  return uuidv4()
}

export function newCardId(): string {
  return uuidv4()
}

export function createEmptyCard(layout: PresentationLayoutId = 'content'): PresentationCard {
  if (layout === 'title') {
    return {
      id: newCardId(),
      layout,
      blocks: [
        { id: newBlockId(), type: 'heading', text: 'Untitled card', level: 1 },
        { id: newBlockId(), type: 'text', text: 'Add a short supporting line.' }
      ],
      notes: ''
    }
  }
  if (layout === 'image-focus') {
    return {
      id: newCardId(),
      layout,
      blocks: [
        { id: newBlockId(), type: 'image', alt: 'Add an image', caption: 'Caption' },
        { id: newBlockId(), type: 'heading', text: 'Visual story', level: 2 }
      ],
      notes: ''
    }
  }
  if (layout === 'media-left' || layout === 'media-right') {
    return {
      id: newCardId(),
      layout,
      blocks: [
        { id: newBlockId(), type: 'image', alt: 'Add an image' },
        { id: newBlockId(), type: 'heading', text: 'Section title', level: 2 },
        {
          id: newBlockId(),
          type: 'bullets',
          items: ['Key point one', 'Key point two', 'Key point three']
        }
      ],
      notes: ''
    }
  }
  return {
    id: newCardId(),
    layout,
    blocks: [
      { id: newBlockId(), type: 'heading', text: 'Section title', level: 2 },
      {
        id: newBlockId(),
        type: 'bullets',
        items: ['First point', 'Second point', 'Third point']
      }
    ],
    notes: ''
  }
}

export function createStarterCards(): PresentationCard[] {
  return [
    {
      id: newCardId(),
      layout: 'title',
      blocks: [
        { id: newBlockId(), type: 'heading', text: 'Untitled Presentation', level: 1 },
        { id: newBlockId(), type: 'text', text: 'Describe the story this deck will tell.' }
      ],
      notes: ''
    },
    createEmptyCard('content')
  ]
}

export function parseCards(raw: string | undefined | null): PresentationCard[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPresentationCard)
  } catch {
    return []
  }
}

export function serializeCards(cards: PresentationCard[]): string {
  return JSON.stringify(cards)
}

export function parseViewState(raw: string | undefined | null): PresentationViewState {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as PresentationViewState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function serializeViewState(state: PresentationViewState): string {
  return JSON.stringify(state)
}

export function parsePresentationVersions(raw: string | undefined | null): PresentationVersion[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is PresentationVersion => {
      if (!item || typeof item !== 'object') return false
      const version = item as PresentationVersion
      return (
        typeof version.id === 'string' &&
        typeof version.label === 'string' &&
        Array.isArray(version.cards) &&
        version.cards.every(isPresentationCard)
      )
    })
  } catch {
    return []
  }
}

function isPresentationCard(value: unknown): value is PresentationCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Record<string, unknown>
  const layouts: PresentationLayoutId[] = [
    'title',
    'content',
    'split',
    'bullets',
    'metrics',
    'quote',
    'closing',
    'image-focus',
    'media-left',
    'media-right'
  ]
  return (
    typeof card.id === 'string' &&
    card.id.length > 0 &&
    layouts.includes(card.layout as PresentationLayoutId) &&
    Array.isArray(card.blocks) &&
    card.blocks.every(isPresentationBlock)
  )
}

function isPresentationBlock(value: unknown): value is PresentationBlock {
  if (!value || typeof value !== 'object') return false
  const block = value as Record<string, unknown>
  if (typeof block.id !== 'string' || block.id.length === 0 || typeof block.type !== 'string')
    return false
  switch (block.type) {
    case 'heading':
    case 'text':
      return typeof block.text === 'string'
    case 'bullets':
      return Array.isArray(block.items) && block.items.every((item) => typeof item === 'string')
    case 'columns':
      return (
        Array.isArray(block.columns) &&
        block.columns.every((column) => {
          if (!column || typeof column !== 'object') return false
          const entry = column as Record<string, unknown>
          return (
            typeof entry.body === 'string' &&
            (entry.title === undefined || typeof entry.title === 'string')
          )
        })
      )
    case 'image':
      return ['src', 'alt', 'caption'].every(
        (key) => block[key] === undefined || typeof block[key] === 'string'
      )
    case 'callout':
      return typeof block.text === 'string'
    case 'divider':
      return true
    case 'metric':
      return (
        Array.isArray(block.metrics) &&
        block.metrics.every((metric) => {
          if (!metric || typeof metric !== 'object') return false
          const entry = metric as Record<string, unknown>
          return typeof entry.label === 'string' && typeof entry.value === 'string'
        })
      )
    default:
      return false
  }
}

export function parseJsonObject<T extends object>(text: string): T {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Expected a JSON object from the model')
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T
}

export interface PresentationDraftCard {
  layout?: string
  notes?: string
  blocks?: Array<Record<string, unknown>>
}

export interface PresentationDraft {
  title?: string
  themeId?: string
  summary?: string
  cards?: PresentationDraftCard[]
}

function coerceLayout(value: unknown): PresentationLayoutId {
  const allowed: PresentationLayoutId[] = [
    'title',
    'content',
    'split',
    'bullets',
    'metrics',
    'quote',
    'closing',
    'image-focus',
    'media-left',
    'media-right'
  ]
  return allowed.includes(value as PresentationLayoutId)
    ? (value as PresentationLayoutId)
    : 'content'
}

function coerceThemeId(value: unknown): PresentationThemeId {
  const allowed: PresentationThemeId[] = [
    'professional',
    'modern',
    'bold',
    'minimal',
    'warm',
    'dark',
    'coral',
    'forest',
    'midnight',
    'canvas'
  ]
  return allowed.includes(value as PresentationThemeId)
    ? (value as PresentationThemeId)
    : 'professional'
}

function draftBlockToBlock(raw: Record<string, unknown>): PresentationBlock | null {
  const type = String(raw.type ?? '')
  const id = typeof raw.id === 'string' ? raw.id : newBlockId()

  switch (type) {
    case 'heading':
      return {
        id,
        type: 'heading',
        text: String(raw.text ?? 'Heading'),
        level: ([1, 2, 3] as const).includes(raw.level as 1 | 2 | 3) ? (raw.level as 1 | 2 | 3) : 2
      }
    case 'text':
      return { id, type: 'text', text: String(raw.text ?? '') }
    case 'bullets': {
      const items = Array.isArray(raw.items)
        ? raw.items.map((item) => String(item)).filter(Boolean)
        : []
      return { id, type: 'bullets', items: items.length > 0 ? items : ['Point'] }
    }
    case 'columns': {
      const columns = Array.isArray(raw.columns)
        ? raw.columns.map((col) => {
            const c = (col ?? {}) as Record<string, unknown>
            return {
              title: c.title != null ? String(c.title) : undefined,
              body: String(c.body ?? '')
            }
          })
        : [{ body: '' }]
      return { id, type: 'columns', columns }
    }
    case 'image':
      return {
        id,
        type: 'image',
        src: raw.src != null ? String(raw.src) : undefined,
        alt: raw.alt != null ? String(raw.alt) : undefined,
        caption: raw.caption != null ? String(raw.caption) : undefined
      }
    case 'callout':
      return {
        id,
        type: 'callout',
        text: String(raw.text ?? ''),
        tone: (['info', 'success', 'warning', 'neutral'] as const).includes(raw.tone as 'info')
          ? (raw.tone as 'info' | 'success' | 'warning' | 'neutral')
          : 'info'
      }
    case 'divider':
      return { id, type: 'divider' }
    case 'metric': {
      const metrics = Array.isArray(raw.metrics)
        ? raw.metrics.map((m) => {
            const metric = (m ?? {}) as Record<string, unknown>
            return {
              label: String(metric.label ?? 'Metric'),
              value: String(metric.value ?? '—'),
              hint: metric.hint != null ? String(metric.hint) : undefined
            }
          })
        : [{ label: 'Metric', value: '—' }]
      return { id, type: 'metric', metrics }
    }
    default:
      return null
  }
}

export function buildCardsFromDraft(draft: PresentationDraft): {
  title: string
  themeId: PresentationThemeId
  cards: PresentationCard[]
  summary: string
} {
  const cards: PresentationCard[] = (draft.cards ?? [])
    .map((card) => {
      const blocks = (card.blocks ?? [])
        .map((block) => draftBlockToBlock(block))
        .filter((block): block is PresentationBlock => block != null)
      if (blocks.length === 0) return null
      return {
        id: newCardId(),
        layout: coerceLayout(card.layout),
        blocks,
        notes: card.notes != null ? String(card.notes) : ''
      } satisfies PresentationCard
    })
    .filter((card): card is PresentationCard => card != null)

  return {
    title: draft.title?.trim() || 'Generated Presentation',
    themeId: coerceThemeId(draft.themeId),
    cards,
    summary: draft.summary?.trim() || 'Generated a card deck from your inputs.'
  }
}

function findCardIndex(cards: PresentationCard[], cardId: string): number {
  return cards.findIndex((card) => card.id === cardId)
}

export function applyPresentationActions(
  cards: PresentationCard[],
  actions: PresentationAction[],
  options?: { themeId?: string; title?: string; description?: string }
): {
  cards: PresentationCard[]
  themeId?: string
  title?: string
  description?: string
} {
  let next = cards.map((card) => ({
    ...card,
    blocks: card.blocks.map((block) => ({ ...block }))
  }))
  let themeId = options?.themeId
  let title = options?.title
  let description = options?.description

  for (const action of actions) {
    switch (action.type) {
      case 'REPLACE_CARDS':
        next = action.cards.map((card) => ({
          ...card,
          id: card.id || newCardId(),
          blocks: card.blocks.map((block) => ({
            ...block,
            id: block.id || newBlockId()
          }))
        }))
        break
      case 'UPDATE_CARD': {
        const index = findCardIndex(next, action.cardId)
        if (index === -1) break
        next[index] = {
          ...next[index],
          ...action.patch,
          id: next[index].id,
          blocks: action.patch.blocks ?? next[index].blocks
        }
        break
      }
      case 'INSERT_CARD': {
        const card: PresentationCard = {
          ...action.card,
          id: action.card.id || newCardId(),
          blocks: action.card.blocks.map((block) => ({
            ...block,
            id: block.id || newBlockId()
          }))
        }
        const index =
          action.index == null ? next.length : Math.max(0, Math.min(action.index, next.length))
        next = [...next.slice(0, index), card, ...next.slice(index)]
        break
      }
      case 'DELETE_CARD':
        next = next.filter((card) => card.id !== action.cardId)
        break
      case 'MOVE_CARD': {
        const from = findCardIndex(next, action.cardId)
        if (from === -1) break
        const [moved] = next.splice(from, 1)
        const to = Math.max(0, Math.min(action.toIndex, next.length))
        next.splice(to, 0, moved)
        break
      }
      case 'RESTYLE':
        themeId = action.themeId
        break
      case 'UPDATE_BLOCK': {
        const index = findCardIndex(next, action.cardId)
        if (index === -1) break
        next[index] = {
          ...next[index],
          blocks: next[index].blocks.map((block) =>
            block.id === action.blockId
              ? ({ ...block, ...action.patch, id: block.id, type: block.type } as PresentationBlock)
              : block
          )
        }
        break
      }
      case 'UPDATE_META':
        if (action.patch.title != null) title = action.patch.title
        if (action.patch.description != null) description = action.patch.description
        break
    }
  }

  return { cards: next, themeId, title, description }
}

export function buildPresentationProposal(
  raw: { summary?: string; rationale?: string; actions?: unknown },
  existingCards: PresentationCard[]
): PresentationActionProposal {
  const actions = normalizeActions(raw.actions, existingCards)
  return {
    id: uuidv4(),
    summary: raw.summary?.trim() || 'Proposed presentation updates',
    rationale: raw.rationale?.trim() || '',
    actions
  }
}

function normalizeActions(raw: unknown, existingCards: PresentationCard[]): PresentationAction[] {
  if (!Array.isArray(raw)) return []
  const actions: PresentationAction[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const action = item as Record<string, unknown>
    const type = String(action.type ?? '')

    switch (type) {
      case 'REPLACE_CARDS': {
        const built = buildCardsFromDraft({
          cards: (action.cards as PresentationDraftCard[]) ?? []
        })
        if (built.cards.length > 0) {
          actions.push({ type: 'REPLACE_CARDS', cards: built.cards })
        }
        break
      }
      case 'UPDATE_CARD': {
        const cardId = resolveCardId(String(action.cardId ?? ''), existingCards)
        if (!cardId) break
        const patch = (action.patch ?? {}) as Partial<Omit<PresentationCard, 'id'>>
        actions.push({ type: 'UPDATE_CARD', cardId, patch })
        break
      }
      case 'INSERT_CARD': {
        const draft = (action.card ?? {}) as PresentationDraftCard
        const built = buildCardsFromDraft({ cards: [draft] })
        if (built.cards[0]) {
          actions.push({
            type: 'INSERT_CARD',
            index: typeof action.index === 'number' ? action.index : undefined,
            card: built.cards[0]
          })
        }
        break
      }
      case 'DELETE_CARD': {
        const cardId = resolveCardId(String(action.cardId ?? ''), existingCards)
        if (cardId) actions.push({ type: 'DELETE_CARD', cardId })
        break
      }
      case 'MOVE_CARD': {
        const cardId = resolveCardId(String(action.cardId ?? ''), existingCards)
        if (cardId && typeof action.toIndex === 'number') {
          actions.push({ type: 'MOVE_CARD', cardId, toIndex: action.toIndex })
        }
        break
      }
      case 'RESTYLE':
        actions.push({ type: 'RESTYLE', themeId: coerceThemeId(action.themeId) })
        break
      case 'UPDATE_META':
        actions.push({
          type: 'UPDATE_META',
          patch: {
            title:
              action.patch && typeof action.patch === 'object'
                ? String((action.patch as { title?: string }).title ?? '') || undefined
                : undefined,
            description:
              action.patch && typeof action.patch === 'object'
                ? String((action.patch as { description?: string }).description ?? '') || undefined
                : undefined
          }
        })
        break
      default:
        break
    }
  }

  return actions
}

function resolveCardId(ref: string, cards: PresentationCard[]): string | null {
  if (!ref) return null
  const byId = cards.find((card) => card.id === ref)
  if (byId) return byId.id
  const heading = cards.find((card) =>
    card.blocks.some(
      (block) => block.type === 'heading' && block.text.toLowerCase() === ref.toLowerCase()
    )
  )
  return heading?.id ?? null
}

export const CARD_LAYOUTS: Array<{
  id: PresentationLayoutId
  label: string
  description: string
}> = [
  { id: 'title', label: 'Title', description: 'Hero opening card' },
  { id: 'content', label: 'Content', description: 'Heading plus body' },
  { id: 'split', label: 'Split', description: 'Two-column layout' },
  { id: 'bullets', label: 'Bullets', description: 'List-focused card' },
  { id: 'metrics', label: 'Metrics', description: 'KPI / numbers card' },
  { id: 'quote', label: 'Quote', description: 'Callout or quote' },
  { id: 'closing', label: 'Closing', description: 'Summary / next steps' },
  { id: 'image-focus', label: 'Image focus', description: 'Large visual with caption' },
  { id: 'media-left', label: 'Media left', description: 'Image left, copy right' },
  { id: 'media-right', label: 'Media right', description: 'Copy left, image right' }
]

/** Strip HTML to plain text for import / outline building. */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

interface DocSectionChunk {
  title: string
  body: string
  bullets: string[]
}

/**
 * Split document HTML into section chunks using heading tags when present,
 * otherwise fall back to paragraph / bullet clusters.
 */
export function extractDocumentSections(htmlOrText: string, docTitle: string): DocSectionChunk[] {
  const html = htmlOrText || ''
  const headingSplit = html.split(/<h([1-3])[^>]*>/i)
  const sections: DocSectionChunk[] = []

  if (headingSplit.length > 2) {
    // parts: [preamble, level, restWithClosing...]
    let i = 1
    while (i < headingSplit.length) {
      const rest = headingSplit[i + 1] ?? ''
      const closeIdx = rest.search(/<\/h[1-3]>/i)
      const title =
        closeIdx >= 0
          ? stripHtmlToText(rest.slice(0, closeIdx))
          : stripHtmlToText(rest.slice(0, 80))
      const bodyHtml = closeIdx >= 0 ? rest.slice(closeIdx).replace(/^<\/h[1-3]>/i, '') : rest
      const bodyText = stripHtmlToText(bodyHtml)
      const lines = bodyText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const bulletLines = lines
        .filter((line) => /^[•\-*]/.test(line) || line.startsWith('•'))
        .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 8)
      const prose = lines
        .filter((line) => !/^[•\-*]/.test(line))
        .join(' ')
        .slice(0, 600)

      if (title || prose || bulletLines.length) {
        sections.push({
          title: title || 'Section',
          body: prose,
          bullets: bulletLines.length >= 2 ? bulletLines : []
        })
      }
      i += 2
    }
  }

  if (sections.length === 0) {
    const text = stripHtmlToText(html)
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (paragraphs.length === 0 && text) {
      sections.push({ title: docTitle, body: text.slice(0, 600), bullets: [] })
    } else {
      for (const paragraph of paragraphs.slice(0, 16)) {
        const lines = paragraph
          .split('\n')
          .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
          .filter(Boolean)
        const looksLikeList = lines.length >= 2 && lines.every((l) => l.length < 120)
        sections.push({
          title: lines[0]?.slice(0, 80) || docTitle,
          body: looksLikeList ? '' : paragraph.slice(0, 600),
          bullets: looksLikeList ? lines.slice(0, 8) : []
        })
      }
    }
  }

  return sections
}

/** Deterministic import: turn one or more documents into cards (no AI). */
export function cardsFromDocuments(
  docs: Array<{ title: string; htmlContent?: string; content?: string }>
): PresentationCard[] {
  const cards: PresentationCard[] = [
    {
      id: newCardId(),
      layout: 'title',
      blocks: [
        {
          id: newBlockId(),
          type: 'heading',
          text: docs.length === 1 ? docs[0].title : 'Project presentation',
          level: 1
        },
        {
          id: newBlockId(),
          type: 'text',
          text:
            docs.length === 1
              ? `Imported from “${docs[0].title}”.`
              : `Imported from ${docs.length} project documents.`
        }
      ],
      notes: ''
    }
  ]

  for (const doc of docs) {
    const source = doc.htmlContent || doc.content || ''
    const sections = extractDocumentSections(source, doc.title)
    for (const section of sections) {
      const blocks: PresentationBlock[] = [
        { id: newBlockId(), type: 'heading', text: section.title, level: 2 }
      ]
      if (section.bullets.length >= 2) {
        blocks.push({ id: newBlockId(), type: 'bullets', items: section.bullets })
      } else if (section.body) {
        blocks.push({ id: newBlockId(), type: 'text', text: section.body })
      }
      cards.push({
        id: newCardId(),
        layout: section.bullets.length >= 2 ? 'bullets' : 'content',
        blocks,
        notes: `Source: ${doc.title}`
      })
    }
  }

  if (cards.length === 1) {
    cards.push(createEmptyCard('content'))
  }

  cards.push({
    id: newCardId(),
    layout: 'closing',
    blocks: [
      { id: newBlockId(), type: 'heading', text: 'Next steps', level: 2 },
      {
        id: newBlockId(),
        type: 'bullets',
        items: ['Review imported cards', 'Refine with AI Assist', 'Present or export PDF']
      }
    ],
    notes: ''
  })

  return cards
}

export interface PresentationTemplate {
  id: string
  title: string
  description: string
  themeId: PresentationThemeId
  build: () => PresentationCard[]
}

export const PRESENTATION_TEMPLATES: PresentationTemplate[] = [
  {
    id: 'stakeholder-update',
    title: 'Stakeholder update',
    description: 'Status, progress, risks, and asks',
    themeId: 'professional',
    build: () => [
      {
        id: newCardId(),
        layout: 'title',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Project status update', level: 1 },
          {
            id: newBlockId(),
            type: 'text',
            text: 'Progress, risks, and decisions for stakeholders.'
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'bullets',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'What we shipped', level: 2 },
          {
            id: newBlockId(),
            type: 'bullets',
            items: ['Milestone completed', 'Key deliverable ready', 'Feedback incorporated']
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'metrics',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Snapshot', level: 2 },
          {
            id: newBlockId(),
            type: 'metric',
            metrics: [
              { label: 'Progress', value: '65%' },
              { label: 'Open risks', value: '3' },
              { label: 'Decisions needed', value: '2' }
            ]
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'content',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Risks & blockers', level: 2 },
          {
            id: newBlockId(),
            type: 'callout',
            text: 'Call out the top risk and the mitigation owner.',
            tone: 'warning'
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'closing',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Asks', level: 2 },
          {
            id: newBlockId(),
            type: 'bullets',
            items: ['Approve scope change', 'Confirm launch window', 'Assign decision owners']
          }
        ]
      }
    ]
  },
  {
    id: 'requirements-walkthrough',
    title: 'Requirements walkthrough',
    description: 'Problem, scope, modules, and acceptance',
    themeId: 'modern',
    build: () => [
      {
        id: newCardId(),
        layout: 'title',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Requirements walkthrough', level: 1 },
          {
            id: newBlockId(),
            type: 'text',
            text: 'Aligned on problem, scope, and acceptance criteria.'
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'content',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Problem & goals', level: 2 },
          { id: newBlockId(), type: 'text', text: 'Describe the user pain and success outcome.' }
        ]
      },
      {
        id: newCardId(),
        layout: 'split',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'In scope / Out of scope', level: 2 },
          {
            id: newBlockId(),
            type: 'columns',
            columns: [
              { title: 'In scope', body: 'Core flows this release covers.' },
              { title: 'Out of scope', body: 'Explicitly deferred items.' }
            ]
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'bullets',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Modules & features', level: 2 },
          {
            id: newBlockId(),
            type: 'bullets',
            items: ['Module A — capability', 'Module B — capability', 'Integrations']
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'closing',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Acceptance criteria', level: 2 },
          {
            id: newBlockId(),
            type: 'bullets',
            items: ['Happy path works end-to-end', 'Edge cases documented', 'Owners signed off']
          }
        ]
      }
    ]
  },
  {
    id: 'pitch-lite',
    title: 'Pitch (lite)',
    description: 'Short narrative for demos and reviews',
    themeId: 'bold',
    build: () => [
      {
        id: newCardId(),
        layout: 'title',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Product pitch', level: 1 },
          { id: newBlockId(), type: 'text', text: 'One clear story from pain to solution.' }
        ]
      },
      {
        id: newCardId(),
        layout: 'quote',
        blocks: [
          {
            id: newBlockId(),
            type: 'callout',
            text: '“Customers struggle with X today.”',
            tone: 'info'
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'content',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Our approach', level: 2 },
          { id: newBlockId(), type: 'text', text: 'Explain the product idea in two sentences.' }
        ]
      },
      {
        id: newCardId(),
        layout: 'metrics',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Why now', level: 2 },
          {
            id: newBlockId(),
            type: 'metric',
            metrics: [
              { label: 'Time saved', value: '10h/wk' },
              { label: 'Target users', value: 'Ops' },
              { label: 'MVP weeks', value: '6' }
            ]
          }
        ]
      },
      {
        id: newCardId(),
        layout: 'closing',
        blocks: [
          { id: newBlockId(), type: 'heading', text: 'Call to action', level: 2 },
          { id: newBlockId(), type: 'text', text: 'Ask for the decision you need next.' }
        ]
      }
    ]
  }
]

export function cardHeading(card: PresentationCard): string {
  const heading = card.blocks.find((block) => block.type === 'heading')
  if (heading && heading.type === 'heading' && heading.text.trim()) return heading.text.trim()
  return `${card.layout} card`
}
