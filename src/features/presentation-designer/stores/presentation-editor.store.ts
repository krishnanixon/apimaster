import { create } from 'zustand'
import type {
  PresentationAction,
  PresentationActionProposal,
  PresentationAspectRatio,
  PresentationBlock,
  PresentationCard,
  PresentationLayoutId,
  PresentationThemeId,
  PresentationThemeOverrides
} from '@shared/types/presentation'
import {
  applyPresentationActions,
  createEmptyCard,
  createStarterCards
} from '@shared/lib/presentation-model'

const HISTORY_LIMIT = 50
let cardClipboard: PresentationCard[] = []
let blockClipboard: PresentationBlock | null = null

interface PresentationEditorState {
  title: string
  description: string
  themeId: PresentationThemeId | string
  cards: PresentationCard[]
  selectedCardId: string | null
  selectedCardIds: string[]
  selectedBlockId: string | null
  linkedDocumentIds: string[]
  includeKnowledge: boolean
  lastSources: string[]
  themeOverrides: PresentationThemeOverrides
  aspectRatio: PresentationAspectRatio
  includeBranding: boolean
  isDirty: boolean
  isPresenting: boolean
  presentIndex: number
  pendingProposal: PresentationActionProposal | null
  past: Array<{ cards: PresentationCard[]; themeId: string; title: string; description: string }>
  future: Array<{ cards: PresentationCard[]; themeId: string; title: string; description: string }>
  canUndo: boolean
  canRedo: boolean

  loadDeck: (input: {
    title: string
    description: string
    themeId: string
    cards: PresentationCard[]
    selectedCardId?: string | null
    linkedDocumentIds?: string[]
    includeKnowledge?: boolean
    lastSources?: string[]
    themeOverrides?: PresentationThemeOverrides
    aspectRatio?: PresentationAspectRatio
    includeBranding?: boolean
  }) => void
  resetEditor: () => void
  markSaved: () => void
  setTitle: (title: string) => void
  setDescription: (description: string) => void
  setThemeId: (themeId: string) => void
  setThemeOverrides: (patch: PresentationThemeOverrides) => void
  clearThemeOverrides: () => void
  setAspectRatio: (value: PresentationAspectRatio) => void
  setIncludeBranding: (value: boolean) => void
  setLinkedDocumentIds: (ids: string[]) => void
  toggleLinkedDocument: (id: string) => void
  setIncludeKnowledge: (value: boolean) => void
  setLastSources: (sources: string[]) => void
  selectCard: (cardId: string | null) => void
  toggleCardSelection: (cardId: string) => void
  selectBlock: (blockId: string | null) => void
  addCard: (layout?: PresentationLayoutId, index?: number) => void
  deleteCard: (cardId: string) => void
  moveCard: (cardId: string, toIndex: number) => void
  updateCard: (cardId: string, patch: Partial<Omit<PresentationCard, 'id'>>) => void
  updateBlock: (cardId: string, blockId: string, patch: Partial<PresentationBlock>) => void
  moveBlock: (cardId: string, blockId: string, toIndex: number) => void
  copySelection: () => void
  pasteSelection: () => void
  replaceCards: (
    cards: PresentationCard[],
    options?: { title?: string; description?: string }
  ) => void
  dispatch: (actions: PresentationAction | PresentationAction[]) => void
  setPendingProposal: (proposal: PresentationActionProposal | null) => void
  applyPendingProposal: () => void
  undo: () => void
  redo: () => void
  setPresenting: (value: boolean, index?: number) => void
  setPresentIndex: (index: number) => void
}

function snapshot(state: PresentationEditorState) {
  return {
    cards: state.cards.map((card) => ({
      ...card,
      blocks: card.blocks.map((block) => ({ ...block }))
    })),
    themeId: state.themeId,
    title: state.title,
    description: state.description
  }
}

