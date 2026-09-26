import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Highlighter,
  Heading2,
  Sparkles,
  Loader2,
  X,
  Wand2,
  MessageSquarePlus
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { cn } from '@/shared/lib/utils'
import { toast } from 'sonner'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'

type Props = {
  editor: Editor
  onAIEditSelection?: (instruction: string, selectedText: string) => Promise<string | null>
  aiProcessing?: boolean
  onAddComment?: () => void
}

const QUICK_ACTIONS = [
  { label: 'Rewrite', instruction: 'Rewrite with clearer, more professional wording.' },
  { label: 'Improve', instruction: 'Improve grammar, tone, and precision.' },
  { label: 'Expand', instruction: 'Expand with more detail while staying concise.' },
  { label: 'Shorten', instruction: 'Make shorter without losing meaning.' },
  { label: 'Summarize', instruction: 'Summarize this selection into a concise paragraph.' },
  { label: 'Fix grammar', instruction: 'Fix grammar, spelling, and punctuation without changing meaning.' },
  { label: 'Professional', instruction: 'Rewrite in a professional specification tone.' },
  { label: 'Translate', instruction: 'Translate to clear professional English.' }
]

export function FloatingSelectionToolbar({ editor, onAIEditSelection, aiProcessing = false, onAddComment }: Props) {
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const selectionRef = useRef({ from: 0, to: 0, text: '' })
  const [wordCount, setWordCount] = useState(0)

  const updatePosition = () => {
    if (!editor.isFocused) {
      setToolbarOpen(false)
      setAiOpen(false)
      return
    }
    const { from, to } = editor.state.selection
    if (from === to) {
      setToolbarOpen(false)
      if (!aiOpen) setAiOpen(false)
      return
    }

    const text = editor.state.doc.textBetween(from, to, '\n').trim()
    selectionRef.current = { from, to, text }
    setWordCount(text.split(/\s+/).filter(Boolean).length)

    try {
      const start = editor.view.coordsAtPos(from)
      const end = editor.view.coordsAtPos(to)
      const midX = Math.round((start.left + end.right) / 2)
      const top = Math.round(Math.min(start.top, end.top) - (aiOpen ? 8 : 44))
      setPos({ top: Math.max(8, top), left: midX })
      setToolbarOpen(true)
    } catch {
      setToolbarOpen(false)
    }
  }

  useEffect(() => {
    updatePosition()
    editor.on('selectionUpdate', updatePosition)
    editor.on('focus', updatePosition)
    editor.on('blur', () => {
      setTimeout(() => {
        if (!document.activeElement?.closest('[data-selection-ai-popover]')) {
          setToolbarOpen(false)
          setAiOpen(false)
        }
      }, 150)
    })
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      editor.off('selectionUpdate', updatePosition)
      editor.off('focus', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [editor, aiOpen])

  const applySelectionEdit = async (instruction: string) => {
    const { from, to, text } = selectionRef.current
    if (!text || !onAIEditSelection) return

    const result = await onAIEditSelection(instruction, text)
    if (!result) {
      toast.error('AI edit failed. Check your API key in Settings.')
      return
    }

    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, result)
      .run()

    setAiOpen(false)
    setPrompt('')
    setToolbarOpen(false)
    toast.success('Selection updated')
  }

  const openAI = () => {
    setPrompt('')
    setAiOpen(true)
    updatePosition()
  }

  if (!toolbarOpen && !aiOpen) return null

  return createPortal(
    <div
      className="pointer-events-none fixed z-[300] -translate-x-1/2"
      style={{ top: pos.top, left: pos.left }}
      data-selection-ai-popover
    >
      {aiOpen ? (
        <div
          className={cn(
            'pointer-events-auto w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl',
            'backdrop-blur supports-[backdrop-filter]:bg-card/90'
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </span>
              <div>
                <p className="text-sm font-medium">Edit selection with AI</p>
                <p className="text-[11px] text-muted-foreground">{wordCount} words selected</p>
              </div>
            </div>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              onClick={() => setAiOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 p-3">
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] font-medium text-muted-foreground">Selected text hidden</p>
              <p className="mt-0.5 text-xs text-muted-foreground/80">
                Your selection stays in the document. Describe how AI should change it.
              </p>
            </div>

            <div className="flex flex-wrap gap-1">
              {QUICK_ACTIONS.map(({ label, instruction }) => (
                <button
                  key={label}
                  type="button"
                  disabled={aiProcessing}
                  onClick={() => void applySelectionEdit(instruction)}
                  className="rounded-lg border border-border/70 px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>

            <Textarea
              placeholder="Describe how to edit this selection…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="resize-none text-sm"
              disabled={aiProcessing}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAiOpen(false)} disabled={aiProcessing}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!prompt.trim() || aiProcessing || !onAIEditSelection}
                onClick={() => void applySelectionEdit(prompt.trim())}
              >
                {aiProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Apply
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'pointer-events-auto flex items-center gap-1 rounded-xl border border-border/70 bg-card/95 p-1 shadow-xl',
            'backdrop-blur supports-[backdrop-filter]:bg-card/80'
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          <WordScreenTip
            label="Bold"
            shortcut="Ctrl+B"
            description="Make the selected text bold."
            side="top"
          >
            <button
              type="button"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                editor.isActive('bold') && 'bg-muted text-foreground'
              )}
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-label="Bold"
            >
              <Bold className="h-4 w-4" />
            </button>
          </WordScreenTip>
          <WordScreenTip
            label="Italic"
            shortcut="Ctrl+I"
            description="Italicize the selected text."
            side="top"
          >
            <button
              type="button"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                editor.isActive('italic') && 'bg-muted text-foreground'
              )}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-label="Italic"
            >
              <Italic className="h-4 w-4" />
            </button>
          </WordScreenTip>
          <WordScreenTip
            label="Underline"
            shortcut="Ctrl+U"
            description="Underline the selected text."
            side="top"
          >
            <button
              type="button"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                editor.isActive('underline') && 'bg-muted text-foreground'
              )}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              aria-label="Underline"
            >
              <Underline className="h-4 w-4" />
            </button>
          </WordScreenTip>
          <WordScreenTip
            label="Text Highlight Color"
            description="Make the selected text stand out with a highlight."
            side="top"
          >
            <button
              type="button"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                editor.isActive('highlight') && 'bg-muted text-foreground'
              )}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              aria-label="Highlight"
            >
              <Highlighter className="h-4 w-4" />
            </button>
          </WordScreenTip>

          <div className="mx-1 h-5 w-px bg-border/70" />

          <WordScreenTip
            label="Heading 2"
            description="Apply Heading 2 to the selected paragraph."
            side="top"
          >
            <button
              type="button"
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                editor.isActive('heading', { level: 2 }) && 'bg-muted text-foreground'
              )}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              aria-label="Heading 2"
            >
              <Heading2 className="h-4 w-4" />
            </button>
          </WordScreenTip>

          <div className="mx-1 h-5 w-px bg-border/70" />

          <WordScreenTip
            label="Ask AI"
            description="Rewrite or improve the selected text with AI."
            side="top"
          >
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              onClick={openAI}
              aria-label="Ask AI"
            >
              <Sparkles className="h-4 w-4" />
              <span>Ask AI</span>
            </button>
          </WordScreenTip>
          {onAddComment && (
            <WordScreenTip
              label="New Comment"
              description="Add a comment on the selected text."
              side="top"
            >
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={onAddComment}
                aria-label="Add comment"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            </WordScreenTip>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}
