import { diffArrays, diffWords, type DiffToken } from './text-diff'

/** Normalize AI / stored document content into renderable HTML. */
export function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:html)?\s*([\s\S]*?)```$/i)
  if (fenceMatch) return fenceMatch[1].trim()
  return trimmed
}

export function isTipTapJson(content: string): boolean {
  const t = content.trim()
  return t.startsWith('{') && t.includes('"type"')
}

export function looksLikeHtml(content: string): boolean {
  const t = content.trim()
  return /^<[a-z][\s\S]*>/i.test(t) || /<(h[1-6]|p|div|table|ul|ol|li|hr)\b/i.test(t)
}

/** Best HTML string for preview / export. */
export function resolveDocumentHtml(doc: {
  htmlContent?: string
  content?: string
}): string {
  const html = stripMarkdownCodeFences(doc.htmlContent ?? '')
  if (html && looksLikeHtml(html)) return html

  const content = stripMarkdownCodeFences(doc.content ?? '')
  if (content && looksLikeHtml(content) && !isTipTapJson(content)) return content

  if (html) return html
  if (content && !isTipTapJson(content)) return content
  return ''
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

export function stripInnerHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

/** Visible document text suitable for full-text search indexing. */
export function documentContentToSearchText(content: string): string {
  const clean = stripMarkdownCodeFences(content)
  if (!looksLikeHtml(clean)) return clean
  return stripInnerHtml(
    clean
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  )
}

export type ExportTableStyle = 'grid' | 'striped' | 'bordered' | 'minimal'
export type ExportTableSize = 'compact' | 'normal' | 'spacious'
export type ExportTableWidth = 'auto' | 'full'

export interface ExportTableCell {
  text: string
  header?: boolean
  background?: string
  borderColor?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  width?: number
  colSpan?: number
  rowSpan?: number
}

export type ExportBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string; ordered?: boolean; number?: number }
  | {
      type: 'table'
      headers: string[]
      rows: string[][]
      tableStyle?: ExportTableStyle
      tableSize?: ExportTableSize
      tableWidth?: ExportTableWidth
      cells?: ExportTableCell[][]
    }
  | { type: 'image'; src: string; alt?: string; width?: number }

interface HtmlMatch {
  index: number
  length: number
  block: ExportBlock
}

function headingLevel(tag: string): 1 | 2 | 3 {
  const n = Number(tag.replace('h', ''))
  if (n <= 1) return 1
  if (n === 2) return 2
  return 3
}

function parseCssColor(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  const raw = value.trim()
  if (/^#([0-9a-f]{6})$/i.test(raw)) return raw
  if (/^#([0-9a-f]{3})$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(raw)
  if (!rgb) return undefined
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
  return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`
}

function attr(html: string, name: string): string | undefined {
  return new RegExp(`${name}=["']([^"']*)["']`, 'i').exec(html)?.[1]
}

function styleValue(html: string, property: string): string | undefined {
  const style = attr(html, 'style')
  if (!style) return undefined
  const match = new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return match?.[1]?.trim()
}

