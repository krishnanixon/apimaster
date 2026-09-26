import { create } from 'zustand'
import type { Project } from '@shared/types'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

interface ProjectState {
  projects: Project[]
  recentProjects: Project[]
  currentProject: Project | null
  isLoading: boolean
  error: string | null
  loadProjects: (status?: string) => Promise<void>
  loadRecentProjects: () => Promise<void>
  createProject: (name: string, description?: string) => Promise<Project | null>
  openProject: (id: string) => Promise<Project | null>
  updateProject: (id: string, data: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  duplicateProject: (id: string) => Promise<Project | null>
  archiveProject: (id: string) => Promise<void>
  setCurrentProject: (project: Project | null) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  recentProjects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  loadProjects: async (status) => {
    set({ isLoading: true, error: null })
    const api = await waitForDesktopApi()
    if (!api?.projects) {
      set({ isLoading: false, error: 'Desktop API is unavailable' })
      return
    }
    const result = await api.projects.list(status)
    if (result.success && result.data) {
      set({ projects: result.data, isLoading: false })
    } else {
      set({ isLoading: false, error: result.error ?? 'Failed to load projects' })
    }
  },

  loadRecentProjects: async () => {
    const api = await waitForDesktopApi()
    if (!api?.projects) return
    const result = await api.projects.recent()
    if (result.success && result.data) {
      set({ recentProjects: result.data })
    }
  },

  createProject: async (name, description) => {
    const api = await waitForDesktopApi()
    if (!api?.projects) {
      set({ error: 'Desktop API is unavailable' })
      return null
    }
    const result = await api.projects.create({ name, description })
    if (result.success && result.data) {
      await get().loadProjects()
      await get().loadRecentProjects()
      return result.data
    }
    set({ error: result.error ?? 'Failed to create project' })
    return null
  },

  openProject: async (id) => {
    const api = await waitForDesktopApi()
    if (!api?.projects) return null
    const result = await api.projects.open(id)
    if (result.success && result.data) {
      set({ currentProject: result.data })
      await get().loadRecentProjects()
      return result.data
    }
    return null
  },

  updateProject: async (id, data) => {
    const api = await waitForDesktopApi()
    if (!api?.projects) return
    const result = await api.projects.update(id, data)
    if (result.success && result.data) {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? result.data! : p)),
        currentProject: state.currentProject?.id === id ? result.data! : state.currentProject
      }))
    }
  },

  deleteProject: async (id) => {
    const api = await waitForDesktopApi()
    if (!api?.projects) return
    const result = await api.projects.delete(id)
    if (result.success) {
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject
      }))
      await get().loadRecentProjects()
    }
  },

  duplicateProject: async (id) => {
    const api = await waitForDesktopApi()
    if (!api?.projects) return null
    const result = await api.projects.duplicate(id)
    if (result.success && result.data) {
      await get().loadProjects()
      return result.data
    }
    return null
  },

  archiveProject: async (id) => {
    const api = await waitForDesktopApi()
    if (!api?.projects) return
    const result = await api.projects.archive(id)
    if (result.success) {
      await get().loadProjects()
    }
  },

  setCurrentProject: (project) => set({ currentProject: project })
}))
