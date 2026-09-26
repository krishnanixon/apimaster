import { useEffect, useState, useCallback, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { format } from 'date-fns'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Trash2,
  Type
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { useNotepadStore } from '../stores/notepad.store'
import { autosaveService } from '../core/autosave.service'
import type { NoteFormat, SaveStatus } from '../types/note.types'

interface NoteEditorProps {
  noteId: string
}

function countWords(text: string): number {
  const stripped = text.replace(/<[^>]*>/g, ' ').trim()
  if (!stripped) return 0
  return stripped.split(/\s+/).filter(Boolean).length
}

export function NoteEditor({ noteId }: NoteEditorProps) {
  const {
    notes,
    updateNoteLocal,
    deleteNote,
    togglePin,
    setFullscreen,
    isFullscreen
  } = useNotepadStore()

  const note = notes.find((n) => n.id === noteId)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false)

  useEffect(() => {
    const unsub = autosaveService.subscribe(noteId, (status) => setSaveStatus(status))
    return unsub
  }, [noteId])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: 'Start writing...' })
    ],
    content: note?.format === 'richtext' ? note.content : '',
    onUpdate: ({ editor: ed }) => {
      updateNoteLocal(noteId, { content: ed.getHTML() })
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[300px] px-4 py-3 focus:outline-none'
      }
    }
  })

  useEffect(() => {
    if (!note || !editor || note.format !== 'richtext') return
    if (editor.getHTML() !== note.content) {
      editor.commands.setContent(note.content, false)
    }
  }, [noteId, note?.format, editor])

  const handleTitleChange = useCallback(
    (title: string) => updateNoteLocal(noteId, { title }),
    [noteId, updateNoteLocal]
  )

  const handleContentChange = useCallback(
    (content: string) => updateNoteLocal(noteId, { content }),
    [noteId, updateNoteLocal]
  )

  const handleFormatChange = useCallback(
    (format: NoteFormat) => updateNoteLocal(noteId, { format }),
    [noteId, updateNoteLocal]
  )

  const wordCount = useMemo(() => {
    if (!note) return 0
    return countWords(note.content)
  }, [note?.content])

  if (!note) return null

  const saveLabel =
    saveStatus === 'saving'
      ? 'Saving...'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? 'Save failed'
          : 'Unsaved changes'

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/notepad-note-id', noteId)}
    >
      <div className="shrink-0 border-b border-border/50 px-4 py-3 md:px-5">
        <Input
          value={note.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title"
          className="w-full border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0 md:text-xl"
        />

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {(['plain', 'markdown', 'richtext'] as NoteFormat[]).map((fmt) => (
              <Button
                key={fmt}
                size="sm"
                variant={note.format === fmt ? 'default' : 'outline'}
                className="h-7 px-2.5 text-xs capitalize"
                onClick={() => handleFormatChange(fmt)}
              >
                {fmt === 'plain' && <Type className="mr-1 h-3 w-3" />}
                {fmt}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => void togglePin(noteId)}
              title={note.isPinned ? 'Unpin' : 'Pin'}
            >
              {note.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => void deleteNote(noteId)}
              title="Delete note"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {note.format === 'richtext' && editor && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border/70 px-4 py-1.5">
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      {note.format === 'markdown' && (
        <div className="flex shrink-0 border-b border-border/70 px-4 py-1.5">
          <Button
            size="sm"
            variant={showMarkdownPreview ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setShowMarkdownPreview((v) => !v)}
          >
            {showMarkdownPreview ? 'Edit' : 'Preview'}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {note.format === 'plain' && (
          <Textarea
            value={note.content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Write your note..."
            className="min-h-full resize-none rounded-none border-0 px-4 py-4 font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0 md:px-5"
          />
        )}

        {note.format === 'markdown' && !showMarkdownPreview && (
          <Textarea
            value={note.content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Write markdown..."
            className="min-h-full resize-none rounded-none border-0 px-4 py-4 font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0 md:px-5"
          />
        )}

        {note.format === 'markdown' && showMarkdownPreview && (
          <div className="prose prose-sm dark:prose-invert max-w-none px-4 py-4 md:px-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content || '*Empty note*'}</ReactMarkdown>
          </div>
        )}

        {note.format === 'richtext' && editor && (
          <EditorContent editor={editor} className="h-full min-h-[200px]" />
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground md:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
          <span>Edited {format(note.updatedAt, 'MMM d, yyyy h:mm a')}</span>
        </div>
        <Badge
          variant={
            saveStatus === 'error' ? 'destructive' : saveStatus === 'saved' ? 'success' : 'secondary'
          }
        >
          {saveLabel}
        </Badge>
      </div>
    </div>
  )
}

function ToolbarButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded p-1.5 transition-colors',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
