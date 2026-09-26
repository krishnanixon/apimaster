import { useCallback, useEffect, useRef, useState } from 'react'
import { Save, StickyNote, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { Textarea } from '@/shared/components/ui/textarea'
import { noteService } from '../services/note.service'

function deriveTitle(title: string, content: string): string {
  const explicitTitle = title.trim()
  if (explicitTitle) return explicitTitle

  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstLine) return 'Untitled Note'
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
}

export function QuickNotePopup() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  const close = useCallback(async () => {
    await window.electronAPI?.quickNote.close()
  }, [])

  const save = useCallback(async () => {
    const trimmedContent = content.trim()
    if (!trimmedContent || isSaving) {
      if (!trimmedContent) setError('Enter some note text before saving.')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await noteService.init()
      await noteService.createNote({
        title: deriveTitle(title, trimmedContent),
        content: trimmedContent,
        format: 'plain',
        folderId: null
      })

      setTitle('')
      setContent('')

      const notifyResult = await window.electronAPI?.quickNote.notifySaved()
      if (notifyResult && !notifyResult.success) {
        setError(notifyResult.error ?? 'Note saved, but the popup could not close.')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save note.')
    } finally {
      setIsSaving(false)
    }
  }, [content, isSaving, title])

  useEffect(() => {
    contentRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        void close()
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        void save()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close, save])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
      <header
        className="flex shrink-0 cursor-default items-center justify-between border-b border-border/60 px-3 py-2.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <StickyNote className="h-4 w-4 text-primary" />
          Quick Note
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => void close()}
          title="Close (draft is kept)"
          aria-label="Close quick note"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div>
          <label htmlFor="quick-note-title" className="mb-1.5 block text-xs font-medium">
            Title <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="quick-note-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="A short title"
            maxLength={200}
            disabled={isSaving}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <label htmlFor="quick-note-content" className="mb-1.5 block text-xs font-medium">
            Note
          </label>
          <Textarea
            ref={contentRef}
            id="quick-note-content"
            value={content}
            onChange={(event) => {
              setContent(event.target.value)
              if (error) setError(null)
            }}
            placeholder="Write anything..."
            className="min-h-0 flex-1 resize-none"
            disabled={isSaving}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
          >
            {error}
          </p>
        )}
      </main>

      <footer className="flex shrink-0 items-center justify-between border-t border-border/60 px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">Ctrl+Enter to save · Esc to close</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void close()} disabled={isSaving}>
            Close
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={isSaving || !content.trim()}>
            {isSaving ? <Spinner size="sm" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </footer>
    </div>
  )
}
