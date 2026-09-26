import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  TableOfContents,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  ImageRun,
  VerticalAlign,
  TableLayoutType
} from 'docx'
import { BrowserWindow, app, nativeImage } from 'electron'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Document, DocumentType, ExportOptions, Project } from '@shared/types'
import {
  parseHtmlToExportBlocks,
  resolveDocumentHtml,
  type ExportBlock,
  type ExportTableCell
} from '@shared/lib/document-html'
import {
  getDocumentTheme,
  resolveDocumentTheme,
  resolveDocumentPadding,
  paddingToDocxTwips,
  docxFontFromCss
} from '@shared/lib/document-theme'
import { DOCUMENT_TYPE_LABELS } from '@shared/lib/project-lifecycle'
import {
  buildClassificationBannerHtml,
  buildCoverCss,
  buildCoverHtml,
  buildCoverOnlyPrintHtml,
  buildWatermarkHtml,
  CLASSIFICATION_META,
  IMAGE_QUALITY_PRESETS,
  parseExportClassification,
  parseExportCoverStyle,
  parseExportImageQuality,
  parseExportOrientation,
  parseExportPageSize,
  parseExportWatermarkStyle,
  resolveCoverAccent,
  resolveCoverFont,
  resolveExportPageBox,
  resolveWatermarkText,
  type CoverHtmlInput
} from '@shared/lib/export-cover'
import { pdfPrintMargins, pdfPrintPaginationCss } from '@shared/lib/export-print'
import { logger } from '../infra/logger.service'
import {
  encryptPdfBytes,
  replacePdfFirstPage,
  blankPdfPageBands,
  pdfColorFromHex
} from './pdf-encrypt'
import { flowRepository } from '../repositories/flow.repository'
import {
  buildFlowDiagramSvg,
  flowSvgToDataUrl,
  type FlowExportEdge,
  type FlowExportNode
} from '@shared/lib/flow-export-svg'

interface ExportContext {
  document: Document
  project: Project
  options: ExportOptions
}

function hexForDocx(hex: string): string {
  return hex.replace('#', '').toUpperCase()
}

function themeFont(theme: ReturnType<typeof getDocumentTheme>): string {
  return docxFontFromCss(theme.fontFamily)
}

function cellFill(hex: string): { type: typeof ShadingType.SOLID; fill: string; color: string } {
  const fill = hexForDocx(hex)
  return { type: ShadingType.SOLID, fill, color: fill }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function logoImageRun(dataUrl: string): ImageRun | null {
  const match = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null

  const data = Buffer.from(match[2], 'base64')
  if (data.length === 0) return null

  let width = 96
  let height = 40
  if (match[1].toLowerCase() === 'png' && data.length >= 24) {
    const sourceWidth = data.readUInt32BE(16)
    const sourceHeight = data.readUInt32BE(20)
    if (sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.min(width / sourceWidth, height / sourceHeight)
      width = Math.max(1, Math.round(sourceWidth * scale))
      height = Math.max(1, Math.round(sourceHeight * scale))
    }
  }

  return new ImageRun({
    type: match[1].toLowerCase().startsWith('jp')
      ? 'jpg'
      : (match[1].toLowerCase() as 'png' | 'gif' | 'bmp'),
    data,
    transformation: { width, height },
    altText: { title: 'Company logo', description: 'Company logo', name: 'Company logo' }
  })
}

function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type.replace(/_/g, ' ')
}

function contentImageRun(dataUrl: string, maxWidth = 520): ImageRun | null {
  const match = /^data:image\/(png|jpe?g|gif|bmp|svg\+xml);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null

  const subtype = match[1].toLowerCase()
  if (subtype === 'svg+xml') {
    // docx ImageRun does not accept SVG — caller should convert first.
    return null
  }

  const data = Buffer.from(match[2], 'base64')
  if (data.length === 0) return null

  let width = maxWidth
  let height = Math.round(maxWidth * 0.55)
  if (subtype === 'png' && data.length >= 24) {
    const sourceWidth = data.readUInt32BE(16)
    const sourceHeight = data.readUInt32BE(20)
    if (sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.min(maxWidth / sourceWidth, 360 / sourceHeight)
      width = Math.max(1, Math.round(sourceWidth * scale))
      height = Math.max(1, Math.round(sourceHeight * scale))
    }
  }

  return new ImageRun({
    type: subtype.startsWith('jp') ? 'jpg' : (subtype as 'png' | 'gif' | 'bmp'),
    data,
    transformation: { width, height },
    altText: { title: 'Diagram', description: 'Document diagram', name: 'Diagram' }
  })
}

