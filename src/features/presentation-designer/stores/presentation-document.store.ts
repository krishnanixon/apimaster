import { create } from 'zustand'
import type { PresentationDocument, PresentationSlide, SlideElement } from '@shared/types/presentation-document'
import { applyPresentationCommand, type PresentationDocumentCommand } from '@shared/lib/presentation-commands'
import { applySlideLayout } from '@shared/lib/presentation-layouts'
import { cloneSlidesWithNewIds, PRESENTATION_SLIDE_TEMPLATES } from '@shared/lib/presentation-slide-templates'
import { normalizePresentationDocument, resolveActiveSlideId, getSlideElements } from '@shared/lib/presentation-schema'

const HISTORY_LIMIT = 50
let clipboard: SlideElement[] = []

interface Snapshot {
  document: PresentationDocument
}

interface PresentationDocumentEditorState {
  document: PresentationDocument | null
  activeSlideId: string | null
  selectedElementIds: string[]
  editingElementId: string | null
  zoom: number
  showGrid: boolean
  snapToGrid: boolean
  mode: 'select' | 'text' | 'shape' | 'image' | 'present'
  isDirty: boolean
  past: Snapshot[]
  future: Snapshot[]
  canUndo: boolean
  canRedo: boolean
  loadDocument: (document: PresentationDocument) => void
  replaceDocument: (document: PresentationDocument) => void
  markSaved: () => void
  setActiveSlide: (id: string) => void
  selectElements: (ids: string[]) => void
  toggleElement: (id: string) => void
  setEditingElement: (id: string | null) => void
  setZoom: (zoom: number) => void
  setShowGrid: (value: boolean) => void
  setSnapToGrid: (value: boolean) => void
  dispatch: (command: PresentationDocumentCommand, options?: { history?: boolean }) => void
  updateElement: (elementId: string, patch: Partial<SlideElement>, history?: boolean) => void
  addSlide: () => void
  addSlideWithLayout: (layoutId: string) => void
  appendTemplateSlides: (templateId: string) => void
  deleteActiveSlide: () => void
  duplicateActiveSlide: () => void
  copy: () => void
  paste: () => void
  deleteSelection: () => void
  duplicateSelection: () => void
  selectAll: () => void
  undo: () => void
  redo: () => void
}

function clone(document: PresentationDocument): PresentationDocument {
  return structuredClone(document)
}

