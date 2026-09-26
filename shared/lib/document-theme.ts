/** Document appearance themes and page layout — shared by editor and export. */

import type { DocumentPageSettings } from '@shared/types'

export const DOCUMENT_THEME_IDS = [
  'professional',
  'modern',
  'soft-ui',
  'corporate',
  'classic',
  'compact',
  'executive',
  'ocean',
  'forest',
  'sunset',
  'lavender',
  'minimal'
] as const

export type DocumentThemeId = (typeof DOCUMENT_THEME_IDS)[number]

export const LAYOUT_PRESET_IDS = [
  'normal',
  'narrow',
  'wide',
  'compact',
  'comfortable',
  'manuscript',
  'custom'
] as const

export type LayoutPresetId = (typeof LAYOUT_PRESET_IDS)[number]

export interface DocumentPadding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface DocumentThemeDefinition {
  id: DocumentThemeId
  label: string
  description: string
  bg: string
  text: string
  heading1Color: string
  heading2Color: string
  heading3Color: string
  accentColor: string
  fontFamily: string
  bodyFontSize: number
  h1Size: number
  h2Size: number
  h3Size: number
  lineHeight: number
  h2Border: boolean
  h2Underline: boolean
  coverAccent: string
}

export interface LayoutPresetDefinition {
  id: LayoutPresetId
  label: string
  description: string
  padding: DocumentPadding
}

export const DEFAULT_PADDING: DocumentPadding = {
  top: 56,
  right: 64,
  bottom: 72,
  left: 64
}

export const LAYOUT_PRESETS: LayoutPresetDefinition[] = [
  {
    id: 'normal',
    label: 'Normal',
    description: 'Standard business margins',
    padding: { top: 56, right: 64, bottom: 72, left: 64 }
  },
  {
    id: 'narrow',
    label: 'Narrow',
    description: 'Wide content area, smaller side margins',
    padding: { top: 48, right: 48, bottom: 56, left: 48 }
  },
  {
    id: 'wide',
    label: 'Wide',
    description: 'Maximum content width',
    padding: { top: 40, right: 40, bottom: 48, left: 40 }
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Dense layout for short documents',
    padding: { top: 24, right: 28, bottom: 28, left: 28 }
  },
  {
    id: 'comfortable',
    label: 'Comfortable',
    description: 'Extra breathing room',
    padding: { top: 64, right: 80, bottom: 80, left: 80 }
  },
  {
    id: 'manuscript',
    label: 'Manuscript',
    description: 'Academic-style wide margins',
    padding: { top: 96, right: 112, bottom: 96, left: 112 }
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Manually adjusted margins',
    padding: DEFAULT_PADDING
  }
]

