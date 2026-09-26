import type {
  PresentationDocument,
  PresentationSlide,
  SlideElement
} from '@shared/types/presentation-document'
import { getPresentationTheme } from '@shared/lib/presentation-model'

export type PresentationDocumentCommand =
  | { type: 'ADD_SLIDE'; slide: PresentationSlide; index?: number }
  | { type: 'DELETE_SLIDE'; slideId: string }
  | { type: 'DUPLICATE_SLIDE'; slideId: string; newSlideId: string }
  | { type: 'MOVE_SLIDE'; slideId: string; toIndex: number }
  | { type: 'UPDATE_SLIDE'; slideId: string; patch: Partial<Omit<PresentationSlide, 'id' | 'elements'>> }
  | { type: 'SET_SLIDE_ELEMENTS'; slideId: string; layout?: string; elements: SlideElement[] }
  | { type: 'ADD_ELEMENT'; slideId: string; element: SlideElement }
  | { type: 'UPDATE_ELEMENT'; slideId: string; elementId: string; patch: Partial<SlideElement> }
  | { type: 'DELETE_ELEMENTS'; slideId: string; elementIds: string[] }
  | { type: 'DUPLICATE_ELEMENTS'; slideId: string; elementIds: string[]; offset?: number }
  | { type: 'MOVE_ELEMENTS'; slideId: string; elementIds: string[]; dx: number; dy: number }
  | { type: 'SET_ELEMENT_ORDER'; slideId: string; elementId: string; direction: 'forward' | 'backward' | 'front' | 'back' }
  | { type: 'SET_THEME'; themeId: string }
  | {
      type: 'CUSTOMIZE_THEME'
      colors: { background: string; text: string; accent: string }
    }
  | { type: 'UPDATE_META'; patch: Pick<Partial<PresentationDocument>, 'title' | 'description' | 'templateId'> }

function ordered(slides: PresentationSlide[]): PresentationSlide[] {
  return slides.map((slide, order) => ({ ...slide, order }))
}

function updateSlide(
  document: PresentationDocument,
  slideId: string,
  updater: (slide: PresentationSlide) => PresentationSlide
): PresentationDocument {
  return {
    ...document,
    slides: document.slides.map((slide) => (slide.id === slideId ? updater(slide) : slide))
  }
}

function applyThemeColors(
  document: PresentationDocument,
  colors: { background: string; text: string; accent: string }
): PresentationDocument {
  return {
    ...document,
    slides: document.slides.map((slide) => ({
      ...slide,
      background:
        slide.background.type === 'solid'
          ? { ...slide.background, color: colors.background }
          : slide.background,
      elements: (slide.elements ?? []).map((element) => {
        if (element.type === 'text') return { ...element, textColor: colors.text }
        if (element.type === 'shape' && element.fill !== 'transparent') {
          return { ...element, fill: colors.accent }
        }
        if (element.type === 'icon') return { ...element, color: colors.accent }
        return element
      })
    }))
  }
}

