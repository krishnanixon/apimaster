import {
  PRESENTATION_SCHEMA_VERSION,
  PRESENTATION_SLIDE_HEIGHT,
  PRESENTATION_SLIDE_WIDTH,
  type PresentationDocument,
  type PresentationSlide,
  type SlideElement
} from '@shared/types/presentation-document'

const elementTypes = new Set([
  'text',
  'image',
  'shape',
  'icon',
  'table',
  'code',
  'diagram',
  'project-reference'
])

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isSlideElement(value: unknown): value is SlideElement {
  if (!value || typeof value !== 'object') return false
  const element = value as Record<string, unknown>
  return (
    typeof element.id === 'string' &&
    element.id.length > 0 &&
    typeof element.type === 'string' &&
    elementTypes.has(element.type) &&
    finite(element.x) &&
    finite(element.y) &&
    finite(element.width) &&
    element.width >= 0 &&
    finite(element.height) &&
    element.height >= 0 &&
    finite(element.rotation) &&
    finite(element.opacity) &&
    element.opacity >= 0 &&
    element.opacity <= 1 &&
    finite(element.zIndex) &&
    typeof element.locked === 'boolean'
  )
}

export function isPresentationSlide(value: unknown): value is PresentationSlide {
  if (!value || typeof value !== 'object') return false
  const slide = value as Record<string, unknown>
  return (
    typeof slide.id === 'string' &&
    slide.id.length > 0 &&
    finite(slide.order) &&
    Boolean(slide.background && typeof slide.background === 'object') &&
    Array.isArray(slide.elements) &&
    slide.elements.every(isSlideElement)
  )
}

export function isPresentationDocument(value: unknown): value is PresentationDocument {
  if (!value || typeof value !== 'object') return false
  const document = value as Record<string, unknown>
  const logicalSize = document.logicalSize as Record<string, unknown> | undefined
  return (
    document.schemaVersion === PRESENTATION_SCHEMA_VERSION &&
    typeof document.id === 'string' &&
    typeof document.title === 'string' &&
    typeof document.themeId === 'string' &&
    finite(logicalSize?.width) &&
    finite(logicalSize?.height) &&
    Array.isArray(document.slides) &&
    document.slides.every(isPresentationSlide) &&
    Boolean(document.metadata && typeof document.metadata === 'object') &&
    typeof document.createdAt === 'string' &&
    typeof document.updatedAt === 'string'
  )
}

export function getSlideElements(slide?: PresentationSlide | null): SlideElement[] {
  if (!slide || !Array.isArray(slide.elements)) return []
  return slide.elements.filter((element) => element && typeof element === 'object')
}

export function resolveActiveSlideId(
  document: PresentationDocument,
  activeSlideId: string | null
): string | null {
  if (activeSlideId && document.slides.some((slide) => slide.id === activeSlideId)) {
    return activeSlideId
  }
  return document.slides[0]?.id ?? null
}

export function parsePresentationDocument(raw: string | null | undefined): PresentationDocument | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (isPresentationDocument(parsed)) return normalizePresentationDocument(parsed)

    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record.slides)) return null

    const now = new Date().toISOString()
    const logicalSize = record.logicalSize as Record<string, unknown> | undefined
    return normalizePresentationDocument({
      schemaVersion: PRESENTATION_SCHEMA_VERSION,
      id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
      projectId: typeof record.projectId === 'string' ? record.projectId : undefined,
      title: typeof record.title === 'string' ? record.title : 'Untitled Presentation',
      description: typeof record.description === 'string' ? record.description : undefined,
      themeId: typeof record.themeId === 'string' ? record.themeId : 'professional',
      templateId: typeof record.templateId === 'string' ? record.templateId : undefined,
      logicalSize: {
        width: finite(logicalSize?.width) ? (logicalSize!.width as number) : PRESENTATION_SLIDE_WIDTH,
        height: finite(logicalSize?.height) ? (logicalSize!.height as number) : PRESENTATION_SLIDE_HEIGHT
      },
      slides: record.slides as PresentationSlide[],
      metadata:
        record.metadata && typeof record.metadata === 'object'
          ? (record.metadata as PresentationDocument['metadata'])
          : {},
      themeOverrides:
        record.themeOverrides && typeof record.themeOverrides === 'object'
          ? (record.themeOverrides as PresentationDocument['themeOverrides'])
          : undefined,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now
    })
  } catch {
    return null
  }
}

export function normalizePresentationDocument(document: PresentationDocument): PresentationDocument {
  const seen = new Set<string>()
  const slides = [...document.slides]
    .filter((slide): slide is PresentationSlide => Boolean(slide && typeof slide === 'object'))
    .sort((a, b) => a.order - b.order)
    .map((slide, order) => {
      if (seen.has(slide.id)) throw new Error(`Duplicate slide id: ${slide.id}`)
      seen.add(slide.id)
      const elements = Array.isArray(slide.elements)
        ? slide.elements.filter((element) => element && typeof element === 'object')
        : []
      return {
        ...slide,
        order,
        layout: slide.layout ?? 'blank',
        background: slide.background ?? { type: 'solid', color: '#ffffff' },
        elements: [...elements].sort((a, b) => a.zIndex - b.zIndex)
      }
    })

  if (slides.length === 0) {
    slides.push({
      id: crypto.randomUUID(),
      order: 0,
      layout: 'blank',
      background: { type: 'solid', color: '#ffffff' },
      elements: []
    })
  }

  return {
    ...document,
    logicalSize:
      finite(document.logicalSize?.width) && finite(document.logicalSize?.height)
        ? document.logicalSize
        : { width: PRESENTATION_SLIDE_WIDTH, height: PRESENTATION_SLIDE_HEIGHT },
    slides
  }
}

export function serializePresentationDocument(document: PresentationDocument): string {
  return JSON.stringify(normalizePresentationDocument(document))
}