async function svgToPngDataUrl(svg: string): Promise<string | null> {
  let win: BrowserWindow | null = null
  try {
    const widthMatch = /width="(\d+(?:\.\d+)?)"/i.exec(svg)
    const heightMatch = /height="(\d+(?:\.\d+)?)"/i.exec(svg)
    const width = Math.min(900, Math.max(320, Math.round(Number(widthMatch?.[1] || 640))))
    const height = Math.min(700, Math.max(160, Math.round(Number(heightMatch?.[1] || 360))))
    win = new BrowserWindow({
      show: false,
      width,
      height,
      webPreferences: { offscreen: true, sandbox: true }
    })
    const html = `<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((r) => setTimeout(r, 80))
    const image = await win.webContents.capturePage()
    return image.toDataURL()
  } catch (error) {
    logger.warn(error instanceof Error ? error.message : 'SVG→PNG conversion failed', 'Export')
    return null
  } finally {
    win?.destroy()
  }
}

async function expandFlowBlocksInHtml(html: string): Promise<string> {
  const blockRegex = /<div\b[^>]*data-type=["']flow-block["'][^>]*>\s*<\/div>/gi
  const matches = [...html.matchAll(blockRegex)]
  if (matches.length === 0) return html

  let next = html
  // Replace from the end so indices stay valid when using string replace of exact match text
  for (const match of [...matches].reverse()) {
    const attrs = match[0]
    const flowId = /data-flow-id=["']([^"']*)["']/i.exec(attrs)?.[1]?.trim() || ''
    const title = /data-title=["']([^"']*)["']/i.exec(attrs)?.[1]?.trim() || 'Flowchart'
    let nodes: FlowExportNode[] = []
    let edges: FlowExportEdge[] = []
    if (flowId) {
      try {
        const flow = await flowRepository.getById(flowId)
        if (flow) {
          nodes = JSON.parse(flow.nodes || '[]') as FlowExportNode[]
          edges = JSON.parse(flow.edges || '[]') as FlowExportEdge[]
        }
      } catch {
        nodes = []
        edges = []
      }
    }
    const svg = buildFlowDiagramSvg(
      Array.isArray(nodes) ? nodes : [],
      Array.isArray(edges) ? edges : [],
      title
    )
    const png = await svgToPngDataUrl(svg)
    const src = png || flowSvgToDataUrl(svg)
    const figure = `<figure class="doc-flow-export"><img src="${src}" alt="${escapeHtml(title)}" style="max-width:100%;height:auto;" /><figcaption>${escapeHtml(title)}</figcaption></figure>`
    next = `${next.slice(0, match.index)}${figure}${next.slice(match.index + match[0].length)}`
  }
  return next
}

function coverHtmlInput(
  document: Document,
  project: Project,
  options: ExportOptions,
  theme: ReturnType<typeof getDocumentTheme>
): CoverHtmlInput {
  return {
    style: parseExportCoverStyle(options.coverStyle),
    accent: resolveCoverAccent(theme.accentColor, options.coverAccent),
    heading1Color: theme.heading1Color,
    bg: theme.bg,
    text: theme.text,
    muted: theme.heading3Color,
    fontFamily: resolveCoverFont(theme.fontFamily, options.coverFont),
    h1Size: theme.h1Size,
    companyName: project.companyName || '',
    companyLogo: project.companyLogo || '',
    showLogo: options.includeLogo !== false,
    projectName: project.name,
    title: document.title,
    typeLabel: documentTypeLabel(document.type),
    subtitle: options.coverSubtitle ?? '',
    preparedBy: options.preparedBy ?? '',
    themeLabel: theme.label,
    dateLabel: new Date().toLocaleDateString(),
    backgroundImage: options.coverBackground ?? '',
    overlay: options.coverOverlay
  }
}

function compressDataUrl(
  dataUrl: string,
  quality: ReturnType<typeof parseExportImageQuality>
): string {
  if (!dataUrl.startsWith('data:image/')) return dataUrl
  try {
    const spec = IMAGE_QUALITY_PRESETS[quality]
    const image = nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) return dataUrl
    const { width, height } = image.getSize()
    if (width <= 0 || height <= 0) return dataUrl
    const scale = Math.min(1, spec.maxEdge / Math.max(width, height))
    const resized =
      scale < 1
        ? image.resize({
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale))
          })
        : image
    if (quality === 'high' && scale === 1) return dataUrl
    return `data:image/jpeg;base64,${resized.toJPEG(Math.round(spec.jpeg * 100)).toString('base64')}`
  } catch {
    return dataUrl
  }
}

function compressHtmlImages(
  html: string,
  quality: ReturnType<typeof parseExportImageQuality>
): string {
  if (quality === 'high') return html
  return html.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, (match) =>
    compressDataUrl(match, quality)
  )
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
}

function buildDocxCover(
  document: Document,
  project: Project,
  options: ExportOptions,
  theme: ReturnType<typeof getDocumentTheme>
): DocxContent[] {
  const coverStyle = parseExportCoverStyle(options.coverStyle)
  const accent = resolveCoverAccent(theme.accentColor, options.coverAccent)
  const accentHex = hexForDocx(accent)
  const inverted = coverStyle === 'corporate' || coverStyle === 'bold'
  const alignment =
    coverStyle === 'minimal' ||
    coverStyle === 'editorial' ||
    coverStyle === 'bold' ||
    coverStyle === 'split'
      ? AlignmentType.LEFT
      : AlignmentType.CENTER
  const fill =
    coverStyle === 'bold'
      ? accentHex
      : coverStyle === 'corporate'
        ? hexForDocx(theme.heading1Color)
        : undefined
  const titleColor = inverted ? 'FFFFFF' : hexForDocx(theme.heading1Color)
  const muted = inverted ? 'E2E8F0' : '666666'
  const logo = options.includeLogo !== false ? logoImageRun(project.companyLogo) : null
  const typeLabel = documentTypeLabel(document.type)
  const subtitle = options.coverSubtitle?.trim() ?? ''
  const preparedBy = options.preparedBy?.trim() ?? ''

  const font = themeFont(theme)
  const paragraphs = (align: typeof alignment): Paragraph[] => {
    const items: Paragraph[] = []
    if (logo && coverStyle !== 'split') {
      items.push(new Paragraph({ children: [logo], alignment: align, spacing: { after: 200 } }))
    }
    if (project.companyName && coverStyle !== 'split') {
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: project.companyName,
              bold: true,
              font,
              size: 22,
              color: inverted ? 'FFFFFF' : accentHex
            })
          ],
          alignment: align,
          spacing: { after: 120 }
        })
      )
    }
    items.push(
      new Paragraph({
        children: [new TextRun({ text: project.name, font, size: 22, color: muted })],
        alignment: align,
        spacing: { after: 240 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: document.title,
            bold: true,
            font,
            size: coverStyle === 'bold' ? 56 : coverStyle === 'minimal' ? 44 : 50,
            color: titleColor
          })
        ],
        alignment: align,
        spacing: { after: 160 }
      })
    )
    if (subtitle) {
      items.push(
        new Paragraph({
          children: [new TextRun({ text: subtitle, font, size: 24, color: muted })],
          alignment: align,
          spacing: { after: 160 }
        })
      )
    }
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: typeLabel,
            bold: true,
            font,
            size: 24,
            color: inverted ? 'FFFFFF' : accentHex
          })
        ],
        alignment: align,
        spacing: { after: 80 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${theme.label} theme · ${new Date().toLocaleDateString()}`,
            font,
            size: 20,
            color: muted
          })
        ],
        alignment: align,
        spacing: { after: 80 }
      })
    )
    if (preparedBy) {
      items.push(
        new Paragraph({
          children: [new TextRun({ text: `Prepared by ${preparedBy}`, font, size: 20, color: muted })],
          alignment: align,
          spacing: { after: 200 }
        })
      )
    }
    return items
  }

  const pageBreak = new Paragraph({
    children: [new TextRun({ text: '', break: 1 })],
    pageBreakBefore: true
  })

  if (coverStyle === 'split') {
    const rail: Paragraph[] = [new Paragraph({ text: '', spacing: { before: 1600 } })]
    if (logo) rail.push(new Paragraph({ children: [logo], spacing: { after: 200 } }))
    if (project.companyName) {
      rail.push(
        new Paragraph({
          children: [
            new TextRun({ text: project.companyName, bold: true, font, size: 22, color: 'FFFFFF' })
          ]
        })
      )
    }
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 36, type: WidthType.PERCENTAGE },
                shading: cellFill(accentHex),
                verticalAlign: VerticalAlign.BOTTOM,
                children: rail.length ? rail : [new Paragraph({ text: '' })]
              }),
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 64, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                children: paragraphs(AlignmentType.LEFT)
              })
            ]
          })
        ]
      }),
      pageBreak
    ]
  }

  if (fill) {
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 100, type: WidthType.PERCENTAGE },
                shading: cellFill(fill),
                children: [
                  new Paragraph({
                    text: '',
                    spacing: { before: coverStyle === 'bold' ? 2800 : 2000 }
                  }),
                  ...paragraphs(alignment)
                ]
              })
            ]
          })
        ]
      }),
      pageBreak
    ]
  }

  return [
    new Paragraph({
      text: '',
      spacing: { before: coverStyle === 'minimal' || coverStyle === 'editorial' ? 2800 : 1800 }
    }),
    ...paragraphs(alignment),
    pageBreak
  ]
}

