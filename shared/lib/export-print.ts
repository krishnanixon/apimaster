/** Chromium print layout uses 96 CSS px per inch. */
const PDF_PX_PER_IN = 96

export type PdfPrintMargins = {
  top: number
  bottom: number
  left: number
  right: number
  headerBandPx: number
  footerBandPx: number
}

/**
 * Space reserved for Chromium's header/footer frames (inches).
 * Those templates paint *inside* the margin box. If the band is shorter than
 * the template (logo, default body margin, border), chrome overlaps body copy
 * and line boxes get sliced through the middle at the page edge.
 */
export function pdfPrintMargins(wantsHeader: boolean, wantsFooter: boolean): PdfPrintMargins {
  const top = wantsHeader ? 0.7 : 0.4
  const bottom = wantsFooter ? 0.65 : 0.4
  return {
    top,
    bottom,
    left: 0,
    right: 0,
    headerBandPx: Math.round(top * PDF_PX_PER_IN),
    footerBandPx: Math.round(bottom * PDF_PX_PER_IN)
  }
}

/** Print CSS so Chromium does not clip text, headings, or images at page breaks. */
export function pdfPrintPaginationCss(): string {
  return `
  html, body { height: auto; overflow: visible; }
  .content { overflow-wrap: break-word; word-wrap: break-word; }
  .content h1, .content h2, .content h3,
  .content h4, .content h5, .content h6 {
    break-after: avoid;
    page-break-after: avoid;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .content h1 + *, .content h2 + *, .content h3 + *,
  .content h4 + *, .content h5 + *, .content h6 + * {
    break-before: avoid-page;
    page-break-before: avoid;
  }
  .pdf-keep {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .content p, .content li, .content td, .content th, .content blockquote {
    orphans: 3;
    widows: 3;
  }
  .content img, .content figure, .content .image-block, .content pre,
  .content blockquote, .content aside, .content .doc-flow-block,
  .content .doc-flow-export {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .content table, .content th, .content td { overflow: visible !important; }
  .doc-page-break, p[data-page-break], div[data-page-break] {
    border: none !important;
    color: transparent !important;
    height: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
  }
  `
}
