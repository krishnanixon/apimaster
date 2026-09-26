import {
  stripMarkdownCodeFences,
  isTipTapJson,
  looksLikeHtml,
  resolveDocumentHtml,
  decodeHtmlEntities,
  stripInnerHtml,
  parseHtmlToExportBlocks,
  sanitizePdfText,
  type ExportBlock
} from '@shared/lib/document-html'

export {
  stripMarkdownCodeFences,
  isTipTapJson,
  looksLikeHtml,
  resolveDocumentHtml,
  decodeHtmlEntities,
  stripInnerHtml,
  parseHtmlToExportBlocks,
  sanitizePdfText,
  type ExportBlock
}

/** Best HTML string for preview / editor load. */
export function getDocumentDisplayHtml(doc: {
  htmlContent?: string
  content?: string
}): string {
  return resolveDocumentHtml(doc)
}

export function stripHtmlToText(html: string, maxLength = 200): string {
  const text = stripInnerHtml(html)
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
