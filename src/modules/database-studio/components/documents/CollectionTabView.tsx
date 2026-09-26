import { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import type { DbTableInfo } from '@shared/types/database-workspace'
import { buildBrowseQuery } from '@shared/types/database-workspace'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'
import { DataGrid } from '../data-grid/DataGrid'
import { Spinner } from '@/shared/components/ui/spinner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import {
  Braces,
  Copy,
  FileCode2,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Table2,
  Trash2,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'
import { formatDisplayValue } from '../../lib/formatValue'
import { dbTableClass, dbTdClass, dbThClass, dbRowStripe, sanitizeRowsForAi } from '../../lib/aiContext'
import { JsonTree } from './JsonTree'

interface CollectionTabViewProps {
  tabId: string
  connectionId: string
  database: string
  schema: string
  table: string
}

type ViewMode = 'json' | 'table'

const COLLECTION_AI_ACTIONS = [
  { action: 'explain_table' as const, label: 'Explain collection' },
  { action: 'generate_documentation' as const, label: 'Generate docs' },
  { action: 'find_missing_indexes' as const, label: 'Suggest indexes' },
  { action: 'generate_dtos' as const, label: 'TypeScript types' },
  {
    action: 'natural_language' as const,
    label: 'Mongoose schema',
    prompt: 'Generate a Mongoose schema (with types, required flags, and indexes) for this collection based on the inferred fields.'
  },
  {
    action: 'natural_language' as const,
    label: 'Validation rules',
    prompt: 'Propose a MongoDB $jsonSchema validator for this collection based on the inferred fields and sample documents.'
  }
]

const VIEW_MODE_KEY = 'db-workbench:document-view-mode'

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'table' ? 'table' : 'json'
  } catch {
    return 'json'
  }
}

function docId(doc: Record<string, unknown>): string {
  return formatDisplayValue(doc._id)
}

