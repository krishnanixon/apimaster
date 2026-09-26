import { create } from 'zustand'
import type {
  AIModelOption,
  AIProviderConfig,
  AIProviderConfigPatch,
  AIProviderId,
  AIProviderMetric,
  AIProviderStatus,
  AIRuntimeStatus,
  AITestConnectionResult,
  CloudProviderId
} from '@shared/types'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

interface AIState {
  config: AIProviderConfig | null
  providers: AIProviderStatus[]
  metrics: AIProviderMetric[]
  activeProvider: AIProviderId | null
  activeModel: string | null
  isLoading: boolean
  /** Brief flag while a provider/mode switch is applied. */
  isSwitching: boolean
  testResults: Partial<Record<AIProviderId, AITestConnectionResult>>

  loadStatus: () => Promise<void>
  setConfig: (patch: AIProviderConfigPatch) => Promise<void>
  setMode: (mode: AIProviderConfig['mode']) => Promise<void>
  selectCloudProvider: (providerId: CloudProviderId) => Promise<void>
  selectOpenAIModel: (model: string) => Promise<void>
  selectOllamaModel: (model: string) => Promise<void>
  testConnection: (providerId: AIProviderId) => Promise<AITestConnectionResult | null>
  listModels: (providerId: AIProviderId) => Promise<AIModelOption[]>

  getProvider: (id: AIProviderId) => AIProviderStatus | undefined
  getMetric: (id: AIProviderId) => AIProviderMetric | undefined
}

function applyStatus(status: AIRuntimeStatus) {
  return {
    config: status.config,
    providers: status.providers,
    metrics: status.metrics,
    activeProvider: status.activeProvider,
    activeModel: status.activeModel
  }
}

export const useAIStore = create<AIState>((set, get) => ({
  config: null,
  providers: [],
  metrics: [],
  activeProvider: null,
  activeModel: null,
  isLoading: false,
  isSwitching: false,
  testResults: {},

  loadStatus: async () => {
    if (!get().config) set({ isLoading: true })
    const api = await waitForDesktopApi()
    if (!api?.ai) {
      set({ isLoading: false })
      return
    }
    const result = await api.ai.getStatus()
    if (result.success && result.data) {
      set({ ...applyStatus(result.data), isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  setConfig: async (patch) => {
    set({ isSwitching: true })
    const api = await waitForDesktopApi()
    if (!api?.ai) {
      set({ isSwitching: false })
      return
    }
    const result = await api.ai.setConfig(patch)
    if (result.success && result.data) {
      set({ config: result.data })
    }
    // Refresh derived active provider/model + statuses.
    await get().loadStatus()
    set({ isSwitching: false })
  },

  setMode: async (mode) => {
    await get().setConfig({ mode })
  },

  selectCloudProvider: async (providerId) => {
    await get().setConfig({ cloudProvider: providerId })
  },

  selectOpenAIModel: async (model) => {
    await get().setConfig({ mode: 'openai', openai: { model } })
  },

  selectOllamaModel: async (model) => {
    await get().setConfig({ mode: 'ollama', ollama: { model } })
  },

  testConnection: async (providerId) => {
    const api = await waitForDesktopApi()
    if (!api?.ai) return null
    const result = await api.ai.testConnection(providerId)
    if (result.success && result.data) {
      set((state) => ({ testResults: { ...state.testResults, [providerId]: result.data } }))
      await get().loadStatus()
      return result.data
    }
    return null
  },

  listModels: async (providerId) => {
    const api = await waitForDesktopApi()
    if (!api?.ai) return []
    const result = await api.ai.listModels(providerId)
    return result.success && result.data ? result.data : []
  },

  getProvider: (id) => get().providers.find((p) => p.id === id),
  getMetric: (id) => get().metrics.find((m) => m.providerId === id)
}))