export const DOCUMENT_THEMES: DocumentThemeDefinition[] = [
  {
    id: 'professional',
    label: 'Professional',
    description: 'Clean business document with structured headings',
    bg: '#ffffff',
    text: '#1a1a2e',
    heading1Color: '#1e3a5f',
    heading2Color: '#1e3a5f',
    heading3Color: '#334155',
    accentColor: '#2563eb',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFontSize: 13,
    h1Size: 26,
    h2Size: 18,
    h3Size: 15,
    lineHeight: 1.65,
    h2Border: true,
    h2Underline: false,
    coverAccent: '2563EB'
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Editorial typography with refined indigo accents',
    bg: '#fcfcff',
    text: '#1f2937',
    heading1Color: '#111827',
    heading2Color: '#4f46e5',
    heading3Color: '#374151',
    accentColor: '#6366f1',
    fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
    bodyFontSize: 14,
    h1Size: 30,
    h2Size: 20,
    h3Size: 15.5,
    lineHeight: 1.72,
    h2Border: false,
    h2Underline: false,
    coverAccent: '6366F1'
  },
  {
    id: 'soft-ui',
    label: 'Soft UI',
    description: 'Gentle tones with rounded, approachable feel',
    bg: '#f8f9fb',
    text: '#334155',
    heading1Color: '#475569',
    heading2Color: '#64748b',
    heading3Color: '#64748b',
    accentColor: '#6366f1',
    fontFamily: "'Inter', 'Nunito Sans', system-ui, sans-serif",
    bodyFontSize: 13,
    h1Size: 24,
    h2Size: 17,
    h3Size: 14,
    lineHeight: 1.75,
    h2Border: false,
    h2Underline: false,
    coverAccent: '6366F1'
  },
  {
    id: 'corporate',
    label: 'Corporate',
    description: 'Formal enterprise style with tight structure',
    bg: '#ffffff',
    text: '#111827',
    heading1Color: '#111827',
    heading2Color: '#1f2937',
    heading3Color: '#374151',
    accentColor: '#1e40af',
    fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif",
    bodyFontSize: 12.5,
    h1Size: 24,
    h2Size: 16,
    h3Size: 14,
    lineHeight: 1.55,
    h2Border: true,
    h2Underline: false,
    coverAccent: '1E40AF'
  },
  {
    id: 'classic',
    label: 'Classic',
    description: 'Traditional serif-inspired formal document',
    bg: '#fffef9',
    text: '#1c1917',
    heading1Color: '#1c1917',
    heading2Color: '#292524',
    heading3Color: '#44403c',
    accentColor: '#78350f',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    bodyFontSize: 13,
    h1Size: 26,
    h2Size: 18,
    h3Size: 15,
    lineHeight: 1.8,
    h2Border: false,
    h2Underline: true,
    coverAccent: '78350F'
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Dense sans-serif layout for scanning long specs',
    bg: '#ffffff',
    text: '#1e293b',
    heading1Color: '#0f172a',
    heading2Color: '#1e293b',
    heading3Color: '#334155',
    accentColor: '#0f766e',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFontSize: 12,
    h1Size: 20,
    h2Size: 14.5,
    h3Size: 12.5,
    lineHeight: 1.45,
    h2Border: true,
    h2Underline: false,
    coverAccent: '0F766E'
  },
  {
    id: 'executive',
    label: 'Executive',
    description: 'Navy and gold leadership-ready presentation',
    bg: '#fffdf8',
    text: '#172033',
    heading1Color: '#102a43',
    heading2Color: '#163a5f',
    heading3Color: '#52616f',
    accentColor: '#b7791f',
    fontFamily: "'Aptos', 'Segoe UI', system-ui, sans-serif",
    bodyFontSize: 13,
    h1Size: 27,
    h2Size: 18,
    h3Size: 14.5,
    lineHeight: 1.65,
    h2Border: true,
    h2Underline: false,
    coverAccent: 'B7791F'
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Calm blue palette for technical documentation',
    bg: '#f8fcff',
    text: '#16324f',
    heading1Color: '#0b3954',
    heading2Color: '#087e8b',
    heading3Color: '#315b72',
    accentColor: '#00a6a6',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFontSize: 13,
    h1Size: 27,
    h2Size: 18,
    h3Size: 14.5,
    lineHeight: 1.68,
    h2Border: false,
    h2Underline: false,
    coverAccent: '00A6A6'
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Natural green tone with quiet contrast',
    bg: '#fbfdf9',
    text: '#24352b',
    heading1Color: '#1b4332',
    heading2Color: '#2d6a4f',
    heading3Color: '#52796f',
    accentColor: '#40916c',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFontSize: 13,
    h1Size: 26,
    h2Size: 18,
    h3Size: 14.5,
    lineHeight: 1.7,
    h2Border: true,
    h2Underline: false,
    coverAccent: '40916C'
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm editorial palette for proposals and briefs',
    bg: '#fffaf5',
    text: '#3b2723',
    heading1Color: '#7f1d1d',
    heading2Color: '#c2410c',
    heading3Color: '#9a3412',
    accentColor: '#ea580c',
    fontFamily: "'Aptos', 'Inter', system-ui, sans-serif",
    bodyFontSize: 13.5,
    h1Size: 28,
    h2Size: 19,
    h3Size: 15,
    lineHeight: 1.7,
    h2Border: false,
    h2Underline: false,
    coverAccent: 'EA580C'
  },
  {
    id: 'lavender',
    label: 'Lavender',
    description: 'Polished violet theme for product documents',
    bg: '#fdfbff',
    text: '#30263d',
    heading1Color: '#4c1d95',
    heading2Color: '#6d28d9',
    heading3Color: '#6b5b7b',
    accentColor: '#8b5cf6',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFontSize: 13,
    h1Size: 27,
    h2Size: 18,
    h3Size: 14.5,
    lineHeight: 1.72,
    h2Border: false,
    h2Underline: false,
    coverAccent: '8B5CF6'
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Pure monochrome typography with no visual noise',
    bg: '#ffffff',
    text: '#18181b',
    heading1Color: '#09090b',
    heading2Color: '#18181b',
    heading3Color: '#3f3f46',
    accentColor: '#27272a',
    fontFamily: "'Helvetica', 'Arial', sans-serif",
    bodyFontSize: 13,
    h1Size: 25,
    h2Size: 17,
    h3Size: 14,
    lineHeight: 1.62,
    h2Border: false,
    h2Underline: false,
    coverAccent: '27272A'
  }
]

export const EDITOR_PAGE_WIDTH_PX = 816
export const PDF_PAGE_WIDTH_PT = 595.28
export const PDF_PAGE_HEIGHT_PT = 841.89

export function getDocumentTheme(id?: string | null): DocumentThemeDefinition {
  const found = DOCUMENT_THEMES.find((t) => t.id === id)
  return found ?? DOCUMENT_THEMES[0]
}

/** Apply saved color and typography overrides to a preset theme. */
export function resolveDocumentTheme(
  id?: string | null,
  settings?: Partial<DocumentPageSettings> | null
): DocumentThemeDefinition {
  const base = getDocumentTheme(id)
  if (!settings) return base
  const accent = settings.accentColor || base.accentColor
  return {
    ...base,
    bg: settings.pageColor || base.bg,
    text: settings.textColor || base.text,
    accentColor: accent,
    heading2Color: settings.accentColor || base.heading2Color,
    coverAccent: accent.replace('#', '').toUpperCase(),
    fontFamily: settings.fontFamily || base.fontFamily,
    bodyFontSize: settings.bodyFontSize || base.bodyFontSize,
    lineHeight: settings.lineHeight || base.lineHeight,
    h2Border: settings.headingStyle && settings.headingStyle !== 'theme' ? false : base.h2Border,
    h2Underline:
      settings.headingStyle === 'underline'
        ? true
        : settings.headingStyle && settings.headingStyle !== 'theme'
          ? false
          : base.h2Underline
  }
}

