import type { DocumentPageSettings } from '@shared/types'
import { getPageCssSize } from '@shared/lib/document-page'

export interface PrintDocumentOptions {
  pageSettings?: DocumentPageSettings
  headerText?: string
  footerText?: string
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function printDocumentHtml(title: string, html: string, options: PrintDocumentOptions = {}): void {
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return
  const safeTitle = escapeHtml(title)
  const pageCss = options.pageSettings ? getPageCssSize(options.pageSettings) : 'letter portrait'
  const header = escapeHtml(options.headerText || title)
  const footer = escapeHtml(options.footerText || '')
  const showNumbers = options.pageSettings?.showPageNumbers !== false

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    @page { size: ${pageCss}; margin: 18mm 16mm 20mm; }
    body { font-family: Inter, Segoe UI, system-ui, sans-serif; color: #1e293b; max-width: 816px; margin: 24px auto; padding: 0 24px; font-size: 13px; line-height: 1.55; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    h2 { font-size: 16px; margin: 1.1rem 0 0.4rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: 13px; margin: 0.85rem 0 0.3rem; }
    h4, h5, h6 { font-size: 12px; margin: 0.7rem 0 0.25rem; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 0.6rem 0; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; }
    th { background: #f1f5f9; }
    td[data-bg] { background: attr(data-bg); }
    blockquote, aside.doc-callout { border-left: 3px solid #0f766e; margin: 0.6rem 0; padding: 0.2rem 0.8rem; color: #334155; }
    aside.doc-callout[data-variant='warning'] { border-left-color: #d97706; background: #fffbeb; }
    aside.doc-callout[data-variant='info'] { border-left-color: #2563eb; background: #eff6ff; }
    .doc-header-block { border: 1px solid #e2e8f0; background: #f8fafc; padding: 10px 12px; margin-bottom: 12px; font-size: 12px; }
    .doc-running-header, .doc-running-footer { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
    .doc-running-header { border-bottom: 1px solid #e2e8f0; margin-bottom: 16px; padding-bottom: 8px; }
    .doc-running-footer { border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 8px; }
    .doc-page-break, p[data-page-break], div[data-page-break] { border: none !important; color: transparent !important; height: 0; margin: 0; overflow: hidden; break-after: page; page-break-after: always; }
    .doc-toc { border: 1px solid #e2e8f0; padding: 12px; margin: 12px 0; }
    .doc-comment-mark { background: #fef3c7; }
    @media print {
      body { margin: 0; max-width: none; }
      .doc-running-header { position: running(pageHeader); }
    }
  </style>
</head>
<body>
  <div class="doc-running-header"><span>${header}</span>${showNumbers ? '<span>Page</span>' : ''}</div>
  ${html || '<p>Empty document</p>'}
  <div class="doc-running-footer"><span>${footer}</span>${showNumbers ? '<span></span>' : ''}</div>
</body>
</html>`)
  win.document.close()
  win.focus()
  win.print()
}
