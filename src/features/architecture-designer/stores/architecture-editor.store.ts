/**
 * Architecture Designer — editor state.
 *
 * Holds the working `ArchitectureModel` plus everything that is editor-local
 * (selection, active section/view, panel layout, history). Persistence lives in
 * `architecture.store.ts`; this store never talks to IPC.
 *
 * Every mutation funnels through `dispatch`, which pushes a history snapshot
 * before applying actions. That is what makes AI changes as reversible as
 * manual ones — they are the same code path.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ArchActionProposal,
  ArchSectionId,
  ArchValidationResult,
  ArchViewId,
  ArchitectureAction,
  ArchitectureModel
} from '@shared/types/architecture'
import { applyActions, createEmptyModel } from '@shared/lib/architecture-model'

const HISTORY_LIMIT = 50

export interface ArchPanelLayout {
  leftWidth: number
  rightWidth: number
  leftCollapsed: boolean
  rightCollapsed: boolean
}

const DEFAULT_LAYOUT: ArchPanelLayout = {
  leftWidth: 188,
  rightWidth: 280,
  leftCollapsed: false,
  /** Start collapsed so the diagram matches Flow Designer’s canvas-first feel. */
  rightCollapsed: true
}

interface ArchitectureEditorState {
  model: ArchitectureModel
  activeSection: ArchSectionId
  activeView: ArchViewId
  selectedComponentIds: string[]
  selectedConnectionId: string | null
  panelLayout: ArchPanelLayout
  searchQuery: string
  /** AI output staged for review; applying it is a normal dispatch. */
  pendingProposal: ArchActionProposal | null
  validation: ArchValidationResult | null
  /** True when the model differs from the last persisted copy. */
  isDirty: boolean

  past: ArchitectureModel[]
  future: ArchitectureModel[]
  canUndo: boolean
  canRedo: boolean

  dispatch: (actions: ArchitectureAction | ArchitectureAction[]) => void
  loadModel: (model: ArchitectureModel, options?: { resetHistory?: boolean }) => void
  /** Swaps in a whole new model (AI generation, templates) but keeps undo working. */
  replaceModel: (model: ArchitectureModel) => void
  resetEditor: () => void
  markSaved: () => void

  undo: () => void
  redo: () => void

  setActiveSection: (section: ArchSectionId) => void
  setActiveView: (view: ArchViewId) => void
  selectComponents: (ids: string[]) => void
  toggleComponentSelection: (id: string) => void
  selectConnection: (id: string | null) => void
  clearSelection: () => void
  setSearchQuery: (query: string) => void
  setPanelLayout: (patch: Partial<ArchPanelLayout>) => void
  setPendingProposal: (proposal: ArchActionProposal | null) => void
  applyPendingProposal: () => void
  setValidation: (result: ArchValidationResult | null) => void
}

