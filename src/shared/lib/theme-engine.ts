/**
 * Theme engine — turns user preferences into CSS custom properties on <html>.
 *
 * Inline properties set here win over every stylesheet rule, so they layer on
 * top of the base tokens, `[data-visual-theme]` overlays and `.dark` without
 * any of those needing to know about customization.
 */

export type FontChoice = 'inter' | 'system' | 'geometric' | 'serif' | 'mono'
export type ContrastLevel = 'default' | 'high'
export type SurfaceStyle = 'solid' | 'glass'

export interface ThemeCustomization {
  /** Hex accent color, or null to keep the visual theme's own accent. */
  accent: string | null
  /** Corner radius in rem, or null to inherit from the visual theme / density. */
  radius: number | null
  /** Global UI scale multiplier applied to the root font size. */
  uiScale: number
  fontFamily: FontChoice
  /** Tint neutral surfaces (sidebar, muted, accent) with the accent hue. */
  tintSurfaces: boolean
  surface: SurfaceStyle
  contrast: ContrastLevel
  reduceMotion: boolean
  /** Animation speed multiplier — lower is snappier. */
  motionScale: number
}

export interface ThemePreset {
  id: string
  name: string
  createdAt: number
  customization: ThemeCustomization
  visualTheme: string
  layoutStyle: string
}

export const DEFAULT_CUSTOMIZATION: ThemeCustomization = {
  accent: null,
  radius: null,
  uiScale: 1,
  fontFamily: 'inter',
  tintSurfaces: false,
  surface: 'solid',
  contrast: 'default',
  reduceMotion: false,
  motionScale: 1
}

export const FONT_STACKS: Record<FontChoice, { label: string; stack: string; note: string }> = {
  inter: {
    label: 'Inter',
    stack: "Inter, ui-sans-serif, system-ui, 'Segoe UI', sans-serif",
    note: 'Bundled default'
  },
  system: {
    label: 'System',
    stack:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, ui-sans-serif, sans-serif",
    note: 'Native OS font'
  },
  geometric: {
    label: 'Geometric',
    stack: "'Segoe UI Variable Display', 'Avenir Next', Futura, Inter, ui-sans-serif, sans-serif",
    note: 'Wider, rounder'
  },
  serif: {
    label: 'Serif',
    stack: "'Iowan Old Style', Georgia, 'Times New Roman', ui-serif, serif",
    note: 'Editorial feel'
  },
  mono: {
    label: 'Mono',
    stack: "ui-monospace, 'JetBrains Mono', 'Cascadia Code', SFMono-Regular, Consolas, monospace",
    note: 'Fixed width'
  }
}

/** A small, muted set that sits well on the warm neutral base palette. */
export const ACCENT_SWATCHES: { name: string; hex: string }[] = [
  { name: 'Clay', hex: '#c96442' },
  { name: 'Graphite', hex: '#3f3f46' },
  { name: 'Slate', hex: '#475f86' },
  { name: 'Sage', hex: '#5b7a5a' },
  { name: 'Ochre', hex: '#a8792c' },
  { name: 'Plum', hex: '#7a4e6e' }
]

export const UI_SCALE_RANGE = { min: 0.85, max: 1.2, step: 0.01 }
export const RADIUS_RANGE = { min: 0, max: 1.25, step: 0.025 }
export const MOTION_RANGE = { min: 0, max: 1.6, step: 0.05 }

/* ---------------------------------------------------------------- color math */

