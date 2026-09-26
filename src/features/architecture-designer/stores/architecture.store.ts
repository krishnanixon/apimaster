import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  ArchitectureDiagram,
  CreateArchitectureDiagramInput,
  UpdateArchitectureDiagramInput
} from '@shared/types'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

interface ArchitectureState {
  diagrams: ArchitectureDiagram[]
  currentDiagram: ArchitectureDiagram | null
  isLoading: boolean
  isSaving: boolean
  loadDiagrams: (projectId: string) => Promise<void>
  loadDiagram: (id: string) => Promise<ArchitectureDiagram | null>
  createDiagram: (input: CreateArchitectureDiagramInput) => Promise<ArchitectureDiagram | null>
  updateDiagram: (id: string, input: UpdateArchitectureDiagramInput) => Promise<void>
  deleteDiagram: (id: string) => Promise<void>
  duplicateDiagram: (id: string) => Promise<ArchitectureDiagram | null>
  setCurrentDiagram: (diagram: ArchitectureDiagram | null) => void
}

async function ensureApi() {
  const api = await waitForDesktopApi()
  if (!api?.architectures) {
    throw new Error('Architecture Designer API is unavailable. Restart the application.')
  }
  return api.architectures
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const useArchitectureStore = create<ArchitectureState>((set) => ({
  diagrams: [],
  currentDiagram: null,
  isLoading: false,
  isSaving: false,

  loadDiagrams: async (projectId) => {
    set({ isLoading: true })
    try {
      const architectures = await ensureApi()
      const result = await architectures.list(projectId)
      if (result.success && result.data) {
        set({ diagrams: result.data, isLoading: false })
      } else {
        set({ isLoading: false })
        toast.error(result.error ?? 'Failed to load architectures')
      }
    } catch (error) {
      set({ isLoading: false })
      toast.error(message(error, 'Failed to load architectures'))
    }
  },

  loadDiagram: async (id) => {
    set({ isLoading: true, currentDiagram: null })
    try {
      const architectures = await ensureApi()
      const result = await architectures.get(id)
      if (result.success && result.data) {
        set({ currentDiagram: result.data, isLoading: false })
        return result.data
      }
      set({ isLoading: false })
      toast.error(result.error ?? 'Architecture not found')
      return null
    } catch (error) {
      set({ isLoading: false })
      toast.error(message(error, 'Failed to load architecture'))
      return null
    }
  },

  createDiagram: async (input) => {
    try {
      const architectures = await ensureApi()
      const result = await architectures.create(input)
      if (result.success && result.data) {
        set((state) => ({ diagrams: [result.data!, ...state.diagrams] }))
        return result.data
      }
      toast.error(result.error ?? 'Failed to create architecture')
      return null
    } catch (error) {
      toast.error(message(error, 'Failed to create architecture'))
      return null
    }
  },

  updateDiagram: async (id, input) => {
    set({ isSaving: true })
    try {
      const architectures = await ensureApi()
      const result = await architectures.update(id, input)
      if (result.success && result.data) {
        set((state) => ({
          currentDiagram: state.currentDiagram?.id === id ? result.data! : state.currentDiagram,
          diagrams: state.diagrams.map((d) => (d.id === id ? result.data! : d)),
          isSaving: false
        }))
      } else {
        set({ isSaving: false })
        toast.error(result.error ?? 'Failed to save architecture')
      }
    } catch (error) {
      set({ isSaving: false })
      toast.error(message(error, 'Failed to save architecture'))
    }
  },

  deleteDiagram: async (id) => {
    try {
      const architectures = await ensureApi()
      const result = await architectures.delete(id)
      if (result.success) {
        set((state) => ({
          diagrams: state.diagrams.filter((d) => d.id !== id),
          currentDiagram: state.currentDiagram?.id === id ? null : state.currentDiagram
        }))
        toast.success('Architecture deleted')
      } else {
        toast.error(result.error ?? 'Failed to delete architecture')
      }
    } catch (error) {
      toast.error(message(error, 'Failed to delete architecture'))
    }
  },

  duplicateDiagram: async (id) => {
    try {
      const architectures = await ensureApi()
      const result = await architectures.duplicate(id)
      if (result.success && result.data) {
        set((state) => ({ diagrams: [result.data!, ...state.diagrams] }))
        toast.success('Architecture duplicated')
        return result.data
      }
      toast.error(result.error ?? 'Failed to duplicate architecture')
      return null
    } catch (error) {
      toast.error(message(error, 'Failed to duplicate architecture'))
      return null
    }
  },

  setCurrentDiagram: (diagram) => set({ currentDiagram: diagram })
}))

/** Reads the diagram list without subscribing — handy inside event handlers. */
export function getArchitectureSnapshot(): ArchitectureDiagram[] {
  return useArchitectureStore.getState().diagrams
}
