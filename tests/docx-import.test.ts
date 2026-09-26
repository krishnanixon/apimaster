import { describe, expect, it } from 'vitest'
import { parseDocxBuffer, wordXmlToHtml, htmlToPlainText } from '../shared/lib/docx-import'
import { sanitizeWordFileName, wordFileNameForDocument, joinFolderFile } from '../shared/lib/word-file-path'

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function storedZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.data.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(Buffer.concat([local, name, entry.data]))

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(entry.data.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([central, name]))
    offset += 30 + name.length + entry.data.length
  }

  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

describe('word file paths', () => {
  it('sanitizes titles and builds unique docx names', () => {
    expect(sanitizeWordFileName('My Spec: v1')).toBe('My Spec- v1')
    expect(wordFileNameForDocument('Requirements', 'abcdefghijklmnop')).toBe('Requirements-abcdefgh.docx')
    expect(joinFolderFile('C:\\Docs\\Out', 'a.docx')).toBe('C:\\Docs\\Out\\a.docx')
  })
})

describe('docx import', () => {
  it('converts Word XML paragraphs and headings', () => {
    const html = wordXmlToHtml(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Intro</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r><w:r><w:t> body</w:t></w:r></w:p>`
    )
    expect(html).toContain('<h1>Intro</h1>')
    expect(html).toContain('<strong>Bold</strong>')
    expect(htmlToPlainText(html)).toContain('Intro')
  })

  it('reads a stored zip docx buffer', () => {
    const xml = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Track field jobs</w:t></w:r></w:p></w:body></w:document>`
    const buffer = storedZip([{ name: 'word/document.xml', data: Buffer.from(xml, 'utf8') }])
    const parsed = parseDocxBuffer(buffer, 'field-ops.docx')
    expect(parsed.title).toBe('field ops')
    expect(parsed.text).toContain('Track field jobs')
    expect(parsed.html).toContain('Track field jobs')
  })

  it('rejects legacy OLE .doc files', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(() => parseDocxBuffer(ole, 'old.doc')).toThrow(/Legacy/)
  })
})
