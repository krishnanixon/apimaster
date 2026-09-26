import { create } from 'zustand'
import { toast } from 'sonner'
import type { CreateFlowDiagramInput, FlowDiagram, FlowCategory } from '@shared/types'

interface FlowState {
  flows: FlowDiagram[]
  currentFlow: FlowDiagram | null
  isLoading: boolean
  isSaving: boolean
  loadFlows: (projectId: string) => Promise<void>
  loadFlow: (id: string) => Promise<boolean>
  createFlow: (input: CreateFlowDiagramInput) => Promise<FlowDiagram | null>
  updateFlow: (id: string, data: Partial<FlowDiagram>) => Promise<void>
  deleteFlow: (id: string) => Promise<void>
  duplicateFlow: (id: string) => Promise<FlowDiagram | null>
  setCurrentFlow: (flow: FlowDiagram | null) => void
}

function ensureFlowsApi() {
  if (!window.electronAPI?.flows) {
    throw new Error('Flow Designer API is unavailable. Restart the application.')
  }
}

export const useFlowStore = create<FlowState>((set, get) => ({
  flows: [],
  currentFlow: null,
  isLoading: false,
  isSaving: false,

  loadFlows: async (projectId) => {
    set({ isLoading: true })
    try {
      ensureFlowsApi()
      const result = await window.electronAPI.flows.list(projectId)
      if (result.success && result.data) {
        set({ flows: result.data, isLoading: false })
      } else {
        set({ isLoading: false })
        toast.error(result.error ?? 'Failed to load flows')
      }
    } catch (error) {
      set({ isLoading: false })
      toast.error(error instanceof Error ? error.message : 'Failed to load flows')
    }
  },

  loadFlow: async (id) => {
    set({ isLoading: true, currentFlow: null })
    try {
      ensureFlowsApi()
      const result = await window.electronAPI.flows.get(id)
      if (result.success && result.data) {
        set({ currentFlow: result.data, isLoading: false })
        return true
      }
      set({ isLoading: false })
      toast.error(result.error ?? 'Flow not found')
      return false
    } catch (error) {
      set({ isLoading: false })
      toast.error(error instanceof Error ? error.message : 'Failed to load flow')
      return false
    }
  },

  createFlow: async (input) => {
    try {
      ensureFlowsApi()
      const result = await window.electronAPI.flows.create(input)
      if (result.success && result.data) {
        set((state) => ({ flows: [result.data!, ...state.flows] }))
        return result.data
      }
      toast.error(result.error ?? 'Failed to create flow')
      return null
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create flow')
      return null
    }
  },

  updateFlow: async (id, data) => {
    set({ isSaving: true })
    try {
      ensureFlowsApi()
      const result = await window.electronAPI.flows.update(id, {
        title: data.title,
        description: data.description,
        category: data.category as FlowCategory | undefined,
        nodes: data.nodes,
        edges: data.edges,
        viewport: data.viewport,
        layoutState: data.layoutState,
        isPinned: data.isPinned
      })
      if (result.success && result.data) {
        set((state) => ({
          currentFlow: state.currentFlow?.id === id ? result.data! : state.currentFlow,
          flows: state.flows.map((f) => (f.id === id ? result.data! : f)),
          isSaving: false
        }))
      } else {
        set({ isSaving: false })
        toast.error(result.error ?? 'Failed to save flow')
      }
    } catch (error) {
      set({ isSaving: false })
      toast.error(error instanceof Error ? error.message : 'Failed to save flow')
    }
  },

  deleteFlow: async (id) => {
    try {
      ensureFlowsApi()
      const result = await window.electronAPI.flows.delete(id)
      if (result.success) {
        set((state) => ({
          flows: state.flows.filter((f) => f.id !== id),
          currentFlow: state.currentFlow?.id === id ? null : state.currentFlow
        }))
        toast.success('Flow deleted')
      } else {
        toast.error(result.error ?? 'Failed to delete flow')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete flow')
    }
  },

  duplicateFlow: async (id) => {
    try {
      ensureFlowsApi()
      const result = await window.electronAPI.flows.duplicate(id)
      if (result.success && result.data) {
        set((state) => ({ flows: [result.data!, ...state.flows] }))
        toast.success('Flow duplicated')
        return result.data
      }
      toast.error(result.error ?? 'Failed to duplicate flow')
      return null
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate flow')
      return null
    }
  },

  setCurrentFlow: (flow) => set({ currentFlow: flow })
}))
