import type { BaseSlideElement, SlideSize, TextAlign, VerticalAlign } from '@shared/types/presentation-document'
import { alignElements, type AlignMode } from '@shared/lib/presentation-geometry'

export const FONT_FAMILIES = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
] as const

export const FONT_SIZE_PRESETS = [12, 16, 20, 24, 32, 40, 48, 64, 72, 96] as const

export type CanvasAlignMode =
  | 'slide-left'
  | 'slide-center-h'
  | 'slide-right'
  | 'slide-top'
  | 'slide-center-v'
  | 'slide-bottom'

export function alignElementToSlide<T extends BaseSlideElement>(
  element: T,
  slideSize: SlideSize,
  mode: CanvasAlignMode
): Partial<T> {
  switch (mode) {
    case 'slide-left':
      return { x: 0 } as Partial<T>
    case 'slide-center-h':
      return { x: (slideSize.width - element.width) / 2 } as Partial<T>
    case 'slide-right':
      return { x: slideSize.width - element.width } as Partial<T>
    case 'slide-top':
      return { y: 0 } as Partial<T>
    case 'slide-center-v':
      return { y: (slideSize.height - element.height) / 2 } as Partial<T>
    case 'slide-bottom':
      return { y: slideSize.height - element.height } as Partial<T>
  }
}

export function alignElementsGroup<T extends BaseSlideElement>(elements: T[], mode: AlignMode): T[] {
  return alignElements(elements, mode)
}

export function normalizeFontFamily(value: string): string {
  const match = FONT_FAMILIES.find(
    (font) => font.value === value || font.label.toLowerCase() === value.toLowerCase()
  )
  return match?.value ?? value
}

export function isTextAlign(value: string): value is TextAlign {
  return value === 'left' || value === 'center' || value === 'right' || value === 'justify'
}

export function isVerticalAlign(value: string): value is VerticalAlign {
  return value === 'top' || value === 'middle' || value === 'bottom'
}