type DocxContent = Paragraph | TableOfContents | Table

function tableCellBorders(
  style: Extract<ExportBlock, { type: 'table' }>['tableStyle'],
  header: boolean,
  borderColor?: string
) {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const custom = borderColor ? hexForDocx(borderColor) : undefined
  if (style === 'minimal') {
    return {
      top: none,
      left: none,
      right: none,
      bottom: {
        style: BorderStyle.SINGLE,
        size: header ? 12 : 4,
        color: custom ?? (header ? '94A3B8' : 'E2E8F0')
      }
    }
  }
  if (style === 'bordered') {
    const edge = { style: BorderStyle.SINGLE, size: 8, color: custom ?? '475569' }
    return { top: edge, bottom: edge, left: edge, right: edge }
  }
  const grid = { style: BorderStyle.SINGLE, size: 4, color: custom ?? 'CBD5E1' }
  return { top: grid, bottom: grid, left: grid, right: grid }
}

function tableCellMargins(size: Extract<ExportBlock, { type: 'table' }>['tableSize']) {
  if (size === 'spacious') return { top: 80, bottom: 80, left: 120, right: 120 }
  if (size === 'normal') return { top: 60, bottom: 60, left: 100, right: 100 }
  return { top: 40, bottom: 40, left: 80, right: 80 }
}

function cellVerticalAlign(align: ExportTableCell['verticalAlign']) {
  if (align === 'top') return VerticalAlign.TOP
  if (align === 'bottom') return VerticalAlign.BOTTOM
  return VerticalAlign.CENTER
}

function themeHeaderFill(theme: ReturnType<typeof getDocumentTheme>): string {
  if (theme.id === 'modern') return 'EEF2FF'
  if (theme.id === 'compact') return 'F1F5F4'
  if (theme.id === 'corporate') return 'F3F4F6'
  return 'E2E8F0'
}

function tableBlockToDocx(
  block: Extract<ExportBlock, { type: 'table' }>,
  theme: ReturnType<typeof getDocumentTheme>
): Table {
  const cells: ExportTableCell[][] =
    block.cells && block.cells.length > 0
      ? block.cells
      : (block.headers.length > 0 ? [block.headers, ...block.rows] : block.rows).map((row, rowIndex) =>
          row.map((text) => ({
            text,
            header: block.headers.length > 0 && rowIndex === 0
          }))
        )
  const rowSpanCount = (row: ExportTableCell[]) =>
    row.reduce((total, cell) => total + (cell.colSpan && cell.colSpan > 1 ? cell.colSpan : 1), 0)
  const colCount = Math.max(0, ...cells.map(rowSpanCount))
  const hasMergedCells = cells.some((row) =>
    row.some((cell) => (cell.colSpan ?? 1) > 1 || (cell.rowSpan ?? 1) > 1)
  )
  const font = themeFont(theme)
  const compact = block.tableSize === 'compact'
  const fontSize = Math.max(16, Math.round(theme.bodyFontSize * 2 * (compact ? 0.82 : 1)))
  const stripeFill = 'F1F5F9'
  const headerFill = themeHeaderFill(theme)
  const columnWidths = cells[0]?.flatMap((cell) => {
    const span = cell.colSpan && cell.colSpan > 1 ? cell.colSpan : 1
    const dxa = cell.width ? Math.round((cell.width / span) * 15) : 0
    return Array.from({ length: span }, () => dxa)
  })
  const resolvedColumnWidths = columnWidths?.some((width) => width > 0)
    ? columnWidths.map((width) => (width > 0 ? width : 1440))
    : undefined

  return new Table({
    width:
      block.tableWidth === 'auto'
        ? { size: 0, type: WidthType.AUTO }
        : { size: 100, type: WidthType.PERCENTAGE },
    layout: resolvedColumnWidths || block.tableWidth === 'auto' ? TableLayoutType.FIXED : TableLayoutType.AUTOFIT,
    columnWidths: resolvedColumnWidths,
    rows: cells.map((row, rowIndex) => {
      const padded = [...row]
      if (!hasMergedCells) {
        while (padded.length < colCount) padded.push({ text: '' })
      }
      const stripe = block.tableStyle === 'striped' && rowIndex > 0 && rowIndex % 2 === 1

      return new TableRow({
        tableHeader: padded.some((cell) => cell.header) && rowIndex === 0,
        cantSplit: true,
        children: padded.map((cell) => {
          const isHeader = Boolean(cell.header) || (rowIndex === 0 && block.headers.length > 0)
          const explicit = cell.background
          const fillHex =
            explicit ??
            (block.tableStyle === 'minimal'
              ? undefined
              : isHeader
                ? `#${headerFill}`
                : stripe
                  ? `#${stripeFill}`
                  : undefined)
          const align =
            cell.align === 'center'
              ? AlignmentType.CENTER
              : cell.align === 'right'
                ? AlignmentType.RIGHT
                : cell.align === 'justify'
                  ? AlignmentType.BOTH
                  : AlignmentType.LEFT
          return new TableCell({
            borders: tableCellBorders(block.tableStyle, isHeader, cell.borderColor),
            shading: fillHex ? cellFill(fillHex) : undefined,
            width: cell.width
              ? { size: Math.round(cell.width * 15), type: WidthType.DXA }
              : undefined,
            columnSpan: cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined,
            rowSpan: cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined,
            margins: tableCellMargins(block.tableSize),
            verticalAlign: cellVerticalAlign(cell.verticalAlign),
            children: [
              new Paragraph({
                alignment: align,
                children: [
                  new TextRun({
                    text: cell.text || ' ',
                    bold: isHeader,
                    font,
                    size: fontSize,
                    color: isHeader ? hexForDocx(theme.heading2Color) : hexForDocx(theme.text)
                  })
                ],
                spacing: { before: 20, after: 20 }
              })
            ]
          })
        })
      })
    })
  })
}

