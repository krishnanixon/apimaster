import { inflateRawSync } from 'zlib'

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0])

export interface ImportedWordDocument {
  html: string
  text: string
  title: string
}

export function isLegacyWordBinary(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(OLE_MAGIC)
}

function findEocdOffset(buffer: Buffer): number {
  const start = Math.max(0, buffer.length - 65557)
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}

function readZipEntry(buffer: Buffer, name: string): Buffer | null {
  const eocd = findEocdOffset(buffer)
  if (eocd < 0) return readZipSequential(buffer, name)

  const entryCount = buffer.readUInt16LE(eocd + 10)
  let cdOffset = buffer.readUInt32LE(eocd + 16)
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(cdOffset) !== CENTRAL_SIG) break
    const method = buffer.readUInt16LE(cdOffset + 10)
    const compSize = buffer.readUInt32LE(cdOffset + 20)
    const nameLen = buffer.readUInt16LE(cdOffset + 28)
    const extraLen = buffer.readUInt16LE(cdOffset + 30)
    const commentLen = buffer.readUInt16LE(cdOffset + 32)
    const localOffset = buffer.readUInt32LE(cdOffset + 42)
    const entryName = buffer.subarray(cdOffset + 46, cdOffset + 46 + nameLen).toString('utf8')
    if (entryName === name || entryName.replace(/\\/g, '/') === name) {
      return inflateLocalEntry(buffer, localOffset, method, compSize)
    }
    cdOffset += 46 + nameLen + extraLen + commentLen
  }
  return null
}

function inflateLocalEntry(
  buffer: Buffer,
  localOffset: number,
  method: number,
  cdCompSize: number
): Buffer | null {
  if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG) return null
  const flags = buffer.readUInt16LE(localOffset + 6)
  const localMethod = buffer.readUInt16LE(localOffset + 8)
  const nameLen = buffer.readUInt16LE(localOffset + 26)
  const extraLen = buffer.readUInt16LE(localOffset + 28)
  let compSize = buffer.readUInt32LE(localOffset + 18)
  if (compSize === 0 || (flags & 0x8) !== 0) compSize = cdCompSize
  const dataStart = localOffset + 30 + nameLen + extraLen
  const data = buffer.subarray(dataStart, dataStart + compSize)
  const usedMethod = localMethod || method
  if (usedMethod === 0) return Buffer.from(data)
  if (usedMethod === 8) return inflateRawSync(data)
  return null
}

function readZipSequential(buffer: Buffer, name: string): Buffer | null {
  let offset = 0
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== LOCAL_SIG) break
    const method = buffer.readUInt16LE(offset + 8)
    const compSize = buffer.readUInt32LE(offset + 18)
    const nameLen = buffer.readUInt16LE(offset + 26)
    const extraLen = buffer.readUInt16LE(offset + 28)
    const entryName = buffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf8')
    const dataStart = offset + 30 + nameLen + extraLen
    if (compSize === 0) break
    const data = buffer.subarray(dataStart, dataStart + compSize)
    if (entryName.replace(/\\/g, '/') === name) {
      if (method === 0) return Buffer.from(data)
      if (method === 8) return inflateRawSync(data)
      return null
    }
    offset = dataStart + compSize
  }
  return null
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function headingTag(style: string | undefined): string | null {
  if (!style) return null
  const normalized = style.toLowerCase()
  if (normalized === 'title' || normalized === 'heading1' || normalized === 'heading 1') return 'h1'
  if (normalized === 'heading2' || normalized === 'heading 2' || normalized === 'subtitle') return 'h2'
  if (normalized === 'heading3' || normalized === 'heading 3') return 'h3'
  return null
}

function paragraphStyle(pXml: string): string | undefined {
  const match = pXml.match(/<w:pStyle[^>]*w:val="([^"]+)"/i)
  return match?.[1]
}

function runToHtml(runXml: string): string {
  const texts = [...runXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) =>
    decodeXmlEntities(m[1])
  )
  let content = escapeHtml(texts.join(''))
  if (!content && /<w:tab\b/i.test(runXml)) content = ' '
  if (!content && /<w:br\b/i.test(runXml)) return '<br>'
  if (!content) return ''
  const bold = /<w:b\b[^/]*\/?>|<w:b\s*\/>|<w:b [^>]*w:val="(?!0|false)[^"]*"/i.test(runXml)
  const italic = /<w:i\b[^/]*\/?>|<w:i\s*\/>|<w:i [^>]*w:val="(?!0|false)[^"]*"/i.test(runXml)
  if (bold) content = `<strong>${content}</strong>`
  if (italic) content = `<em>${content}</em>`
  return content
}

function paragraphToHtml(pXml: string): string {
  const runs = [...pXml.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)].map((m) => runToHtml(m[0]))
  const inner = runs.join('').trim()
  if (!inner) return ''
  const tag = headingTag(paragraphStyle(pXml)) ?? 'p'
  return `<${tag}>${inner}</${tag}>`
}

function tableToHtml(tblXml: string): string {
  const rows = [...tblXml.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)]
  const htmlRows = rows.map((row) => {
    const cells = [...row[0].matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map((cell) => {
      const paras = [...cell[0].matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]
        .map((p) => {
          const text = [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
            .map((t) => decodeXmlEntities(t[1]))
            .join('')
          return escapeHtml(text)
        })
        .filter(Boolean)
        .join(' ')
      return `<td>${paras || '&nbsp;'}</td>`
    })
    return `<tr>${cells.join('')}</tr>`
  })
  return htmlRows.length > 0 ? `<table>${htmlRows.join('')}</table>` : ''
}

export function wordXmlToHtml(xml: string): string {
  const withoutNsNoise = xml.replace(/w:instrText[\s\S]*?<\/w:instrText>/g, '')
  const parts: string[] = []
  const tokenRe = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g
  let match: RegExpExecArray | null
  while ((match = tokenRe.exec(withoutNsNoise))) {
    const chunk = match[0]
    if (chunk.startsWith('<w:tbl')) parts.push(tableToHtml(chunk))
    else parts.push(paragraphToHtml(chunk))
  }
  return parts.filter(Boolean).join('\n')
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function parseDocxBuffer(buffer: Buffer, fileName = 'document.docx'): ImportedWordDocument {
  if (isLegacyWordBinary(buffer)) {
    throw new Error('Legacy .doc files are not supported. Save the file as .docx in Word and import again.')
  }
  const xmlBuffer = readZipEntry(buffer, 'word/document.xml')
  if (!xmlBuffer) {
    throw new Error('Could not read this Word file. Use a .docx document.')
  }
  const html = wordXmlToHtml(xmlBuffer.toString('utf8'))
  const text = htmlToPlainText(html)
  const title = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported document'
  if (!text) {
    throw new Error('The Word file did not contain readable text.')
  }
  return { html: html || `<p>${escapeHtml(text)}</p>`, text, title }
}
