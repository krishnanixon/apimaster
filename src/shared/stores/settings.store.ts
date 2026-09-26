import { create } from 'zustand'
import type { ApiKeyStatus, AppSettings, ThemeMode, AIProviderId } from '@shared/types'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { writeStoredColorMode } from '@/shared/lib/boot-theme'
import { refreshThemeCustomization, runThemeTransition } from '@/shared/lib/theme-engine'

interface SettingsState {
  settings: AppSettings | null
  isLoading: boolean
  /** Timestamp of the last successful updateSettings call (for save feedback) */
  lastSavedAt: number | null
  apiKeyStatus: ApiKeyStatus | null
  providerKeyStatuses: Partial<Record<AIProviderId, ApiKeyStatus>>
  loadSettings: () => Promise<void>
  updateSettings: (data: Partial<AppSettings>) => Promise<void>
  setApiKey: (key: string) => Promise<boolean>
  deleteApiKey: () => Promise<boolean>
  loadApiKeyStatus: () => Promise<void>
  setProviderKey: (providerId: AIProviderId, key: string) => Promise<boolean>
  deleteProviderKey: (providerId: AIProviderId) => Promise<boolean>
  getEffectiveTheme: () => 'light' | 'dark'
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isLoading: false,
  lastSavedAt: null,
  apiKeyStatus: null,
  providerKeyStatuses: {},

  loadSettings: async () => {
    set({ isLoading: true })
    const api = await waitForDesktopApi()
    if (!api?.settings) {
      set({ isLoading: false })
      return
    }
    const result = await api.settings.get()
    if (result.success && result.data) {
      set({ settings: result.data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  updateSettings: async (data) => {
    const api = await waitForDesktopApi()
    if (!api?.settings) return
    const result = await api.settings.update(data)
    if (result.success && result.data) {
      set({ settings: result.data, lastSavedAt: Date.now() })
    }
  },

  setApiKey: async (key) => {
    const api = await waitForDesktopApi()
    if (!api?.apiKey) return false
    const result = await api.apiKey.set(key)
    if (result.success) {
      await get().loadApiKeyStatus()
      return true
    }
    return false
  },

  deleteApiKey: async () => {
    const api = await waitForDesktopApi()
    if (!api?.apiKey) return false
    const result = await api.apiKey.delete()
    if (result.success) {
      await get().loadApiKeyStatus()
      return true
    }
    return false
  },

  loadApiKeyStatus: async () => {
    const api = await waitForDesktopApi()
    if (!api?.apiKey) return
    const openai = await api.apiKey.getStatus()
    const all = api.apiKey.listStatuses ? await api.apiKey.listStatuses() : { success: false as const }
    set({
      apiKeyStatus: openai.success ? (openai.data ?? null) : null,
      providerKeyStatuses: all.success && all.data ? all.data : {}
    })
  },

  setProviderKey: async (providerId, key) => {
    const api = await waitForDesktopApi()
    if (!api?.apiKey?.setFor) return false
    const result = await api.apiKey.setFor(providerId, key)
    if (result.success) {
      await get().loadApiKeyStatus()
      return true
    }
    return false
  },

  deleteProviderKey: async (providerId) => {
    const api = await waitForDesktopApi()
    if (!api?.apiKey?.deleteFor) return false
    const result = await api.apiKey.deleteFor(providerId)
    if (result.success) {
      await get().loadApiKeyStatus()
      return true
    }
    return false
  },

  getEffectiveTheme: () => {
    const { settings } = get()
    if (!settings || settings.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return settings.theme as 'light' | 'dark'
  }
}))

export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement
  const nextDark =
    theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark'

  if (root.classList.contains('dark') !== nextDark) {
    runThemeTransition()
  }
  root.classList.toggle('dark', nextDark)
  writeStoredColorMode(nextDark ? 'dark' : 'light')

  // Custom accents are tuned per color mode, so they need recomputing on flip.
  refreshThemeCustomization()
}
