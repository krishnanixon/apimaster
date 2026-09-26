import { useState } from 'react'
import {
  Boxes,
  ChevronRight,
  Database,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Upload
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { useVectorWorkspaceStore } from '../../stores/vectorWorkspace.store'
import { buildVectorBaseUrl } from '@shared/types/vector-workspace'
import { toast } from 'sonner'

export function VectorExplorerPanel() {
  const connections = useVectorWorkspaceStore((s) => s.connections)
  const activeConnectionId = useVectorWorkspaceStore((s) => s.activeConnectionId)
  const explorerTree = useVectorWorkspaceStore((s) => s.explorerTree)
  const explorerLoading = useVectorWorkspaceStore((s) => s.explorerLoading)
  const selectedExplorerNodeId = useVectorWorkspaceStore((s) => s.selectedExplorerNodeId)
  const settings = useVectorWorkspaceStore((s) => s.settings)
  const connect = useVectorWorkspaceStore((s) => s.connect)
  const refreshExplorer = useVectorWorkspaceStore((s) => s.refreshExplorer)
  const openCollectionTab = useVectorWorkspaceStore((s) => s.openCollectionTab)
  const openSearchTab = useVectorWorkspaceStore((s) => s.openSearchTab)
  const openUpsertTab = useVectorWorkspaceStore((s) => s.openUpsertTab)
  const openStatsTab = useVectorWorkspaceStore((s) => s.openStatsTab)
  const createCollection = useVectorWorkspaceStore((s) => s.createCollection)
  const deleteCollection = useVectorWorkspaceStore((s) => s.deleteCollection)
  const renameCollection = useVectorWorkspaceStore((s) => s.renameCollection)
  const setSelectedExplorerNode = useVectorWorkspaceStore((s) => s.setSelectedExplorerNode)
  const setConnectionManagerOpen = useVectorWorkspaceStore((s) => s.setConnectionManagerOpen)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDim, setNewDim] = useState(String(settings.defaultDimension))
  const [newMetric, setNewMetric] = useState(settings.defaultMetric)
  const [newIndex, setNewIndex] = useState(settings.defaultIndex)
  const [menuId, setMenuId] = useState<string | null>(null)

  const active = connections.find((c) => c.id === activeConnectionId)

  const handleCreate = async () => {
    if (!activeConnectionId) return
    const name = newName.trim()
    const dimension = Number(newDim)
    if (!name) {
      toast.error('Collection name is required')
      return
    }
    if (!dimension || dimension < 1) {
      toast.error('Dimension must be a positive number')
      return
    }
    const created = await createCollection(activeConnectionId, {
      name,
      dimension,
      metric: newMetric,
      index: newIndex
    })
    if (created) {
      setCreateOpen(false)
      setNewName('')
      setNewDim(String(settings.defaultDimension))
      setNewMetric(settings.defaultMetric)
      setNewIndex(settings.defaultIndex)
      openCollectionTab(activeConnectionId, created.name)
    }
  }

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      <div className="flex h-11 items-center justify-between gap-2 border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Explorer
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Refresh"
            disabled={!activeConnectionId || explorerLoading}
            onClick={() => activeConnectionId && void refreshExplorer(activeConnectionId)}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', explorerLoading && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="New collection"
            disabled={!activeConnectionId}
            onClick={() => setCreateOpen((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border p-2">
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          value={activeConnectionId ?? ''}
          onChange={(e) => {
            const id = e.target.value
            if (id) void connect(id)
          }}
        >
          <option value="">Select connection…</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {active && (
          <div className="mt-1.5 space-y-1">
            <p className="truncate text-[10px] text-muted-foreground">
              {buildVectorBaseUrl(active.config)}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium',
                  active.health === 'healthy' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                  active.health === 'offline' && 'bg-destructive/15 text-destructive',
                  active.health === 'degraded' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                  (active.health === 'unknown' || !active.health) && 'bg-muted text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    active.health === 'healthy' && 'bg-emerald-500',
                    active.health === 'offline' && 'bg-destructive',
                    active.health === 'degraded' && 'bg-amber-500',
                    (active.health === 'unknown' || !active.health) && 'bg-muted-foreground'
                  )}
                />
                {active.health === 'healthy'
                  ? 'Healthy'
                  : active.health === 'offline'
                    ? 'Offline'
                    : active.health === 'degraded'
                      ? 'Degraded'
                      : 'Unknown'}
              </span>
              {active.latencyMs != null && (
                <span className="text-muted-foreground">{active.latencyMs}ms</span>
              )}
              {active.serverVersion && (
                <span className="text-muted-foreground">v{active.serverVersion}</span>
              )}
            </div>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full text-xs"
          onClick={() => setConnectionManagerOpen(true)}
        >
          Manage connections
        </Button>
      </div>

      {createOpen && activeConnectionId && (
        <div className="space-y-2 border-b border-border p-3">
          <Input
            placeholder="Collection name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Dimension"
            value={newDim}
            onChange={(e) => setNewDim(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={newMetric}
              onChange={(e) => setNewMetric(e.target.value as typeof newMetric)}
            >
              <option value="cosine">cosine</option>
              <option value="l2">l2</option>
              <option value="ip">ip</option>
            </select>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={newIndex}
              onChange={(e) => setNewIndex(e.target.value as typeof newIndex)}
            >
              <option value="flat">flat</option>
              <option value="hnsw">hnsw</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => void handleCreate()}>
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {!activeConnectionId ? (
          <p className="px-3 py-6 text-center text-caption text-muted-foreground">
            Connect to a LiteChroma server to browse collections.
          </p>
        ) : explorerTree.length === 0 && !explorerLoading ? (
          <p className="px-3 py-6 text-center text-caption text-muted-foreground">
            No collections yet. Create one to store embeddings.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {activeConnectionId && (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                  onClick={() => openStatsTab(activeConnectionId)}
                >
                  <Database className="h-3.5 w-3.5 text-muted-foreground" />
                  Database stats
                </button>
              </li>
            )}
            {explorerTree.map((node) => {
              const count = node.metadata?.count
              const dim = node.metadata?.dimension
              return (
                <li key={node.id} className="relative">
                  <div
                    className={cn(
                      'group flex items-center gap-1 rounded-lg px-1 py-0.5',
                      selectedExplorerNodeId === node.id && 'bg-primary/15 ring-1 ring-primary/30'
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-xs"
                      onClick={() => {
                        setSelectedExplorerNode(node.id)
                        if (node.collection && activeConnectionId) {
                          openCollectionTab(activeConnectionId, node.collection)
                        }
                      }}
                    >
                      <Boxes className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate font-medium">{node.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {typeof count === 'number' ? count : '—'}
                        {typeof dim === 'number' ? ` · d${dim}` : ''}
                      </span>
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => setMenuId(menuId === node.id ? null : node.id)}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </div>
                  {menuId === node.id && node.collection && activeConnectionId && (
                    <div className="absolute right-1 z-10 mt-0.5 w-40 rounded-lg border border-border bg-popover p-1 shadow-md">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                        onClick={() => {
                          openSearchTab(activeConnectionId, node.collection)
                          setMenuId(null)
                        }}
                      >
                        <Search className="h-3 w-3" /> Search
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                        onClick={() => {
                          openUpsertTab(activeConnectionId, node.collection)
                          setMenuId(null)
                        }}
                      >
                        <Upload className="h-3 w-3" /> Upsert
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                        onClick={() => {
                          const next = window.prompt('New collection name', node.collection)
                          if (next && next !== node.collection) {
                            void renameCollection(activeConnectionId, node.collection!, next)
                          }
                          setMenuId(null)
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-muted"
                        onClick={() => {
                          const ok =
                            !settings.confirmDestructive ||
                            window.confirm(`Delete collection “${node.collection}”?`)
                          if (ok) void deleteCollection(activeConnectionId, node.collection!)
                          setMenuId(null)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
