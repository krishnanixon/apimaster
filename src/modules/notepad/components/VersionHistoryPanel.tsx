import { History, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { useNotepadStore } from '../stores/notepad.store'

interface VersionHistoryPanelProps {
  noteId: string
}

export function VersionHistoryPanel({ noteId }: VersionHistoryPanelProps) {
  const { versions, restoreVersion, notes } = useNotepadStore()
  const note = notes.find((n) => n.id === noteId)

  return (
    <div className="flex min-h-[180px] flex-1 flex-col overflow-hidden px-4 py-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <History className="h-3.5 w-3.5 shrink-0" />
        Version History
      </div>

      {note && (
        <div className="mb-3 shrink-0 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <p>Created {format(note.createdAt, 'MMM d, yyyy')}</p>
          <p className="mt-0.5">Current version: v{note.version}</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {versions.length === 0 ? (
          <p className="py-4 text-center text-xs leading-relaxed text-muted-foreground">
            No previous versions yet. Versions are saved on each edit.
          </p>
        ) : (
          <ul className="space-y-2 pr-1">
            {versions.map((version) => (
              <li
                key={version.id}
                className="group flex min-w-0 items-start justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    v{version.version} — {version.title || 'Untitled'}
                  </p>
                  <p className="text-muted-foreground">{format(version.savedAt, 'MMM d, h:mm a')}</p>
                  <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                    {version.content.replace(/<[^>]*>/g, '').slice(0, 120)}
                    {version.content.length > 0 ? '…' : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 opacity-0 group-hover:opacity-100"
                  onClick={() => void restoreVersion(noteId, version.id)}
                  title="Restore this version"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
