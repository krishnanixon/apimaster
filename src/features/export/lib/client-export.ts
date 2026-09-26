/**
 * Renderer-side exporters for lightweight formats (Markdown / HTML / JSON).
 *
 * PDF and DOCX are produced in the main process via `export.service.ts` because
 * they need native file dialogs and binary libraries. Markdown, HTML and JSON
 * are pure text and can be generated and downloaded directly in the renderer,
 * which keeps them instant and offline-friendly.
 */

import { resolveDocumentTheme, type DocumentThemeId } from '@shared/lib/document-theme'
import type { DocumentPageSettings } from '@shared/types'
import { EXPORT_SCHEMA_V2 } from '@shared/constants/product'

export type ClientExportFormat = 'markdown' | 'html' | 'json'

export interface ClientExportDocument {
  id: string
  title: string
  type: string
  style?: string
  pageTheme?: string
  pageSettings?: DocumentPageSettings
  htmlContent: string
  content?: string
  createdAt?: string
  updatedAt?: string
}

export interface ClientExportContext {
  projectName?: string
  companyName?: string
  companyLogo?: string
}

/** Trigger a browser download for a generated text blob. */
function downloadTextFile(filename: string, mime: string, contents: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sanitizeFileName(name: string): string {
  return (
    (name || 'document')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'document'
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------------ */
/* HTML -> Markdown                                                     */
/* ------------------------------------------------------------------ */

function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const inner = Array.from(el.childNodes).map(inlineToMarkdown).join('')
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'strong':
    case 'b':
      return inner.trim() ? `**${inner}**` : inner
    case 'em':
    case 'i':
      return inner.trim() ? `*${inner}*` : inner
    case 'code':
      return `\`${inner}\``
    case 's':
    case 'del':
      return `~~${inner}~~`
    case 'a': {
      const href = el.getAttribute('href') ?? ''
      return href ? `[${inner}](${href})` : inner
    }
    case 'br':
      return '  \n'
    default:
      return inner
  }
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  const toCells = (row: HTMLTableRowElement): string[] =>
    Array.from(row.querySelectorAll('th,td')).map((cell) =>
      inlineToMarkdown(cell).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()
    )

  const headerCells = toCells(rows[0])
  const colCount = Math.max(1, headerCells.length)
  const lines: string[] = []
  lines.push(`| ${headerCells.join(' | ')} |`)
  lines.push(`| ${Array(colCount).fill('---').join(' | ')} |`)

  for (let i = 1; i < rows.length; i++) {
    const cells = toCells(rows[i])
    while (cells.length < colCount) cells.push('')
    lines.push(`| ${cells.join(' | ')} |`)
  }
  return lines.join('\n')
}

function blockToMarkdown(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').trim()
    return text ? text : ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'h1':
      return `# ${inlineToMarkdown(el).trim()}`
    case 'h2':
      return `## ${inlineToMarkdown(el).trim()}`
    case 'h3':
      return `### ${inlineToMarkdown(el).trim()}`
    case 'h4':
      return `#### ${inlineToMarkdown(el).trim()}`
    case 'h5':
      return `##### ${inlineToMarkdown(el).trim()}`
    case 'h6':
      return `###### ${inlineToMarkdown(el).trim()}`
    case 'p':
      return inlineToMarkdown(el).trim()
    case 'blockquote':
      return inlineToMarkdown(el)
        .trim()
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
    case 'hr':
      return '---'
    case 'pre': {
      const codeEl = el.querySelector('code')
      const code = (codeEl ?? el).textContent ?? ''
      return '```\n' + code.replace(/\n$/, '') + '\n```'
    }
    case 'ul':
    case 'ol': {
      const ordered = tag === 'ol'
      const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li')
      return items
        .map((li, index) => {
          const indent = '  '.repeat(depth)
          const marker = ordered ? `${index + 1}.` : '-'
          // Separate nested lists from inline content.
          const nested = Array.from(li.children).filter(
            (c) => c.tagName.toLowerCase() === 'ul' || c.tagName.toLowerCase() === 'ol'
          )
          const liClone = li.cloneNode(true) as HTMLElement
          liClone.querySelectorAll(':scope > ul, :scope > ol').forEach((n) => n.remove())
          const checkbox =
            li.getAttribute('data-checked') === 'true'
              ? '[x] '
              : li.getAttribute('data-type') === 'taskItem' || li.hasAttribute('data-checked')
                ? '[ ] '
                : ''
          const text = inlineToMarkdown(liClone).replace(/\n+/g, ' ').trim()
          const nestedMd = nested.map((n) => blockToMarkdown(n, depth + 1)).join('\n')
          return `${indent}${marker} ${checkbox}${text}${nestedMd ? '\n' + nestedMd : ''}`
        })
        .join('\n')
    }
    case 'table':
      return tableToMarkdown(el as HTMLTableElement)
    case 'div':
    case 'section':
    case 'article':
      return Array.from(el.childNodes)
        .map((c) => blockToMarkdown(c, depth))
        .filter(Boolean)
        .join('\n\n')
    default:
      return inlineToMarkdown(el).trim()
  }
}