export function getLayoutPreset(id?: string | null): LayoutPresetDefinition {
  const found = LAYOUT_PRESETS.find((p) => p.id === id)
  return found ?? LAYOUT_PRESETS[0]
}

export function resolveDocumentPadding(doc: {
  layoutPreset?: string | null
  paddingTop?: number | null
  paddingRight?: number | null
  paddingBottom?: number | null
  paddingLeft?: number | null
}): DocumentPadding {
  if (
    doc.paddingTop != null &&
    doc.paddingRight != null &&
    doc.paddingBottom != null &&
    doc.paddingLeft != null
  ) {
    return {
      top: doc.paddingTop,
      right: doc.paddingRight,
      bottom: doc.paddingBottom,
      left: doc.paddingLeft
    }
  }
  return getLayoutPreset(doc.layoutPreset).padding
}

export function paddingToCssVars(padding: DocumentPadding): Record<string, string> {
  return {
    '--doc-pad-top': `${padding.top}px`,
    '--doc-pad-right': `${padding.right}px`,
    '--doc-pad-bottom': `${padding.bottom}px`,
    '--doc-pad-left': `${padding.left}px`
  }
}

/** First installed-safe font name for Word / LibreOffice DOCX runs. */
export function docxFontFromCss(fontFamily: string): string {
  const first = fontFamily.split(',')[0]?.replace(/['"]/g, '').trim() || 'Calibri'
  const mapped: Record<string, string> = {
    Inter: 'Calibri',
    'Segoe UI': 'Calibri',
    'SF Pro Display': 'Calibri',
    'system-ui': 'Calibri',
    'Nunito Sans': 'Calibri',
    Helvetica: 'Arial',
    Aptos: 'Aptos'
  }
  return mapped[first] ?? first
}

export function themeToCssVars(theme: DocumentThemeDefinition): Record<string, string> {
  return {
    '--doc-font-family': theme.fontFamily,
    '--doc-body-size': `${theme.bodyFontSize}px`,
    '--doc-line-height': String(theme.lineHeight),
    '--doc-h1-size': `${theme.h1Size}px`,
    '--doc-h2-size': `${theme.h2Size}px`,
    '--doc-h3-size': `${theme.h3Size}px`,
    '--doc-h1-color': theme.heading1Color,
    '--doc-h2-color': theme.heading2Color,
    '--doc-h3-color': theme.heading3Color,
    '--doc-accent': theme.accentColor,
    '--doc-h2-border': theme.h2Border ? '1px solid #e2e8f0' : 'none',
    '--doc-page-bg': theme.bg,
    '--doc-page-text': theme.text
  }
}

export function getDocumentAppearanceStyle(
  themeId?: string | null,
  padding?: DocumentPadding
): Record<string, string> {
  const theme = getDocumentTheme(themeId)
  const pad = padding ?? DEFAULT_PADDING
  return {
    backgroundColor: theme.bg,
    color: theme.text,
    ...themeToCssVars(theme),
    ...paddingToCssVars(pad)
  }
}

/** Convert editor px margins to PDF points. */
export function paddingToPdfMargins(padding: DocumentPadding): {
  top: number
  right: number
  bottom: number
  left: number
} {
  const scale = PDF_PAGE_WIDTH_PT / EDITOR_PAGE_WIDTH_PX
  return {
    top: padding.top * scale,
    right: padding.right * scale,
    bottom: padding.bottom * scale,
    left: padding.left * scale
  }
}

/** Convert editor px margins to DOCX twips (1 px ≈ 15 twips at 96 dpi). */
export function paddingToDocxTwips(padding: DocumentPadding): {
  top: number
  right: number
  bottom: number
  left: number
} {
  const pxToTwip = 15
  return {
    top: Math.round(padding.top * pxToTwip),
    right: Math.round(padding.right * pxToTwip),
    bottom: Math.round(padding.bottom * pxToTwip),
    left: Math.round(padding.left * pxToTwip)
  }
}

export function hexToPdfRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

export function matchLayoutPreset(padding: DocumentPadding): LayoutPresetId {
  for (const preset of LAYOUT_PRESETS) {
    if (preset.id === 'custom') continue
    const p = preset.padding
    if (
      p.top === padding.top &&
      p.right === padding.right &&
      p.bottom === padding.bottom &&
      p.left === padding.left
    ) {
      return preset.id
    }
  }
  return 'custom'
}

/** @deprecated use DocumentThemeId */
export type PageThemeId = DocumentThemeId

/** @deprecated use DOCUMENT_THEMES */
export const PAGE_THEMES = DOCUMENT_THEMES.map((t) => ({
  id: t.id,
  label: t.label,
  bg: t.bg,
  text: t.text
}))
