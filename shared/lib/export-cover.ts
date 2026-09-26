import type {
  ExportClassification,
  ExportCoverStyle,
  ExportImageQuality,
  ExportOrientation,
  ExportPageSize,
  ExportWatermarkStyle
} from '@shared/types'

export const EXPORT_COVER_STYLES: Array<{
  id: ExportCoverStyle
  label: string
  description: string
}> = [
  { id: 'modern', label: 'Modern', description: 'Centered title with an accent bar' },
  { id: 'minimal', label: 'Minimal', description: 'Quiet layout anchored at the bottom' },
  { id: 'corporate', label: 'Corporate', description: 'Full-bleed brand panel' },
  { id: 'split', label: 'Split', description: 'Color rail with title on the right' },
  { id: 'editorial', label: 'Editorial', description: 'Magazine band and large type' },
  { id: 'classic', label: 'Classic', description: 'Traditional rules around the title' },
  { id: 'bold', label: 'Bold', description: 'Accent wash with oversized type' }
]

export const EXPORT_COVER_STYLE_IDS = EXPORT_COVER_STYLES.map((style) => style.id)

export const COVER_ACCENT_PRESETS = [
  { id: 'theme', label: 'Theme', value: '' },
  { id: 'navy', label: 'Navy', value: '#1e3a5f' },
  { id: 'blue', label: 'Blue', value: '#2563eb' },
  { id: 'indigo', label: 'Indigo', value: '#4f46e5' },
  { id: 'teal', label: 'Teal', value: '#0f766e' },
  { id: 'forest', label: 'Forest', value: '#166534' },
  { id: 'burgundy', label: 'Burgundy', value: '#9f1239' },
  { id: 'slate', label: 'Slate', value: '#334155' }
] as const

export const EXPORT_PAGE_SIZES: Record<
  ExportPageSize,
  {
    id: ExportPageSize
    label: string
    description: string
    widthPx: number
    heightPx: number
    electron: 'Letter' | 'A4'
    docxTwips: { width: number; height: number }
  }
> = {
  letter: {
    id: 'letter',
    label: 'Letter',
    description: 'US 8.5 × 11 in',
    widthPx: 816,
    heightPx: 1056,
    electron: 'Letter',
    docxTwips: { width: 12240, height: 15840 }
  },
  a4: {
    id: 'a4',
    label: 'A4',
    description: 'ISO 210 × 297 mm',
    widthPx: 794,
    heightPx: 1123,
    electron: 'A4',
    docxTwips: { width: 11906, height: 16838 }
  }
}

export const WATERMARK_LABELS: Record<Exclude<ExportWatermarkStyle, 'custom'>, string> = {
  confidential: 'CONFIDENTIAL',
  draft: 'DRAFT',
  internal: 'INTERNAL USE'
}

export const CLASSIFICATION_META: Record<
  ExportClassification,
  { label: string; color: string; background: string }
> = {
  none: { label: '', color: '', background: '' },
  confidential: { label: 'Confidential', color: '#991b1b', background: '#fef2f2' },
  internal: { label: 'Internal use only', color: '#92400e', background: '#fffbeb' },
  draft: { label: 'Draft', color: '#1e40af', background: '#eff6ff' },
  public: { label: 'Public', color: '#166534', background: '#f0fdf4' }
}

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/

export function parseExportCoverStyle(value: unknown): ExportCoverStyle {
  return EXPORT_COVER_STYLE_IDS.includes(value as ExportCoverStyle)
    ? (value as ExportCoverStyle)
    : 'modern'
}

export function parseExportWatermarkStyle(value: unknown): ExportWatermarkStyle {
  return value === 'draft' || value === 'internal' || value === 'custom' ? value : 'confidential'
}

export function parseExportClassification(value: unknown): ExportClassification {
  return value === 'confidential' || value === 'internal' || value === 'draft' || value === 'public'
    ? value
    : 'none'
}