export function htmlToMarkdown(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html || '', 'text/html')
  const blocks = Array.from(doc.body.childNodes)
    .map((node) => blockToMarkdown(node))
    .filter((block) => block.trim().length > 0)
  return (
    blocks
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

/* ------------------------------------------------------------------ */
/* HTML -> standalone HTML document                                    */
/* ------------------------------------------------------------------ */

export function buildStandaloneHtml(
  doc: ClientExportDocument,
  context: ClientExportContext = {}
): string {
  const theme = resolveDocumentTheme(doc.pageTheme as DocumentThemeId | undefined, doc.pageSettings)
  const title = escapeHtml(doc.title || 'Document')
  const heading = context.companyName ? `${escapeHtml(context.companyName)} · ${title}` : title
  const logo = context.companyLogo?.startsWith('data:image/')
    ? `<img class="brand-logo" src="${escapeHtml(context.companyLogo)}" alt="" />`
    : ''
  const headingDesign =
    doc.pageSettings?.headingStyle === 'accent'
      ? `border: 0; border-left: 3px solid ${theme.accentColor}; padding: .3rem 0 .3rem .65rem; text-decoration: none;`
      : doc.pageSettings?.headingStyle === 'underline'
        ? `border: 0; border-bottom: 2px solid ${theme.accentColor}; padding-bottom: .25rem; text-decoration: none;`
        : doc.pageSettings?.headingStyle === 'plain'
          ? 'border: 0; text-decoration: none;'
          : ''
  const pageBorder =
    doc.pageSettings?.pageBorder === 'accent'
      ? `box-shadow: inset 0 0 0 2px ${theme.accentColor};`
      : doc.pageSettings?.pageBorder === 'subtle'
        ? 'box-shadow: inset 0 0 0 1px #d4d4d8;'
        : ''
  const paragraphSpacing =
    doc.pageSettings?.paragraphSpacing === 'compact'
      ? '0.4rem'
      : doc.pageSettings?.paragraphSpacing === 'relaxed'
        ? '1.1rem'
        : '0.75rem'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${title}</title>
<style>
  :root { color-scheme: light only; }
  html, body {
    margin: 0;
    background: ${theme.bg};
    color: ${theme.text};
    color-scheme: light only;
  }
  body {
    font-family: ${theme.fontFamily};
    line-height: ${theme.lineHeight};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    max-width: 820px;
    margin: 0 auto;
    background: ${theme.bg};
    color: ${theme.text};
    padding: 64px 72px;
    font-size: ${theme.bodyFontSize}px;
    min-height: 100vh;
    box-sizing: border-box;
    ${pageBorder}
  }
  h1 { color: ${theme.heading1Color}; font-size: ${theme.h1Size}px; margin: 1.2em 0 0.5em; }
  h2 { color: ${theme.heading2Color}; font-size: ${theme.h2Size}px; margin: 1.1em 0 0.4em; ${theme.h2Underline ? 'text-decoration: underline;' : ''} ${theme.h2Border ? 'border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em;' : ''} ${headingDesign} }
  h3 { color: ${theme.heading3Color}; font-size: ${theme.h3Size}px; margin: 1em 0 0.3em; }
  p { color: inherit; margin-bottom: ${paragraphSpacing}; }
  li { color: inherit; }
  a { color: ${theme.accentColor}; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
  th { background: #f1f5f9; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 3px solid ${theme.accentColor}; margin: 1em 0; padding: 0.2em 1em; color: #475569; }
  pre { background: #f1f5f9; color: ${theme.text}; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 8px; overflow: auto; }
  code { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
  .document-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e2e8f0;
    color: #64748b;
    font-size: 13px;
  }
  .brand-logo { max-width: 120px; max-height: 42px; object-fit: contain; }
</style>
</head>
<body>
  <div class="page">
    <header class="document-header">${logo}<span>${heading}</span></header>
    ${doc.htmlContent || '<p>No content.</p>'}
  </div>
</body>
</html>`
}

/* ------------------------------------------------------------------ */
/* HTML -> JSON                                                         */
/* ------------------------------------------------------------------ */

export function buildJsonExport(
  doc: ClientExportDocument,
  context: ClientExportContext = {}
): string {
  const payload = {
    schema: EXPORT_SCHEMA_V2,
    exportedAt: new Date().toISOString(),
    project: {
      name: context.projectName ?? null,
      company: context.companyName ?? null
    },
    document: {
      id: doc.id,
      title: doc.title,
      type: doc.type,
      style: doc.style ?? null,
      pageTheme: doc.pageTheme ?? null,
      pageSettings: doc.pageSettings ?? null,
      createdAt: doc.createdAt ?? null,
      updatedAt: doc.updatedAt ?? null,
      html: doc.htmlContent,
      markdown: htmlToMarkdown(doc.htmlContent)
    }
  }
  return JSON.stringify(payload, null, 2)
}

/* ------------------------------------------------------------------ */
/* Public entry                                                        */
/* ------------------------------------------------------------------ */

export function exportClientSide(
  format: ClientExportFormat,
  doc: ClientExportDocument,
  context: ClientExportContext = {}
): void {
  const base = sanitizeFileName(doc.title)
  switch (format) {
    case 'markdown':
      downloadTextFile(`${base}.md`, 'text/markdown', htmlToMarkdown(doc.htmlContent))
      break
    case 'html':
      downloadTextFile(`${base}.html`, 'text/html', buildStandaloneHtml(doc, context))
      break
    case 'json':
      downloadTextFile(`${base}.json`, 'application/json', buildJsonExport(doc, context))
      break
  }
}
