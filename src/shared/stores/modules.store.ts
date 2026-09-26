import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModuleCategoryId, ModulePreferences, SidebarTreeDepth } from '@shared/types/modules'
import { DEFAULT_MODULE_PREFERENCES } from '@shared/types/modules'
import {
  MODULE_REGISTRY,
  getModulesByCategory,
  isModuleEnabled,
  type ModuleDefinition
} from '@/shared/lib/module-registry'

interface ModulesState extends ModulePreferences {
  setModuleEnabled: (id: string, enabled: boolean) => void
  setCategoryEnabled: (category: ModuleCategoryId, enabled: boolean) => void
  setSidebarTreeDepth: (depth: SidebarTreeDepth) => void
  resetToDefaults: () => void
  isEnabled: (id: string) => boolean
  getPreferences: () => ModulePreferences
}

export const useModulesStore = create<ModulesState>()(
  persist(
    (set, get) => ({
      enabled: {},
      sidebarTreeDepth: DEFAULT_MODULE_PREFERENCES.sidebarTreeDepth,

      setModuleEnabled: (id, enabled) => {
        const mod = MODULE_REGISTRY.find((m) => m.id === id)
        if (mod?.required) return
        const updates: Record<string, boolean> = { [id]: enabled }
        if (mod?.isGroup) {
          for (const child of MODULE_REGISTRY.filter((m) => m.parentId === id && !m.required)) {
            updates[child.id] = enabled
          }
        }
        set((s) => ({
          enabled: { ...s.enabled, ...updates }
        }))
      },

      setCategoryEnabled: (category, enabled) => {
        const updates: Record<string, boolean> = {}
        for (const mod of getModulesByCategory(category)) {
          if (!mod.required) updates[mod.id] = enabled
        }
        set((s) => ({
          enabled: { ...s.enabled, ...updates }
        }))
      },

      setSidebarTreeDepth: (depth) => set({ sidebarTreeDepth: depth }),

      resetToDefaults: () =>
        set({
          enabled: {},
          sidebarTreeDepth: DEFAULT_MODULE_PREFERENCES.sidebarTreeDepth
        }),

      isEnabled: (id) => {
        const mod = MODULE_REGISTRY.find((m) => m.id === id)
        if (!mod) return false
        return isModuleEnabled(mod, get().getPreferences())
      },

      getPreferences: () => ({
        enabled: get().enabled,
        sidebarTreeDepth: get().sidebarTreeDepth
      })
    }),
    {
      name: 'ai-workbench-modules',
      partialize: (s) => ({
        enabled: s.enabled,
        sidebarTreeDepth: s.sidebarTreeDepth
      })
    }
  )
)

export function countEnabledInCategory(
  category: ModuleCategoryId,
  preferences: ModulePreferences
): { enabled: number; total: number } {
  const mods = getModulesByCategory(category)
  const total = mods.filter((m) => !m.required).length
  const enabled = mods.filter((m) => !m.required && isModuleEnabled(m, preferences)).length
  return { enabled, total }
}

export function isGroupFullyEnabled(
  group: ModuleDefinition,
  preferences: ModulePreferences
): boolean {
  const children = MODULE_REGISTRY.filter((m) => m.parentId === group.id)
  if (children.length === 0) return isModuleEnabled(group, preferences)
  return children.every((c) => isModuleEnabled(c, preferences))
}
