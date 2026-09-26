import { dialog } from 'electron'
import PptxGenJS from 'pptxgenjs'
import type { Presentation, PresentationBlock, PresentationCard, Project } from '@shared/types'
import { getPresentationTheme, parseCards, parseViewState } from '@shared/lib/presentation-model'
import { PRODUCT_NAME } from '@shared/constants/product'
import { resolvePresentationAssetPath } from './presentation-assets.service'

function hex(value: string): string {
  return value.replace(/^#/, '').toUpperCase()
}

function textForBlock(block: PresentationBlock): string {
  switch (block.type) {
    case 'heading':
    case 'text':
    case 'callout':
      return block.text
    case 'bullets':
      return block.items.map((item) => `• ${item}`).join('\n')
    case 'columns':
      return block.columns
        .map((column) => [column.title, column.body].filter(Boolean).join('\n'))
        .join('\n\n')
    case 'metric':
      return block.metrics
        .map(
          (metric) => `${metric.value}\n${metric.label}${metric.hint ? ` — ${metric.hint}` : ''}`
        )
        .join('\n\n')
    default:
      return ''
  }
}

function addCard(
  pptx: PptxGenJS,
  card: PresentationCard,
  index: number,
  total: number,
  presentation: Presentation,
  project:
    (Project & { settings?: { brandingPrimary: string; brandingAccent: string } | null }) | null
): void {
  const view = parseViewState(presentation.viewState)
  const theme = getPresentationTheme(presentation.themeId, view.themeOverrides)
  const slide = pptx.addSlide()
  slide.background = {
    color: hex(card.layout === 'title' ? theme.colors.accent : theme.colors.surface)
  }
  const foreground = hex(card.layout === 'title' ? theme.colors.accentText : theme.colors.text)
  const accent = hex(project?.settings?.brandingPrimary || theme.colors.accent)
  const textBlocks = card.blocks.filter(
    (block) => block.type !== 'image' && block.type !== 'divider'
  )
  const imageBlocks = card.blocks.filter(
    (block): block is Extract<PresentationBlock, { type: 'image' }> =>
      block.type === 'image' && Boolean(block.src)
  )
  const mediaLayout =
    card.layout === 'media-left' || card.layout === 'media-right' || card.layout === 'split'
  const textX = mediaLayout && card.layout === 'media-left' ? 6.8 : 0.7
  const textW = mediaLayout ? 5.4 : 11.9
  let y = 0.65

  for (const block of textBlocks) {
    const content = textForBlock(block)
    if (!content) continue
    const heading = block.type === 'heading'
    const height = heading ? 0.75 : Math.min(2.2, Math.max(0.45, content.split('\n').length * 0.32))
    slide.addText(content, {
      x: textX,
      y,
      w: textW,
      h: height,
      fontFace: heading
        ? theme.fonts.heading.split(',')[0].replace(/["']/g, '')
        : theme.fonts.body.split(',')[0].replace(/["']/g, ''),
      fontSize: heading ? (block.level === 1 ? 30 : 22) : 15,
      bold: heading,
      color: block.type === 'metric' ? accent : foreground,
      breakLine: false,
      margin: 0.04,
      valign: 'mid'
    })
    y += height + 0.18
  }

  imageBlocks.slice(0, 1).forEach((block) => {
    if (!block.src) return
    const image = block.src.startsWith('data:image/')
      ? { data: block.src }
      : { path: resolvePresentationAssetPath(block.src) ?? '' }
    if (!('data' in image) && !image.path) return
    slide.addImage({
      ...image,
      x: card.layout === 'media-right' ? 6.8 : 0.7,
      y: 1.0,
      w: mediaLayout ? 5.7 : 11.9,
      h: mediaLayout ? 5.3 : 4.8,
      transparency: 0
    })
  })

  if (view.includeBranding && project) {
    slide.addText(project.companyName || project.name, {
      x: 0.45,
      y: 7.08,
      w: 5,
      h: 0.2,
      fontSize: 8,
      color: hex(theme.colors.muted),
      margin: 0
    })
    if (project.companyLogo?.startsWith('data:image/')) {
      slide.addImage({ data: project.companyLogo, x: 11.7, y: 6.85, w: 0.9, h: 0.35 })
    }
  }
  slide.addText(`${index + 1} / ${total}`, {
    x: 12.0,
    y: 7.12,
    w: 0.65,
    h: 0.18,
    fontSize: 7,
    color: hex(theme.colors.muted),
    align: 'right',
    margin: 0
  })
  if (card.notes) slide.addNotes(card.notes)
}

export async function exportPresentationPptx(
  presentation: Presentation,
  project:
    (Project & { settings?: { brandingPrimary: string; brandingAccent: string } | null }) | null,
  outputPath?: string
): Promise<string> {
  let target = outputPath?.trim()
  if (!target) {
    const result = await dialog.showSaveDialog({
      title: 'Export presentation PowerPoint',
      defaultPath: `${presentation.title.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 80) || 'presentation'}.pptx`,
      filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
    })
    if (result.canceled || !result.filePath) throw new Error('Export cancelled')
    target = result.filePath
  }

  const pptx = new PptxGenJS()
  const aspectRatio = parseViewState(presentation.viewState).aspectRatio ?? '16:9'
  if (aspectRatio === '4:3') pptx.layout = 'LAYOUT_4X3'
  else if (aspectRatio === '16:10') {
    pptx.defineLayout({ name: 'LAYOUT_16X10', width: 13.333, height: 8.333 })
    pptx.layout = 'LAYOUT_16X10'
  } else pptx.layout = 'LAYOUT_WIDE'
  pptx.author = project?.companyName || project?.name || PRODUCT_NAME
  pptx.subject = presentation.description
  pptx.title = presentation.title
  pptx.company = project?.companyName || ''
  pptx.lang = 'en-US'

  const cards = parseCards(presentation.cards)
  cards.forEach((card, index) => addCard(pptx, card, index, cards.length, presentation, project))
  await pptx.writeFile({ fileName: target })
  return target
}