function parseTableAttr<T extends string>(html: string, name: string, allowed: readonly T[]): T | undefined {
  const value = attr(html, name)
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function parseAlign(value: string | undefined): ExportTableCell['align'] {
  const align = (value ?? '').toLowerCase()
  if (align === 'center' || align === 'right' || align === 'left' || align === 'justify') return align
  return undefined
}

function parseVerticalAlign(value: string | undefined): ExportTableCell['verticalAlign'] {
  const align = (value ?? '').toLowerCase()
  if (align === 'top' || align === 'middle' || align === 'bottom') return align
  return undefined
}

function parseSpan(value: string | undefined): number | undefined {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n : undefined
}

function innerParagraphAlign(innerHtml: string): ExportTableCell['align'] {
  const styled = /<(?:p|div)[^>]*style=["'][^"']*text-align\s*:\s*(left|center|right|justify)/i.exec(
    innerHtml
  )
  return parseAlign(styled?.[1])
}

function parseTableHtml(tableHtml: string): ExportBlock | null {
  const cells: ExportTableCell[][] = []
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch: RegExpExecArray | null

  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const row: ExportTableCell[] = []
    const cellRegex = /<(t[hd])([^>]*)>([\s\S]*?)<\/\1>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
      const tag = cellMatch[1].toLowerCase()
      const cellAttrs = cellMatch[2] ?? ''
      const innerHtml = cellMatch[3] ?? ''
      const widthAttr = attr(cellAttrs, 'colwidth') ?? attr(cellAttrs, 'width')
      const widthPx = widthAttr ? Number.parseInt(widthAttr.split(',')[0] ?? '', 10) : Number.NaN
      const align =
        parseAlign(attr(cellAttrs, 'align') ?? styleValue(cellAttrs, 'text-align')) ??
        innerParagraphAlign(innerHtml)
      const background =
        parseCssColor(attr(cellAttrs, 'data-bg')) ?? parseCssColor(styleValue(cellAttrs, 'background-color'))
      const borderColor =
        parseCssColor(attr(cellAttrs, 'data-border-color')) ?? parseCssColor(styleValue(cellAttrs, 'border-color'))
      row.push({
        text: stripInnerHtml(innerHtml),
        header: tag === 'th',
        background,
        borderColor,
        align,
        verticalAlign:
          parseVerticalAlign(attr(cellAttrs, 'data-valign')) ??
          parseVerticalAlign(styleValue(cellAttrs, 'vertical-align')),
        width: Number.isFinite(widthPx) && widthPx > 0 ? widthPx : undefined,
        colSpan: parseSpan(attr(cellAttrs, 'colspan')),
        rowSpan: parseSpan(attr(cellAttrs, 'rowspan'))
      })
    }
    if (row.length > 0) cells.push(row)
  }

  if (cells.length === 0) return null

  const firstRowIsHeader = cells[0].some((cell) => cell.header)
  const headers = firstRowIsHeader ? cells[0].map((cell) => cell.text) : []
  const body = firstRowIsHeader ? cells.slice(1) : cells

  return {
    type: 'table',
    headers,
    rows: body.map((row) => row.map((cell) => cell.text)),
    tableStyle: parseTableAttr(tableHtml, 'data-table-style', ['grid', 'striped', 'bordered', 'minimal'] as const),
    tableSize: parseTableAttr(tableHtml, 'data-table-size', ['compact', 'normal', 'spacious'] as const),
    tableWidth: parseTableAttr(tableHtml, 'data-table-width', ['auto', 'full'] as const),
    cells
  }
}

function parseListBlock(listInnerHtml: string, listStartInDoc: number, ordered: boolean): HtmlMatch[] {
  const items: HtmlMatch[] = []
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let liMatch: RegExpExecArray | null
  let number = 1

  while ((liMatch = liRegex.exec(listInnerHtml)) !== null) {
    const text = stripInnerHtml(liMatch[1])
    if (!text) continue
    items.push({
      index: listStartInDoc + liMatch.index,
      length: liMatch[0].length,
      block: {
        type: 'bullet',
        text,
        ordered,
        number: ordered ? number++ : undefined
      }
    })
  }

  return items
}

