import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_CUSTOMIZATION,
  applyThemeCustomization,
  normalizeCustomization,
  runThemeTransition,
  type ThemeCustomization,
  type ThemePreset
} from '@/shared/lib/theme-engine'

export type VisualTheme =
  | 'default'
  | 'modern'
  | 'midnight'
  | 'professional'
  | 'glass'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'rose'
  | 'minimal'

export type LayoutStyle = 'comfortable' | 'compact' | 'spacious'

/** How primary app navigation is presented */
export type NavChromeStyle = 'sidebar' | 'header'

export const VISUAL_THEME_META: Record<
  VisualTheme,
  { label: string; swatch: string; description: string }
> = {
  default: { label: 'Claude', swatch: 'from-[#C96442] to-[#F0EEE6]', description: 'Warm ivory neutrals with a clay accent' },
  modern: { label: 'Modern', swatch: 'from-indigo-500 to-violet-500', description: 'Indigo violet accents' },
  midnight: { label: 'Midnight', swatch: 'from-slate-900 to-cyan-500', description: 'Deep indigo with cyan glow' },
  professional: { label: 'Professional', swatch: 'from-slate-600 to-blue-700', description: 'Refined slate blue' },
  glass: { label: 'Glass', swatch: 'from-teal-400 to-cyan-300', description: 'Translucent frosted surfaces' },
  ocean: { label: 'Ocean', swatch: 'from-blue-600 to-teal-400', description: 'Cool ocean blues and teals' },
  forest: { label: 'Forest', swatch: 'from-emerald-600 to-green-400', description: 'Natural green tones' },
  sunset: { label: 'Sunset', swatch: 'from-orange-500 to-rose-400', description: 'Warm amber and coral' },
  rose: { label: 'Rose', swatch: 'from-pink-500 to-rose-400', description: 'Soft pink accents' },
  minimal: { label: 'Minimal', swatch: 'from-zinc-600 to-zinc-400', description: 'Monochrome accent on warm neutrals' }
}

export const LAYOUT_STYLE_META: Record<LayoutStyle, { label: string; description: string }> = {
  comfortable: { label: 'Comfortable', description: 'Balanced spacing and rounded corners' },
  compact: { label: 'Compact', description: 'Tighter density for more content' },
  spacious: { label: 'Spacious', description: 'Generous whitespace and soft corners' }
}

export const NAV_CHROME_STYLE_META: Record<NavChromeStyle, { label: string; description: string }> = {
  sidebar: {
    label: 'Sidebar',
    description: 'Classic left navigation rail with collapsible sections'
  },
  header: {
    label: 'Header menus',
    description: 'Hide the sidebar and navigate from top menu categories'
  }
}

function applyVisualTheme(theme: VisualTheme) {
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-visual-theme')
  } else {
    document.documentElement.setAttribute('data-visual-theme', theme)
  }
}

function applyLayoutStyle(style: LayoutStyle) {
  if (style === 'comfortable') {
    document.documentElement.removeAttribute('data-layout-style')
  } else {
    document.documentElement.setAttribute('data-layout-style', style)
  }
}

function isVisualTheme(value: string): value is VisualTheme {
  return value in VISUAL_THEME_META
}

function isLayoutStyle(value: string): value is LayoutStyle {
  return value in LAYOUT_STYLE_META
}

interface UIState {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  visualTheme: VisualTheme
  layoutStyle: LayoutStyle
  navChromeStyle: NavChromeStyle
  themeCustomization: ThemeCustomization
  themePresets: ThemePreset[]
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setVisualTheme: (theme: VisualTheme) => void
  setLayoutStyle: (style: LayoutStyle) => void
  setNavChromeStyle: (style: NavChromeStyle) => void
  /** Patch one or more customization fields and apply them immediately. */
  setThemeCustomization: (patch: Partial<ThemeCustomization>) => void
  resetThemeCustomization: () => void
  /** Re-apply every appearance preference to the DOM (used on app boot). */
  applyAppearance: () => void
  saveThemePreset: (name: string) => ThemePreset
  deleteThemePreset: (id: string) => void
  applyThemePreset: (preset: ThemePreset) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      visualTheme: 'default',
      layoutStyle: 'comfortable',
      navChromeStyle: 'sidebar',
      themeCustomization: DEFAULT_CUSTOMIZATION,
      themePresets: [],

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),

      setVisualTheme: (theme) => {
        runThemeTransition()
        applyVisualTheme(theme)
        set({ visualTheme: theme })
      },

      setLayoutStyle: (style) => {
        applyLayoutStyle(style)
        set({ layoutStyle: style })
      },

      setNavChromeStyle: (style) => set({ navChromeStyle: style }),

      setThemeCustomization: (patch) => {
        const next = normalizeCustomization({ ...get().themeCustomization, ...patch })
        // Color swaps read better with a cross-fade; geometry changes should be instant.
        if ('accent' in patch || 'tintSurfaces' in patch || 'contrast' in patch) {
          runThemeTransition()
        }
        applyThemeCustomization(next)
        set({ themeCustomization: next })
      },

      resetThemeCustomization: () => {
        runThemeTransition()
        applyThemeCustomization(DEFAULT_CUSTOMIZATION)
        set({ themeCustomization: DEFAULT_CUSTOMIZATION })
      },

      applyAppearance: () => {
        const { visualTheme, layoutStyle, themeCustomization } = get()
        applyVisualTheme(visualTheme)
        applyLayoutStyle(layoutStyle)
        applyThemeCustomization(themeCustomization)
      },

      saveThemePreset: (name) => {
        const { visualTheme, layoutStyle, themeCustomization, themePresets } = get()
        const preset: ThemePreset = {
          id: `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          name: name.trim() || 'Untitled theme',
          createdAt: Date.now(),
          customization: themeCustomization,
          visualTheme,
          layoutStyle
        }
        set({ themePresets: [preset, ...themePresets] })
        return preset
      },

      deleteThemePreset: (id) => {
        set({ themePresets: get().themePresets.filter((p) => p.id !== id) })
      },

      applyThemePreset: (preset) => {
        const customization = normalizeCustomization(preset.customization)
        const visualTheme = isVisualTheme(preset.visualTheme) ? preset.visualTheme : 'default'
        const layoutStyle = isLayoutStyle(preset.layoutStyle) ? preset.layoutStyle : 'comfortable'

        runThemeTransition()
        applyVisualTheme(visualTheme)
        applyLayoutStyle(layoutStyle)
        applyThemeCustomization(customization)
        set({ visualTheme, layoutStyle, themeCustomization: customization })
      }
    }),
    {
      name: 'ai-studio-ui',
      version: 2,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        visualTheme: state.visualTheme,
        layoutStyle: state.layoutStyle,
        navChromeStyle: state.navChromeStyle,
        themeCustomization: state.themeCustomization,
        themePresets: state.themePresets
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<UIState>
        if (version < 2) {
          return { ...state, themeCustomization: DEFAULT_CUSTOMIZATION, themePresets: [] } as UIState
        }
        return state as UIState
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        applyVisualTheme(state.visualTheme ?? 'default')
        applyLayoutStyle(state.layoutStyle ?? 'comfortable')
        applyThemeCustomization(normalizeCustomization(state.themeCustomization))
      }
    }
  )
)