export const useArchitectureEditorStore = create<ArchitectureEditorState>()(
  persist(
    (set, get) => ({
      model: createEmptyModel(),
      activeSection: 'architecture',
      activeView: 'system-context',
      selectedComponentIds: [],
      selectedConnectionId: null,
      panelLayout: DEFAULT_LAYOUT,
      searchQuery: '',
      pendingProposal: null,
      validation: null,
      isDirty: false,

      past: [],
      future: [],
      canUndo: false,
      canRedo: false,

      dispatch: (actions) => {
        const list = Array.isArray(actions) ? actions : [actions]
        if (list.length === 0) return

        const { model, past } = get()
        const next = applyActions(model, list)
        const nextPast = [...past, model].slice(-HISTORY_LIMIT)
        const addedIds = next.components
          .filter((component) => !model.components.some((existing) => existing.id === component.id))
          .map((component) => component.id)
        const removedIds = new Set(
          list.flatMap((action) => (action.type === 'REMOVE_COMPONENT' ? [action.componentId] : []))
        )

        set({
          model: next,
          past: nextPast,
          future: [],
          canUndo: true,
          canRedo: false,
          isDirty: true,
          validation: null,
          ...(addedIds.length > 0
            ? { selectedComponentIds: addedIds, selectedConnectionId: null }
            : removedIds.size > 0
              ? {
                  selectedComponentIds: get().selectedComponentIds.filter((id) => !removedIds.has(id))
                }
              : {})
        })
      },

      loadModel: (model, options) => {
        set({
          model,
          isDirty: false,
          validation: null,
          pendingProposal: null,
          ...(options?.resetHistory === false
            ? {}
            : { past: [], future: [], canUndo: false, canRedo: false })
        })
      },

      replaceModel: (model) => {
        const current = get().model
        set({
          model,
          past: [...get().past, current].slice(-HISTORY_LIMIT),
          future: [],
          canUndo: true,
          canRedo: false,
          isDirty: true,
          validation: null,
          pendingProposal: null,
          selectedComponentIds: [],
          selectedConnectionId: null
        })
      },

      resetEditor: () =>
        set({
          model: createEmptyModel(),
          activeSection: 'architecture',
          activeView: 'system-context',
          selectedComponentIds: [],
          selectedConnectionId: null,
          searchQuery: '',
          pendingProposal: null,
          validation: null,
          isDirty: false,
          past: [],
          future: [],
          canUndo: false,
          canRedo: false
        }),

      markSaved: () => set({ isDirty: false }),

      undo: () => {
        const { past, future, model } = get()
        if (past.length === 0) return
        const previous = past[past.length - 1]
        const nextPast = past.slice(0, -1)
        const nextFuture = [model, ...future].slice(0, HISTORY_LIMIT)
        set({
          model: previous,
          past: nextPast,
          future: nextFuture,
          canUndo: nextPast.length > 0,
          canRedo: true,
          isDirty: true,
          validation: null
        })
      },

      redo: () => {
        const { past, future, model } = get()
        if (future.length === 0) return
        const [next, ...rest] = future
        const nextPast = [...past, model].slice(-HISTORY_LIMIT)
        set({
          model: next,
          past: nextPast,
          future: rest,
          canUndo: true,
          canRedo: rest.length > 0,
          isDirty: true,
          validation: null
        })
      },

      setActiveSection: (section) => set({ activeSection: section }),
      setActiveView: (view) => set({ activeView: view }),

      selectComponents: (ids) =>
        set((state) => ({
          selectedComponentIds: ids,
          selectedConnectionId: null,
          ...(ids.length > 0
            ? { panelLayout: { ...state.panelLayout, rightCollapsed: false } }
            : {})
        })),

      toggleComponentSelection: (id) =>
        set((state) => {
          const nextIds = state.selectedComponentIds.includes(id)
            ? state.selectedComponentIds.filter((existing) => existing !== id)
            : [...state.selectedComponentIds, id]
          return {
            selectedComponentIds: nextIds,
            selectedConnectionId: null,
            ...(nextIds.length > 0
              ? { panelLayout: { ...state.panelLayout, rightCollapsed: false } }
              : {})
          }
        }),

      selectConnection: (id) =>
        set((state) => ({
          selectedConnectionId: id,
          selectedComponentIds: [],
          ...(id
            ? { panelLayout: { ...state.panelLayout, rightCollapsed: false } }
            : {})
        })),

      clearSelection: () => set({ selectedComponentIds: [], selectedConnectionId: null }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setPanelLayout: (patch) =>
        set((state) => ({ panelLayout: { ...state.panelLayout, ...patch } })),

      setPendingProposal: (proposal) => set({ pendingProposal: proposal }),

      applyPendingProposal: () => {
        const proposal = get().pendingProposal
        if (!proposal) return
        get().dispatch(proposal.actions)
        set({ pendingProposal: null })
      },

      setValidation: (result) => set({ validation: result })
    }),
    {
      name: 'architecture-designer-layout',
      // Only editor chrome is remembered locally; the model itself is in SQLite.
      partialize: (state) => ({ panelLayout: state.panelLayout })
    }
  )
)

/** Currently selected component, or null when the selection is not exactly one. */
export function useSelectedComponent() {
  return useArchitectureEditorStore((state) => {
    if (state.selectedComponentIds.length !== 1) return null
    return state.model.components.find((c) => c.id === state.selectedComponentIds[0]) ?? null
  })
}
