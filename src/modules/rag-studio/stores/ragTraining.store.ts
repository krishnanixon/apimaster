import { create } from 'zustand'
import type {
  CreateRagTrainingDocumentInput,
  RagModelProfile,
  RagTrainingDocument,
  RagTrainingIndexStatus,
  RagTrainingSettings,
  UpdateRagTrainingDocumentInput
} from '@shared/types/rag-training'
import type { AppScope } from '@shared/types/scope'
import { DEFAULT_RAG_TRAINING_SETTINGS } from '@shared/types/rag-training'
import { toast } from 'sonner'

interface RagTrainingState {
  scope: AppScope
  projectId: string | null
  documents: RagTrainingDocument[]
  settings: RagTrainingSettings
  indexStatus: RagTrainingIndexStatus | null
  selectedId: string | null
  loading: boolean
  indexing: boolean

  setScope: (scope: AppScope, projectId: string | null) => void
  load: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (patch: Partial<RagTrainingSettings>) => Promise<void>
  saveModelProfile: (profile: Partial<RagModelProfile>) => Promise<void>
  select: (id: string | null) => void
  create: (input: Omit<CreateRagTrainingDocumentInput, 'scope' | 'projectId'>) => Promise<RagTrainingDocument | null>
  update: (id: string, input: UpdateRagTrainingDocumentInput) => Promise<void>
  remove: (id: string) => Promise<void>
  index: () => Promise<void>
  refreshStatus: () => Promise<void>
}

async function ipc<T>(fn: () => Promise<{ success: boolean; data?: T; error?: string }>): Promise<T | null> {
  const res = await fn()
  if (!res.success) {
    toast.error(res.error ?? 'Request failed')
    return null
  }
  return res.data ?? (null as T)
}

export const useRagTrainingStore = create<RagTrainingState>((set, get) => ({
  scope: 'GLOBAL',
  projectId: null,
  documents: [],
  settings: DEFAULT_RAG_TRAINING_SETTINGS,
  indexStatus: null,
  selectedId: null,
  loading: false,
  indexing: false,

  setScope(scope, projectId) {
    set({ scope, projectId, selectedId: null })
  },

  async load() {
    const { scope, projectId } = get()
    set({ loading: true })
    try {
      const data = await ipc(() =>
        window.electronAPI.ragTraining.list(
          scope === 'PROJECT' && projectId
            ? { scope: 'PROJECT', projectId }
            : { scope: 'GLOBAL' }
        )
      )
      if (data) set({ documents: data })
      await get().refreshStatus()
    } finally {
      set({ loading: false })
    }
  },

  async loadSettings() {
    const data = await ipc(() => window.electronAPI.ragTraining.getSettings())
    if (data) set({ settings: data })
  },

  async saveSettings(patch) {
    const data = await ipc(() => window.electronAPI.ragTraining.saveSettings(patch))
    if (data) {
      set({ settings: data })
      toast.success('Training settings saved')
    }
  },

  async saveModelProfile(profile) {
    const current = get().settings.modelProfile
    await get().saveSettings({ modelProfile: { ...current, ...profile } })
  },

  select(id) {
    set({ selectedId: id })
  },

  async create(input) {
    const { scope, projectId } = get()
    const data = await ipc(() =>
      window.electronAPI.ragTraining.create({
        ...input,
        scope,
        projectId: scope === 'PROJECT' ? projectId : null
      })
    )
    if (data) {
      set((s) => ({ documents: [data, ...s.documents], selectedId: data.id }))
      toast.success('Training document added')
      await get().refreshStatus()
    }
    return data
  },

  async update(id, input) {
    const data = await ipc(() => window.electronAPI.ragTraining.update(id, input))
    if (data) {
      set((s) => ({
        documents: s.documents.map((d) => (d.id === id ? data : d))
      }))
      toast.success('Saved')
      await get().refreshStatus()
    }
  },

  async remove(id) {
    const res = await window.electronAPI.ragTraining.delete(id)
    if (!res.success) {
      toast.error(res.error ?? 'Delete failed')
      return
    }
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId
    }))
    toast.success('Deleted')
    await get().refreshStatus()
  },

  async index() {
    const { scope, projectId } = get()
    set({ indexing: true })
    try {
      const data = await ipc(() =>
        window.electronAPI.ragTraining.index(scope, scope === 'PROJECT' ? projectId : null)
      )
      if (data) {
        toast.success(
          `Indexed ${data.documentCount} docs (${data.chunkCount} chunks) → ${data.collection}`
        )
        await get().refreshStatus()
      }
    } finally {
      set({ indexing: false })
    }
  },

  async refreshStatus() {
    const { scope, projectId } = get()
    const data = await ipc(() =>
      window.electronAPI.ragTraining.indexStatus(scope, scope === 'PROJECT' ? projectId : null)
    )
    if (data) set({ indexStatus: data })
  }
}))