export const COVER_FONTS = [
  { id: 'theme', label: 'Theme', value: '' },
  { id: 'sans', label: 'Sans', value: 'Inter, Segoe UI, sans-serif' },
  { id: 'serif', label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { id: 'times', label: 'Times', value: '"Times New Roman", Times, serif' },
  { id: 'calibri', label: 'Calibri', value: 'Calibri, Carlito, sans-serif' }
] as const

export const IMAGE_QUALITY_PRESETS: Record<
  ExportImageQuality,
  { label: string; jpeg: number; maxEdge: number }
> = {
  high: { label: 'High', jpeg: 0.92, maxEdge: 2200 },
  standard: { label: 'Standard', jpeg: 0.78, maxEdge: 1600 },
  compact: { label: 'Compact', jpeg: 0.55, maxEdge: 1100 }
}

export function parseExportPageSize(value: unknown): ExportPageSize {
  return value === 'a4' ? 'a4' : 'letter'
}

export function parseExportOrientation(value: unknown): ExportOrientation {
  return value === 'landscape' ? 'landscape' : 'portrait'
}

export function parseExportImageQuality(value: unknown): ExportImageQuality {
  return value === 'high' || value === 'compact' ? value : 'standard'
}

export function parseCoverOverlay(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 40
  return Math.min(80, Math.max(0, Math.round(n)))
}

export function resolveCoverFont(themeFont: string, override?: string | null): string {
  const candidate = override?.trim() ?? ''
  return candidate || themeFont
}

export function resolveExportPageBox(
  pageSize: ExportPageSize,
  orientation: ExportOrientation = 'portrait'
): {
  widthPx: number
  heightPx: number
  docxTwips: { width: number; height: number }
  electron: 'Letter' | 'A4'
  landscape: boolean
} {
  const base = EXPORT_PAGE_SIZES[pageSize]
  const landscape = orientation === 'landscape'
  return {
    widthPx: landscape ? base.heightPx : base.widthPx,
    heightPx: landscape ? base.widthPx : base.heightPx,
    docxTwips: landscape
      ? { width: base.docxTwips.height, height: base.docxTwips.width }
      : base.docxTwips,
    electron: base.electron,
    landscape
  }
}

export function resolveCoverAccent(themeAccent: string, override?: string | null): string {
  const candidate = override?.trim() ?? ''
  return HEX_COLOR.test(candidate) ? candidate : themeAccent
}

export function resolveWatermarkText(
  style: ExportWatermarkStyle,
  customText?: string | null
): string {
  if (style === 'custom') {
    const custom = customText?.trim()
    return custom ? custom.toUpperCase() : 'DRAFT'
  }
  return WATERMARK_LABELS[style]
}

export function escapeExportHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface CoverHtmlInput {
  style: ExportCoverStyle
  accent: string
  heading1Color: string
  bg: string
  text: string
  muted: string
  fontFamily: string
  h1Size: number
  companyName: string
  companyLogo: string
  showLogo: boolean
  projectName: string
  title: string
  typeLabel: string
  subtitle: string
  preparedBy: string
  themeLabel: string
  dateLabel: string
  backgroundImage?: string
  overlay?: number
}

function isSafeImageSrc(src: string): boolean {
  return src.startsWith('data:image/')
}

function isSafeLogoSrc(src: string): boolean {
  return isSafeImageSrc(src)
}

export function buildCoverCss(): string {
  return `
.cover {
  --cover-accent: inherit;
  --cover-bg: inherit;
  --cover-text: inherit;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 245mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--cover-bg);
  color: var(--cover-text);
  font-family: var(--cover-font, inherit);
  page-break-after: always;
  break-after: page;
}
.cover-photo,
.cover-photo-scrim {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
.cover-photo {
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
.cover-photo-scrim { background: #0f172a; }
.cover.has-photo { color: #ffffff; }
.cover.has-photo .cover-company,
.cover.has-photo .cover-title,
.cover.has-photo .cover-type { color: #ffffff; }
.cover.has-photo .cover-project,
.cover.has-photo .cover-subtitle,
.cover.has-photo .cover-meta,
.cover.has-photo .cover-prepared { color: rgba(255,255,255,.86); }
.cover.has-photo.cover-corporate,
.cover.has-photo.cover-bold { background: transparent; }
.cover.has-photo.cover-split .cover-rail { background: color-mix(in srgb, var(--cover-accent) 82%, transparent); }
.cover.has-photo.cover-editorial::before { opacity: 0.86; }
.cover-rail { display: none; }
.cover-inner { position: relative; z-index: 1; width: 100%; max-width: 78%; }
.cover-logo { max-height: 52px; max-width: 200px; object-fit: contain; margin: 0 auto 22px; display: block; }
.cover-accent-bar {
  width: 64px; height: 6px; border-radius: 99px;
  background: var(--cover-accent); margin: 0 auto 28px;
}
.cover-company {
  font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--cover-accent); margin: 0 0 10px;
}
.cover-project { font-size: 14px; margin: 0 0 18px; opacity: 0.72; }
.cover-title { font-weight: 700; line-height: 1.12; margin: 0 0 14px; letter-spacing: -0.03em; }
.cover-subtitle { font-size: 16px; font-weight: 500; margin: 0 0 18px; opacity: 0.78; }
.cover-type { font-size: 15px; font-weight: 700; color: var(--cover-accent); margin: 0 0 8px; }
.cover-meta { font-size: 12px; margin: 22px 0 0; opacity: 0.58; }
.cover-prepared { font-size: 12px; margin: 10px 0 0; opacity: 0.7; }

.cover-minimal { align-items: flex-start; justify-content: flex-end; text-align: left; padding: 12% 14% 16%; }
.cover-minimal .cover-inner { max-width: 100%; }
.cover-minimal .cover-accent-bar { margin: 0 0 28px; width: 96px; }
.cover-minimal .cover-logo { margin: 0 0 22px; }

.cover-corporate, .cover-bold { color: #ffffff; }
.cover-corporate { background: var(--cover-heading, #0f172a); }
.cover-corporate .cover-company,
.cover-corporate .cover-title,
.cover-corporate .cover-type { color: #ffffff; }
.cover-corporate .cover-accent-bar { background: var(--cover-accent); }
.cover-corporate .cover-project,
.cover-corporate .cover-subtitle,
.cover-corporate .cover-meta,
.cover-corporate .cover-prepared { color: rgba(255,255,255,.78); }

.cover-bold {
  background: var(--cover-accent);
  align-items: flex-start;
  justify-content: flex-end;
  text-align: left;
  padding: 12% 12% 14%;
}
.cover-bold .cover-inner { max-width: 100%; }
.cover-bold .cover-company,
.cover-bold .cover-title,
.cover-bold .cover-type { color: #ffffff; }
.cover-bold .cover-accent-bar { background: rgba(255,255,255,.85); margin: 0 0 28px; width: 72px; }
.cover-bold .cover-project,
.cover-bold .cover-subtitle,
.cover-bold .cover-meta,
.cover-bold .cover-prepared { color: rgba(255,255,255,.82); }
.cover-bold .cover-title { font-size: 1.18em; }

.cover-split {
  display: grid;
  grid-template-columns: 36% 1fr;
  align-items: stretch;
  justify-content: stretch;
  text-align: left;
  padding: 0;
}
.cover-split .cover-rail {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 14px;
  background: var(--cover-accent);
  color: #ffffff;
  padding: 12% 10% 14%;
}
.cover-split .cover-rail .cover-logo { margin: 0 0 12px; }
.cover-split .cover-rail .cover-company { color: #ffffff; margin: 0; }
.cover-split .cover-inner { display: flex; flex-direction: column; justify-content: center; padding: 12% 11%; max-width: 100%; }
.cover-split .cover-accent-bar { display: none; }

.cover-editorial { align-items: flex-start; justify-content: flex-end; text-align: left; padding: 0 12% 14%; }
.cover-editorial::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 29%;
  background: var(--cover-accent);
}
.cover-editorial .cover-inner { max-width: 100%; padding-top: 8%; }
.cover-editorial .cover-logo { margin: 0 0 22px; }
.cover-editorial .cover-accent-bar { display: none; }
.cover-editorial .cover-title { max-width: 92%; }

.cover-classic { padding: 12% 14%; }
.cover-classic .cover-accent-bar { display: none; }
.cover-classic .cover-rules {
  display: block;
  width: 72%;
  margin: 18px auto;
  border: 0;
  border-top: 2px solid var(--cover-accent);
  border-bottom: 1px solid var(--cover-accent);
  height: 5px;
  background: transparent;
}
.cover-classic .cover-title { margin: 8px 0; }

.cover-watermark {
  position: absolute;
  inset: 18% 8%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 50;
  opacity: 0.085;
  font-size: 78px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  transform: rotate(-32deg);
  color: #0f172a;
  white-space: nowrap;
}
.classification-banner {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 5;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 7px 12px;
}
body.export-print .classification-banner,
body.export-print .cover-watermark {
  position: fixed;
}
body.export-print.landscape .cover { min-height: 170mm; }
/* Applied only during the isolated first-page PDF pass. Keeping this out of
   normal document flow prevents the cover from shifting later pages. */
body.export-print .cover.cover-print-full-bleed {
  height: 100vh;
  min-height: 100vh;
  max-height: 100vh;
  page-break-after: avoid;
  break-after: avoid;
}
/* Dedicated cover print: title-sheet only — no running header/footer chrome,
   classification banner, watermark, TOC, or body copy. */
body.export-print.cover-print-isolated .classification-banner,
body.export-print.cover-print-isolated .cover-watermark,
body.export-print.cover-print-isolated .toc,
body.export-print.cover-print-isolated main.content {
  display: none !important;
}
`
}

export function buildCoverHtml(input: CoverHtmlInput): string {
  const logo =
    input.showLogo && isSafeLogoSrc(input.companyLogo)
      ? `<img class="cover-logo" src="${escapeExportHtml(input.companyLogo)}" alt="" />`
      : ''
  const company = input.companyName
    ? `<p class="cover-company">${escapeExportHtml(input.companyName)}</p>`
    : ''
  const subtitle = input.subtitle.trim()
    ? `<p class="cover-subtitle">${escapeExportHtml(input.subtitle.trim())}</p>`
    : ''
  const prepared = input.preparedBy.trim()
    ? `<p class="cover-prepared">Prepared by ${escapeExportHtml(input.preparedBy.trim())}</p>`
    : ''
  const rules = input.style === 'classic' ? '<hr class="cover-rules" />' : ''
  const background = input.backgroundImage?.trim() ?? ''
  const hasPhoto = isSafeImageSrc(background)
  const overlay = Math.min(0.8, Math.max(0, (input.overlay ?? 40) / 100))
  const photo = hasPhoto
    ? `<div class="cover-photo" style="background-image:url('${escapeExportHtml(background)}')"></div><div class="cover-photo-scrim" style="opacity:${overlay}"></div>`
    : ''
  const inverted = input.style === 'corporate' || input.style === 'bold' || hasPhoto
  const rail =
    input.style === 'split'
      ? `<aside class="cover-rail">${logo}${company}</aside>`
      : ''

  const innerLogo = input.style === 'split' ? '' : logo
  const innerCompany = input.style === 'split' ? '' : company

  return `<section class="cover cover-${input.style}${hasPhoto ? ' has-photo' : ''}" style="--cover-accent:${escapeExportHtml(input.accent)};--cover-bg:${escapeExportHtml(input.bg)};--cover-text:${escapeExportHtml(input.text)};--cover-heading:${escapeExportHtml(input.heading1Color)};--cover-font:${escapeExportHtml(input.fontFamily)};font-family:${escapeExportHtml(input.fontFamily)};">
    ${photo}
    ${rail}
    <div class="cover-inner">
      ${innerLogo}
      <div class="cover-accent-bar"></div>
      ${innerCompany}
      <p class="cover-project">${escapeExportHtml(input.projectName)}</p>
      ${rules}
      <h1 class="cover-title" style="font-size:${Math.round(input.h1Size * 1.7)}px;color:${inverted ? '#ffffff' : escapeExportHtml(input.heading1Color)}">${escapeExportHtml(input.title)}</h1>
      ${rules}
      ${subtitle}
      <p class="cover-type">${escapeExportHtml(input.typeLabel)}</p>
      <p class="cover-meta">${escapeExportHtml(input.themeLabel)} theme · ${escapeExportHtml(input.dateLabel)}</p>
      ${prepared}
    </div>
  </section>`
}

/** Standalone print document for a clean cover sheet (no header, footer, or overlays). */
export function buildCoverOnlyPrintHtml(input: CoverHtmlInput): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light only" />
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: ${escapeExportHtml(input.bg)};
    color: ${escapeExportHtml(input.text)};
    color-scheme: light only;
  }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  ${buildCoverCss()}
  body.export-print .cover {
    height: 100vh;
    min-height: 100vh;
    max-height: 100vh;
    page-break-after: avoid;
    break-after: avoid;
  }
</style>
</head>
<body class="export-print cover-print-isolated">
  ${buildCoverHtml(input)}
</body>
</html>`
}

export function buildWatermarkHtml(text: string): string {
  if (!text.trim()) return ''
  return `<div class="cover-watermark">${escapeExportHtml(text.trim())}</div>`
}

export function buildClassificationBannerHtml(
  classification: ExportClassification
): string {
  if (classification === 'none') return ''
  const meta = CLASSIFICATION_META[classification]
  return `<div class="classification-banner" style="color:${meta.color};background:${meta.background};">${escapeExportHtml(meta.label)}</div>`
}
