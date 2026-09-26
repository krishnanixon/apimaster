import { ChevronDown, Clock, FolderOpen, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import { useTerminalStore } from '../stores/terminal.store'

interface RecentFolderSelectProps {
  className?: string
}

export function RecentFolderSelect({ className }: RecentFolderSelectProps) {
  const workspaceCwd = useTerminalStore((s) => s.workspaceCwd)
  const workspaceName = useTerminalStore((s) => s.workspaceName)
  const recentFolders = useTerminalStore((s) => s.recentFolders)
  const isPickingFolder = useTerminalStore((s) => s.isPickingFolder)
  const pickFolder = useTerminalStore((s) => s.pickFolder)
  const selectFolder = useTerminalStore((s) => s.selectFolder)
  const removeRecentFolder = useTerminalStore((s) => s.removeRecentFolder)

  const label = workspaceName ?? 'Select folder'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'max-w-[280px] gap-1.5 text-[var(--wb-fg)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]',
            className
          )}
          disabled={isPickingFolder}
          title={workspaceCwd ?? 'Choose working folder'}
        >
          {isPickingFolder ? (
            <Spinner size="sm" className="text-current" />
          ) : (
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Working folder</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void pickFolder()}>
          <FolderOpen className="h-3.5 w-3.5" />
          Browse for folder…
        </DropdownMenuItem>
        {recentFolders.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> Recent folders
            </DropdownMenuLabel>
            {recentFolders.map((folder) => (
              <DropdownMenuItem
                key={folder.path}
                className="group flex items-center justify-between gap-2"
                onSelect={() => void selectFolder(folder.path, true)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{folder.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{folder.path}</p>
                </div>
                <button
                  type="button"
                  title="Remove from recent"
                  className="shrink-0 rounded p-1 opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeRecentFolder(folder.path)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
