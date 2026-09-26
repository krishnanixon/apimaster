import { describe, expect, it } from 'vitest'
import {
  parsePageSettings,
  getPageDimensions,
  serializePageSettings
} from '../shared/lib/document-page'
import { parseComments, serializeComments } from '../shared/lib/document-comments'
import { buildFindPattern } from '../src/features/editor/lib/find-replace'
import { extractOutline, outlineOccurrenceIndex } from '../src/features/editor/lib/document-outline'
import { resolveDocumentTheme, docxFontFromCss } from '../shared/lib/document-theme'

describe('document page settings', () => {
  it('parses defaults for empty JSON', () => {
    expect(parsePageSettings('{}')).toMatchObject({
      pageSize: 'letter',
      orientation: 'portrait',
      showPageNumbers: true
    })
  })

  it('swaps dimensions in landscape', () => {
    const portrait = getPageDimensions(
      parsePageSettings({ pageSize: 'a4', orientation: 'portrait' })
    )
    const landscape = getPageDimensions(
      parsePageSettings({ pageSize: 'a4', orientation: 'landscape' })
    )
    expect(landscape.widthPx).toBe(portrait.heightPx)
    expect(landscape.heightPx).toBe(portrait.widthPx)
  })

  it('round-trips settings', () => {
    const settings = parsePageSettings({
      pageSize: 'legal',
      orientation: 'landscape',
      headerText: 'Acme',
      footerText: 'Confidential',
      showPageNumbers: false,
      differentFirstPage: true
    })
    expect(parsePageSettings(serializePageSettings(settings))).toEqual(settings)
  })

  it('persists and resolves custom document design settings', () => {
    const settings = parsePageSettings({
      pageSize: 'letter',
      accentColor: '#0d9488',
      pageColor: '#f8fafc',
      textColor: '#1f2937',
      fontFamily: 'Georgia, serif',
      bodyFontSize: 14,
      lineHeight: 1.8,
      headingStyle: 'underline',
      pageBorder: 'accent',
      paragraphSpacing: 'relaxed'
    })
    const restored = parsePageSettings(serializePageSettings(settings))
    const theme = resolveDocumentTheme('executive', restored)

    expect(restored).toMatchObject({ headingStyle: 'underline', pageBorder: 'accent' })
    expect(theme).toMatchObject({
      bg: '#f8fafc',
      text: '#1f2937',
      accentColor: '#0d9488',
      fontFamily: 'Georgia, serif',
      bodyFontSize: 14,
      lineHeight: 1.8,
      h2Underline: true
    })
  })

  it('rejects unsafe design values', () => {
    const settings = parsePageSettings({
      accentColor: 'red; background:url(x)',
      bodyFontSize: 200,
      lineHeight: 8,
      headingStyle: 'animated'
    })
    expect(settings.accentColor).toBeUndefined()
    expect(settings.bodyFontSize).toBeUndefined()
    expect(settings.lineHeight).toBeUndefined()
    expect(settings.headingStyle).toBeUndefined()
  })

  it('maps web fonts to Word-safe typefaces for DOCX export', () => {
    expect(docxFontFromCss("'Inter', 'Segoe UI', sans-serif")).toBe('Calibri')
    expect(docxFontFromCss("Georgia, 'Times New Roman', serif")).toBe('Georgia')
    expect(docxFontFromCss("'Aptos', 'Calibri', sans-serif")).toBe('Aptos')
  })
})

describe('document comments', () => {
  it('ignores malformed comment rows', () => {
    expect(parseComments('[{"id":"1","body":"Review this"}]')).toHaveLength(1)
    expect(parseComments('not-json')).toEqual([])
    expect(parseComments([{ body: 'missing id' }])).toEqual([])
  })

  it('serializes threads', () => {
    const comments = parseComments([
      { id: 'c1', body: 'Need AC', quote: 'The system shall', replies: [] }
    ])
    expect(JSON.parse(serializeComments(comments))[0].body).toBe('Need AC')
  })
})

describe('find pattern', () => {
  it('supports whole word and case sensitivity', () => {
    const word = buildFindPattern('req', { wholeWord: true, caseSensitive: true })
    expect(word?.test('req')).toBe(true)
    expect(word?.test('request')).toBe(false)
  })

  it('returns null for invalid regex', () => {
    expect(buildFindPattern('(', { regex: true })).toBeNull()
  })
})

describe('document outline', () => {
  it('includes heading levels 1-6', () => {
    const items = extractOutline('<h1>Intro</h1><h4>Detail</h4><h6>Note</h6>')
    expect(items.map((item) => item.level)).toEqual([1, 4, 6])
  })

  it('tracks duplicate heading occurrence indexes', () => {
    const items = extractOutline('<h2>Scope</h2><p>x</p><h2>Scope</h2><h2>Other</h2>')
    expect(outlineOccurrenceIndex(items, 0)).toBe(0)
    expect(outlineOccurrenceIndex(items, 1)).toBe(1)
    expect(outlineOccurrenceIndex(items, 2)).toBe(0)
  })
})