function collectMatches(html: string): HtmlMatch[] {
  const matches: HtmlMatch[] = []

  const imageBlockRegex =
    /<div[^>]*data-type="image-block"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<\/div>|<img[^>]+src="([^"]+)"[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = imageBlockRegex.exec(html)) !== null) {
    const src = m[1] || m[2]
    if (!src) continue
    const altMatch = /alt="([^"]*)"/i.exec(m[0])
    matches.push({
      index: m.index,
      length: m[0].length,
      block: { type: 'image', src, alt: altMatch?.[1] || 'Image' }
    })
  }

  const flowImgRegex =
    /<figure[^>]*class="[^"]*doc-flow-export[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<\/figure>/gi
  while ((m = flowImgRegex.exec(html)) !== null) {
    const src = m[1]
    if (!src) continue
    const altMatch = /alt="([^"]*)"/i.exec(m[0])
    matches.push({
      index: m.index,
      length: m[0].length,
      block: { type: 'image', src, alt: altMatch?.[1] || 'Flowchart', width: 520 }
    })
  }

  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi
  while ((m = tableRegex.exec(html)) !== null) {
    const block = parseTableHtml(m[0])
    if (block) {
      matches.push({ index: m.index, length: m[0].length, block })
    }
  }

  for (let level = 1; level <= 6; level++) {
    const tag = `h${level}`
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
    while ((m = regex.exec(html)) !== null) {
      const text = stripInnerHtml(m[1])
      if (text) {
        matches.push({
          index: m.index,
          length: m[0].length,
          block: { type: 'heading', level: headingLevel(tag), text }
        })
      }
    }
  }

  const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi
  while ((m = ulRegex.exec(html)) !== null) {
    const innerStart = m.index + m[0].indexOf(m[1])
    matches.push(...parseListBlock(m[1], innerStart, false))
  }

  const olRegex = /<ol[^>]*>([\s\S]*?)<\/ol>/gi
  while ((m = olRegex.exec(html)) !== null) {
    const innerStart = m.index + m[0].indexOf(m[1])
    matches.push(...parseListBlock(m[1], innerStart, true))
  }

  const blockRegex = /<(p|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi
  while ((m = blockRegex.exec(html)) !== null) {
    const text = stripInnerHtml(m[2])
    if (text) {
      matches.push({
        index: m.index,
        length: m[0].length,
        block: { type: 'paragraph', text }
      })
    }
  }

  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
  while ((m = liRegex.exec(html)) !== null) {
    const insideList = matches.some(
      (x) => x.block.type === 'bullet' && m!.index >= x.index && m!.index < x.index + x.length
    )
    if (insideList) continue
    const text = stripInnerHtml(m[1])
    if (text) {
      matches.push({
        index: m.index,
        length: m[0].length,
        block: { type: 'bullet', text }
      })
    }
  }

  return matches
}

function dedupeOrdered(matches: HtmlMatch[]): HtmlMatch[] {
  matches.sort((a, b) => a.index - b.index || b.length - a.length)

  const result: HtmlMatch[] = []
  let coveredUntil = -1

  for (const match of matches) {
    if (match.index < coveredUntil) continue
    result.push(match)
    coveredUntil = Math.max(coveredUntil, match.index + match.length)
  }

  return result
}

export function parseHtmlToExportBlocks(html: string): ExportBlock[] {
  const clean = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')

  const matches = dedupeOrdered(collectMatches(clean))
  const blocks = matches.map((m) => m.block)

  if (blocks.length === 0) {
    const plain = stripInnerHtml(clean)
    if (plain) {
      for (const line of plain.split(/\n+/)) {
        const trimmed = line.trim()
        if (trimmed) blocks.push({ type: 'paragraph', text: trimmed })
      }
    }
  }

  return blocks
}

/** pdf-lib StandardFonts only support WinAnsi — normalize unicode punctuation first. */
export function sanitizePdfText(text: string): string {
  return text
    .replace(/\u2022/g, '-')
    .replace(/\u25aa|\u25cf|\u2023/g, '-')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}

export interface HtmlSection {
  title: string
  level: number
  startIndex: number
  endIndex: number
  html: string
}

/**
 * Splits HTML into sections delimited by heading tags at the given level.
 * Generated documents use h2 for major sections (see getTypeSystemPrompt),
 * so h2 is the default granularity for section-scoped AI editing.
 */
export function extractHeadingSections(html: string, level: 1 | 2 | 3 = 2): HtmlSection[] {
  const tag = `h${level}`
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const headings: { index: number; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    const title = stripInnerHtml(m[1])
    if (title) headings.push({ index: m.index, title })
  }

  return headings.map((h, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].index : html.length
    return {
      title: h.title,
      level,
      startIndex: h.index,
      endIndex: end,
      html: html.slice(h.index, end)
    }
  })
}

export function findHeadingSection(html: string, sectionTitle: string, level?: 1 | 2 | 3): HtmlSection | null {
  const normalized = sectionTitle.trim().toLowerCase()
  const levelsToTry: (1 | 2 | 3)[] = level ? [level] : [1, 2, 3]

  for (const l of levelsToTry) {
    const sections = extractHeadingSections(html, l)
    const exact = sections.find((s) => s.title.trim().toLowerCase() === normalized)
    if (exact) return exact
  }

  for (const l of levelsToTry) {
    const sections = extractHeadingSections(html, l)
    const partial = sections.find((s) => s.title.trim().toLowerCase().includes(normalized))
    if (partial) return partial
  }

  return null
}

