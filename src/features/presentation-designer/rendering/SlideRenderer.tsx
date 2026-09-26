import type { PresentationSlide, SlideElement, SlideSize } from '@shared/types/presentation-document'
import { getSlideElements } from '@shared/lib/presentation-schema'
import { ElementRenderer } from './ElementRenderer'
import { SelectionHandles } from '../components/SelectionHandles'

export function SlideRenderer({
  slide,
  logicalSize,
  interactive = false,
  selectedIds = [],
  editingElementId,
  showGrid = false,
  onElementPointerDown,
  onElementDoubleClick,
  onElementContextMenu,
  onTextChange
}: {
  slide: PresentationSlide
  logicalSize: SlideSize
  interactive?: boolean
  selectedIds?: string[]
  editingElementId?: string | null
  showGrid?: boolean
  onElementPointerDown?: (event: React.PointerEvent, element: SlideElement) => void
  onElementDoubleClick?: (element: SlideElement) => void
  onElementContextMenu?: (event: React.MouseEvent, element: SlideElement) => void
  onTextChange?: (element: SlideElement, value: string) => void
}) {
  if (!slide) return null

  const size = logicalSize ?? { width: 1920, height: 1080 }
  const elements = getSlideElements(slide)
  const background =
    slide.background?.type === 'gradient'
      ? slide.background.gradient
      : slide.background?.type === 'image'
        ? `url(${slide.background.src ?? ''}) center/cover`
        : slide.background?.color ?? '#fff'

  return (
    <div
      data-presentation-slide={slide.id}
      style={{
        position: 'relative',
        width: size.width,
        height: size.height,
        overflow: 'hidden',
        background
      }}
    >
      {showGrid ? <CanvasGrid logicalSize={size} /> : null}
      {elements
        .filter((element) => !element.hidden)
        .map((element) => {
          const selected = selectedIds.includes(element.id)
          return (
            <div
              key={element.id}
              data-element-id={element.id}
              onPointerDown={(event) => interactive && onElementPointerDown?.(event, element)}
              onDoubleClick={() => interactive && onElementDoubleClick?.(element)}
              onContextMenu={(event) => interactive && onElementContextMenu?.(event, element)}
              style={{
                position: 'absolute',
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                transform: `rotate(${element.rotation}deg)`,
                transformOrigin: 'center',
                opacity: element.opacity,
                zIndex: element.zIndex,
                cursor: interactive && !element.locked ? 'move' : 'default',
                outline: selected ? '3px solid #0d99ff' : undefined,
                outlineOffset: 2,
                userSelect: editingElementId === element.id ? 'text' : 'none'
              }}
            >
              <ElementRenderer
                element={element}
                editing={editingElementId === element.id && element.type === 'text'}
                onTextChange={(value) => onTextChange?.(element, value)}
              />
              {interactive && selected && !element.locked ? (
                <SelectionHandles showRotate={element.type === 'shape' || element.type === 'image'} />
              ) : null}
            </div>
          )
        })}
    </div>
  )
}

function CanvasGrid({ logicalSize }: { logicalSize: SlideSize }) {
  const step = 20
  const lines: React.ReactNode[] = []
  for (let x = step; x < logicalSize.width; x += step) {
    lines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={logicalSize.height}
        stroke="rgba(148,163,184,0.25)"
        strokeWidth={x % 100 === 0 ? 1 : 0.5}
      />
    )
  }
  for (let y = step; y < logicalSize.height; y += step) {
    lines.push(
      <line
        key={`h-${y}`}
        x1={0}
        y1={y}
        x2={logicalSize.width}
        y2={y}
        stroke="rgba(148,163,184,0.25)"
        strokeWidth={y % 100 === 0 ? 1 : 0.5}
      />
    )
  }
  return (
    <svg
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      width={logicalSize.width}
      height={logicalSize.height}
    >
      {lines}
    </svg>
  )
}
