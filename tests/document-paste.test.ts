import { describe, expect, it } from 'vitest'
import { pastedTextToDocumentHtml } from '../shared/lib/document-paste'

describe('Gamma-style document paste', () => {
  it('converts headings, bullets, and explicit splits to structured HTML', () => {
    const html = pastedTextToDocumentHtml('# Overview\nIntro\n- One\n- Two\n/split\n## Details')
    expect(html).toContain('<h1>Overview</h1>')
    expect(html).toContain('<ul><li>One</li><li>Two</li></ul>')
    expect(html).toContain('<hr data-page-break="true" />')
    expect(html).toContain('<h2>Details</h2>')
  })

  it('escapes pasted HTML instead of executing it', () => {
    expect(pastedTextToDocumentHtml('<script>alert(1)</script>')).toContain('&lt;script&gt;')
  })
})
