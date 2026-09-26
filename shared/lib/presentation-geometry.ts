import type { BaseSlideElement, SlidePoint, SlideSize } from '@shared/types/presentation-document'

export interface ScreenRect extends SlidePoint, SlideSize {}

export function getSlideScale(viewport: SlideSize, logical: SlideSize): number {
  if (viewport.width <= 0 || viewport.height <= 0 || logical.width <= 0 || logical.height <= 0) {
    return 0
  }
  return Math.min(viewport.width / logical.width, viewport.height / logical.height)
}

export interface CanvasFitOptions {
  paddingX?: number
  paddingY?: number
  max?: number
  min?: number
}

export function computeCanvasFitZoom(
  viewport: SlideSize,
  logical: SlideSize,
  options: CanvasFitOptions = {}
): number {
  const paddingX = options.paddingX ?? 48
  const paddingY = options.paddingY ?? 72
  const max = options.max ?? 1.5
  const min = options.min ?? 0.2
  const scale = getSlideScale(
    {
      width: Math.max(0, viewport.width - paddingX),
      height: Math.max(0, viewport.height - paddingY)
    },
    logical
  )
  if (scale <= 0) return min
  return Math.max(min, Math.min(max, scale))
}

export function screenToSlideCoordinates(point: SlidePoint, slideRect: ScreenRect, scale: number): SlidePoint {
  if (scale <= 0) return { x: 0, y: 0 }
  return { x: (point.x - slideRect.x) / scale, y: (point.y - slideRect.y) / scale }
}

export function slideToScreenCoordinates(point: SlidePoint, slideRect: ScreenRect, scale: number): SlidePoint {
  return { x: slideRect.x + point.x * scale, y: slideRect.y + point.y * scale }
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export function alignElements<T extends BaseSlideElement>(elements: T[], mode: AlignMode): T[] {
  if (elements.length < 2) return elements
  const left = Math.min(...elements.map((element) => element.x))
  const right = Math.max(...elements.map((element) => element.x + element.width))
  const top = Math.min(...elements.map((element) => element.y))
  const bottom = Math.max(...elements.map((element) => element.y + element.height))
  const center = (left + right) / 2
  const middle = (top + bottom) / 2
  return elements.map((element) => ({
    ...element,
    x:
      mode === 'left'
        ? left
        : mode === 'center'
          ? center - element.width / 2
          : mode === 'right'
            ? right - element.width
            : element.x,
    y:
      mode === 'top'
        ? top
        : mode === 'middle'
          ? middle - element.height / 2
          : mode === 'bottom'
            ? bottom - element.height
            : element.y
  }))
}

export function clampElementToSlide<T extends BaseSlideElement>(element: T, slide: SlideSize): T {
  return {
    ...element,
    x: Math.min(Math.max(element.x, -element.width + 1), slide.width - 1),
    y: Math.min(Math.max(element.y, -element.height + 1), slide.height - 1)
  }
}