function blocksToDocxContent(
  blocks: ExportBlock[],
  theme: ReturnType<typeof getDocumentTheme>
): DocxContent[] {
  const content: DocxContent[] = []
  const font = themeFont(theme)

  for (const block of blocks) {
    if (block.type === 'table') {
      content.push(tableBlockToDocx(block, theme))
      content.push(new Paragraph({ text: '', spacing: { after: 120 } }))
      continue
    }

    if (block.type === 'image') {
      const image = contentImageRun(block.src, block.width ?? 520)
      if (image) {
        content.push(
          new Paragraph({
            children: [image],
            alignment: AlignmentType.CENTER,
            spacing: { before: 160, after: 80 }
          })
        )
        if (block.alt) {
          content.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: block.alt,
                  italics: true,
                  font,
                  size: Math.max(16, theme.bodyFontSize * 2 - 4),
                  color: '64748B'
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 160 }
            })
          )
        }
      } else {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.alt ? `[Diagram: ${block.alt}]` : '[Diagram]',
                italics: true,
                font,
                size: theme.bodyFontSize * 2,
                color: '64748B'
              })
            ],
            spacing: { after: 120 }
          })
        )
      }
      continue
    }

    if (block.type === 'heading') {
      const heading =
        block.level === 1
          ? HeadingLevel.HEADING_1
          : block.level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3
      const color =
        block.level === 1
          ? hexForDocx(theme.heading1Color)
          : block.level === 2
            ? hexForDocx(theme.heading2Color)
            : hexForDocx(theme.heading3Color)
      const size =
        block.level === 1
          ? theme.h1Size * 2
          : block.level === 2
            ? theme.h2Size * 2
            : theme.h3Size * 2

      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text,
              bold: true,
              font,
              size,
              color,
              underline: block.level === 2 && theme.h2Underline ? {} : undefined
            })
          ],
          heading,
          border:
            block.level === 2 && theme.h2Border
              ? {
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 6,
                    color: 'E2E8F0',
                    space: 4
                  }
                }
              : undefined,
          spacing: {
            before: block.level === 1 ? 400 : 300,
            after: block.level === 1 ? 200 : 150,
            line: Math.round(theme.lineHeight * 240)
          }
        })
      )
    } else if (block.type === 'bullet') {
      const bulletText =
        block.ordered && block.number != null ? `${block.number}. ${block.text}` : block.text

      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: bulletText,
              font,
              size: theme.bodyFontSize * 2,
              color: hexForDocx(theme.text)
            })
          ],
          bullet: block.ordered ? undefined : { level: 0 },
          indent: block.ordered ? { left: 360 } : undefined,
          spacing: { after: 100, line: Math.round(theme.lineHeight * 240) }
        })
      )
    } else if (block.type === 'paragraph') {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text,
              font,
              size: theme.bodyFontSize * 2,
              color: hexForDocx(theme.text)
            })
          ],
          spacing: { after: 120, line: Math.round(theme.lineHeight * 240) }
        })
      )
    }
  }

  if (content.length === 0) {
    content.push(new Paragraph({ text: 'No content available.' }))
  }

  return content
}

