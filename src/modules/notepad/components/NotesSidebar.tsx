import { useState, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Inbox,
  Pin
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useNotepadStore } from '../stores/notepad.store'
import { FolderTree } from './FolderTree'
import { formatDistanceToNow } from 'date-fns'

export function NotesSidebar() {
  const {
    notes,
    folders,
    selectedNoteId,
    selectedFolderId,
    searchQuery,
    searchResults,
    selectNote,
    selectFolder,
    createFolder
  } = useNotepadStore()

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [foldersExpanded, setFoldersExpanded] = useState(true)

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return
    await createFolder(newFolderName.trim())
    setNewFolderName('')
    setShowNewFolder(false)
  }, [createFolder, newFolderName])

  const displayNotes = searchQuery.trim() ? searchResults.map((r) => r.note) : notes

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/50 px-3 py-3">
        <button
          type="button"
          onClick={() => setFoldersExpanded((v) => !v)}
          className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {foldersExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Folders
        </button>

        {foldersExpanded && (
          <div className="mt-2 space-y-0.5">
            <FolderItem
              label="All Notes"
              icon={<Inbox className="h-4 w-4 shrink-0" />}
              active={selectedFolderId === null && !searchQuery.trim()}
              onClick={() => selectFolder(null)}
            />

            <FolderTree
              nodes={folders}
              selectedFolderId={selectedFolderId}
              onSelect={selectFolder}
            />

            {showNewFolder ? (
              <div className="flex gap-1.5 pt-1">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="h-8 min-w-0 flex-1 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateFolder()
                    if (e.key === 'Escape') setShowNewFolder(false)
                  }}
                />
                <Button size="sm" className="h-8 shrink-0 px-2.5 text-xs" onClick={() => void handleCreateFolder()}>
                  Add
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewFolder(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                New folder
              </button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Notes {displayNotes.length > 0 && `(${displayNotes.length})`}
        </p>

        {displayNotes.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No notes here</p>
        ) : (
          <ul className="space-y-0.5">
            {displayNotes.map((note) => {
              const highlight = searchResults.find((r) => r.note.id === note.id)
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => void selectNote(note.id)}
                    className={cn(
                      'group flex w-full min-w-0 flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      selectedNoteId === note.id
                        ? 'bg-primary/10 text-foreground'
                        : 'hover:bg-muted/60'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
                      {highlight?.highlights.title ? (
                        <span
                          className="truncate text-sm font-medium"
                          dangerouslySetInnerHTML={{ __html: highlight.highlights.title }}
                        />
                      ) : (
                        <span className="truncate text-sm font-medium">{note.title || 'Untitled'}</span>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formatDistanceToNow(note.updatedAt, { addSuffix: true })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}

function FolderItem({
  label,
  icon,
  active,
  onClick
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        active ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

export { FolderItem }