interface Hsl {
  h: number
  s: number
  l: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function hexToHsl(hex: string): Hsl | null {
  const normalized = hex.trim().replace(/^#/, '')
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null

  const r = parseInt(expanded.slice(0, 2), 16) / 255
  const g = parseInt(expanded.slice(2, 4), 16) / 255
  const b = parseInt(expanded.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2

  let h = 0
  let s = 0
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = s / 100
  const lig = l / 100
  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lig - c / 2

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const fmt = ({ h, s, l }: Hsl) => `${h} ${s}% ${l}%`

/**
 * Dark surfaces need a lighter, slightly less saturated accent to hold the same
 * perceived weight as on white.
 */
function tuneForMode(hsl: Hsl, isDark: boolean): Hsl {
  if (!isDark) {
    return { h: hsl.h, s: hsl.s, l: clamp(hsl.l, 18, 58) }
  }
  const lifted = hsl.l < 45 ? hsl.l + 26 : hsl.l + 8
  return { h: hsl.h, s: clamp(hsl.s - 6, 0, 100), l: clamp(lifted, 48, 82) }
}

/** Pick a foreground that stays legible on the given accent. */
function readableOn(hsl: Hsl): Hsl {
  // Perceived lightness — yellows and greens read brighter than blues at equal L.
  const hueWeight = Math.cos(((hsl.h - 90) * Math.PI) / 180) * 8
  const perceived = hsl.l + hueWeight * (hsl.s / 100)
  return perceived > 58 ? { h: hsl.h, s: 20, l: 10 } : { h: 0, s: 0, l: 100 }
}

/* -------------------------------------------------------------- application */

const ACCENT_PROPS = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-ring',
  '--glow-violet',
  '--chart-1'
] as const

const TINT_PROPS = ['--sidebar', '--sidebar-accent', '--muted', '--accent', '--secondary'] as const

let current: ThemeCustomization = DEFAULT_CUSTOMIZATION

export function getCurrentCustomization(): ThemeCustomization {
  return current
}

export function normalizeCustomization(value: unknown): ThemeCustomization {
  const input = (value ?? {}) as Partial<ThemeCustomization>
  const accent = typeof input.accent === 'string' && hexToHsl(input.accent) ? input.accent : null
  return {
    accent,
    radius:
      typeof input.radius === 'number'
        ? clamp(input.radius, RADIUS_RANGE.min, RADIUS_RANGE.max)
        : null,
    uiScale:
      typeof input.uiScale === 'number'
        ? clamp(input.uiScale, UI_SCALE_RANGE.min, UI_SCALE_RANGE.max)
        : 1,
    fontFamily: input.fontFamily && input.fontFamily in FONT_STACKS ? input.fontFamily : 'inter',
    tintSurfaces: Boolean(input.tintSurfaces),
    surface: input.surface === 'glass' ? 'glass' : 'solid',
    contrast: input.contrast === 'high' ? 'high' : 'default',
    reduceMotion: Boolean(input.reduceMotion),
    motionScale:
      typeof input.motionScale === 'number'
        ? clamp(input.motionScale, MOTION_RANGE.min, MOTION_RANGE.max)
        : 1
  }
}

export function applyThemeCustomization(customization: ThemeCustomization): void {
  current = customization
  refreshThemeCustomization()
}

/**
 * Re-applies the cached customization. Accent lightness depends on whether dark
 * mode is active, so this must run again whenever the color mode flips.
 */
export function refreshThemeCustomization(): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const style = root.style
  const isDark = root.classList.contains('dark')
  const c = current

  const accentHsl = c.accent ? hexToHsl(c.accent) : null
  if (accentHsl) {
    const accent = tuneForMode(accentHsl, isDark)
    const onAccent = readableOn(accent)
    style.setProperty('--primary', fmt(accent))
    style.setProperty('--primary-foreground', fmt(onAccent))
    style.setProperty('--ring', fmt(accent))
    style.setProperty('--sidebar-primary', fmt(accent))
    style.setProperty('--sidebar-primary-foreground', fmt(onAccent))
    style.setProperty('--sidebar-ring', fmt(accent))
    style.setProperty('--glow-violet', fmt({ ...accent, l: clamp(accent.l + 6, 0, 92) }))
    style.setProperty('--chart-1', fmt(accent))

    if (c.tintSurfaces) {
      const tint = (l: number, s: number) => fmt({ h: accent.h, s, l })
      if (isDark) {
        style.setProperty('--sidebar', tint(11, 18))
        style.setProperty('--sidebar-accent', tint(17, 16))
        style.setProperty('--muted', tint(16, 14))
        style.setProperty('--accent', tint(18, 14))
        style.setProperty('--secondary', tint(17, 14))
      } else {
        style.setProperty('--sidebar', tint(96, 32))
        style.setProperty('--sidebar-accent', tint(92, 30))
        style.setProperty('--muted', tint(97, 32))
        style.setProperty('--accent', tint(95, 30))
        style.setProperty('--secondary', tint(95, 28))
      }
    } else {
      TINT_PROPS.forEach((prop) => style.removeProperty(prop))
    }
  } else {
    ACCENT_PROPS.forEach((prop) => style.removeProperty(prop))
    TINT_PROPS.forEach((prop) => style.removeProperty(prop))
  }

  if (c.radius === null) {
    style.removeProperty('--radius')
  } else {
    style.setProperty('--radius', `${c.radius}rem`)
  }

  style.setProperty('--ui-scale', String(c.uiScale))
  style.setProperty('--font-sans', FONT_STACKS[c.fontFamily].stack)
  style.setProperty('--motion-scale', String(c.reduceMotion ? 0 : c.motionScale))

  toggleAttr(root, 'data-surface', c.surface === 'glass' ? 'glass' : null)
  toggleAttr(root, 'data-contrast', c.contrast === 'high' ? 'high' : null)
  toggleAttr(root, 'data-reduce-motion', c.reduceMotion ? 'true' : null)
}

function toggleAttr(el: HTMLElement, name: string, value: string | null) {
  if (value === null) el.removeAttribute(name)
  else el.setAttribute(name, value)
}

/**
 * Cross-fades the whole window on theme changes so switching mode or accent
 * doesn't snap. Hover/focus transitions stay untouched the rest of the time.
 */
let transitionTimer: ReturnType<typeof setTimeout> | null = null

export function runThemeTransition(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (root.getAttribute('data-reduce-motion') === 'true') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  root.classList.add('theme-switching')
  if (transitionTimer) clearTimeout(transitionTimer)
  transitionTimer = setTimeout(() => {
    root.classList.remove('theme-switching')
    transitionTimer = null
  }, 240)
}

/* ------------------------------------------------------------ import/export */

export interface ThemeExport {
  kind: 'requirement-studio-theme'
  version: 1
  name: string
  visualTheme: string
  layoutStyle: string
  customization: ThemeCustomization
}

export function serializeTheme(payload: Omit<ThemeExport, 'kind' | 'version'>): string {
  return JSON.stringify({ kind: 'requirement-studio-theme', version: 1, ...payload }, null, 2)
}

export function parseTheme(raw: string): Omit<ThemeExport, 'kind' | 'version'> | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ThemeExport>
    if (parsed.kind !== 'requirement-studio-theme') return null
    return {
      name: typeof parsed.name === 'string' ? parsed.name : 'Imported theme',
      visualTheme: typeof parsed.visualTheme === 'string' ? parsed.visualTheme : 'default',
      layoutStyle: typeof parsed.layoutStyle === 'string' ? parsed.layoutStyle : 'comfortable',
      customization: normalizeCustomization(parsed.customization)
    }
  } catch {
    return null
  }
}
