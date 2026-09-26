import { describe, expect, it } from 'vitest'
import { pdfPrintMargins, pdfPrintPaginationCss } from '../shared/lib/export-print'

describe('pdf print layout', () => {
  it('reserves enough header and footer band for Chromium chrome', () => {
    const withChrome = pdfPrintMargins(true, true)
    expect(withChrome.top).toBeGreaterThanOrEqual(0.65)
    expect(withChrome.bottom).toBeGreaterThanOrEqual(0.6)
    expect(withChrome.headerBandPx).toBe(Math.round(withChrome.top * 96))
    expect(withChrome.footerBandPx).toBe(Math.round(withChrome.bottom * 96))
  })

  it('uses a smaller band when header or footer is off', () => {
    const bare = pdfPrintMargins(false, false)
    expect(bare.top).toBeLessThan(0.5)
    expect(bare.bottom).toBeLessThan(0.5)
  })

  it('includes page-break rules that keep lines and headings intact', () => {
    const css = pdfPrintPaginationCss()
    expect(css).toContain('orphans: 3')
    expect(css).toContain('widows: 3')
    expect(css).toContain('page-break-inside: avoid')
    expect(css).toContain('page-break-after: avoid')
    expect(css).toContain('.pdf-keep')
    expect(css).toContain('overflow: visible !important')
    expect(css).not.toContain('@page { margin: 0')
  })
})
