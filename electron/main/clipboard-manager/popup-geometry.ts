export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export const CLIPBOARD_POPUP_PREFERRED_WIDTH = 340
export const CLIPBOARD_POPUP_PREFERRED_HEIGHT = 420
export const CLIPBOARD_POPUP_MIN_WIDTH = 280
export const CLIPBOARD_POPUP_MIN_HEIGHT = 260
export const CLIPBOARD_POPUP_SCREEN_MARGIN = 12
export const CLIPBOARD_POPUP_CURSOR_OFFSET = 10

/**
 * Pick the display rectangle that the popup can actually occupy.
 * Native macOS fullscreen / Split View can shrink workArea below the
 * preferred popup size; fall back to the full display bounds in that case.
 */
export function resolveUsableDisplayArea(workArea: Rect, bounds: Rect, minWidth: number, minHeight: number): Rect {
  if (workArea.width >= minWidth && workArea.height >= minHeight) {
    return workArea
  }
  return bounds
}

export function fitPopupToDisplay(options: {
  cursor: Point
  workArea: Rect
  bounds: Rect
  preferredWidth?: number
  preferredHeight?: number
  minWidth?: number
  minHeight?: number
  margin?: number
  cursorOffset?: number
}): Rect {
  const preferredWidth = options.preferredWidth ?? CLIPBOARD_POPUP_PREFERRED_WIDTH
  const preferredHeight = options.preferredHeight ?? CLIPBOARD_POPUP_PREFERRED_HEIGHT
  const minWidth = options.minWidth ?? CLIPBOARD_POPUP_MIN_WIDTH
  const minHeight = options.minHeight ?? CLIPBOARD_POPUP_MIN_HEIGHT
  const margin = options.margin ?? CLIPBOARD_POPUP_SCREEN_MARGIN
  const cursorOffset = options.cursorOffset ?? CLIPBOARD_POPUP_CURSOR_OFFSET

  const area = resolveUsableDisplayArea(options.workArea, options.bounds, minWidth, minHeight)
  const availableWidth = Math.max(1, area.width - margin * 2)
  const availableHeight = Math.max(1, area.height - margin * 2)
  const width = Math.round(Math.min(preferredWidth, availableWidth))
  const height = Math.round(Math.min(preferredHeight, availableHeight))

  let x = options.cursor.x + cursorOffset
  let y = options.cursor.y + cursorOffset

  if (x + width > area.x + area.width - margin) {
    x = options.cursor.x - width - cursorOffset
  }
  if (y + height > area.y + area.height - margin) {
    y = options.cursor.y - height - cursorOffset
  }

  const minX = area.x + margin
  const minY = area.y + margin
  const maxX = area.x + area.width - width - margin
  const maxY = area.y + area.height - height - margin

  x = Math.round(maxX >= minX ? Math.min(Math.max(x, minX), maxX) : area.x + Math.max(0, (area.width - width) / 2))
  y = Math.round(maxY >= minY ? Math.min(Math.max(y, minY), maxY) : area.y + Math.max(0, (area.height - height) / 2))

  return { x, y, width, height }
}
