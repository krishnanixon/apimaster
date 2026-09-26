import { useState } from 'react'
import {
  Folder,
  FolderOpen,
  Star,
  Clock,
  Archive,
  Trash2,
  Plus,
  Server,
  Database,
  Shield,
  Code,
  Cloud,
  Sparkles,
  Github,
  CreditCard,
  Mail,
  Terminal,
  FolderSync,
  Zap,
  ChevronRight,
  ChevronDown
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { VaultConfirmDialog, type VaultConfirmAction } from './VaultConfirmDialog'
import { useVaultStore } from '../stores/vault.store'
import type { VaultFolder, VaultViewFilter } from '@shared/types/vault'

const ICON_MAP: Record<string, typeof Folder> = {
  folder: Folder,
  server: Server,
  database: Database,
  shield: Shield,
  code: Code,
  cloud: Cloud,
  sparkles: Sparkles,
  github: Github,
  'credit-card': CreditCard,
  mail: Mail,
  terminal: Terminal,
  'folder-sync': FolderSync,
  zap: Zap
}

interface VaultFolderTreeProps {
  folders: VaultFolder[]
  selectedFolderId: string | null
  viewFilter: VaultViewFilter
  onSelectFolder: (id: string | null) => void
  onSetViewFilter: (filter: VaultViewFilter) => void
  onCreateFolder: () => void
}

function FolderNode({
  folder,
  folders,
  selectedFolderId,
  onSelectFolder,
  onDeleteFolder,
  depth = 0
}: {
  folder: VaultFolder
  folders: VaultFolder[]
  selectedFolderId: string | null
  onSelectFolder: (id: string) => void
  onDeleteFolder: (folder: VaultFolder) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(true)
  const children = folders.filter((f) => f.parentId === folder.id)
  const Icon = ICON_MAP[folder.icon] ?? Folder
  const isSelected = selectedFolderId === folder.id

  return (
    <div className="group/folder">
      <div className="flex items-center gap-0.5 pr-1">
        <button
          type="button"
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
            isSelected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onSelectFolder(folder.id)}
        >
          {children.length > 0 ? (
            <span
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{folder.name}</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover/folder:opacity-100"
          onClick={() => onDeleteFolder(folder)}
          title="Delete folder"
        >
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
      {expanded &&
        children.map((child) => (
          <FolderNode
            key={child.id}
            folder={child}
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            onDeleteFolder={onDeleteFolder}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

export function VaultFolderTree({
  folders,
  selectedFolderId,
  viewFilter,
  onSelectFolder,
  onSetViewFilter,
  onCreateFolder
}: VaultFolderTreeProps) {
  const { deleteFolder } = useVaultStore()
  const [confirmAction, setConfirmAction] = useState<VaultConfirmAction | null>(null)
  const roots = folders.filter((f) => !f.parentId)

  const smartFilters: Array<{ id: VaultViewFilter; label: string; icon: typeof Star }> = [
    { id: 'all', label: 'All Items', icon: FolderOpen },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'recent', label: 'Recently Used', icon: Clock },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'trash', label: 'Trash', icon: Trash2 }
  ]

  return (
    <>
    <div className="flex h-full min-w-0 w-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vault</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCreateFolder}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-0.5 px-2 pb-2">
        {smartFilters.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={cn(
              'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
              viewFilter === id && !selectedFolderId
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
            onClick={() => {
              onSetViewFilter(id)
              onSelectFolder(null)
            }}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="mx-3 border-t border-border/50" />

      <div className="flex-1 overflow-y-auto px-1 py-2">
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Folders
        </p>
        {roots.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => {
              onSetViewFilter('all')
              onSelectFolder(id)
            }}
            onDeleteFolder={(f) =>
              setConfirmAction({ type: 'delete-folder', id: f.id, name: f.name })
            }
          />
        ))}
      </div>
    </div>
    <VaultConfirmDialog
      action={confirmAction}
      onClose={() => setConfirmAction(null)}
      onConfirm={async (action) => {
        if (action.type === 'delete-folder') {
          setConfirmAction(null)
          await deleteFolder(action.id)
        }
      }}
    />
    </>
  )
}
