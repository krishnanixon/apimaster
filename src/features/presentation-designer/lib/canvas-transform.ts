export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface ElementBounds {
  x: number
  y: number
  width: number
  height: number
}

export function snapDimension(value: number, enabled: boolean, grid = 20): number {
  return enabled ? Math.round(value / grid) * grid : Math.round(value)
}

export function resizeFromHandle(
  origin: ElementBounds,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  options?: { minWidth?: number; minHeight?: number; snap?: boolean; grid?: number }
): ElementBounds {
  const minWidth = options?.minWidth ?? 20
  const minHeight = options?.minHeight ?? 20
  const snap = options?.snap ?? false
  const grid = options?.grid ?? 20

  let { x, y, width, height } = origin

  if (handle.includes('e')) width += dx
  if (handle.includes('w')) {
    width -= dx
    x += dx
  }
  if (handle.includes('s')) height += dy
  if (handle.includes('n')) {
    height -= dy
    y += dy
  }

  if (width < minWidth) {
    if (handle.includes('w')) x -= minWidth - width
    width = minWidth
  }
  if (height < minHeight) {
    if (handle.includes('n')) y -= minHeight - height
    height = minHeight
  }

  return {
    x: snapDimension(x, snap, grid),
    y: snapDimension(y, snap, grid),
    width: snapDimension(width, snap, grid),
    height: snapDimension(height, snap, grid)
  }
}

export function rotationFromPointer(
  center: { x: number; y: number },
  pointer: { x: number; y: number },
  offset = -90
): number {
  const angle = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI
  let next = angle + offset
  while (next > 180) next -= 360
  while (next < -180) next += 360
  return Math.round(next)
}

export function pointerToSlidePoint(
  clientX: number,
  clientY: number,
  slideNode: HTMLElement | null,
  zoom: number
): { x: number; y: number } {
  if (!slideNode) return { x: 0, y: 0 }
  const rect = slideNode.getBoundingClientRect()
  return {
    x: (clientX - rect.left) / zoom,
    y: (clientY - rect.top) / zoom
  }
}

export function isLineShape(shape: string): boolean {
  return shape === 'line' || shape === 'arrow'
}

export const GRID_SIZE = 20
