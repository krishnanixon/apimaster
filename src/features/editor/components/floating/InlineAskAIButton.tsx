import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'

type Props = {
  editor: Editor
  onAskAI?: (draft: string) => void
}

export function InlineAskAIButton({ editor, onAskAI }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const update = () => {
      if (!editor.isFocused) {
        setOpen(false)
        return
      }
      const { from, to } = editor.state.selection
      // Only show for caret (not selection) to avoid clashing with selection toolbar.
      if (from !== to) {
        setOpen(false)
        return
      }
      try {
        const c = editor.view.coordsAtPos(from)
        setPos({ top: Math.round(c.top - 6), left: Math.round(c.right + 14) })
        setOpen(true)
      } catch {
        setOpen(false)
      }
    }

    update()
    editor.on('selectionUpdate', update)
    editor.on('focus', update)
    editor.on('blur', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('focus', update)
      editor.off('blur', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor])

  if (!open) return null

  return createPortal(
    <div className="pointer-events-none fixed z-[310]" style={{ top: pos.top, left: pos.left }}>
      <WordScreenTip
        label="Ask AI"
        description="Generate the next sentences in a professional requirements tone."
        side="right"
      >
        <button
          type="button"
          className={cn(
            'pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm',
            'backdrop-blur transition-colors hover:bg-card'
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            onAskAI?.('Help me write the next few sentences in a professional requirement-document tone. Keep it concise and structured.')
          }
          aria-label="Ask AI"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Ask AI
        </button>
      </WordScreenTip>
    </div>,
    document.body
  )
}