export function replaceHtmlSection(html: string, section: HtmlSection, replacementHtml: string): string {
  return html.slice(0, section.startIndex) + replacementHtml.trim() + html.slice(section.endIndex)
}

export type BlockDiffEntryType = 'equal' | 'added' | 'removed' | 'changed'

export interface BlockDiffEntry {
  type: BlockDiffEntryType
  oldText?: string
  newText?: string
  text?: string
  wordDiff?: DiffToken[]
}

function lineSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const wordsB = new Set(b.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let common = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) common++
  }
  return common / new Set([...wordsA, ...wordsB]).size
}

function blockToLine(block: ExportBlock): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${block.text}`
    case 'bullet':
      return `${block.ordered ? `${block.number}.` : '-'} ${block.text}`
    case 'table':
      return `[table] ${block.headers.join(' | ')} :: ${block.rows.map((r) => r.join(' | ')).join(' / ')}`
    case 'image':
      return `[image] ${block.alt || block.src.slice(0, 48)}`
    case 'paragraph':
    default:
      return 'text' in block ? block.text : ''
  }
}

/**
 * Structured, block-level diff between two document HTML strings.
 * Blocks are matched via LCS; adjacent delete+insert pairs are merged into
 * "changed" entries with a finer word-level diff for readable review UIs.
 */
export function diffHtmlDocuments(oldHtml: string, newHtml: string): BlockDiffEntry[] {
  const oldBlocks = parseHtmlToExportBlocks(oldHtml)
  const newBlocks = parseHtmlToExportBlocks(newHtml)
  const oldLines = oldBlocks.map(blockToLine)
  const newLines = newBlocks.map(blockToLine)

  const rawDiff = diffArrays(oldLines, newLines, undefined, false)

  const entries: BlockDiffEntry[] = []
  for (let i = 0; i < rawDiff.length; i++) {
    const token = rawDiff[i]
    if (token.type === 'equal') {
      entries.push({ type: 'equal', text: token.value })
      continue
    }

    const deleted: string[] = []
    const inserted: string[] = []
    while (i < rawDiff.length && rawDiff[i].type !== 'equal') {
      const changedToken = rawDiff[i]
      if (changedToken.type === 'delete') deleted.push(changedToken.value)
      else inserted.push(changedToken.value)
      i++
    }
    i--

    const matchedInsertions = new Map<number, string>()
    const unmatchedDeletions: string[] = []
    const availableInsertions = new Set(inserted.map((_, index) => index))

    for (let deleteIndex = 0; deleteIndex < deleted.length; deleteIndex++) {
      const oldText = deleted[deleteIndex]
      let bestIndex = -1
      let bestScore = -1
      for (const insertIndex of availableInsertions) {
        const score = lineSimilarity(oldText, inserted[insertIndex])
        if (score > bestScore) {
          bestIndex = insertIndex
          bestScore = score
        }
      }

      if (bestIndex >= 0 && (bestScore >= 0.2 || deleted.length === inserted.length)) {
        matchedInsertions.set(bestIndex, oldText)
        availableInsertions.delete(bestIndex)
      } else {
        unmatchedDeletions.push(oldText)
      }
    }

    for (const text of unmatchedDeletions) entries.push({ type: 'removed', text })
    for (let insertIndex = 0; insertIndex < inserted.length; insertIndex++) {
      const newText = inserted[insertIndex]
      const oldText = matchedInsertions.get(insertIndex)
      if (oldText === undefined) {
        entries.push({ type: 'added', text: newText })
      } else {
        entries.push({
          type: 'changed',
          oldText,
          newText,
          wordDiff: diffWords(oldText, newText)
        })
      }
    }
  }

  return entries
}

/** Wrap text to fit a max width for PDF table cells. */
export function wrapPdfText(
  text: string,
  maxWidth: number,
  measure: (line: string) => number
): string[] {
  const safe = sanitizePdfText(text)
  if (!safe) return []

  const words = safe.split(' ')
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (measure(test) > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}
