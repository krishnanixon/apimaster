import { describe, expect, it } from 'vitest'
import {
  buildCoverCss,
  buildCoverHtml,
  buildCoverOnlyPrintHtml,
  type CoverHtmlInput
} from '../shared/lib/export-cover'

const COVER: CoverHtmlInput = {
  style: 'modern',
  accent: '#2563eb',
  heading1Color: '#0f172a',
  bg: '#ffffff',
  text: '#1e293b',
  muted: '#64748b',
  fontFamily: 'Inter, sans-serif',
  h1Size: 28,
  companyName: 'Acme',
  companyLogo: '',
  showLogo: true,
  projectName: 'Atlas',
  title: 'System Requirements',
  typeLabel: 'SRS',
  subtitle: 'Release 1.0',
  preparedBy: 'PMO',
  themeLabel: 'Executive',
  dateLabel: '31 Aug 2026'
}

describe('clean export cover page', () => {
  it('cover HTML only includes title-sheet details', () => {
    const html = buildCoverHtml(COVER)

    expect(html).toContain('cover-title')
    expect(html).toContain('System Requirements')
    expect(html).toContain('Acme')
    expect(html).toContain('Atlas')
    expect(html).toContain('SRS')
    expect(html).toContain('Release 1.0')
    expect(html).toContain('Prepared by PMO')
    expect(html).not.toContain('classification-banner')
    expect(html).not.toContain('cover-watermark')
    expect(html).not.toContain('pageNumber')
    expect(html).not.toContain('doc-running-header')
    expect(html).not.toContain('doc-running-footer')
  })

  it('standalone cover print document has no header, footer, or overlays', () => {
    const html = buildCoverOnlyPrintHtml(COVER)
    const body = html.split(/<body[^>]*>/)[1] ?? ''

    expect(html).toContain('cover-print-isolated')
    expect(body).toContain('cover-title')
    expect(body).toContain('System Requirements')
    expect(body).not.toContain('<div class="classification-banner"')
    expect(body).not.toContain('<div class="cover-watermark"')
    expect(body).not.toContain('pageNumber')
    expect(body).not.toContain('totalPages')
    expect(body).not.toContain('Table of Contents')
    expect(body).not.toContain('class="content')
  })

  it('cover CSS hides running chrome during the isolated cover pass', () => {
    const css = buildCoverCss()
    expect(css).toContain('cover-print-isolated')
    expect(css).toContain('.classification-banner')
    expect(css).toContain('main.content')
  })
})
