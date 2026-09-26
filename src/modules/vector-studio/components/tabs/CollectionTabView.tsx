import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useVectorWorkspaceStore } from '../../stores/vectorWorkspace.store'
import type { VectorCollectionStats, VectorGetResult, VectorRecord } from '@shared/types/vector-workspace'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Copy, RefreshCw, Trash2 } from 'lucide-react'
import { writeClipboardText } from '@/shared/lib/clipboard'

interface CollectionTabViewProps {
  connectionId: string
  collection: string
}

const PAGE_SIZE = 25

export function CollectionTabView({ connectionId, collection }: CollectionTabViewProps) {
  const openSearchTab = useVectorWorkspaceStore((s) => s.openSearchTab)
  const openUpsertTab = useVectorWorkspaceStore((s) => s.openUpsertTab)
  const deleteVectors = useVectorWorkspaceStore((s) => s.deleteVectors)
  const getVector = useVectorWorkspaceStore((s) => s.getVector)
  const getVectors = useVectorWorkspaceStore((s) => s.getVectors)
  const settings = useVectorWorkspaceStore((s) => s.settings)

  const [stats, setStats] = useState<VectorCollectionStats | null>(null)
  const [vectorId, setVectorId] = useState('')
  const [record, setRecord] = useState<VectorRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [browse, setBrowse] = useState<VectorGetResult | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [idFilter, setIdFilter] = useState('')

  const refreshStats = useCallback(async () => {
    const res = await window.electronAPI.vectorWorkspace.getCollectionStats(
      connectionId,
      collection
    )
    if (res.success) setStats(res.data ?? null)
  }, [connectionId, collection])

  const loadBrowse = useCallback(
    async (nextOffset: number) => {
      setBrowseLoading(true)
      const data = await getVectors(connectionId, {
        collection,
        limit: PAGE_SIZE,
        offset: nextOffset,
        include_embeddings: false
      })
      setBrowseLoading(false)
      if (data) {
        setBrowse(data)
        setOffset(nextOffset)
        setSelectedIds(new Set())
      }
    },
    [connectionId, collection, getVectors]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await refreshStats()
      if (cancelled) return
      setBrowseLoading(true)
      const data = await getVectors(connectionId, {
        collection,
        limit: PAGE_SIZE,
        offset: 0,
        include_embeddings: false
      })
      if (!cancelled) {
        setBrowse(data)
        setOffset(0)
        setBrowseLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connectionId, collection, getVectors, refreshStats])

  const handleFetch = async () => {
    const id = vectorId.trim()
    if (!id) {
      toast.error('Enter a vector id')
      return
    }
    setLoading(true)
    const data = (await getVector(connectionId, collection, id)) as VectorRecord | null
    setLoading(false)
    setRecord(data)
  }

  const handleDeleteOne = async (id: string) => {
    const ok =
      !settings.confirmDestructive || window.confirm(`Delete vector “${id}” from ${collection}?`)
    if (!ok) return
    const success = await deleteVectors(connectionId, collection, [id])
    if (success) {
      if (record?.id === id) setRecord(null)
      await loadBrowse(offset)
      await refreshStats()
    }
  }

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    const ok =
      !settings.confirmDestructive ||
      window.confirm(`Delete ${ids.length} vector(s) from ${collection}?`)
    if (!ok) return
    const success = await deleteVectors(connectionId, collection, ids)
    if (success) {
      setRecord(null)
      await loadBrowse(offset)
      await refreshStats()
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyId = async (id: string) => {
    try {
      await writeClipboardText(id)
      toast.success('Id copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  const openRecord = async (id: string) => {
    setVectorId(id)
    setLoading(true)
    const data = (await getVector(connectionId, collection, id)) as VectorRecord | null
    setLoading(false)
    setRecord(data)
  }

  const total = browse?.total ?? 0
  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = Math.min(offset + PAGE_SIZE, total)
  const canPrev = offset > 0
  const canNext = offset + PAGE_SIZE < total

  const filteredRows =
    browse?.ids
      .map((id, i) => ({
        id,
        document: browse.documents[i],
        metadata: browse.metadatas[i]
      }))
      .filter((row) => {
        const q = idFilter.trim().toLowerCase()
        if (!q) return true
        return (
          row.id.toLowerCase().includes(q) ||
          (row.document?.toLowerCase().includes(q) ?? false)
        )
      }) ?? []

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h3 className="text-base font-semibold">{collection}</h3>
        <p className="mt-1 text-caption text-muted-foreground">
          Browse records, fetch by id, run similarity search, or upsert embeddings.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['Vectors', stats.count],
              ['Dimension', stats.dimension],
              ['Metric', stats.metric],
              ['Index', stats.index]
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openSearchTab(connectionId, collection)}>
          Similarity search
        </Button>
        <Button size="sm" variant="outline" onClick={() => openUpsertTab(connectionId, collection)}>
          Upsert vectors
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={browseLoading}
          onClick={() => void loadBrowse(offset).then(() => refreshStats())}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${browseLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold">Records</h4>
            <p className="text-[11px] text-muted-foreground">
              {browseLoading
                ? 'Loading…'
                : total > 0
                  ? `Showing ${pageStart}–${pageEnd} of ${total}`
                  : 'No vectors in this collection'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 w-44 text-xs"
              placeholder="Filter id / document"
              value={idFilter}
              onChange={(e) => setIdFilter(e.target.value)}
            />
            {selectedIds.size > 0 && (
              <Button size="sm" variant="destructive" className="h-8" onClick={() => void handleDeleteSelected()}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete ({selectedIds.size})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!canPrev || browseLoading}
              onClick={() => void loadBrowse(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!canNext || browseLoading}
              onClick={() => void loadBrowse(offset + PAGE_SIZE)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Id</th>
                <th className="px-3 py-2 font-medium">Document</th>
                <th className="px-3 py-2 font-medium">Metadata</th>
                <th className="w-24 px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && !browseLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    {total === 0
                      ? 'Upsert vectors to populate this collection.'
                      : 'No rows match the filter on this page.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border/30 align-top hover:bg-muted/20"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Select ${row.id}`}
                      />
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 font-mono">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => void openRecord(row.id)}
                      >
                        {row.id}
                      </button>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-2" title={row.document ?? undefined}>
                      {row.document ?? '—'}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-3 py-2 font-mono text-[10px]"
                      title={row.metadata ? JSON.stringify(row.metadata) : undefined}
                    >
                      {row.metadata ? JSON.stringify(row.metadata) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Copy id"
                          onClick={() => void copyId(row.id)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          title="Delete"
                          onClick={() => void handleDeleteOne(row.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 p-4">
        <h4 className="text-sm font-semibold">Get vector by id</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="Vector id"
            value={vectorId}
            onChange={(e) => setVectorId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleFetch()}
          />
          <Button size="sm" disabled={loading} onClick={() => void handleFetch()}>
            {loading ? 'Loading…' : 'Fetch'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!vectorId.trim()}
            onClick={() => void handleDeleteOne(vectorId.trim())}
          >
            Delete
          </Button>
        </div>
        {record && (
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-muted/30 p-3 text-[11px] leading-relaxed">
            {JSON.stringify(
              {
                id: record.id,
                document: record.document,
                metadata: record.metadata,
                embeddingPreview: record.embedding
                  ? `[${record.embedding
                      .slice(0, 8)
                      .map((n) => n.toFixed(4))
                      .join(', ')}${record.embedding.length > 8 ? ', …' : ''}] (${record.embedding.length}d)`
                  : null
              },
              null,
              2
            )}
          </pre>
        )}
      </div>
    </div>
  )
}
