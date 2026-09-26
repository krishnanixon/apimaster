import type { PresentationSlide, SlideElement } from '@shared/types/presentation-document'
import { getSlideElements } from '@shared/lib/presentation-schema'

export interface SlideLayoutDefinition {
  id: string
  name: string
  createElements: () => SlideElement[]
}

function text(
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  fontWeight = 400,
  textColor = '#111827',
  textAlign: 'left' | 'center' | 'right' = 'left'
): SlideElement {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: y,
    locked: false,
    content,
    fontFamily: 'Inter',
    fontSize,
    fontWeight,
    fontStyle: 'normal',
    textDecoration: 'none',
    textColor,
    textAlign,
    verticalAlign: 'middle',
    lineHeight: 1.2,
    letterSpacing: 0
  }
}

function accent(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  shape: 'rounded-rectangle' | 'circle' = 'rounded-rectangle'
): SlideElement {
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: y - 1,
    locked: false,
    shape,
    fill,
    stroke: 'transparent',
    strokeWidth: 0,
    borderRadius: shape === 'rounded-rectangle' ? 20 : 0
  }
}

export const PRESENTATION_LAYOUTS: SlideLayoutDefinition[] = [
  { id: 'blank', name: 'Blank', createElements: () => [] },
  {
    id: 'title',
    name: 'Title',
    createElements: () => [
      accent(760, 120, 400, 8, '#6366f1'),
      text('Presentation title', 180, 330, 1560, 180, 84, 700),
      text('Subtitle', 180, 520, 1560, 100, 38)
    ]
  },
  {
    id: 'title-content',
    name: 'Title + Content',
    createElements: () => [
      accent(140, 200, 80, 80, '#eef2ff'),
      text('Slide title', 240, 90, 1540, 120, 58, 700),
      text('Add your content', 140, 260, 1640, 600, 34)
    ]
  },
  {
    id: 'two-column',
    name: 'Two Columns',
    createElements: () => [
      text('Slide title', 140, 80, 1640, 120, 58, 700),
      text('Left column', 140, 260, 780, 620, 32),
      text('Right column', 1000, 260, 780, 620, 32)
    ]
  },
  {
    id: 'section-header',
    name: 'Section Header',
    createElements: () => [
      accent(140, 280, 1640, 520, '#f8fafc'),
      text('Section', 220, 360, 1480, 180, 82, 700),
      text('What this section covers', 220, 550, 1480, 100, 34)
    ]
  },
  {
    id: 'closing',
    name: 'Closing',
    createElements: () => [
      accent(760, 180, 400, 400, '#eef2ff', 'circle'),
      text('Thank you', 220, 360, 1480, 180, 88, 700),
      text('Questions?', 220, 560, 1480, 100, 40)
    ]
  },
  {
    id: 'image-left',
    name: 'Image Left',
    createElements: () => [
      text('Slide title', 140, 90, 1640, 100, 58, 700),
      accent(140, 240, 720, 560, '#f1f5f9'),
      text('Describe the visual or paste an image over the placeholder.', 920, 280, 860, 480, 30)
    ]
  },
  {
    id: 'image-right',
    name: 'Image Right',
    createElements: () => [
      text('Slide title', 140, 90, 1640, 100, 58, 700),
      text('Describe the visual or paste an image over the placeholder.', 140, 280, 860, 480, 30),
      accent(1060, 240, 720, 560, '#f1f5f9')
    ]
  },
  {
    id: 'metrics',
    name: 'Metrics',
    createElements: () => [
      text('Key metrics', 140, 80, 1640, 100, 58, 700),
      text('10K+', 140, 280, 500, 100, 64, 700, '#6366f1', 'center'),
      text('Users', 140, 390, 500, 50, 22, 400, '#64748b', 'center'),
      text('$2M', 710, 280, 500, 100, 64, 700, '#6366f1', 'center'),
      text('Revenue', 710, 390, 500, 50, 22, 400, '#64748b', 'center'),
      text('95%', 1280, 280, 500, 100, 64, 700, '#6366f1', 'center'),
      text('Satisfaction', 1280, 390, 500, 50, 22, 400, '#64748b', 'center')
    ]
  },
  {
    id: 'quote',
    name: 'Quote',
    createElements: () => [
      accent(140, 200, 1640, 680, '#f8fafc'),
      text('"Insert a powerful quote that supports your narrative."', 220, 360, 1480, 280, 44, 500, '#334155', 'center'),
      text('— Attribution', 220, 660, 1480, 60, 24, 400, '#64748b', 'center')
    ]
  },
  {
    id: 'agenda',
    name: 'Agenda',
    createElements: () => [
      text('Agenda', 140, 80, 1640, 100, 58, 700),
      text('1. Introduction\n2. Main topic\n3. Discussion\n4. Next steps', 140, 220, 900, 560, 34)
    ]
  },
  {
    id: 'comparison',
    name: 'Comparison',
    createElements: () => [
      text('Compare options', 140, 80, 1640, 100, 58, 700),
      accent(140, 240, 780, 560, '#ecfdf5'),
      accent(1000, 240, 780, 560, '#fef2f2'),
      text('Option A\n\nPros and details', 180, 280, 700, 480, 28),
      text('Option B\n\nPros and details', 1040, 280, 700, 480, 28)
    ]
  },
  {
    id: 'big-number',
    name: 'Big Number',
    createElements: () => [
      text('72%', 140, 280, 1640, 200, 120, 700, '#6366f1', 'center'),
      text('Headline metric with supporting context below.', 300, 520, 1320, 120, 32, 400, '#64748b', 'center')
    ]
  }
]

export function applySlideLayout(slide: PresentationSlide, layoutId: string): PresentationSlide {
  const layout = PRESENTATION_LAYOUTS.find((item) => item.id === layoutId) ?? PRESENTATION_LAYOUTS[0]
  if (!layout) {
    return { ...slide, layout: 'blank', elements: getSlideElements(slide) }
  }
  return { ...slide, layout: layout.id, elements: layout.createElements() }
}