export function applyPresentationCommand(
  document: PresentationDocument,
  command: PresentationDocumentCommand
): PresentationDocument {
  switch (command.type) {
    case 'ADD_SLIDE': {
      const slides = [...document.slides]
      slides.splice(Math.max(0, Math.min(command.index ?? slides.length, slides.length)), 0, command.slide)
      return { ...document, slides: ordered(slides) }
    }
    case 'DELETE_SLIDE':
      return document.slides.length <= 1
        ? document
        : { ...document, slides: ordered(document.slides.filter((slide) => slide.id !== command.slideId)) }
    case 'DUPLICATE_SLIDE': {
      const index = document.slides.findIndex((slide) => slide.id === command.slideId)
      if (index < 0) return document
      const source = document.slides[index]
      if (!source) return document
      const copy = structuredClone(source)
      copy.id = command.newSlideId
      copy.elements = (copy.elements ?? []).map((element) => ({ ...element, id: crypto.randomUUID() }))
      const slides = [...document.slides]
      slides.splice(index + 1, 0, copy)
      return { ...document, slides: ordered(slides) }
    }
    case 'MOVE_SLIDE': {
      const index = document.slides.findIndex((slide) => slide.id === command.slideId)
      if (index < 0) return document
      const slides = [...document.slides]
      const [slide] = slides.splice(index, 1)
      slides.splice(Math.max(0, Math.min(command.toIndex, slides.length)), 0, slide)
      return { ...document, slides: ordered(slides) }
    }
    case 'UPDATE_SLIDE':
      return updateSlide(document, command.slideId, (slide) => ({ ...slide, ...command.patch, id: slide.id, elements: slide.elements ?? [] }))
    case 'SET_SLIDE_ELEMENTS':
      return updateSlide(document, command.slideId, (slide) => ({ ...slide, layout: command.layout ?? slide.layout, elements: command.elements ?? [] }))
    case 'ADD_ELEMENT':
      return updateSlide(document, command.slideId, (slide) => ({ ...slide, elements: [...(slide.elements ?? []), command.element] }))
    case 'UPDATE_ELEMENT':
      return updateSlide(document, command.slideId, (slide) => ({
        ...slide,
        elements: (slide.elements ?? []).map((element) =>
          element.id === command.elementId
            ? ({ ...element, ...command.patch, id: element.id, type: element.type } as SlideElement)
            : element
        )
      }))
    case 'DELETE_ELEMENTS': {
      const ids = new Set(command.elementIds)
      return updateSlide(document, command.slideId, (slide) => ({ ...slide, elements: (slide.elements ?? []).filter((element) => !ids.has(element.id)) }))
    }
    case 'DUPLICATE_ELEMENTS': {
      const ids = new Set(command.elementIds)
      const offset = command.offset ?? 24
      return updateSlide(document, command.slideId, (slide) => {
        const elements = slide.elements ?? []
        const copies = elements.filter((element) => ids.has(element.id)).map((element) => ({ ...structuredClone(element), id: crypto.randomUUID(), x: element.x + offset, y: element.y + offset, zIndex: element.zIndex + 1 }))
        return { ...slide, elements: [...elements, ...copies] }
      })
    }
    case 'MOVE_ELEMENTS': {
      const ids = new Set(command.elementIds)
      return updateSlide(document, command.slideId, (slide) => ({ ...slide, elements: (slide.elements ?? []).map((element) => ids.has(element.id) ? { ...element, x: element.x + command.dx, y: element.y + command.dy } : element) }))
    }
    case 'SET_ELEMENT_ORDER':
      return updateSlide(document, command.slideId, (slide) => {
        const elements = slide.elements ?? []
        const target = elements.find((element) => element.id === command.elementId)
        if (!target) return slide
        const min = Math.min(...elements.map((element) => element.zIndex), 0)
        const max = Math.max(...elements.map((element) => element.zIndex), 0)
        const zIndex = command.direction === 'front' ? max + 1 : command.direction === 'back' ? min - 1 : target.zIndex + (command.direction === 'forward' ? 1 : -1)
        return { ...slide, elements: elements.map((element) => element.id === target.id ? { ...element, zIndex } : element) }
      })
    case 'SET_THEME': {
      const theme = getPresentationTheme(command.themeId)
      return applyThemeColors(
        { ...document, themeId: command.themeId, themeOverrides: {} },
        { background: theme.colors.background, text: theme.colors.text, accent: theme.colors.accent }
      )
    }
    case 'CUSTOMIZE_THEME':
      return applyThemeColors({
        ...document,
        themeOverrides: {
          ...document.themeOverrides,
          colors: {
            ...document.themeOverrides?.colors,
            background: command.colors.background,
            surface: command.colors.background,
            text: command.colors.text,
            accent: command.colors.accent
          }
        }
      }, command.colors)
    case 'UPDATE_META':
      return { ...document, ...command.patch }
  }
}

export function applyPresentationCommands(document: PresentationDocument, commands: PresentationDocumentCommand[]): PresentationDocument {
  return commands.reduce(applyPresentationCommand, document)
}