function DocumentEditor({
  initial,
  title,
  onCancel,
  onSave
}: {
  initial: string
  title: string
  onCancel: () => void
  onSave: (doc: Record<string, unknown>) => Promise<boolean>
}) {
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('A document must be a JSON object')
      return
    }
    setSaving(true)
    const ok = await onSave(parsed as Record<string, unknown>)
    setSaving(false)
    if (!ok) setError('Save failed — see notification for details')
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-background shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-medium">{title}</span>
        <span className="text-[10px] text-muted-foreground">Extended JSON · {'{"$oid": …}'} {'{"$date": …}'}</span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save()
          if (e.key === 'Escape') onCancel()
        }}
        rows={Math.min(22, Math.max(6, text.split('\n').length + 1))}
        className="rounded-none border-0 font-mono text-[11px] focus-visible:ring-0"
        spellCheck={false}
        autoFocus
      />
      {error && <p className="border-t border-destructive/30 bg-destructive/5 px-3 py-1 text-[11px] text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border px-3 py-1.5">
        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="h-6 text-[11px]" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

export function CollectionTabView({ tabId: _tabId, connectionId, database, schema, table }: CollectionTabViewProps) {
  const [info, setInfo] = useState<DbTableInfo | null>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = useState<DbTableInfo['columns']>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subTab, setSubTab] = useState('documents')
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode)
  const [filterDraft, setFilterDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [inserting, setInserting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Record<string, unknown> | null>(null)

  const settings = useDbWorkspaceStore((s) => s.settings)
  const runAi = useDbWorkspaceStore((s) => s.runAi)
  const getTableInfo = useDbWorkspaceStore((s) => s.getTableInfo)
  const connections = useDbWorkspaceStore((s) => s.connections)
  const aiLoading = useDbWorkspaceStore((s) => s.aiLoading)
  const setAiLiveContext = useDbWorkspaceStore((s) => s.setAiLiveContext)
  const openQueryTab = useDbWorkspaceStore((s) => s.openQueryTab)
  const loadingMoreRef = useRef(false)

  const pageSize = Math.min(100, Math.max(20, settings.maxRows || 50))
  const conn = connections.find((c) => c.id === connectionId)
  const readonly = Boolean(conn?.config.readonly) || info?.type === 'view'

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode)
    } catch {
      // storage unavailable — keep in-memory preference
    }
  }, [viewMode])

  const fetchPage = useCallback(
    (offset: number) =>
      window.electronAPI.dbWorkspace.fetchDataPage({
        connectionId,
        database,
        schema,
        table,
        offset,
        limit: pageSize,
        documentFilter: filter || undefined
      }),
    [connectionId, database, schema, table, pageSize, filter]
  )

  const loadInitial = useCallback(async () => {
    setLoadingInitial(true)
    setError(null)
    const [page, tableInfo] = await Promise.all([fetchPage(0), getTableInfo(connectionId, database, schema, table)])
    if (tableInfo) setInfo(tableInfo)
    if (page.success && page.data) {
      setRows(page.data.rows)
      setColumns(page.data.columns)
      setTotalCount(page.data.totalCount)
      const total = page.data.totalCount
      setHasMore(total != null ? page.data.rows.length < total : page.data.rows.length >= pageSize)
    } else {
      setRows([])
      setTotalCount(null)
      setHasMore(false)
      setError(page.error ?? 'Failed to load documents')
    }
    setLoadingInitial(false)
  }, [fetchPage, getTableInfo, connectionId, database, schema, table, pageSize])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const offset = rows.length
    const page = await fetchPage(offset)
    if (page.success && page.data) {
      const next = page.data.rows
      setRows((prev) => [...prev, ...next])
      const total = page.data.totalCount
      setHasMore(total != null ? offset + next.length < total : next.length >= pageSize)
    } else {
      setHasMore(false)
      if (page.error) setError(page.error)
    }
    setLoadingMore(false)
    loadingMoreRef.current = false
  }, [fetchPage, rows.length, hasMore, pageSize])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    return () => {
      const current = useDbWorkspaceStore.getState().aiLiveContext
      if (current?.table === table && current.connectionId === connectionId) {
        useDbWorkspaceStore.getState().setAiLiveContext(null)
      }
    }
  }, [connectionId, table])

  useEffect(() => {
    if (!rows.length) return
    setAiLiveContext({
      connectionId,
      database,
      schema,
      table,
      columns: columns.map((c) => c.name),
      selectedRows: [],
      loadedSample: sanitizeRowsForAi(rows, 20)
    })
  }, [rows, columns, connectionId, database, schema, table, setAiLiveContext])

  const save = async (change: Parameters<typeof window.electronAPI.dbWorkspace.saveDataChanges>[0]['changes'][number]) => {
    const res = await window.electronAPI.dbWorkspace.saveDataChanges({ connectionId, database, schema, table, changes: [change] })
    if (!res.success) {
      toast.error(res.error ?? 'Save failed')
      return false
    }
    return true
  }

  const applyFilter = () => setFilter(filterDraft.trim())

  const askAiAbout = (doc: Record<string, unknown>) => {
    const cleaned = sanitizeRowsForAi([doc], 1)
    setAiLiveContext({
      connectionId,
      database,
      schema,
      table,
      columns: columns.map((c) => c.name),
      selectedRows: cleaned,
      loadedSample: sanitizeRowsForAi(rows, 20)
    })
    void runAi(connectionId, 'natural_language', {
      table,
      database,
      schema,
      prompt: `Explain this document from ${table} (_id ${docId(doc)}): what it represents, notable fields, and anything unusual compared with the other documents.`
    })
  }

  if (loadingInitial && !info) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Spinner />
        <p className="text-xs text-muted-foreground">Loading {table}…</p>
      </div>
    )
  }

  const schemaColumns = info?.columns.length ? info.columns : columns

  return (
    <Tabs value={subTab} onValueChange={setSubTab} className="flex h-full min-h-0 flex-col">
      <TabsList className="h-7 shrink-0 justify-start rounded-none border-b border-border bg-transparent p-0 px-1">
        <TabsTrigger value="documents" className="h-6 px-2 text-[11px]">
          Documents
        </TabsTrigger>
        <TabsTrigger value="schema" className="h-6 px-2 text-[11px]">
          Schema
        </TabsTrigger>
        <TabsTrigger value="indexes" className="h-6 px-2 text-[11px]">
          Indexes {info?.indexes.length ? `(${info.indexes.length})` : ''}
        </TabsTrigger>
        <TabsTrigger value="ai" className="h-6 px-2 text-[11px]">
          AI
        </TabsTrigger>
        <span className="ml-auto pr-2 text-[10px] text-muted-foreground">
          {info?.type === 'view' ? 'View · read-only' : 'Collection'}
          {info?.rowCount != null && ` · ~${info.rowCount.toLocaleString()} docs`}
        </span>
      </TabsList>

      <TabsContent value="documents" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
          <div className="relative min-w-[200px] flex-1">
            <Filter className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filterDraft}
              onChange={(e) => setFilterDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
              placeholder='Filter, e.g. { status: "active", age: { $gt: 30 } }'
              className="h-7 pl-6 pr-6 font-mono text-[11px]"
              spellCheck={false}
            />
            {filterDraft && (
              <button
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => {
                  setFilterDraft('')
                  setFilter('')
                }}
                title="Clear filter"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button size="sm" className="h-7 px-2.5 text-[11px]" onClick={applyFilter}>
            Find
          </Button>
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button
              type="button"
              className={cn('rounded px-1.5 py-0.5', viewMode === 'json' ? 'bg-muted text-foreground' : 'text-muted-foreground')}
              onClick={() => setViewMode('json')}
              title="Document view"
            >
              <Braces className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn('rounded px-1.5 py-0.5', viewMode === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground')}
              onClick={() => setViewMode('table')}
              title="Table view"
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void loadInitial()} title="Refresh">
            <RefreshCw className={cn('h-3.5 w-3.5', loadingInitial && 'animate-spin')} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Open in shell"
            onClick={() =>
              openQueryTab(
                connectionId,
                filter
                  ? buildBrowseQuery('mongodb', table, { limit: 50 }).replace('find({})', `find(${filter})`)
                  : buildBrowseQuery('mongodb', table, { limit: 50 }),
                `${table} — shell`
              )
            }
          >
            <FileCode2 className="h-3.5 w-3.5" />
          </Button>
          {!readonly && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setInserting(true)
                setViewMode('json')
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> Insert
            </Button>
          )}
        </div>

        {error && <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}

        {loadingInitial ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : viewMode === 'table' ? (
          <div className="min-h-0 flex-1">
            <DataGrid
              connectionId={connectionId}
              database={database}
              schema={schema}
              table={table}
              columns={columns}
              rows={rows}
              totalCount={totalCount}
              density={settings.gridDensity}
              readonly={readonly}
              hasMore={hasMore}
              loadingMore={loadingMore}
              exportFormat="json"
              onRefresh={() => void loadInitial()}
              onLoadMore={() => void loadMore()}
              onAskAi={(selected) => selected[0] && askAiAbout(selected[0])}
            />
          </div>
        ) : (
          <div
            className="min-h-0 flex-1 space-y-2 overflow-auto p-2"
            onScroll={(e) => {
              const el = e.currentTarget
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) void loadMore()
            }}
          >
            {inserting && (
              <DocumentEditor
                title="New document"
                initial={'{\n  \n}'}
                onCancel={() => setInserting(false)}
                onSave={async (doc) => {
                  const ok = await save({ type: 'insert', primaryKey: {}, after: doc, replace: true })
                  if (ok) {
                    toast.success('Document inserted')
                    setInserting(false)
                    void loadInitial()
                  }
                  return ok
                }}
              />
            )}
            {rows.length === 0 && !inserting && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Braces className="h-6 w-6 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">{filter ? 'No documents match this filter' : 'This collection is empty'}</p>
              </div>
            )}
            {rows.map((doc, i) => {
              const id = docId(doc)
              const key = `${id}-${i}`
              if (editingId === key) {
                const { _id, ...rest } = doc
                return (
                  <DocumentEditor
                    key={key}
                    title={`Edit ${id}`}
                    initial={JSON.stringify(rest, null, 2)}
                    onCancel={() => setEditingId(null)}
                    onSave={async (next) => {
                      const ok = await save({ type: 'update', primaryKey: { _id }, before: doc, after: next, replace: true })
                      if (ok) {
                        toast.success('Document saved')
                        setEditingId(null)
                        setRows((prev) => prev.map((r, idx) => (idx === i ? { _id, ...next } : r)))
                      }
                      return ok
                    }}
                  />
                )
              }
              return (
                <div key={key} className="group rounded-lg border border-border bg-card/40 px-3 py-2 hover:border-border/100 hover:bg-card">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate font-mono text-[11px] text-violet-600 dark:text-violet-400">{id}</span>
                    <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Copy JSON"
                        onClick={() => {
                          void navigator.clipboard.writeText(JSON.stringify(doc, null, 2))
                          toast.success('Document copied')
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Ask AI about this document"
                        disabled={aiLoading}
                        onClick={() => askAiAbout(doc)}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                      {!readonly && (
                        <>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Edit document"
                            onClick={() => setEditingId(key)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Delete document"
                            onClick={() => setPendingDelete(doc)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <JsonTree value={Object.fromEntries(Object.entries(doc).filter(([k]) => k !== '_id'))} />
                </div>
              )
            })}
            {rows.length > 0 && (
              <div className="py-2 text-center text-[11px] text-muted-foreground">
                {loadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size="sm" /> Loading more…
                  </span>
                ) : hasMore ? (
                  <button type="button" className="text-primary hover:underline" onClick={() => void loadMore()}>
                    Load more
                  </button>
                ) : (
                  <span>
                    {rows.length}
                    {totalCount != null ? ` of ${totalCount.toLocaleString()}` : ''} documents
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </TabsContent>

      <TabsContent value="schema" className="mt-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
        <p className="mb-2 text-[11px] text-muted-foreground">
          Inferred from a sample of documents. Presence shows how many sampled documents contain each field.
        </p>
        <table className={dbTableClass}>
          <thead>
            <tr>
              <th className={dbThClass}>Field</th>
              <th className={dbThClass}>Types</th>
              <th className={cn(dbThClass, 'w-40')}>Presence</th>
            </tr>
          </thead>
          <tbody>
            {schemaColumns.map((c, i) => {
              const pct = Math.round((c.presence ?? 1) * 100)
              return (
                <tr key={c.name} className={cn(dbRowStripe(i), 'hover:bg-muted/70')}>
                  <td className={cn(dbTdClass, 'font-mono font-medium')}>
                    {c.name}
                    {c.isPrimaryKey && <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] text-primary">id</span>}
                  </td>
                  <td className={dbTdClass}>
                    <div className="flex flex-wrap gap-1">
                      {c.dataType.split(' | ').map((t) => (
                        <span key={t} className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={dbTdClass}>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : 'bg-amber-500')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {info?.comment && <p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">{info.comment}</p>}
      </TabsContent>

      <TabsContent value="indexes" className="mt-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
        {(info?.indexes ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No indexes</p>
        ) : (
          <table className={dbTableClass}>
            <thead>
              <tr>
                <th className={dbThClass}>Index</th>
                <th className={dbThClass}>Keys</th>
                <th className={dbThClass}>Type</th>
              </tr>
            </thead>
            <tbody>
              {info?.indexes.map((idx, i) => (
                <tr key={idx.name} className={cn(dbRowStripe(i), 'hover:bg-muted/70')}>
                  <td className={cn(dbTdClass, 'font-medium')}>
                    {idx.name}
                    {idx.unique && !idx.primary && <span className="ml-1 text-[10px] text-muted-foreground">UNIQUE</span>}
                  </td>
                  <td className={cn(dbTdClass, 'font-mono')}>{idx.columns.join(', ')}</td>
                  <td className={dbTdClass}>{idx.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabsContent>

      <TabsContent value="ai" className="mt-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
        <div className="flex flex-wrap gap-1">
          {COLLECTION_AI_ACTIONS.map(({ action, label, ...rest }) => (
            <Button
              key={label}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={aiLoading}
              onClick={() =>
                void runAi(connectionId, action, {
                  table,
                  database,
                  schema,
                  prompt: 'prompt' in rest ? rest.prompt : undefined,
                  userLabel: `${label} · ${table}`
                })
              }
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {label}
            </Button>
          ))}
        </div>
      </TabsContent>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete document?"
        description={pendingDelete ? `Document ${docId(pendingDelete)} will be permanently removed from ${table}.` : undefined}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          const doc = pendingDelete
          setPendingDelete(null)
          if (!doc) return
          if (await save({ type: 'delete', primaryKey: { _id: doc._id }, before: doc })) {
            toast.success('Document deleted')
            setRows((prev) => prev.filter((r) => r !== doc))
            setTotalCount((c) => (c != null ? c - 1 : c))
          }
        }}
      />
    </Tabs>
  )
}
