import { useCallback, useRef } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { GripVertical } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'

export function ImageNodeView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const { src, alt, align = 'center', width } = node.attrs as {
    src: string
    alt?: string
    align?: 'left' | 'center' | 'right'
    width?: string | null
  }

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startWidth = imgRef.current?.offsetWidth ?? 320

      const onMove = (ev: MouseEvent) => {
        const next = Math.min(760, Math.max(80, startWidth + ev.clientX - startX))
        updateAttributes({ width: `${next}px` })
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [updateAttributes]
  )

  const selectImage = () => {
    const pos = getPos()
    if (typeof pos === 'number') {
      editor.chain().focus().setNodeSelection(pos).run()
    }
  }

  return (
    <NodeViewWrapper
      as="div"
      className={cn('image-block', `image-align-${align}`, selected && 'is-selected')}
      data-align={align}
      data-type="image-block"
      onClick={selectImage}
    >
      <div className="image-block-inner">
        <WordScreenTip label="Move Object" description="Drag to reposition this picture in the document.">
          <button
            type="button"
            className="image-drag-handle"
            contentEditable={false}
            data-drag-handle
            aria-label="Drag image"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </WordScreenTip>
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ''}
          style={width ? { width } : undefined}
          draggable={false}
          className="image-block-img"
        />
        <WordScreenTip label="Resize" description="Drag to change the picture width.">
          <span
            className="image-resize-handle"
            contentEditable={false}
            onMouseDown={onResizeStart}
            aria-hidden
          />
        </WordScreenTip>
      </div>
    </NodeViewWrapper>
  )
}
