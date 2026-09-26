import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Trash2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useNotepadStore } from '../stores/notepad.store'
import type { FolderTreeNode } from '../types/folder.types'

interface FolderTreeProps {
  nodes: FolderTreeNode[]
  selectedFolderId: string | null
  onSelect: (id: string | null) => void
  depth?: number
}

export function FolderTree({ nodes, selectedFolderId, onSelect, depth = 0 }: FolderTreeProps) {
  return (
    <>
      {nodes.map((node) => (
        <FolderTreeItem
          key={node.id}
          node={node}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </>
  )
}

function FolderTreeItem({
  node,
  selectedFolderId,
  onSelect,
  depth
}: {
  node: FolderTreeNode
  selectedFolderId: string | null
  onSelect: (id: string | null) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const { deleteFolder, moveNoteToFolder } = useNotepadStore()
  const hasChildren = node.children.length > 0
  const isSelected = selectedFolderId === node.id

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const noteId = e.dataTransfer.getData('text/notepad-note-id')
    if (noteId) void moveNoteToFolder(noteId, node.id)
  }

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-0.5 rounded-md pr-1 transition-colors',
          isSelected ? 'bg-primary/10' : 'hover:bg-muted/60'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-sm"
        >
          {isSelected ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
          {node.noteCount > 0 && (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{node.noteCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => void deleteFolder(node.id)}
          className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          title="Delete folder"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {hasChildren && expanded && (
        <FolderTree
          nodes={node.children}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      )}
    </div>
  )
}
