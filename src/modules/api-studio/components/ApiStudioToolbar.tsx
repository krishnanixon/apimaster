import { useEffect, useRef, useState } from 'react'
import { Code2, Columns2, Copy, MoreHorizontal, Pencil, Rows2, Save, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { EnvironmentSelector } from './EnvironmentSelector'
import { useApiStudioStore } from '../stores/apiStudioStore'
import type { RequestType } from '../types/api.types'

interface ApiStudioToolbarProps {
  tabId: string
  onSave: () => void
  onClear: () => void
  onViewCode: () => void
}

export function ApiStudioToolbar({ tabId, onSave, onClear, onViewCode }: ApiStudioToolbarProps) {
  const tab = useApiStudioStore((s) => s.tabs.find((t) => t.id === tabId))
  const updateDraft = useApiStudioStore((s) => s.updateDraft)
  const renameRequest = useApiStudioStore((s) => s.renameRequest)
  const disconnectWebSocket = useApiStudioStore((s) => s.disconnectWebSocket)
  const copyTabAsCurl = useApiStudioStore((s) => s.copyTabAsCurl)
  const workspaceSplit = useApiStudioStore((s) => s.workspaceSplit)
  const setWorkspaceSplit = useApiStudioStore((s) => s.setWorkspaceSplit)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editingName) return
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [editingName])

  if (!tab) return null

  const { request } = tab
  const collectionId = tab.collectionId
  const isDirty = tab.dirty
  const displayName = request.name || 'Untitled Request'

  function setRequestType(type: RequestType) {
    updateDraft(tabId, { requestType: type })
    if (type === 'http') disconnectWebSocket(tabId)
  }

  function startRename() {
    setNameDraft(request.name || '')
    setEditingName(true)
  }

  function commitRename() {
    const next = nameDraft.trim() || 'Untitled Request'
    setEditingName(false)
    if (next === request.name) return

    if (collectionId) {
      renameRequest(collectionId, request.id, next)
    } else {
      updateDraft(tabId, { name: next })
    }
  }

  function cancelRename() {
    setEditingName(false)
    setNameDraft(request.name || '')
  }

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 bg-muted/15 px-2">
      {editingName ? (
        <Input
          ref={nameInputRef}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitRename()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancelRename()
            }
          }}
          className="h-6 min-w-0 flex-1 px-1.5 text-xs"
          placeholder="Request name"
          aria-label="Request name"
        />
      ) : (
        <button
          type="button"
          onClick={startRename}
          onDoubleClick={startRename}
          className="group flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60"
          title="Click to rename"
        >
          <span className="min-w-0 truncate text-xs text-muted-foreground group-hover:text-foreground">
            {displayName}
            {isDirty && <span className="ml-1 text-foreground">•</span>}
          </span>
          <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}

      <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 p-0.5">
        {(['http', 'websocket'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setRequestType(type)}
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors',
              (request.requestType ?? 'http') === type
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {type === 'http' ? 'HTTP' : 'WS'}
          </button>
        ))}
      </div>

      <EnvironmentSelector compact />

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        title={workspaceSplit === 'vertical' ? 'Side-by-side layout' : 'Stacked layout'}
        onClick={() => setWorkspaceSplit(workspaceSplit === 'vertical' ? 'horizontal' : 'vertical')}
      >
        {workspaceSplit === 'vertical' ? <Columns2 className="h-3.5 w-3.5" /> : <Rows2 className="h-3.5 w-3.5" />}
      </Button>

      <Button
        variant={isDirty ? 'secondary' : 'ghost'}
        size="sm"
        className="h-6 gap-1 px-2 text-xs"
        onClick={onSave}
        title="Save (Ctrl+S)"
      >
        <Save className="h-3 w-3" />
        Save
        {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={startRename}>
            <Pencil className="h-3.5 w-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyTabAsCurl(tabId)}>
            <Copy className="h-3.5 w-3.5" /> Copy as cURL
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onViewCode}>
            <Code2 className="h-3.5 w-3.5" /> Code snippet
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onClear} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Clear request
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
