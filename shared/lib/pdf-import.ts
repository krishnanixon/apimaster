import { extractText, getDocumentProxy } from 'unpdf'

export interface ImportedPdfDocument {
  html: string
  text: string
  title: string
  pageCount: number
}

const PDF_MAGIC = Buffer.from('%PDF')

export function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 5) return false
  const head = buffer.subarray(0, 8).toString('latin1')
  return head.startsWith('%PDF')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Turn extracted PDF plain text into simple HTML paragraphs / headings. */
export function pdfTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return ''

  const blocks = normalized.split(/\n{2,}/)
  const parts: string[] = []

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) continue

    const first = lines[0]
    const looksLikeHeading =
      lines.length === 1 &&
      first.length > 0 &&
      first.length <= 80 &&
      !/[.!?]$/.test(first) &&
      (first === first.toUpperCase() || /^[A-Z0-9][\w\s\-:/]+$/.test(first))

    if (looksLikeHeading) {
      parts.push(`<h2>${escapeHtml(first)}</h2>`)
      continue
    }

    parts.push(`<p>${escapeHtml(lines.join(' '))}</p>`)
  }

  return parts.join('\n')
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported PDF'
}

export async function parsePdfBuffer(
  buffer: Buffer,
  fileName = 'document.pdf'
): Promise<ImportedPdfDocument> {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer)
  }

  if (buffer.length === 0) {
    throw new Error('The PDF file is empty.')
  }

  if (!isPdfBuffer(buffer) && !buffer.subarray(0, 4).equals(PDF_MAGIC)) {
    throw new Error('This file does not look like a PDF. Choose a .pdf file and try again.')
  }

  let totalPages = 0
  let mergedText = ''

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const extracted = await extractText(pdf, { mergePages: true })
    totalPages = extracted.totalPages
    mergedText = typeof extracted.text === 'string' ? extracted.text : extracted.text.join('\n\n')
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown PDF error'
    if (/password|encrypted/i.test(message)) {
      throw new Error('This PDF is password-protected. Remove the password and try again.')
    }
    throw new Error(`Could not read this PDF. ${message}`)
  }

  const text = mergedText
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  if (!text) {
    throw new Error(
      'No readable text was found in this PDF. Scanned image-only PDFs are not supported yet.'
    )
  }

  const html = pdfTextToHtml(text) || `<p>${escapeHtml(text)}</p>`
  const title = titleFromFileName(fileName)

  return { html, text, title, pageCount: totalPages }
}
