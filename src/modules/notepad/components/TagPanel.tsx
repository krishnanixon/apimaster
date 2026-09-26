import { useState, useCallback } from 'react'
import { Plus, Tag as TagIcon, X } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { useNotepadStore } from '../stores/notepad.store'

interface TagPanelProps {
  noteId: string
}

export function TagPanel({ noteId }: TagPanelProps) {
  const { notes, tags, addTagToNote, removeTagFromNote, selectTag, selectedTagId } = useNotepadStore()
  const [newTag, setNewTag] = useState('')
  const [showInput, setShowInput] = useState(false)

  const note = notes.find((n) => n.id === noteId)
  const noteTags = tags.filter((t) => note?.tags.includes(t.id))
  const suggestions = tags.filter((t) => !note?.tags.includes(t.id)).slice(0, 5)

  const handleAddTag = useCallback(async () => {
    if (!newTag.trim()) return
    await addTagToNote(noteId, newTag.trim())
    setNewTag('')
    setShowInput(false)
  }, [addTagToNote, noteId, newTag])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border/50 px-4 py-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <TagIcon className="h-3.5 w-3.5 shrink-0" />
        Tags
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {noteTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: tag.color }}
          >
            <span className="truncate">{tag.name}</span>
            <button
              type="button"
              onClick={() => void removeTagFromNote(noteId, tag.id)}
              className="shrink-0 rounded-full p-0.5 hover:bg-black/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {!showInput ? (
          <button
            type="button"
            onClick={() => setShowInput(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add tag
          </button>
        ) : (
          <div className="flex w-full min-w-0 gap-1.5">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Tag name"
              className="h-8 min-w-0 flex-1 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddTag()
                if (e.key === 'Escape') setShowInput(false)
              }}
            />
            <Button size="sm" className="h-8 shrink-0 px-2.5" onClick={() => void handleAddTag()}>
              Add
            </Button>
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs text-muted-foreground">Suggestions</p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => void addTagToNote(noteId, tag.name)}
                className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted/60"
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-border/50 pt-3">
        <p className="mb-2 text-xs text-muted-foreground">Filter by tag</p>
        <div className="flex flex-wrap gap-1">
          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">No tags yet</p>
          ) : (
            tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => selectTag(selectedTagId === tag.id ? null : tag.id)}
                className="max-w-full truncate rounded-full px-2.5 py-0.5 text-xs text-white transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: tag.color,
                  opacity: selectedTagId === tag.id ? 1 : 0.65
                }}
              >
                {tag.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
