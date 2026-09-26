import { PDFDocument, rgb, type RGB } from '@cantoo/pdf-lib'

export async function encryptPdfBytes(bytes: Uint8Array, password: string): Promise<Buffer> {
  const doc = await PDFDocument.load(bytes)
  doc.encrypt({
    userPassword: password,
    ownerPassword: password,
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: false
    }
  })
  const encrypted = await doc.save()
  return Buffer.from(encrypted)
}

/** Concatenate PDF buffers in order (e.g. cover without HF + body with HF). */
export async function mergePdfBuffers(
  ...parts: Array<Buffer | Uint8Array | null | undefined>
): Promise<Buffer> {
  const out = await PDFDocument.create()
  for (const part of parts) {
    if (!part || part.byteLength === 0) continue
    const doc = await PDFDocument.load(part)
    if (doc.getPageCount() === 0) continue
    const pages = await out.copyPages(doc, doc.getPageIndices())
    for (const page of pages) out.addPage(page)
  }
  return Buffer.from(await out.save())
}

/**
 * Swap page 0 of `fullPdf` with page 0 of `firstPagePdf`.
 * Used so a cover can be printed without Chromium header/footer while the
 * remaining pages keep theirs.
 */
export async function replacePdfFirstPage(
  fullPdf: Uint8Array,
  firstPagePdf: Uint8Array
): Promise<Buffer> {
  const full = await PDFDocument.load(fullPdf)
  const source = await PDFDocument.load(firstPagePdf)
  if (full.getPageCount() === 0 || source.getPageCount() === 0) {
    return Buffer.from(fullPdf)
  }
  const [freshFirst] = await full.copyPages(source, [0])
  full.removePage(0)
  full.insertPage(0, freshFirst)
  return Buffer.from(await full.save())
}

/** Paint over Chromium header/footer bands on one page (last-resort cover cleanup). */
export async function blankPdfPageBands(
  pdfBytes: Uint8Array,
  pageIndex: number,
  options: {
    topBandInches?: number
    bottomBandInches?: number
    color?: RGB
  } = {}
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes)
  const pages = doc.getPages()
  const page = pages[pageIndex]
  if (!page) return Buffer.from(pdfBytes)

  const { width, height } = page.getSize()
  const topBand = (options.topBandInches ?? 0.7) * 72
  const bottomBand = (options.bottomBandInches ?? 0.65) * 72
  const color = options.color ?? rgb(1, 1, 1)

  page.drawRectangle({
    x: 0,
    y: height - topBand,
    width,
    height: topBand,
    color,
    borderWidth: 0
  })
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height: bottomBand,
    color,
    borderWidth: 0
  })

  return Buffer.from(await doc.save())
}

export function pdfColorFromHex(hex: string): RGB {
  const raw = hex.replace('#', '').trim()
  if (raw.length !== 6 || Number.isNaN(Number.parseInt(raw, 16))) {
    return rgb(1, 1, 1)
  }
  const n = Number.parseInt(raw, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
