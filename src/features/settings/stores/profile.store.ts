import { create } from 'zustand'
import type { ActivityLog, UserProfile, UserProfilePatch } from '@shared/types'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

interface ProfileState {
  profile: UserProfile | null
  activity: ActivityLog | null
  loaded: boolean
  loadProfile: () => Promise<void>
  loadActivity: () => Promise<void>
  updateProfile: (patch: UserProfilePatch) => Promise<boolean>
  clearActivity: () => Promise<boolean>
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  activity: null,
  loaded: false,

  loadProfile: async () => {
    const api = await waitForDesktopApi()
    const result = await api?.profile?.get()
    set({ profile: result?.success ? (result.data ?? null) : null, loaded: true })
  },

  loadActivity: async () => {
    const api = await waitForDesktopApi()
    const result = await api?.activity?.get()
    if (result?.success && result.data) set({ activity: result.data })
  },

  updateProfile: async (patch) => {
    const api = await waitForDesktopApi()
    const result = await api?.profile?.update(patch)
    if (!result?.success || !result.data) return false
    set({ profile: result.data })
    return true
  },

  clearActivity: async () => {
    const api = await waitForDesktopApi()
    const result = await api?.activity?.clear()
    if (!result?.success) return false
    set({ activity: { days: {} } })
    return true
  }
}))
