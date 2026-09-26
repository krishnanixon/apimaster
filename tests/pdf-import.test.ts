import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { isPdfBuffer, parsePdfBuffer, pdfTextToHtml } from '../shared/lib/pdf-import'

describe('pdf import helpers', () => {
  it('detects PDF magic bytes', () => {
    expect(isPdfBuffer(Buffer.from('%PDF-1.7\n…'))).toBe(true)
    expect(isPdfBuffer(Buffer.from('not a pdf'))).toBe(false)
    expect(isPdfBuffer(Buffer.from([]))).toBe(false)
  })

  it('converts extracted text into HTML paragraphs', () => {
    const html = pdfTextToHtml('REQUIREMENTS\n\nTrack field jobs offline.\n\nSync when online.')
    expect(html).toContain('<h2>REQUIREMENTS</h2>')
    expect(html).toContain('<p>Track field jobs offline.</p>')
    expect(html).toContain('<p>Sync when online.</p>')
  })

  it('returns empty HTML for blank text', () => {
    expect(pdfTextToHtml('   ')).toBe('')
  })

  it('extracts text from a real PDF buffer', async () => {
    const buffer = readFileSync(join(__dirname, 'fixtures/sample-import.pdf'))
    const parsed = await parsePdfBuffer(buffer, 'field-ops.pdf')
    expect(parsed.title).toBe('field ops')
    expect(parsed.pageCount).toBeGreaterThanOrEqual(1)
    expect(parsed.text).toContain('Track field jobs offline')
    expect(parsed.html).toContain('Track field jobs offline')
  })

  it('rejects empty buffers', async () => {
    await expect(parsePdfBuffer(Buffer.alloc(0), 'empty.pdf')).rejects.toThrow(/empty/i)
  })
})
