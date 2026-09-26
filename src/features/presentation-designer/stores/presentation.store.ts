import { create } from 'zustand'
import { toast } from 'sonner'
import type { CreatePresentationInput, Presentation, UpdatePresentationInput } from '@shared/types'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

interface PresentationState {
  presentations: Presentation[]
  currentPresentation: Presentation | null
  isLoading: boolean
  isSaving: boolean
  loadPresentations: (projectId: string) => Promise<void>
  loadPresentation: (id: string) => Promise<Presentation | null>
  createPresentation: (input: CreatePresentationInput) => Promise<Presentation | null>
  updatePresentation: (id: string, input: UpdatePresentationInput) => Promise<boolean>
  deletePresentation: (id: string) => Promise<void>
  duplicatePresentation: (id: string) => Promise<Presentation | null>
  setCurrentPresentation: (presentation: Presentation | null) => void
}

async function ensureApi() {
  const api = await waitForDesktopApi()
  if (!api?.presentations) {
    throw new Error('Presentation Studio API is unavailable. Restart the application.')
  }
  return api.presentations
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const usePresentationStore = create<PresentationState>((set) => ({
  presentations: [],
  currentPresentation: null,
  isLoading: false,
  isSaving: false,

  loadPresentations: async (projectId) => {
    set({ isLoading: true })
    try {
      const presentations = await ensureApi()
      const result = await presentations.list(projectId)
      if (result.success && result.data) {
        set({ presentations: result.data, isLoading: false })
      } else {
        set({ isLoading: false })
        toast.error(result.error ?? 'Failed to load presentations')
      }
    } catch (error) {
      set({ isLoading: false })
      toast.error(message(error, 'Failed to load presentations'))
    }
  },

  loadPresentation: async (id) => {
    set({ isLoading: true, currentPresentation: null })
    try {
      const presentations = await ensureApi()
      const result = await presentations.get(id)
      if (result.success && result.data) {
        set({ currentPresentation: result.data, isLoading: false })
        return result.data
      }
      set({ isLoading: false })
      toast.error(result.error ?? 'Presentation not found')
      return null
    } catch (error) {
      set({ isLoading: false })
      toast.error(message(error, 'Failed to load presentation'))
      return null
    }
  },

  createPresentation: async (input) => {
    try {
      const presentations = await ensureApi()
      const result = await presentations.create(input)
      if (result.success && result.data) {
        set((state) => ({ presentations: [result.data!, ...state.presentations] }))
        return result.data
      }
      toast.error(result.error ?? 'Failed to create presentation')
      return null
    } catch (error) {
      toast.error(message(error, 'Failed to create presentation'))
      return null
    }
  },

  updatePresentation: async (id, input) => {
    set({ isSaving: true })
    try {
      const presentations = await ensureApi()
      const result = await presentations.update(id, input)
      if (result.success && result.data) {
        set((state) => ({
          currentPresentation:
            state.currentPresentation?.id === id ? result.data! : state.currentPresentation,
          presentations: state.presentations.map((p) => (p.id === id ? result.data! : p)),
          isSaving: false
        }))
        return true
      } else {
        set({ isSaving: false })
        toast.error(result.error ?? 'Failed to save presentation')
        return false
      }
    } catch (error) {
      set({ isSaving: false })
      toast.error(message(error, 'Failed to save presentation'))
      return false
    }
  },

  deletePresentation: async (id) => {
    try {
      const presentations = await ensureApi()
      const result = await presentations.delete(id)
      if (result.success) {
        set((state) => ({
          presentations: state.presentations.filter((p) => p.id !== id),
          currentPresentation:
            state.currentPresentation?.id === id ? null : state.currentPresentation
        }))
        toast.success('Presentation deleted')
      } else {
        toast.error(result.error ?? 'Failed to delete presentation')
      }
    } catch (error) {
      toast.error(message(error, 'Failed to delete presentation'))
    }
  },

  duplicatePresentation: async (id) => {
    try {
      const presentations = await ensureApi()
      const result = await presentations.duplicate(id)
      if (result.success && result.data) {
        set((state) => ({ presentations: [result.data!, ...state.presentations] }))
        toast.success('Presentation duplicated')
        return result.data
      }
      toast.error(result.error ?? 'Failed to duplicate presentation')
      return null
    } catch (error) {
      toast.error(message(error, 'Failed to duplicate presentation'))
      return null
    }
  },

  setCurrentPresentation: (presentation) => set({ currentPresentation: presentation })
}))