export const usePresentationDocumentStore = create<PresentationDocumentEditorState>((set, get) => ({
  document: null,
  activeSlideId: null,
  selectedElementIds: [],
  editingElementId: null,
  zoom: 0.6,
  showGrid: true,
  snapToGrid: true,
  mode: 'select',
  isDirty: false,
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  loadDocument: (document) => {
    const normalized = normalizePresentationDocument(document)
    set({
      document: normalized,
      activeSlideId: resolveActiveSlideId(normalized, null),
      selectedElementIds: [],
      editingElementId: null,
      isDirty: false,
      past: [],
      future: [],
      canUndo: false,
      canRedo: false
    })
  },
  replaceDocument: (document) => {
    const state = get()
    const normalized = normalizePresentationDocument(document)
    set({
      document: normalized,
      activeSlideId: resolveActiveSlideId(normalized, state.activeSlideId),
      selectedElementIds: [],
      editingElementId: null,
      isDirty: true,
      past: state.document ? [...state.past, { document: clone(state.document) }].slice(-HISTORY_LIMIT) : state.past,
      future: [],
      canUndo: Boolean(state.document),
      canRedo: false
    })
  },
  markSaved: () => set({ isDirty: false }),
  setActiveSlide: (activeSlideId) => set({ activeSlideId, selectedElementIds: [], editingElementId: null }),
  selectElements: (selectedElementIds) => set({ selectedElementIds, editingElementId: null }),
  toggleElement: (id) => set((state) => ({ selectedElementIds: state.selectedElementIds.includes(id) ? state.selectedElementIds.filter((value) => value !== id) : [...state.selectedElementIds, id], editingElementId: null })),
  setEditingElement: (editingElementId) => set({ editingElementId }),
  setZoom: (zoom) => set({ zoom: Math.max(0.2, Math.min(1.5, zoom)) }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  dispatch: (command, options) => {
    const state = get()
    if (!state.document) return
    const raw = applyPresentationCommand(state.document, command)
    if (raw === state.document) return
    const next = normalizePresentationDocument({ ...raw, updatedAt: new Date().toISOString() })
    const activeSlideId = resolveActiveSlideId(next, state.activeSlideId)
    const history = options?.history !== false
    set({
      document: next,
      activeSlideId,
      isDirty: true,
      ...(history ? { past: [...state.past, { document: clone(state.document) }].slice(-HISTORY_LIMIT), future: [], canUndo: true, canRedo: false } : {})
    })
  },
  updateElement: (elementId, patch, history = true) => {
    const { activeSlideId } = get()
    if (activeSlideId) get().dispatch({ type: 'UPDATE_ELEMENT', slideId: activeSlideId, elementId, patch }, { history })
  },
  addSlide: () => {
    const state = get()
    if (!state.document) return
    const slide: PresentationSlide = { id: crypto.randomUUID(), order: state.document.slides.length, layout: 'blank', background: { type: 'solid', color: '#ffffff' }, elements: [] }
    state.dispatch({ type: 'ADD_SLIDE', slide })
    set({ activeSlideId: slide.id, selectedElementIds: [], editingElementId: null })
  },
  addSlideWithLayout: (layoutId) => {
    const state = get()
    if (!state.document) return
    const blank: PresentationSlide = {
      id: crypto.randomUUID(),
      order: state.document.slides.length,
      layout: layoutId,
      background: { type: 'solid', color: '#ffffff' },
      elements: []
    }
    const slide = applySlideLayout(blank, layoutId)
    state.dispatch({ type: 'ADD_SLIDE', slide })
    set({ activeSlideId: slide.id, selectedElementIds: [], editingElementId: null })
  },
  appendTemplateSlides: (templateId) => {
    const state = get()
    if (!state.document) return
    const template = PRESENTATION_SLIDE_TEMPLATES.find((item) => item.id === templateId)
    if (!template) return
    const slides = cloneSlidesWithNewIds(template.build(), state.document.slides.length)
    slides.forEach((slide, index) => {
      state.dispatch({ type: 'ADD_SLIDE', slide }, { history: index === slides.length - 1 })
    })
    const last = slides.at(-1)
    if (last) set({ activeSlideId: last.id, selectedElementIds: [], editingElementId: null })
  },
  deleteActiveSlide: () => {
    const state = get()
    if (!state.document || !state.activeSlideId) return
    const index = state.document.slides.findIndex((slide) => slide.id === state.activeSlideId)
    state.dispatch({ type: 'DELETE_SLIDE', slideId: state.activeSlideId })
    const slides = get().document?.slides ?? []
    set({ activeSlideId: slides[Math.min(index, slides.length - 1)]?.id ?? null, selectedElementIds: [] })
  },
  duplicateActiveSlide: () => {
    const state = get()
    if (!state.activeSlideId) return
    const id = crypto.randomUUID()
    state.dispatch({ type: 'DUPLICATE_SLIDE', slideId: state.activeSlideId, newSlideId: id })
    set({ activeSlideId: id, selectedElementIds: [] })
  },
  copy: () => {
    const state = get()
    const slide = state.document?.slides.find((item) => item.id === state.activeSlideId)
    clipboard = structuredClone(
      getSlideElements(slide).filter((element) => state.selectedElementIds.includes(element.id))
    )
  },
  paste: () => {
    const state = get()
    if (!state.activeSlideId || clipboard.length === 0) return
    const copies = clipboard.map((element) => ({ ...structuredClone(element), id: crypto.randomUUID(), x: element.x + 24, y: element.y + 24 }))
    copies.forEach((element) => state.dispatch({ type: 'ADD_ELEMENT', slideId: state.activeSlideId!, element }))
    set({ selectedElementIds: copies.map((element) => element.id) })
  },
  deleteSelection: () => {
    const state = get()
    if (!state.activeSlideId || state.selectedElementIds.length === 0) return
    state.dispatch({ type: 'DELETE_ELEMENTS', slideId: state.activeSlideId, elementIds: state.selectedElementIds })
    set({ selectedElementIds: [], editingElementId: null })
  },
  duplicateSelection: () => {
    const state = get()
    if (!state.activeSlideId || state.selectedElementIds.length === 0) return
    const before = new Set(
      getSlideElements(state.document?.slides.find((slide) => slide.id === state.activeSlideId)).map(
        (element) => element.id
      )
    )
    state.dispatch({ type: 'DUPLICATE_ELEMENTS', slideId: state.activeSlideId, elementIds: state.selectedElementIds })
    const elements = getSlideElements(get().document?.slides.find((slide) => slide.id === state.activeSlideId))
    set({ selectedElementIds: elements.filter((element) => !before.has(element.id)).map((element) => element.id) })
  },
  selectAll: () => {
    const state = get()
    const slide = state.document?.slides.find((item) => item.id === state.activeSlideId)
    set({
      selectedElementIds: getSlideElements(slide).filter((element) => !element.locked && !element.hidden).map((element) => element.id)
    })
  },
  undo: () => {
    const state = get()
    const previous = state.past.at(-1)
    if (!previous || !state.document) return
    const past = state.past.slice(0, -1)
    const restored = normalizePresentationDocument(clone(previous.document))
    set({
      document: restored,
      activeSlideId: resolveActiveSlideId(restored, state.activeSlideId),
      past,
      future: [{ document: clone(state.document) }, ...state.future].slice(0, HISTORY_LIMIT),
      canUndo: past.length > 0,
      canRedo: true,
      isDirty: true,
      selectedElementIds: []
    })
  },
  redo: () => {
    const state = get()
    const next = state.future[0]
    if (!next || !state.document) return
    const future = state.future.slice(1)
    const restored = normalizePresentationDocument(clone(next.document))
    set({
      document: restored,
      activeSlideId: resolveActiveSlideId(restored, state.activeSlideId),
      past: [...state.past, { document: clone(state.document) }].slice(-HISTORY_LIMIT),
      future,
      canUndo: true,
      canRedo: future.length > 0,
      isDirty: true,
      selectedElementIds: []
    })
  }
}))
