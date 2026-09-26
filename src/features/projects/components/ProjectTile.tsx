import { Archive, ChevronRight, Copy, FolderKanban, MoreHorizontal, SquarePlus, Trash2 } from 'lucide-react'
import { formatRelativeTime } from '@/shared/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { AppleTile } from './project-chrome'

export interface ProjectTileModel {
  id: string
  name: string
  description: string
  style: string
  status: string
  lastOpenedAt: string
}

export function ProjectTile({
  project,
  onOpen,
  onDuplicate,
  onArchive,
  onDelete,
  onOpenInNewWindow
}: {
  project: ProjectTileModel
  onOpen: () => void
  onDuplicate?: () => void
  onArchive?: () => void
  onDelete?: () => void
  onOpenInNewWindow?: () => void
  featured?: boolean
}) {
  const hasMenu = Boolean(onDuplicate || onArchive || onDelete || onOpenInNewWindow)

  return (
    <AppleTile onClick={onOpen} className="group relative">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FolderKanban className="h-4 w-4" />
        </span>
        {hasMenu && (
          <div onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Project actions"
                  className="-mr-1 -mt-1 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onOpenInNewWindow && (
                  <DropdownMenuItem onClick={() => onOpenInNewWindow()}>
                    <SquarePlus className="h-3.5 w-3.5" /> Open in new window
                  </DropdownMenuItem>
                )}
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => onDuplicate()}>
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </DropdownMenuItem>
                )}
                {onArchive && (
                  <DropdownMenuItem onClick={() => onArchive()}>
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete()}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <h3 className="truncate text-sm font-semibold">{project.name}</h3>
      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {project.description || 'No description'}
      </p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="capitalize">{project.status === 'archived' ? 'Archived' : project.style}</span>
        <span className="inline-flex items-center gap-0.5">
          {formatRelativeTime(project.lastOpenedAt)}
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </AppleTile>
  )
}

export function ProjectListRow({
  project,
  onOpen,
  onDelete
}: {
  project: ProjectTileModel
  onOpen: () => void
  onDelete?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-accent/40"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FolderKanban className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <p className="truncate text-xs text-muted-foreground">{project.description || 'No description'}</p>
      </div>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {formatRelativeTime(project.lastOpenedAt)}
      </span>
      {onDelete && (
        <span
          role="button"
          tabIndex={0}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation()
              onDelete()
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  )
}
