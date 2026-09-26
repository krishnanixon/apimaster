import { create } from 'zustand'
import type {
  ExtractKnowledgeResult,
  KnowledgeBundle,
  KnowledgeSearchResult,
  KnowledgeSeedResult,
  KnowledgeStats,
  KnowledgeSuggestion,
  RequirementKnowledge
} from '@shared/types'

interface KnowledgeState {
  bundle: KnowledgeBundle | null
  stats: KnowledgeStats | null
  suggestions: KnowledgeSuggestion[]
  searchResults: KnowledgeSearchResult[]
  isLoading: boolean
  isSaving: boolean
  isExtracting: boolean
  isSeeding: boolean
  loadKnowledge: (projectId: string) => Promise<void>
  loadStats: (projectId: string) => Promise<void>
  loadSuggestions: (projectId: string) => Promise<void>
  search: (projectId: string, query: string) => Promise<void>
  updateOverview: (projectId: string, data: Partial<RequirementKnowledge>) => Promise<void>
  createItem: (entityType: string, projectId: string, data: Record<string, unknown>) => Promise<unknown>
  updateItem: (entityType: string, id: string, data: Record<string, unknown>) => Promise<void>
  deleteItem: (entityType: string, id: string) => Promise<void>
  extractKnowledge: (projectId: string, text: string) => Promise<ExtractKnowledgeResult | null>
  seedSampleData: (projectId: string, force?: boolean) => Promise<KnowledgeSeedResult | null>
}

const emptyBundle: KnowledgeBundle = {
  overview: null,
  stakeholders: [],
  roles: [],
  modules: [],
  features: [],
  requirements: [],
  businessRules: [],
  workflows: [],
  entities: [],
  apiEndpoints: [],
  integrations: [],
  reports: [],
  risks: [],
  assumptions: [],
  decisions: []
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  bundle: null,
  stats: null,
  suggestions: [],
  searchResults: [],
  isLoading: false,
  isSaving: false,
  isExtracting: false,
  isSeeding: false,

  loadKnowledge: async (projectId) => {
    set({ isLoading: true })
    const result = await window.electronAPI.knowledge.load(projectId)
    if (result.success && result.data) {
      set({ bundle: result.data, isLoading: false })
    } else {
      set({ bundle: emptyBundle, isLoading: false })
    }
    await get().loadStats(projectId)
    await get().loadSuggestions(projectId)
  },

  loadStats: async (projectId) => {
    const result = await window.electronAPI.knowledge.getStats(projectId)
    if (result.success && result.data) {
      set({ stats: result.data })
    }
  },

  loadSuggestions: async (projectId) => {
    const result = await window.electronAPI.knowledge.getSuggestions(projectId)
    if (result.success && result.data) {
      set({ suggestions: result.data })
    }
  },

  search: async (projectId, query) => {
    if (!query.trim()) {
      set({ searchResults: [] })
      return
    }
    const result = await window.electronAPI.knowledge.search(projectId, query)
    if (result.success && result.data) {
      set({ searchResults: result.data })
    }
  },

  updateOverview: async (projectId, data) => {
    set({ isSaving: true })
    const result = await window.electronAPI.knowledge.updateOverview(projectId, data)
    if (result.success && result.data) {
      const bundle = get().bundle ?? emptyBundle
      set({
        bundle: { ...bundle, overview: result.data as RequirementKnowledge },
        isSaving: false
      })
    } else {
      set({ isSaving: false })
    }
  },

  createItem: async (entityType, projectId, data) => {
    set({ isSaving: true })
    const result = await window.electronAPI.knowledge.createItem(entityType, projectId, data)
    set({ isSaving: false })
    if (result.success) {
      await get().loadKnowledge(projectId)
      return result.data
    }
    return null
  },

  updateItem: async (entityType, id, data) => {
    set({ isSaving: true })
    await window.electronAPI.knowledge.updateItem(entityType, id, data)
    set({ isSaving: false })
    const bundle = get().bundle
    if (bundle?.overview?.projectId) {
      await get().loadKnowledge(bundle.overview.projectId)
    }
  },

  deleteItem: async (entityType, id) => {
    set({ isSaving: true })
    await window.electronAPI.knowledge.deleteItem(entityType, id)
    set({ isSaving: false })
    const bundle = get().bundle
    if (bundle?.overview?.projectId) {
      await get().loadKnowledge(bundle.overview.projectId)
    } else if (bundle?.modules[0]?.projectId) {
      await get().loadKnowledge(bundle.modules[0].projectId)
    }
  },

  extractKnowledge: async (projectId, text) => {
    set({ isExtracting: true })
    const result = await window.electronAPI.knowledge.extract({ projectId, text })
    set({ isExtracting: false })
    if (result.success && result.data) {
      await get().loadKnowledge(projectId)
      return result.data
    }
    return null
  },

  seedSampleData: async (projectId, force = false) => {
    set({ isSeeding: true })
    const result = await window.electronAPI.knowledge.seedSample(projectId, force)
    set({ isSeeding: false })
    if (result.success && result.data) {
      if (!result.data.skipped) {
        await get().loadKnowledge(projectId)
      }
      return result.data
    }
    return null
  }
}))
