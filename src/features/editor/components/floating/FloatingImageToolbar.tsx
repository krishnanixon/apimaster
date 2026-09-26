import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NodeSelection } from 'prosemirror-state'
import type { Editor } from '@tiptap/react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  ArrowDown,
  Trash2,
  Maximize2,
  Minimize2
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'
import { moveSelectedNode } from '@/features/editor/lib/move-node'
import type { ImageAlign } from '@/features/editor/extensions/resizable-image'

type Props = {
  editor: Editor
}

export function FloatingImageToolbar({ editor }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [align, setAlign] = useState<ImageAlign>('center')

  const update = () => {
    const { selection } = editor.state
    const isImage =
      selection instanceof NodeSelection && selection.node.type.name === 'image'

    if (!isImage) {
      setOpen(false)
      return
    }

    setAlign((selection.node.attrs.align as ImageAlign) || 'center')

    try {
      const coords = editor.view.coordsAtPos(selection.from)
      setPos({
        top: Math.round(coords.top - 48),
        left: Math.round((coords.left + coords.right) / 2)
      })
      setOpen(true)
    } catch {
      setOpen(false)
    }
  }

  useEffect(() => {
    update()
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor])

  if (!open) return null

  const setImageAlign = (next: ImageAlign) => {
    editor.chain().focus().updateImageAttributes({ align: next }).run()
    setAlign(next)
  }

  const setWidth = (width: string | null) => {
    editor.chain().focus().updateImageAttributes({ width }).run()
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[305] -translate-x-1/2"
      style={{ top: Math.max(8, pos.top), left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        className={cn(
          'pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-card/95 p-1 shadow-xl',
          'backdrop-blur supports-[backdrop-filter]:bg-card/80'
        )}
      >
        <WordScreenTip label="Align Left" description="Place the picture on the left side of the page." side="top">
          <button
            type="button"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted',
              align === 'left' && 'bg-muted text-foreground'
            )}
            onClick={() => setImageAlign('left')}
            aria-label="Align left"
          >
            <AlignLeft className="h-4 w-4" />
          </button>
        </WordScreenTip>
        <WordScreenTip label="Align Center" description="Center the picture on the page." side="top">
          <button
            type="button"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted',
              align === 'center' && 'bg-muted text-foreground'
            )}
            onClick={() => setImageAlign('center')}
            aria-label="Align center"
          >
            <AlignCenter className="h-4 w-4" />
          </button>
        </WordScreenTip>
        <WordScreenTip label="Align Right" description="Place the picture on the right side of the page." side="top">
          <button
            type="button"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted',
              align === 'right' && 'bg-muted text-foreground'
            )}
            onClick={() => setImageAlign('right')}
            aria-label="Align right"
          >
            <AlignRight className="h-4 w-4" />
          </button>
        </WordScreenTip>

        <div className="mx-1 h-5 w-px bg-border/70" />

        <WordScreenTip label="Small" description="Resize the picture to a compact width." side="top">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            onClick={() => setWidth('240px')}
            aria-label="Small"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </WordScreenTip>
        <WordScreenTip label="Medium" description="Resize the picture to a medium width." side="top">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            onClick={() => setWidth('480px')}
            aria-label="Medium"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </WordScreenTip>
        <WordScreenTip label="Full Width" description="Stretch the picture to the full page width." side="top">
          <button
            type="button"
            className="flex h-8 items-center rounded-lg px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            onClick={() => setWidth('100%')}
            aria-label="Full width"
          >
            Full
          </button>
        </WordScreenTip>

        <div className="mx-1 h-5 w-px bg-border/70" />

        <WordScreenTip label="Move Up" description="Move the picture above the previous block." side="top">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            onClick={() => moveSelectedNode(editor, 'up')}
            aria-label="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </WordScreenTip>
        <WordScreenTip label="Move Down" description="Move the picture below the next block." side="top">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            onClick={() => moveSelectedNode(editor, 'down')}
            aria-label="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </WordScreenTip>

        <div className="mx-1 h-5 w-px bg-border/70" />

        <WordScreenTip label="Delete" description="Remove the picture from the document." side="top">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
            onClick={() => editor.chain().focus().deleteSelection().run()}
            aria-label="Delete image"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </WordScreenTip>
      </div>
      <p className="pointer-events-none mt-1 text-center text-[10px] text-muted-foreground">
        Drag the handle on the left to reposition
      </p>
    </div>,
    document.body
  )
}
