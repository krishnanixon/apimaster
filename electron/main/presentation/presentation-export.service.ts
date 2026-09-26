import { BrowserWindow, dialog } from 'electron'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { getPresentationTheme, parseCards, parseViewState } from '@shared/lib/presentation-model'
import type { Project } from '@shared/types'
import type { Presentation, PresentationBlock, PresentationCard } from '@shared/types/presentation'
import type { PresentationDocument, PresentationSlide, SlideElement } from '@shared/types/presentation-document'
import { parsePresentationDocument } from '@shared/lib/presentation-schema'
import { logger } from '../infra/logger.service'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function style(element: SlideElement): string {
  return `left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;transform:rotate(${element.rotation}deg);opacity:${element.opacity};z-index:${element.zIndex};`
}

function renderSlideElement(element: SlideElement): string {
  const outer = `class="slide-element type-${element.type}" style="${style(element)}"`
  switch (element.type) {
    case 'text':
      return `<div ${outer}><div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:${element.verticalAlign === 'middle' ? 'center' : element.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'};white-space:pre-wrap;overflow:hidden;font-family:${escapeHtml(element.fontFamily)};font-size:${element.fontSize}px;font-weight:${element.fontWeight};font-style:${element.fontStyle};text-decoration:${element.textDecoration};color:${escapeHtml(element.textColor)};background:${escapeHtml(element.backgroundColor ?? 'transparent')};text-align:${element.textAlign};line-height:${element.lineHeight};letter-spacing:${element.letterSpacing}px">${escapeHtml(element.content)}</div></div>`
    case 'image':
      return `<div ${outer}>${element.src ? `<img src="${escapeHtml(element.src)}" alt="${escapeHtml(element.alt)}" style="width:100%;height:100%;object-fit:${element.objectFit};border:${element.borderWidth}px solid ${escapeHtml(element.borderColor ?? 'transparent')};border-radius:${element.borderRadius}px" />` : ''}</div>`
    case 'shape': {
      if (element.shape === 'line' || element.shape === 'arrow') return `<div ${outer}><svg width="100%" height="100%" viewBox="0 0 ${element.width} ${element.height}" preserveAspectRatio="none"><line x1="0" y1="${element.height / 2}" x2="${element.width}" y2="${element.height / 2}" stroke="${escapeHtml(element.stroke)}" stroke-width="${element.strokeWidth}" /></svg></div>`
      const radius = element.shape === 'circle' ? '50%' : `${element.borderRadius ?? (element.shape === 'rounded-rectangle' ? 28 : 0)}px`
      const clipPath = element.shape === 'triangle' ? 'polygon(50% 0, 100% 100%, 0 100%)' : 'none'
      return `<div ${outer}><div style="width:100%;height:100%;background:${escapeHtml(element.fill)};border:${element.strokeWidth}px solid ${escapeHtml(element.stroke)};border-radius:${radius};clip-path:${clipPath}"></div></div>`
    }
    case 'icon':
      return `<div ${outer}><div style="width:100%;height:100%;color:${escapeHtml(element.color)};font-size:${Math.min(element.width, element.height)}px;display:grid;place-items:center">◆</div></div>`
    case 'table':
      return `<div ${outer}><table style="width:100%;height:100%;border-collapse:collapse;color:${escapeHtml(element.textColor)};font-size:${element.fontSize}px"><tbody>${element.rows.map((row, rowIndex) => `<tr>${row.map((cell) => `<td style="border:1px solid ${escapeHtml(element.borderColor)};padding:12px;background:${escapeHtml(element.headerRow && rowIndex === 0 ? element.headerBackground : element.cellBackground)};font-weight:${element.headerRow && rowIndex === 0 ? 700 : 400}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    case 'code':
      return `<div ${outer}><div style="width:100%;height:100%;overflow:hidden;border-radius:12px;background:${element.theme === 'dark' ? '#0f172a' : '#f8fafc'};color:${element.theme === 'dark' ? '#e2e8f0' : '#0f172a'};font:24px ui-monospace,monospace"><div style="padding:10px 16px;border-bottom:1px solid #64748b55;font-size:18px">${escapeHtml(element.fileName ?? element.language)}</div><pre style="margin:0;padding:16px;white-space:pre-wrap">${escapeHtml(element.code)}</pre></div></div>`
    case 'project-reference':
      return `<div ${outer}><div style="width:100%;height:100%;border:2px solid #6366f1;border-radius:16px;padding:20px;background:#eef2ff;color:#1e1b4b"><strong>${escapeHtml(element.referenceType.toUpperCase())}</strong><div style="margin-top:12px;font-size:28px">${escapeHtml(String(element.snapshot.title ?? element.snapshot.name ?? element.referenceId))}</div></div></div>`
    case 'diagram':
      return `<div ${outer}><div style="width:100%;height:100%;display:grid;place-items:center;border:2px solid #94a3b8;border-radius:12px;background:#f8fafc;color:#475569;font-size:24px">${escapeHtml(element.diagramType)} diagram</div></div>`
  }
}

function renderDocumentSlide(slide: PresentationSlide): string {
  const background = slide.background.type === 'gradient' ? slide.background.gradient : slide.background.type === 'image' ? `url('${escapeHtml(slide.background.src ?? '')}') center/cover` : slide.background.color ?? '#fff'
  return `<section class="document-slide"><div class="document-slide-inner" style="background:${background}">${slide.elements.filter((element) => !element.hidden).map(renderSlideElement).join('\n')}</div></section>`
}

function buildDocumentPrintHtml(presentation: Presentation, document: PresentationDocument): string {
  const scale = 1280 / document.logicalSize.width
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(presentation.title)}</title><style>
  @page { size: 13.333in 7.5in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .document-slide { width: 1280px; height: 720px; overflow: hidden; page-break-after: always; break-after: page; position: relative; }
  .document-slide:last-child { page-break-after: auto; }
  .document-slide-inner { position:absolute;left:0;top:0;width:${document.logicalSize.width}px;height:${document.logicalSize.height}px;transform:scale(${scale});transform-origin:top left;overflow:hidden; }
  .slide-element { position:absolute;transform-origin:center;overflow:visible; }
  </style></head><body>${document.slides.filter((slide) => !slide.hidden).map(renderDocumentSlide).join('\n')}</body></html>`
}

function renderBlock(block: PresentationBlock): string {
  switch (block.type) {
    case 'heading': {
      const level = block.level ?? 2
      const tag = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2'
      return `<${tag} class="block-heading level-${level}">${escapeHtml(block.text)}</${tag}>`
    }
    case 'text':
      return `<p class="block-text">${escapeHtml(block.text)}</p>`
    case 'bullets':
      return `<ul class="block-bullets">${block.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>`
    case 'columns':
      return `<div class="block-columns">${block.columns
        .map(
          (col) =>
            `<div class="column">${col.title ? `<h4>${escapeHtml(col.title)}</h4>` : ''}<p>${escapeHtml(col.body)}</p></div>`
        )
        .join('')}</div>`
    case 'callout':
      return `<aside class="block-callout tone-${block.tone ?? 'info'}">${escapeHtml(block.text)}</aside>`
    case 'divider':
      return `<hr class="block-divider" />`
    case 'metric':
      return `<div class="block-metrics">${block.metrics
        .map(
          (metric) =>
            `<div class="metric"><div class="metric-value">${escapeHtml(metric.value)}</div><div class="metric-label">${escapeHtml(metric.label)}</div>${metric.hint ? `<div class="metric-hint">${escapeHtml(metric.hint)}</div>` : ''}</div>`
        )
        .join('')}</div>`
    case 'image':
      return `<figure class="block-image">${
        block.src
          ? `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt ?? '')}" />`
          : `<div class="image-placeholder">${escapeHtml(block.alt || block.caption || 'Image')}</div>`
      }${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`
    default:
      return ''
  }
}

function renderCard(card: PresentationCard, index: number, total: number, branding = ''): string {
  return `<section class="card layout-${escapeHtml(card.layout)}" data-index="${index}">
  <div class="card-inner">
    ${card.blocks.map(renderBlock).join('\n')}
  </div>
  ${branding}
  <div class="card-footer">${index + 1} / ${total}</div>
</section>`
}

export function buildPresentationPrintHtml(
  presentation: Presentation,
  project?:
    (Project & { settings?: { brandingPrimary: string; brandingAccent: string } | null }) | null
): string {
  const document = parsePresentationDocument(presentation.documentJson)
  if (document) return buildDocumentPrintHtml(presentation, document)
  const viewState = parseViewState(presentation.viewState)
  const baseTheme = getPresentationTheme(presentation.themeId, viewState.themeOverrides)
  const theme =
    viewState.includeBranding && project?.settings?.brandingPrimary
      ? {
          ...baseTheme,
          colors: {
            ...baseTheme.colors,
            accent: project.settings.brandingPrimary,
            border: project.settings.brandingAccent || baseTheme.colors.border
          }
        }
      : baseTheme
  const cards = parseCards(presentation.cards)
  const densityPad =
    theme.density === 'compact'
      ? '28px 36px'
      : theme.density === 'spacious'
        ? '48px 56px'
        : '36px 44px'
  const ratio = viewState.aspectRatio ?? '16:9'
  const pageSize =
    ratio === '4:3' ? '10in 7.5in' : ratio === '16:10' ? '12in 7.5in' : '13.333in 7.5in'
  const branding =
    viewState.includeBranding && project
      ? `<div class="card-brand">${project.companyLogo?.startsWith('data:image/') ? `<img src="${escapeHtml(project.companyLogo)}" alt="" />` : ''}<span>${escapeHtml(project.companyName || project.name)}</span></div>`
      : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(presentation.title)}</title>
  <style>
    @page { size: ${pageSize}; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: ${theme.colors.background};
      color: ${theme.colors.text};
      font-family: ${theme.fonts.body};
    }
    h1, h2, h3, h4 {
      font-family: ${theme.fonts.heading};
      margin: 0 0 0.45em;
      line-height: 1.2;
      color: ${theme.colors.text};
    }
    h1 { font-size: 42px; }
    h2 { font-size: 28px; }
    h3 { font-size: 22px; }
    h4 { font-size: 16px; color: ${theme.colors.accent}; }
    p { margin: 0 0 0.75em; line-height: 1.5; font-size: 16px; color: ${theme.colors.text}; }
    .card {
      page-break-after: always;
      break-after: page;
      min-height: 100vh;
      padding: ${densityPad};
      background: ${theme.colors.surface};
      border-bottom: 1px solid ${theme.colors.border};
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
    }
    .card:last-child { page-break-after: auto; }
    .card.layout-title { background: ${theme.colors.accent}; color: ${theme.colors.accentText}; }
    .card.layout-title h1, .card.layout-title h2, .card.layout-title p { color: ${theme.colors.accentText}; }
    .card-inner { max-width: 960px; margin: 0 auto; width: 100%; }
    .card.layout-split .card-inner,
    .card.layout-media-left .card-inner,
    .card.layout-media-right .card-inner {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: center;
      gap: 32px;
    }
    .card.layout-media-right .block-image { order: 2; }
    .card.layout-image-focus .card-inner { text-align: center; }
    .card.layout-image-focus .block-image img {
      width: 100%;
      max-height: 62vh;
      object-fit: cover;
    }
    .card.layout-quote .card-inner { max-width: 760px; text-align: center; }
    .card.layout-quote .block-text,
    .card.layout-quote .block-callout { font-size: 26px; line-height: 1.4; }
    .card.layout-closing .card-inner { max-width: 760px; text-align: center; }
    .card-footer {
      position: absolute;
      right: 28px;
      bottom: 18px;
      font-size: 12px;
      color: ${theme.colors.muted};
    }
    .card-brand { position: absolute; left: 28px; bottom: 16px; display: flex; align-items: center; gap: 8px; color: ${theme.colors.muted}; font-size: 11px; }
    .card-brand img { max-width: 72px; max-height: 24px; object-fit: contain; }
    .card.layout-title .card-footer { color: ${theme.colors.accentText}; opacity: 0.75; }
    .block-bullets { margin: 0; padding-left: 1.25em; }
    .block-bullets li { margin: 0.35em 0; font-size: 17px; line-height: 1.45; }
    .block-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
    .block-callout {
      border-left: 4px solid ${theme.colors.accent};
      background: ${theme.colors.background};
      padding: 14px 16px;
      border-radius: 8px;
      margin: 12px 0;
    }
    .block-divider { border: none; border-top: 1px solid ${theme.colors.border}; margin: 18px 0; }
    .block-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; }
    .metric {
      border: 1px solid ${theme.colors.border};
      border-radius: 12px;
      padding: 16px;
      background: ${theme.colors.background};
    }
    .metric-value { font-size: 28px; font-weight: 700; color: ${theme.colors.accent}; }
    .metric-label { font-size: 13px; color: ${theme.colors.muted}; margin-top: 4px; }
    .metric-hint { font-size: 12px; color: ${theme.colors.muted}; margin-top: 6px; }
    .image-placeholder {
      border: 1px dashed ${theme.colors.border};
      border-radius: 12px;
      padding: 48px;
      text-align: center;
      color: ${theme.colors.muted};
      background: ${theme.colors.background};
    }
    .block-image img { display: block; max-width: 100%; max-height: 68vh; object-fit: contain; border-radius: 12px; }
    figcaption { font-size: 12px; color: ${theme.colors.muted}; margin-top: 8px; }
  </style>
</head>
<body>
  ${cards.map((card, index) => renderCard(card, index, cards.length, branding)).join('\n')}
</body>
</html>`
}

export async function exportPresentationPdf(
  presentation: Presentation,
  outputPath?: string,
  project?:
    (Project & { settings?: { brandingPrimary: string; brandingAccent: string } | null }) | null
): Promise<string> {
  let target = outputPath?.trim()
  if (!target) {
    const result = await dialog.showSaveDialog({
      title: 'Export presentation PDF',
      defaultPath: `${presentation.title.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 80) || 'presentation'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) {
      throw new Error('Export cancelled')
    }
    target = result.filePath
  }

  const html = buildPresentationPrintHtml(presentation, project)
  const tempPath = join(app.getPath('temp'), `presentation-export-${randomUUID()}.html`)
  writeFileSync(tempPath, html, 'utf-8')

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true }
  })

  try {
    await win.loadFile(tempPath)
    const pdfBytes = await win.webContents.printToPDF({
      printBackground: true,
      landscape: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
    writeFileSync(target, pdfBytes)
    logger.info(`Exported presentation PDF: ${target}`, 'PresentationExport')
    return target
  } finally {
    if (!win.isDestroyed()) win.destroy()
    try {
      unlinkSync(tempPath)
    } catch {
      /* best-effort */
    }
  }
}
