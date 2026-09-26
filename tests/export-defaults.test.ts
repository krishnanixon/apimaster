import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPORT_DEFAULTS,
  exportDefaultsFromSettings
} from '../shared/lib/export-defaults'
import {
  parseExportClassification,
  parseExportCoverStyle,
  parseExportImageQuality,
  parseExportOrientation,
  parseExportPageSize,
  parseExportWatermarkStyle,
  resolveCoverAccent,
  resolveExportPageBox,
  resolveWatermarkText
} from '../shared/lib/export-cover'

describe('export defaults', () => {
  it('provides complete formatting and style defaults', () => {
    expect(exportDefaultsFromSettings(null)).toEqual(DEFAULT_EXPORT_DEFAULTS)
  })

  it('keeps valid saved styles and falls back for invalid values', () => {
    const saved = exportDefaultsFromSettings({
      exportDefaultFormat: 'docx',
      exportCoverStyle: 'split',
      exportTocStyle: 'numbered',
      exportPageNumberStyle: 'number',
      exportHeaderFooterStyle: 'branded',
      exportIncludeLogo: false,
      exportCoverAccent: '#1e3a5f',
      exportCoverSubtitle: 'Release 1.0',
      exportPreparedBy: 'PMO',
      exportIncludeWatermark: true,
      exportWatermarkStyle: 'draft',
      exportWatermarkText: 'CLIENT COPY',
      exportClassification: 'internal',
      exportPageSize: 'a4',
      exportOrientation: 'landscape',
      exportCoverOverlay: 55,
      exportCoverFont: 'Georgia, "Times New Roman", serif',
      exportImageQuality: 'compact'
    })

    expect(saved).toMatchObject({
      format: 'docx',
      coverStyle: 'split',
      tocStyle: 'numbered',
      pageNumberStyle: 'number',
      headerFooterStyle: 'branded',
      includeLogo: false,
      coverAccent: '#1e3a5f',
      coverSubtitle: 'Release 1.0',
      preparedBy: 'PMO',
      includeWatermark: true,
      watermarkStyle: 'draft',
      watermarkText: 'CLIENT COPY',
      classification: 'internal',
      pageSize: 'a4',
      orientation: 'landscape',
      coverOverlay: 55,
      coverFont: 'Georgia, "Times New Roman", serif',
      imageQuality: 'compact'
    })

    const invalid = exportDefaultsFromSettings({
      exportCoverStyle: 'invalid',
      exportTocStyle: 'invalid',
      exportPageNumberStyle: 'invalid',
      exportHeaderFooterStyle: 'invalid',
      exportWatermarkStyle: 'invalid',
      exportClassification: 'invalid',
      exportPageSize: 'invalid',
      exportOrientation: 'invalid',
      exportImageQuality: 'invalid'
    } as never)

    expect(invalid).toMatchObject({
      coverStyle: 'modern',
      tocStyle: 'classic',
      pageNumberStyle: 'page-total',
      headerFooterStyle: 'standard',
      watermarkStyle: 'confidential',
      classification: 'none',
      pageSize: 'letter',
      orientation: 'portrait',
      imageQuality: 'standard'
    })
  })
})

describe('export cover helpers', () => {
  it('parses cover, watermark, classification, and page size values', () => {
    expect(parseExportCoverStyle('editorial')).toBe('editorial')
    expect(parseExportCoverStyle('unknown')).toBe('modern')
    expect(parseExportWatermarkStyle('custom')).toBe('custom')
    expect(parseExportClassification('public')).toBe('public')
    expect(parseExportPageSize('a4')).toBe('a4')
    expect(parseExportOrientation('landscape')).toBe('landscape')
    expect(parseExportImageQuality('compact')).toBe('compact')
    expect(resolveExportPageBox('letter', 'landscape').widthPx).toBeGreaterThan(
      resolveExportPageBox('letter', 'portrait').widthPx
    )
  })

  it('resolves accent overrides and watermark copy', () => {
    expect(resolveCoverAccent('#2563eb', '#9f1239')).toBe('#9f1239')
    expect(resolveCoverAccent('#2563eb', 'red')).toBe('#2563eb')
    expect(resolveWatermarkText('confidential')).toBe('CONFIDENTIAL')
    expect(resolveWatermarkText('custom', '  client review  ')).toBe('CLIENT REVIEW')
    expect(resolveWatermarkText('custom', '   ')).toBe('DRAFT')
  })
})