export class ExportService {
  async exportDocx(context: ExportContext, outputPath: string): Promise<void> {
    const { document, project, options } = context
    const isChatGpt = document.style === 'chatgpt'
    const theme = resolveDocumentTheme(document.pageTheme, document.pageSettings)
    const padding = resolveDocumentPadding(document)
    const margins = paddingToDocxTwips(padding)
    const headerLogo = options.includeLogo !== false ? logoImageRun(project.companyLogo) : null
    const tocStyle = options.tocStyle ?? 'classic'
    const headerStyle = options.headerFooterStyle ?? 'standard'
    const pageNumberStyle = options.pageNumberStyle ?? 'page-total'
    const pageSize = resolveExportPageBox(
      parseExportPageSize(options.pageSize),
      parseExportOrientation(options.orientation)
    )
    const classification = parseExportClassification(options.classification)
    const watermarkText = options.includeWatermark
      ? resolveWatermarkText(
          parseExportWatermarkStyle(options.watermarkStyle),
          options.watermarkText
        )
      : ''
    const bodyFont = themeFont(theme)
    const pageNumberRuns =
      pageNumberStyle === 'number'
        ? [new TextRun({ children: [PageNumber.CURRENT], font: bodyFont, size: 18, color: '888888' })]
        : pageNumberStyle === 'page'
          ? [
              new TextRun({ text: 'Page ', font: bodyFont, size: 18, color: '888888' }),
              new TextRun({ children: [PageNumber.CURRENT], font: bodyFont, size: 18, color: '888888' })
            ]
          : [
              new TextRun({ text: 'Page ', font: bodyFont, size: 18, color: '888888' }),
              new TextRun({ children: [PageNumber.CURRENT], font: bodyFont, size: 18, color: '888888' }),
              new TextRun({ text: ' of ', font: bodyFont, size: 18, color: '888888' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: bodyFont, size: 18, color: '888888' })
            ]
    const sections = []
    const children: DocxContent[] = []

    if (options.includeCoverPage !== false && !isChatGpt) {
      children.push(...buildDocxCover(document, project, options, theme))
    }

    if (options.includeTableOfContents !== false && !isChatGpt) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Table of Contents',
              bold: true,
              font: bodyFont,
              size: tocStyle === 'compact' ? theme.h2Size * 2 : theme.h1Size * 2,
              color: hexForDocx(theme.heading1Color)
            })
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: tocStyle === 'compact' ? 160 : 300 }
        }),
        new TableOfContents('Contents', {
          hyperlink: true,
          headingStyleRange: '1-3'
        }),
        new Paragraph({
          children: [new TextRun({ text: '', break: 1 })],
          pageBreakBefore: true
        })
      )
    }

    const html = await expandFlowBlocksInHtml(resolveDocumentHtml(document))
    const blocks = parseHtmlToExportBlocks(html)
    children.push(...blocksToDocxContent(blocks, theme))

    const showHeader =
      (options.includeHeaderFooter !== false || classification !== 'none' || !!watermarkText) &&
      !isChatGpt
    const classificationMeta =
      classification === 'none' ? null : CLASSIFICATION_META[classification]
    const headerChildren: Paragraph[] = []
    if (classificationMeta) {
      headerChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: classificationMeta.label.toUpperCase(),
              bold: true,
              size: 16,
              color: hexForDocx(classificationMeta.color)
            })
          ],
          alignment: AlignmentType.CENTER,
          shading: cellFill(classificationMeta.background)
        })
      )
    }
    if (watermarkText) {
      headerChildren.push(
        new Paragraph({
          children: [new TextRun({ text: watermarkText, bold: true, size: 16, color: 'CBD5E1' })],
          alignment: AlignmentType.CENTER
        })
      )
    }
    if (options.includeHeaderFooter !== false) {
      headerChildren.push(
        new Paragraph({
          children: [
            ...(headerStyle !== 'minimal' && headerLogo
              ? [headerLogo, new TextRun({ text: '    ' })]
              : []),
            new TextRun({
              text:
                headerStyle === 'minimal' ? document.title : `${project.name} | ${document.title}`,
              font: bodyFont,
              size: 18,
              bold: headerStyle === 'branded',
              color: headerStyle === 'branded' ? theme.coverAccent : hexForDocx(theme.heading3Color)
            })
          ],
          alignment:
            headerStyle !== 'minimal' && headerLogo ? AlignmentType.LEFT : AlignmentType.RIGHT
        })
      )
    }

    const hasCover = options.includeCoverPage !== false && !isChatGpt
    const showFooter = options.includePageNumbers !== false && !isChatGpt
    // Cover is page 1 — use a blank first header/footer so HF only starts on content.
    sections.push({
      properties: {
        page: {
          size: {
            width: pageSize.docxTwips.width,
            height: pageSize.docxTwips.height
          },
          margin: {
            top: margins.top,
            right: margins.right,
            bottom: margins.bottom,
            left: margins.left
          },
          titlePage: hasCover
        }
      },
      headers: showHeader
        ? {
            default: new Header({
              children: headerChildren
            }),
            ...(hasCover ? { first: new Header({ children: [] }) } : {})
          }
        : undefined,
      footers: showFooter
        ? {
            default: new Footer({
              children: [
                new Paragraph({
                  children: pageNumberRuns,
                  alignment: AlignmentType.CENTER
                })
              ]
            }),
            ...(hasCover ? { first: new Footer({ children: [] }) } : {})
          }
        : undefined,
      children
    })

    const doc = new DocxDocument({
      background: {
        color: hexForDocx(isChatGpt ? '#ffffff' : theme.bg)
      },
      styles: {
        default: {
          document: {
            run: {
              font: themeFont(theme),
              size: theme.bodyFontSize * 2,
              color: hexForDocx(isChatGpt ? '#0d0d0d' : theme.text)
            },
            paragraph: {
              spacing: { line: Math.round(theme.lineHeight * 240) }
            }
          }
        },
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            next: 'Normal',
            run: {
              font: themeFont(theme),
              size: theme.h1Size * 2,
              bold: true,
              color: hexForDocx(theme.heading1Color)
            },
            paragraph: {
              spacing: { before: 400, after: 200, line: Math.round(theme.lineHeight * 240) }
            }
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            basedOn: 'Normal',
            next: 'Normal',
            run: {
              font: themeFont(theme),
              size: theme.h2Size * 2,
              bold: true,
              color: hexForDocx(theme.heading2Color)
            },
            paragraph: {
              spacing: { before: 300, after: 150, line: Math.round(theme.lineHeight * 240) }
            }
          },
          {
            id: 'Heading3',
            name: 'Heading 3',
            basedOn: 'Normal',
            next: 'Normal',
            run: {
              font: themeFont(theme),
              size: theme.h3Size * 2,
              bold: true,
              color: hexForDocx(theme.heading3Color)
            },
            paragraph: {
              spacing: { before: 200, after: 100, line: Math.round(theme.lineHeight * 240) }
            }
          }
        ]
      },
      sections
    })

    const buffer = await Packer.toBuffer(doc)
    writeFileSync(outputPath, buffer)
    logger.info(`Exported DOCX: ${outputPath}`, 'ExportService')
  }

  /**
   * Build a print-ready HTML document whose styling mirrors the in-app editor
   * view (`.document-page-content.tiptap` + the per-theme rules in globals.css).
   * Rendering this through Chromium gives a PDF that is visually identical to
   * what the user sees on screen — tables, header shading, heading colors,
   * highlights, inline text colors, images, alignment, code blocks, etc.
   */
  private async buildPrintHtml(context: ExportContext): Promise<string> {
    const { document, project, options } = context
    const isChatGpt = document.style === 'chatgpt'
    const theme = resolveDocumentTheme(document.pageTheme, document.pageSettings)
    const padding = resolveDocumentPadding(document)
    const html = await expandFlowBlocksInHtml(resolveDocumentHtml(document))

    // Keep page + body on the same background so PDF paper gutters do not
    // show as pure white against a themed content area.
    const pageBg = isChatGpt ? '#ffffff' : theme.bg
    const pageText = isChatGpt ? '#0d0d0d' : theme.text

    const wantsFooter =
      options.includePageNumbers !== false || options.includeHeaderFooter !== false
    const wantsHeader = options.includeHeaderFooter !== false && !isChatGpt
    // Reserve room for Chromium header/footer bands so theme padding is not doubled.
    const chrome = pdfPrintMargins(wantsHeader, wantsFooter && !isChatGpt)
    const contentPadTop = Math.max(20, padding.top - chrome.headerBandPx)
    const contentPadBottom = Math.max(20, padding.bottom - chrome.footerBandPx)
    const contentPadLeft = padding.left
    const contentPadRight = padding.right

    // Theme CSS variables, identical to themeToCssVars() used by the editor.
    const themeVars = `
      --doc-font-family: ${theme.fontFamily};
      --doc-body-size: ${theme.bodyFontSize}px;
      --doc-line-height: ${theme.lineHeight};
      --doc-h1-size: ${theme.h1Size}px;
      --doc-h2-size: ${theme.h2Size}px;
      --doc-h3-size: ${theme.h3Size}px;
      --doc-h1-color: ${theme.heading1Color};
      --doc-h2-color: ${theme.heading2Color};
      --doc-h3-color: ${theme.heading3Color};
      --doc-accent: ${theme.accentColor};
      --doc-h2-border: ${theme.h2Border ? '1px solid #e2e8f0' : 'none'};
      --doc-page-bg: ${pageBg};
      --doc-page-text: ${pageText};
      --doc-pad-top: ${contentPadTop}px;
      --doc-pad-right: ${contentPadRight}px;
      --doc-pad-bottom: ${contentPadBottom}px;
      --doc-pad-left: ${contentPadLeft}px;
    `

    const classicUnderline =
      theme.id === 'classic'
        ? `.content h2 { border-bottom: none; text-decoration: underline; text-underline-offset: 4px; }`
        : ''

    const modernExtras =
      theme.id === 'modern'
        ? `
      .content h1 { position: relative; padding-bottom: 0.85rem; }
      .content h1::after {
        content: ''; position: absolute; left: 0; bottom: 0; width: 3.5rem; height: 3px;
        border-radius: 999px; background: linear-gradient(90deg, var(--doc-accent), #a78bfa);
      }
      .content h2 {
        border-bottom: none; border-left: 3px solid var(--doc-accent);
        padding: 0.35rem 0 0.35rem 0.75rem;
        background: linear-gradient(90deg, rgb(99 102 241 / 8%), transparent 72%);
        border-radius: 0 6px 6px 0;
      }
      .content table { overflow: visible; border-radius: 8px; border-color: #e0e7ff; }
      .content th { background: #eef2ff; color: #3730a3; border-color: #e0e7ff; }
    `
        : ''

    const customHeadingCss =
      document.pageSettings?.headingStyle === 'accent'
        ? `.content h2 { border: 0; border-left: 3px solid var(--doc-accent); background: linear-gradient(90deg, color-mix(in srgb, var(--doc-accent) 9%, transparent), transparent 76%); padding: .3rem 0 .3rem .65rem; text-decoration: none; }`
        : document.pageSettings?.headingStyle === 'underline'
          ? `.content h2 { border: 0; border-bottom: 2px solid var(--doc-accent); background: transparent; padding-left: 0; text-decoration: none; }`
          : document.pageSettings?.headingStyle === 'plain'
            ? `.content h2 { border: 0; background: transparent; padding-left: 0; text-decoration: none; }`
            : ''
    const paragraphSpacing =
      document.pageSettings?.paragraphSpacing === 'compact'
        ? '0.4rem'
        : document.pageSettings?.paragraphSpacing === 'relaxed'
          ? '1.1rem'
          : '0.75rem'

    // ChatGPT presentation style — mirrors the `[data-style='chatgpt']` rules in
    // globals.css so a ChatGPT-styled document exports exactly as it appears.
    const chatgptCss = isChatGpt
      ? `
      body {
        background: #ffffff;
        font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
        line-height: 1.75;
        letter-spacing: -0.01em;
      }
      .content { max-width: 680px; margin: 0 auto; color: #0d0d0d; background: #ffffff; }
      .content h1 { font-size: 1.75rem; font-weight: 600; color: #0d0d0d; margin: 0 0 1.25rem; border: none; letter-spacing: -0.01em; }
      .content h2 { font-size: 1.25rem; font-weight: 600; color: #0d0d0d; margin: 1.75rem 0 0.75rem; border: none; padding-bottom: 0; text-decoration: none; }
      .content h3 { font-size: 1.05rem; font-weight: 600; color: #0d0d0d; margin: 1.25rem 0 0.5rem; }
      .content p { margin: 0 0 1rem; color: #0d0d0d; }
      .content ul, .content ol { margin: 0 0 1rem; padding-left: 1.5rem; }
      .content li { margin-bottom: 0.35rem; }
    `
      : ''

    // Cover page — same HTML/CSS as the in-app export preview.
    const coverHtml =
      options.includeCoverPage !== false && !isChatGpt
        ? buildCoverHtml(coverHtmlInput(document, project, options, theme))
        : ''
    const classificationHtml = isChatGpt
      ? ''
      : buildClassificationBannerHtml(parseExportClassification(options.classification))
    const watermarkHtml =
      !isChatGpt && options.includeWatermark
        ? buildWatermarkHtml(
            resolveWatermarkText(
              parseExportWatermarkStyle(options.watermarkStyle),
              options.watermarkText
            )
          )
        : ''

    // Table of contents from headings (h1–h3).
    let tocHtml = ''
    if (options.includeTableOfContents !== false && !isChatGpt) {
      const headings = parseHtmlToExportBlocks(html).filter(
        (b): b is Extract<ExportBlock, { type: 'heading' }> => b.type === 'heading'
      )
      const items = headings.length
        ? headings.map((h) => `<li class="toc-l${h.level}">${escapeHtml(h.text)}</li>`).join('')
        : '<li class="toc-l1">Document Content</li>'
      tocHtml = `<section class="toc toc-${options.tocStyle ?? 'classic'}">
          <h1>Table of Contents</h1>
          <ul class="toc-list">${items}</ul>
        </section>`
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light only" />
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: ${pageBg};
    color: ${pageText};
    color-scheme: light only;
  }
  body {
    ${themeVars}
    font-family: var(--doc-font-family);
    font-size: var(--doc-body-size);
    line-height: var(--doc-line-height);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Document padding lives in the page flow so the themed background fills
     the whole sheet instead of leaving white Chromium print gutters. */
  .page-section {
    background: ${pageBg};
    color: ${pageText};
    padding: var(--doc-pad-top) var(--doc-pad-right) var(--doc-pad-bottom) var(--doc-pad-left);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .content { color: ${pageText}; background: ${pageBg}; }

  .content h1 {
    font-size: var(--doc-h1-size); font-weight: 700; color: var(--doc-h1-color);
    margin: 0.5rem 0 1rem; letter-spacing: -0.02em;
  }
  .content h2 {
    font-size: var(--doc-h2-size); font-weight: 600; color: var(--doc-h2-color);
    margin: 1.5rem 0 0.75rem; border-bottom: var(--doc-h2-border); padding-bottom: 0.25rem;
  }
  .content h3 {
    font-size: var(--doc-h3-size); font-weight: 600; color: var(--doc-h3-color);
    margin: 1rem 0 0.5rem;
  }
  ${classicUnderline}
  ${modernExtras}
  ${customHeadingCss}
  .content p { margin: 0 0 ${paragraphSpacing}; color: inherit; }
  .content ul, .content ol { margin: 0 0 0.75rem 1.5rem; padding: 0; }
  .content ul { list-style: disc; }
  .content ol { list-style: decimal; }
  .content li { margin-bottom: 0.25rem; color: inherit; }
  .content a { color: var(--doc-accent); text-decoration: underline; }
  .content blockquote {
    border-left: 3px solid var(--doc-accent); padding-left: 1rem; margin: 1rem 0;
    color: var(--doc-h3-color); font-style: italic;
  }
  .content hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0; }
  .content table {
    border-collapse: collapse; width: 100%; margin: 0 0 1rem; font-size: 0.9em;
    page-break-inside: auto;
  }
  .content tr { page-break-inside: avoid; }
  .content th, .content td {
    border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; vertical-align: top;
  }
  .content th { background: #f1f5f9; font-weight: 600; color: var(--doc-h2-color); }
  .content table[data-table-width='auto'] { width: auto; max-width: 100%; }
  .content table[data-table-width='full'] { width: 100%; }
  .content table[data-table-size='compact'] th,
  .content table[data-table-size='compact'] td { padding: 3px 6px; font-size: 0.82em; line-height: 1.35; }
  .content table[data-table-size='normal'] th,
  .content table[data-table-size='normal'] td { padding: 6px 9px; font-size: 0.9em; line-height: 1.45; }
  .content table[data-table-size='spacious'] th,
  .content table[data-table-size='spacious'] td { padding: 10px 12px; font-size: 0.95em; line-height: 1.55; }
  .content table[data-table-style='bordered'] { border: 2px solid #475569; }
  .content table[data-table-style='bordered'] th,
  .content table[data-table-style='bordered'] td { border: 1px solid #64748b; }
  .content table[data-table-style='striped'] tbody tr:nth-child(even) td,
  .content table[data-table-style='striped'] > tr:nth-child(even) td { background-color: #f1f5f9; }
  .content table[data-table-style='minimal'] { border: none; }
  .content table[data-table-style='minimal'] th,
  .content table[data-table-style='minimal'] td {
    border-width: 0 0 1px; border-color: #e2e8f0; background: transparent;
  }
  .content th[data-valign='top'], .content td[data-valign='top'] { vertical-align: top; }
  .content th[data-valign='middle'], .content td[data-valign='middle'] { vertical-align: middle; }
  .content th[data-valign='bottom'], .content td[data-valign='bottom'] { vertical-align: bottom; }
  .content img { max-width: 100%; height: auto; border-radius: 6px; }
  .content .image-block { display: flex; margin: 1rem 0; }
  .content .image-block.image-align-center { justify-content: center; }
  .content .image-block.image-align-right { justify-content: flex-end; }
  .content .image-drag-handle, .content .image-resize-handle { display: none !important; }
  .content pre {
    background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px;
    font-family: 'Consolas', 'Courier New', monospace; font-size: 0.85em; overflow: auto;
    white-space: pre-wrap; word-break: break-word;
  }
  .content code {
    background: #f1f5f9; border-radius: 3px; padding: 1px 4px;
    font-family: 'Consolas', 'Courier New', monospace; font-size: 0.85em;
  }
  .content pre code { background: transparent; padding: 0; }
  .content mark { background: #fef9c3; border-radius: 2px; padding: 0 2px; }
  .content ul[data-type='taskList'] { list-style: none; margin-left: 0; padding-left: 0; }
  .content ul[data-type='taskList'] li { display: flex; align-items: flex-start; gap: 0.5rem; }
  .content [style*='text-align: center'] { text-align: center; }
  .content [style*='text-align: right'] { text-align: right; }
  .content [style*='text-align: justify'] { text-align: justify; }

  ${buildCoverCss()}
  .cover { background-clip: padding-box; }

  /* Table of contents */
  .toc { page-break-after: always; background: ${pageBg}; }
  .toc h1 { font-size: var(--doc-h1-size); font-weight: 700; color: var(--doc-h1-color); margin: 0 0 1.25rem; }
  .toc-list { list-style: none; margin: 0; padding: 0; }
  .toc-list li { margin: 0.4rem 0; color: ${pageText}; }
  .toc-l1 { font-weight: 600; color: var(--doc-h2-color); margin-top: 0.6rem; }
  .toc-l2 { padding-left: 1.25rem; }
  .toc-l3 { padding-left: 2.5rem; font-size: 0.95em; color: #64748b; }
  .toc-compact .toc-list li { margin: 0.15rem 0; font-size: 0.9em; }
  .toc-numbered .toc-list { counter-reset: toc-item; }
  .toc-numbered .toc-list li { counter-increment: toc-item; display: flex; gap: 0.65rem; }
  .toc-numbered .toc-list li::before { content: counter(toc-item, decimal-leading-zero); color: var(--doc-accent); font-weight: 600; }

  ${pdfPrintPaginationCss()}

  /* Document-style overrides (applied last so they win) */
  ${chatgptCss}
</style>
</head>
<body class="export-print${parseExportOrientation(options.orientation) === 'landscape' ? ' landscape' : ''}">
  ${classificationHtml}
  ${watermarkHtml}
  ${coverHtml}
  ${tocHtml ? tocHtml.replace('<section class="toc', '<section class="page-section toc') : ''}
  <main class="page-section content tiptap" data-doc-theme="${escapeHtml(theme.id)}" data-style="${escapeHtml(document.style)}">
    ${html || '<p>No content available.</p>'}
  </main>
</body>
</html>`
  }

  async exportPdf(context: ExportContext, outputPath: string): Promise<void> {
    const { document, project, options } = context
    const isChatGpt = document.style === 'chatgpt'
    const theme = resolveDocumentTheme(document.pageTheme, document.pageSettings)
    const pageBg = isChatGpt ? '#ffffff' : theme.bg

    // Chromium header/footer paint inside these margins. Keep them large enough
    // that chrome never overlaps body text; theme padding lives in the HTML.
    const wantsFooter =
      options.includePageNumbers !== false || options.includeHeaderFooter !== false
    const wantsHeader = options.includeHeaderFooter !== false && !isChatGpt
    const pageSize = resolveExportPageBox(
      parseExportPageSize(options.pageSize),
      parseExportOrientation(options.orientation)
    )
    const includeLogo = options.includeLogo !== false
    const chrome = pdfPrintMargins(wantsHeader, wantsFooter && !isChatGpt)
    const margins = {
      top: chrome.top,
      bottom: chrome.bottom,
      left: chrome.left,
      right: chrome.right
    }

    const html = compressHtmlImages(
      await this.buildPrintHtml(context),
      parseExportImageQuality(options.imageQuality)
    )
    const tempPath = join(app.getPath('temp'), `studio-export-${randomUUID()}.html`)
    writeFileSync(tempPath, html, 'utf-8')

    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    try {
      await win.loadFile(tempPath)
      // Wait for fonts/images, then keep headings with the following block so
      // Chromium does not park a heading on one page and slice its first line.
      await win.webContents.executeJavaScript(`
        (async () => {
          if (document.fonts) await document.fonts.ready
          await Promise.race([
            Promise.all(Array.from(document.images).map((img) => {
              if (img.complete) return Promise.resolve()
              return new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true })
                img.addEventListener('error', resolve, { once: true })
              })
            })),
            new Promise((resolve) => setTimeout(resolve, 4000))
          ])
          const content = document.querySelector('main.content')
          if (content) {
            const headings = Array.from(content.querySelectorAll('h1,h2,h3,h4,h5,h6'))
            for (const heading of headings) {
              if (heading.parentElement && heading.parentElement.classList.contains('pdf-keep')) continue
              const next = heading.nextElementSibling
              if (!next || /^H[1-6]$/.test(next.tagName)) continue
              if (next.matches('.doc-page-break, [data-page-break]')) continue
              const wrap = document.createElement('div')
              wrap.className = 'pdf-keep'
              heading.parentNode.insertBefore(wrap, heading)
              wrap.appendChild(heading)
              wrap.appendChild(next)
            }
          }
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          return true
        })()
      `)

      const footerTemplate = this.buildFooterTemplate(
        project.name,
        document.title,
        options,
        isChatGpt,
        pageBg
      )
      const headerTemplate = this.buildHeaderTemplate(
        project,
        document.title,
        wantsHeader,
        options.headerFooterStyle ?? 'standard',
        theme.accentColor,
        pageBg,
        includeLogo
      )
      const displayHeaderFooter = !isChatGpt && wantsFooter
      // Prefer live DOM so we still strip HF if cover HTML is present.
      const hasCoverInDom = await win.webContents.executeJavaScript(
        'Boolean(document.querySelector("section.cover, .cover"))'
      )
      const hasCover = (options.includeCoverPage !== false && !isChatGpt) || Boolean(hasCoverInDom)
      const printBase = {
        printBackground: true as const,
        preferCSSPageSize: false as const,
        pageSize: pageSize.electron,
        landscape: pageSize.landscape
      }
      // Electron requires marginType: 'custom' for top/bottom/left/right to apply.
      const contentMargins = { marginType: 'custom' as const, ...margins }
      const coverMargins = {
        marginType: 'custom' as const,
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }

      let pdfBytes: Buffer | Uint8Array = await win.webContents.printToPDF({
        ...printBase,
        margins: hasCover && !displayHeaderFooter ? coverMargins : contentMargins,
        displayHeaderFooter,
        headerTemplate,
        footerTemplate
      })

      // Chromium cannot omit header/footer on page 1 only. Print a dedicated
      // cover sheet (title, branding, metadata — no running chrome) and swap
      // it in so the cover stays a clean title page.
      if (hasCover) {
        try {
          const coverPdf = await this.printCleanCoverPdf(context, printBase, coverMargins)
          pdfBytes = await replacePdfFirstPage(pdfBytes, coverPdf)
        } catch (coverError) {
          logger.warn(
            coverError instanceof Error
              ? coverError.message
              : 'Cover header/footer strip failed; blanking bands',
            'ExportService'
          )
          pdfBytes = await blankPdfPageBands(pdfBytes, 0, {
            topBandInches: margins.top,
            bottomBandInches: margins.bottom,
            color: pdfColorFromHex(pageBg)
          })
        }
      }

      const password = options.pdfPassword?.trim()
      if (password) {
        pdfBytes = await encryptPdfBytes(pdfBytes, password)
      }

      writeFileSync(outputPath, pdfBytes)
      logger.info(`Exported PDF: ${outputPath}`, 'ExportService')
    } finally {
      if (!win.isDestroyed()) win.destroy()
      try {
        unlinkSync(tempPath)
      } catch {
        /* temp cleanup best-effort */
      }
    }
  }

  /** Print a full-bleed cover with no Chromium header, footer, or overlays. */
  private async printCleanCoverPdf(
    context: ExportContext,
    printBase: {
      printBackground: true
      preferCSSPageSize: false
      pageSize: 'Letter' | 'A4'
      landscape: boolean
    },
    coverMargins: { marginType: 'custom'; top: number; bottom: number; left: number; right: number }
  ): Promise<Buffer> {
    const { document, project, options } = context
    const theme = resolveDocumentTheme(document.pageTheme, document.pageSettings)
    const html = compressHtmlImages(
      buildCoverOnlyPrintHtml(coverHtmlInput(document, project, options, theme)),
      parseExportImageQuality(options.imageQuality)
    )
    const tempPath = join(app.getPath('temp'), `studio-cover-${randomUUID()}.html`)
    writeFileSync(tempPath, html, 'utf-8')
    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    try {
      await win.loadFile(tempPath)
      await win.webContents.executeJavaScript(
        'document.fonts ? document.fonts.ready.then(() => true) : true'
      )
      return await win.webContents.printToPDF({
        ...printBase,
        margins: coverMargins,
        displayHeaderFooter: false
      })
    } finally {
      if (!win.isDestroyed()) win.destroy()
      try {
        unlinkSync(tempPath)
      } catch {
        /* temp cleanup best-effort */
      }
    }
  }

  private buildHeaderTemplate(
    project: Project,
    title: string,
    showHeader: boolean,
    style: 'standard' | 'minimal' | 'branded',
    accentColor: string,
    pageBg = '#ffffff',
    includeLogo = true
  ): string {
    if (!showHeader) {
      return `<div style="font-size:10px;width:100%;height:100%;background:${pageBg};"></div>`
    }
    if (style === 'minimal') {
      return `<div style="font-size:8px; color:#94a3b8; width:100%; height:100%; background:${pageBg}; padding:0 14mm; text-align:right; display:flex; align-items:flex-end; justify-content:flex-end; box-sizing:border-box;">${escapeHtml(title)}</div>`
    }
    const logo =
      includeLogo && project.companyLogo.startsWith('data:image/')
        ? `<img src="${escapeHtml(project.companyLogo)}" style="max-width:26mm; max-height:7mm; object-fit:contain;" />`
        : ''

    return `<div style="font-size:10px; color:${style === 'branded' ? accentColor : '#64748b'}; width:100%; height:100%; background:${pageBg}; padding:0 14mm 2mm; display:flex; justify-content:space-between; align-items:flex-end; gap:8mm; box-sizing:border-box; ${style === 'branded' ? `border-bottom:2px solid ${accentColor};font-weight:600;` : ''}">
      <span style="display:flex; align-items:center; gap:4mm;">${logo}<span>${escapeHtml(project.name)}</span></span>
      <span>${escapeHtml(title)}</span>
    </div>`
  }

  private buildFooterTemplate(
    projectName: string,
    title: string,
    options: ExportOptions,
    isChatGpt: boolean,
    pageBg = '#ffffff'
  ): string {
    if (isChatGpt) {
      return `<div style="font-size:10px;width:100%;height:100%;background:${pageBg};"></div>`
    }
    const showLabel = options.includeHeaderFooter !== false
    const showPages = options.includePageNumbers !== false
    if (!showLabel && !showPages) {
      return `<div style="font-size:10px;width:100%;height:100%;background:${pageBg};"></div>`
    }

    const headerStyle = options.headerFooterStyle ?? 'standard'
    const left = showLabel
      ? `<span>${escapeHtml(headerStyle === 'minimal' ? title : `${projectName} | ${title}`)}</span>`
      : '<span></span>'
    const pageStyle = options.pageNumberStyle ?? 'page-total'
    const right = !showPages
      ? '<span></span>'
      : pageStyle === 'number'
        ? '<span class="pageNumber"></span>'
        : pageStyle === 'page'
          ? '<span>Page <span class="pageNumber"></span></span>'
          : '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span>'

    return `<div style="font-size:10px; color:${headerStyle === 'branded' ? '#475569' : '#94a3b8'}; width:100%; height:100%; background:${pageBg}; padding:2mm 14mm 0; display:flex; justify-content:space-between; align-items:flex-start; box-sizing:border-box; ${headerStyle === 'branded' ? 'font-weight:600;border-top:1px solid #cbd5e1;' : ''}">
      ${left}
      ${right}
    </div>`
  }

  async export(context: ExportContext, outputPath: string): Promise<void> {
    if (context.options.format === 'docx') {
      await this.exportDocx(context, outputPath)
    } else {
      await this.exportPdf(context, outputPath)
    }
  }
}

export const exportService = new ExportService()