export const usePresentationEditorStore = create<PresentationEditorState>((set, get) => ({
  title: 'Untitled Presentation',
  description: '',
  themeId: 'professional',
  cards: createStarterCards(),
  selectedCardId: null,
  selectedCardIds: [],
  selectedBlockId: null,
  linkedDocumentIds: [],
  includeKnowledge: true,
  lastSources: [],
  themeOverrides: {},
  aspectRatio: '16:9',
  includeBranding: true,
  isDirty: false,
  isPresenting: false,
  presentIndex: 0,
  pendingProposal: null,
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  loadDeck: (input) => {
    set({
      title: input.title,
      description: input.description,
      themeId: input.themeId,
      cards: input.cards,
      selectedCardId: input.selectedCardId ?? input.cards[0]?.id ?? null,
      selectedCardIds: input.selectedCardId
        ? [input.selectedCardId]
        : input.cards[0]
          ? [input.cards[0].id]
          : [],
      selectedBlockId: null,
      linkedDocumentIds: input.linkedDocumentIds ?? [],
      includeKnowledge: input.includeKnowledge !== false,
      lastSources: input.lastSources ?? [],
      themeOverrides: input.themeOverrides ?? {},
      aspectRatio: input.aspectRatio ?? '16:9',
      includeBranding: input.includeBranding !== false,
      isDirty: false,
      pendingProposal: null,
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
      isPresenting: false,
      presentIndex: 0
    })
  },

  resetEditor: () => {
    const cards = createStarterCards()
    set({
      title: 'Untitled Presentation',
      description: '',
      themeId: 'professional',
      cards,
      selectedCardId: cards[0]?.id ?? null,
      selectedCardIds: cards[0] ? [cards[0].id] : [],
      selectedBlockId: null,
      linkedDocumentIds: [],
      includeKnowledge: true,
      lastSources: [],
      themeOverrides: {},
      aspectRatio: '16:9',
      includeBranding: true,
      isDirty: false,
      pendingProposal: null,
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
      isPresenting: false,
      presentIndex: 0
    })
  },

  markSaved: () => set({ isDirty: false }),

  setTitle: (title) => set({ title, isDirty: true }),
  setDescription: (description) => set({ description, isDirty: true }),
  setThemeId: (themeId) => set({ themeId, isDirty: true }),
  setThemeOverrides: (patch) => {
    const current = get().themeOverrides
    set({
      themeOverrides: {
        colors: { ...current.colors, ...patch.colors },
        fonts: { ...current.fonts, ...patch.fonts },
        density: patch.density ?? current.density
      },
      isDirty: true
    })
  },
  clearThemeOverrides: () => set({ themeOverrides: {}, isDirty: true }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio, isDirty: true }),
  setIncludeBranding: (includeBranding) => set({ includeBranding, isDirty: true }),
  setLinkedDocumentIds: (ids) => set({ linkedDocumentIds: ids, isDirty: true }),
  toggleLinkedDocument: (id) => {
    const current = get().linkedDocumentIds
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    set({ linkedDocumentIds: next, isDirty: true })
  },
  setIncludeKnowledge: (value) => set({ includeKnowledge: value, isDirty: true }),
  setLastSources: (sources) => set({ lastSources: sources }),

  selectCard: (cardId) =>
    set({ selectedCardId: cardId, selectedCardIds: cardId ? [cardId] : [], selectedBlockId: null }),
  toggleCardSelection: (cardId) => {
    const state = get()
    const selectedCardIds = state.selectedCardIds.includes(cardId)
      ? state.selectedCardIds.filter((id) => id !== cardId)
      : [...state.selectedCardIds, cardId]
    set({ selectedCardIds, selectedCardId: cardId, selectedBlockId: null })
  },
  selectBlock: (blockId) => set({ selectedBlockId: blockId }),

  addCard: (layout = 'content', index) => {
    const state = get()
    const card = createEmptyCard(layout)
    const next = [...state.cards]
    const at = index == null ? next.length : Math.max(0, Math.min(index, next.length))
    next.splice(at, 0, card)
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      canUndo: true,
      canRedo: false,
      cards: next,
      selectedCardId: card.id,
      selectedCardIds: [card.id],
      isDirty: true
    })
  },

  deleteCard: (cardId) => {
    const state = get()
    if (state.cards.length <= 1) return
    const next = state.cards.filter((card) => card.id !== cardId)
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      canUndo: true,
      canRedo: false,
      cards: next,
      selectedCardId: next[0]?.id ?? null,
      selectedCardIds: next[0] ? [next[0].id] : [],
      isDirty: true
    })
  },

  moveCard: (cardId, toIndex) => {
    get().dispatch({ type: 'MOVE_CARD', cardId, toIndex })
  },

  updateCard: (cardId, patch) => {
    get().dispatch({ type: 'UPDATE_CARD', cardId, patch })
  },

  updateBlock: (cardId, blockId, patch) => {
    get().dispatch({ type: 'UPDATE_BLOCK', cardId, blockId, patch })
  },
  moveBlock: (cardId, blockId, toIndex) => {
    const state = get()
    const card = state.cards.find((item) => item.id === cardId)
    if (!card) return
    const from = card.blocks.findIndex((block) => block.id === blockId)
    if (from < 0) return
    const blocks = [...card.blocks]
    const [moved] = blocks.splice(from, 1)
    blocks.splice(Math.max(0, Math.min(toIndex, blocks.length)), 0, moved)
    get().updateCard(cardId, { blocks })
  },
  copySelection: () => {
    const state = get()
    if (state.selectedBlockId && state.selectedCardId) {
      blockClipboard = structuredClone(
        state.cards
          .find((card) => card.id === state.selectedCardId)
          ?.blocks.find((block) => block.id === state.selectedBlockId) ?? null
      )
      return
    }
    cardClipboard = structuredClone(
      state.cards.filter((card) => state.selectedCardIds.includes(card.id))
    )
  },
  pasteSelection: () => {
    const state = get()
    if (blockClipboard && state.selectedCardId) {
      const card = state.cards.find((item) => item.id === state.selectedCardId)
      if (!card) return
      get().updateCard(card.id, {
        blocks: [...card.blocks, { ...structuredClone(blockClipboard), id: crypto.randomUUID() }]
      })
      return
    }
    if (cardClipboard.length === 0) return
    const copies = structuredClone(cardClipboard).map((card) => ({
      ...card,
      id: crypto.randomUUID(),
      blocks: card.blocks.map((block) => ({ ...block, id: crypto.randomUUID() }))
    }))
    get().replaceCards([...state.cards, ...copies])
    set({ selectedCardId: copies[0]?.id ?? null, selectedCardIds: copies.map((card) => card.id) })
  },

  replaceCards: (cards, options) => {
    const state = get()
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      canUndo: true,
      canRedo: false,
      cards,
      title: options?.title ?? state.title,
      description: options?.description ?? state.description,
      selectedCardId: cards[0]?.id ?? null,
      selectedCardIds: cards[0] ? [cards[0].id] : [],
      isDirty: true
    })
  },

  dispatch: (actions) => {
    const list = Array.isArray(actions) ? actions : [actions]
    if (list.length === 0) return
    const state = get()
    const applied = applyPresentationActions(state.cards, list, {
      themeId: state.themeId,
      title: state.title,
      description: state.description
    })
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      canUndo: true,
      canRedo: false,
      cards: applied.cards,
      themeId: applied.themeId ?? state.themeId,
      title: applied.title ?? state.title,
      description: applied.description ?? state.description,
      isDirty: true
    })
  },

  setPendingProposal: (proposal) => set({ pendingProposal: proposal }),

  applyPendingProposal: () => {
    const { pendingProposal } = get()
    if (!pendingProposal) return
    get().dispatch(pendingProposal.actions)
    set({ pendingProposal: null })
  },

  undo: () => {
    const state = get()
    const previous = state.past[state.past.length - 1]
    if (!previous) return
    set({
      past: state.past.slice(0, -1),
      future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
      cards: previous.cards,
      themeId: previous.themeId,
      title: previous.title,
      description: previous.description,
      canUndo: state.past.length > 1,
      canRedo: true,
      isDirty: true
    })
  },

  redo: () => {
    const state = get()
    const next = state.future[0]
    if (!next) return
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      cards: next.cards,
      themeId: next.themeId,
      title: next.title,
      description: next.description,
      canUndo: true,
      canRedo: state.future.length > 1,
      isDirty: true
    })
  },

  setPresenting: (value, index) =>
    set({
      isPresenting: value,
      presentIndex: index ?? get().presentIndex
    }),

  setPresentIndex: (index) => set({ presentIndex: index })
}))
