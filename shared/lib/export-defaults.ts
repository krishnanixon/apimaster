import type {
  AppSettings,
  ExportClassification,
  ExportCoverStyle,
  ExportHeaderFooterStyle,
  ExportImageQuality,
  ExportOrientation,
  ExportPageNumberStyle,
  ExportPageSize,
  ExportTocStyle,
  ExportWatermarkStyle
} from '@shared/types'
import {
  parseCoverOverlay,
  parseExportClassification,
  parseExportCoverStyle,
  parseExportImageQuality,
  parseExportOrientation,
  parseExportPageSize,
  parseExportWatermarkStyle
} from './export-cover'

export interface ExportDefaults {
  format: 'pdf' | 'docx'
  includeCoverPage: boolean
  includeTableOfContents: boolean
  includePageNumbers: boolean
  includeHeaderFooter: boolean
  coverStyle: ExportCoverStyle
  tocStyle: ExportTocStyle
  pageNumberStyle: ExportPageNumberStyle
  headerFooterStyle: ExportHeaderFooterStyle
  includeLogo: boolean
  coverAccent: string
  coverSubtitle: string
  preparedBy: string
  includeWatermark: boolean
  watermarkStyle: ExportWatermarkStyle
  watermarkText: string
  classification: ExportClassification
  pageSize: ExportPageSize
  orientation: ExportOrientation
  coverBackground: string
  coverOverlay: number
  coverFont: string
  imageQuality: ExportImageQuality
}

export const DEFAULT_EXPORT_DEFAULTS: ExportDefaults = {
  format: 'pdf',
  includeCoverPage: true,
  includeTableOfContents: true,
  includePageNumbers: true,
  includeHeaderFooter: true,
  coverStyle: 'modern',
  tocStyle: 'classic',
  pageNumberStyle: 'page-total',
  headerFooterStyle: 'standard',
  includeLogo: true,
  coverAccent: '',
  coverSubtitle: '',
  preparedBy: '',
  includeWatermark: false,
  watermarkStyle: 'confidential',
  watermarkText: '',
  classification: 'none',
  pageSize: 'letter',
  orientation: 'portrait',
  coverBackground: '',
  coverOverlay: 40,
  coverFont: '',
  imageQuality: 'standard'
}

export function exportDefaultsFromSettings(
  settings: Partial<AppSettings> | null | undefined
): ExportDefaults {
  const format = settings?.exportDefaultFormat
  return {
    format: format === 'docx' ? 'docx' : 'pdf',
    includeCoverPage: settings?.exportIncludeCoverPage ?? DEFAULT_EXPORT_DEFAULTS.includeCoverPage,
    includeTableOfContents:
      settings?.exportIncludeTableOfContents ?? DEFAULT_EXPORT_DEFAULTS.includeTableOfContents,
    includePageNumbers: settings?.exportIncludePageNumbers ?? DEFAULT_EXPORT_DEFAULTS.includePageNumbers,
    includeHeaderFooter:
      settings?.exportIncludeHeaderFooter ?? DEFAULT_EXPORT_DEFAULTS.includeHeaderFooter,
    coverStyle: parseExportCoverStyle(settings?.exportCoverStyle),
    tocStyle:
      settings?.exportTocStyle === 'compact' || settings?.exportTocStyle === 'numbered'
        ? settings.exportTocStyle
        : 'classic',
    pageNumberStyle:
      settings?.exportPageNumberStyle === 'page' || settings?.exportPageNumberStyle === 'number'
        ? settings.exportPageNumberStyle
        : 'page-total',
    headerFooterStyle:
      settings?.exportHeaderFooterStyle === 'minimal' || settings?.exportHeaderFooterStyle === 'branded'
        ? settings.exportHeaderFooterStyle
        : 'standard',
    includeLogo: settings?.exportIncludeLogo ?? DEFAULT_EXPORT_DEFAULTS.includeLogo,
    coverAccent: settings?.exportCoverAccent?.trim() ?? '',
    coverSubtitle: settings?.exportCoverSubtitle ?? '',
    preparedBy: settings?.exportPreparedBy ?? '',
    includeWatermark: settings?.exportIncludeWatermark ?? DEFAULT_EXPORT_DEFAULTS.includeWatermark,
    watermarkStyle: parseExportWatermarkStyle(settings?.exportWatermarkStyle),
    watermarkText: settings?.exportWatermarkText ?? '',
    classification: parseExportClassification(settings?.exportClassification),
    pageSize: parseExportPageSize(settings?.exportPageSize),
    orientation: parseExportOrientation(settings?.exportOrientation),
    coverBackground: settings?.exportCoverBackground?.startsWith('data:image/')
      ? settings.exportCoverBackground
      : '',
    coverOverlay: parseCoverOverlay(settings?.exportCoverOverlay),
    coverFont: settings?.exportCoverFont ?? '',
    imageQuality: parseExportImageQuality(settings?.exportImageQuality)
  }
}
