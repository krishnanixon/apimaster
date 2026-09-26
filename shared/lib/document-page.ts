import type { DocumentPageSettings, PageOrientation, PageSizeId } from '@shared/types'

export const DEFAULT_PAGE_SETTINGS: DocumentPageSettings = {
  pageSize: 'letter',
  orientation: 'portrait',
  headerText: '',
  footerText: '',
  showPageNumbers: true,
  differentFirstPage: false
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function numberInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined
}

export const PAGE_SIZE_OPTIONS: Array<{
  id: PageSizeId
  label: string
  description: string
  widthPx: number
  heightPx: number
  cssSize: string
}> = [
  {
    id: 'a4',
    label: 'A4',
    description: '210 × 297 mm',
    widthPx: 794,
    heightPx: 1123,
    cssSize: 'A4'
  },
  {
    id: 'letter',
    label: 'Letter',
    description: '8.5 × 11 in',
    widthPx: 816,
    heightPx: 1056,
    cssSize: 'letter'
  },
  {
    id: 'legal',
    label: 'Legal',
    description: '8.5 × 14 in',
    widthPx: 816,
    heightPx: 1344,
    cssSize: 'legal'
  }
]

export function isPageSizeId(value: unknown): value is PageSizeId {
  return value === 'a4' || value === 'letter' || value === 'legal'
}

export function isPageOrientation(value: unknown): value is PageOrientation {
  return value === 'portrait' || value === 'landscape'
}

export function parsePageSettings(raw: unknown): DocumentPageSettings {
  let parsed: Record<string, unknown> = {}
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const value = JSON.parse(raw) as unknown
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>
      }
    } catch {
      parsed = {}
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = raw as Record<string, unknown>
  }

  return {
    pageSize: isPageSizeId(parsed.pageSize) ? parsed.pageSize : DEFAULT_PAGE_SETTINGS.pageSize,
    orientation: isPageOrientation(parsed.orientation)
      ? parsed.orientation
      : DEFAULT_PAGE_SETTINGS.orientation,
    headerText: typeof parsed.headerText === 'string' ? parsed.headerText : '',
    footerText: typeof parsed.footerText === 'string' ? parsed.footerText : '',
    showPageNumbers: parsed.showPageNumbers !== false,
    differentFirstPage: parsed.differentFirstPage === true,
    accentColor: isHexColor(parsed.accentColor) ? parsed.accentColor : undefined,
    pageColor: isHexColor(parsed.pageColor) ? parsed.pageColor : undefined,
    textColor: isHexColor(parsed.textColor) ? parsed.textColor : undefined,
    fontFamily:
      typeof parsed.fontFamily === 'string' && parsed.fontFamily.length < 160
        ? parsed.fontFamily
        : undefined,
    bodyFontSize: numberInRange(parsed.bodyFontSize, 9, 20),
    lineHeight: numberInRange(parsed.lineHeight, 1.1, 2.5),
    headingStyle:
      parsed.headingStyle === 'accent' ||
      parsed.headingStyle === 'underline' ||
      parsed.headingStyle === 'plain'
        ? parsed.headingStyle
        : undefined,
    pageBorder:
      parsed.pageBorder === 'subtle' || parsed.pageBorder === 'accent'
        ? parsed.pageBorder
        : parsed.pageBorder === 'none'
          ? 'none'
          : undefined,
    paragraphSpacing:
      parsed.paragraphSpacing === 'compact' || parsed.paragraphSpacing === 'relaxed'
        ? parsed.paragraphSpacing
        : parsed.paragraphSpacing === 'normal'
          ? 'normal'
          : undefined
  }
}

export function serializePageSettings(settings: DocumentPageSettings): string {
  return JSON.stringify({
    pageSize: settings.pageSize,
    orientation: settings.orientation,
    headerText: settings.headerText,
    footerText: settings.footerText,
    showPageNumbers: settings.showPageNumbers,
    differentFirstPage: settings.differentFirstPage,
    accentColor: settings.accentColor,
    pageColor: settings.pageColor,
    textColor: settings.textColor,
    fontFamily: settings.fontFamily,
    bodyFontSize: settings.bodyFontSize,
    lineHeight: settings.lineHeight,
    headingStyle: settings.headingStyle,
    pageBorder: settings.pageBorder,
    paragraphSpacing: settings.paragraphSpacing
  })
}

export function getPageDimensions(settings: DocumentPageSettings): {
  widthPx: number
  heightPx: number
} {
  const size =
    PAGE_SIZE_OPTIONS.find((item) => item.id === settings.pageSize) ?? PAGE_SIZE_OPTIONS[1]
  if (settings.orientation === 'landscape') {
    return { widthPx: size.heightPx, heightPx: size.widthPx }
  }
  return { widthPx: size.widthPx, heightPx: size.heightPx }
}

export function getPageCssSize(settings: DocumentPageSettings): string {
  const size =
    PAGE_SIZE_OPTIONS.find((item) => item.id === settings.pageSize) ?? PAGE_SIZE_OPTIONS[1]
  return `${size.cssSize} ${settings.orientation}`
}

export function pageSettingsToCssVars(settings: DocumentPageSettings): Record<string, string> {
  const { widthPx, heightPx } = getPageDimensions(settings)
  const variables: Record<string, string> = {
    '--doc-page-width': `${widthPx}px`,
    '--doc-page-min-height': `${heightPx}px`
  }
  if (settings.accentColor) variables['--doc-accent'] = settings.accentColor
  if (settings.pageColor) variables['--doc-page-bg'] = settings.pageColor
  if (settings.textColor) variables['--doc-page-text'] = settings.textColor
  if (settings.fontFamily) variables['--doc-font-family'] = settings.fontFamily
  if (settings.bodyFontSize) variables['--doc-body-size'] = `${settings.bodyFontSize}px`
  if (settings.lineHeight) variables['--doc-line-height'] = String(settings.lineHeight)
  return variables
}
