import { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import type { DbTableInfo, DbTableLink } from '@shared/types/database-workspace'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'
import { DataGrid } from '../data-grid/DataGrid'
import { Spinner } from '@/shared/components/ui/spinner'
import { Button } from '@/shared/components/ui/button'
import { Sparkles } from 'lucide-react'
import { formatDisplayValue } from '../../lib/formatValue'
import { cn } from '@/shared/lib/utils'
import { dbTableClass, dbTdClass, dbThClass, sanitizeRowsForAi, dbRowStripe } from '../../lib/aiContext'

interface TableTabViewProps {
  tabId: string
  connectionId: string
  database: string
  schema: string
  table: string
}

const TABLE_AI_ACTIONS = [
  { action: 'explain_table' as const, label: 'Explain table' },
  { action: 'generate_documentation' as const, label: 'Generate docs' },
  { action: 'business_description' as const, label: 'Business description' },
  { action: 'generate_prisma' as const, label: 'Prisma model' },
  { action: 'generate_dtos' as const, label: 'Generate DTOs' },
  { action: 'suggest_constraints' as const, label: 'Suggest constraints' }
]

export function TableTabView({ tabId: _tabId, connectionId, database, schema, table }: TableTabViewProps) {
  const [info, setInfo] = useState<DbTableInfo | null>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [links, setLinks] = useState<DbTableLink[]>([])
  const [subTab, setSubTab] = useState('data')
  const settings = useDbWorkspaceStore((s) => s.settings)
  const runAi = useDbWorkspaceStore((s) => s.runAi)
  const getTableInfo = useDbWorkspaceStore((s) => s.getTableInfo)
  const connections = useDbWorkspaceStore((s) => s.connections)
  const aiLoading = useDbWorkspaceStore((s) => s.aiLoading)
  const setAiLiveContext = useDbWorkspaceStore((s) => s.setAiLiveContext)
  const loadingMoreRef = useRef(false)

  const pageSize = Math.min(100, Math.max(25, settings.maxRows || 100))
  const conn = connections.find((c) => c.id === connectionId)
  const readonly = Boolean(conn?.config.readonly)

  const loadMeta = useCallback(async () => {
    const tableInfo = await getTableInfo(connectionId, database, schema, table)
    if (tableInfo) setInfo(tableInfo)
    const linkRes = await window.electronAPI.dbWorkspace.listTableLinks(connectionId, table)
    if (linkRes.success && linkRes.data) setLinks(linkRes.data)
  }, [connectionId, database, schema, table, getTableInfo])

  const loadInitial = useCallback(async () => {
    setLoadingInitial(true)
    setError(null)
    setHasMore(true)
    const page = await window.electronAPI.dbWorkspace.fetchDataPage({
      connectionId,
      database,
      schema,
      table,
      offset: 0,
      limit: pageSize
    })
    if (page.success && page.data) {
      setRows(page.data.rows)
      setTotalCount(page.data.totalCount)
      const loaded = page.data.rows.length
      const total = page.data.totalCount
      setHasMore(total != null ? loaded < total : loaded >= pageSize)
    } else {
      setRows([])
      setTotalCount(null)
      setHasMore(false)
      setError(page.error ?? 'Failed to load table data')
    }
    await loadMeta()
    setLoadingInitial(false)
  }, [connectionId, database, schema, table, pageSize, loadMeta])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const offset = rows.length
    const page = await window.electronAPI.dbWorkspace.fetchDataPage({
      connectionId,
      database,
      schema,
      table,
      offset,
      limit: pageSize
    })
    if (page.success && page.data) {
      const next = page.data.rows
      setRows((prev) => [...prev, ...next])
      if (page.data.totalCount != null) setTotalCount(page.data.totalCount)
      const totalLoaded = offset + next.length
      const total = page.data.totalCount
      setHasMore(total != null ? totalLoaded < total : next.length >= pageSize)
    } else {
      setHasMore(false)
      if (page.error) setError(page.error)
    }
    setLoadingMore(false)
    loadingMoreRef.current = false
  }, [connectionId, database, schema, table, pageSize, rows.length, hasMore])

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

  const handleLiveContext = useCallback(
    (ctx: { selectedRows: Record<string, unknown>[]; loadedRows: Record<string, unknown>[] }) => {
      setAiLiveContext({
        connectionId,
        database,
        schema,
        table,
        columns: (info?.columns ?? []).map((c) => c.name),
        selectedRows: ctx.selectedRows,
        loadedSample: ctx.loadedRows
      })
    },
    [connectionId, database, schema, table, info?.columns, setAiLiveContext]
  )

  const handleAskAi = useCallback(
    (selected: Record<string, unknown>[]) => {
      const cleaned = sanitizeRowsForAi(selected, 40)
      setAiLiveContext({
        connectionId,
        database,
        schema,
        table,
        columns: (info?.columns ?? []).map((c) => c.name),
        selectedRows: cleaned,
        loadedSample: sanitizeRowsForAi(rows, 20)
      })
      void runAi(connectionId, 'natural_language', {
        table,
        database,
        schema,
        prompt:
          cleaned.length > 0
            ? `Analyze the ${cleaned.length} selected row(s) in ${schema}.${table}. Summarize the values, point out notable fields, and answer based on this selection.`
            : `Analyze the current data visible in ${schema}.${table}.`
      })
    },
    [connectionId, database, schema, table, info?.columns, rows, runAi, setAiLiveContext]
  )

  if (loadingInitial && !info) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Spinner />
        <p className="text-xs text-muted-foreground">Loading {table}…</p>
      </div>
    )
  }

  const columns = info?.columns ?? []

  return (
    <Tabs value={subTab} onValueChange={setSubTab} className="flex h-full min-h-0 flex-col">
      <TabsList className="h-7 shrink-0 justify-start rounded-none border-b border-border bg-transparent p-0 px-1">
        <TabsTrigger value="data" className="h-6 px-2 text-[11px]">
          Data
        </TabsTrigger>
        <TabsTrigger value="overview" className="h-6 px-2 text-[11px]">
          Overview
        </TabsTrigger>
        <TabsTrigger value="structure" className="h-6 px-2 text-[11px]">
          Structure
        </TabsTrigger>
        <TabsTrigger value="indexes" className="h-6 px-2 text-[11px]">
          Indexes
        </TabsTrigger>
        <TabsTrigger value="foreignKeys" className="h-6 px-2 text-[11px]">
          FKs
        </TabsTrigger>
        <TabsTrigger value="links" className="h-6 px-2 text-[11px]">
          Links
        </TabsTrigger>
        <TabsTrigger value="ai" className="h-6 px-2 text-[11px]">
          AI
        </TabsTrigger>
      </TabsList>

      <TabsContent value="data" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {loadingInitial ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
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
            exportFormat={settings.defaultExportFormat === 'xlsx' ? 'csv' : settings.defaultExportFormat}
            onRefresh={() => void loadInitial()}
            onLoadMore={() => void loadMore()}
            onLiveContextChange={handleLiveContext}
            onAskAi={handleAskAi}
          />
        )}
      </TabsContent>

      <TabsContent value="overview" className="mt-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
        <dl className="grid max-w-xl grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Table</dt>
            <dd className="font-medium">{table}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Schema</dt>
            <dd>{schema}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Database</dt>
            <dd>{database}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Rows</dt>
            <dd>{info?.rowCount ?? totalCount ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Columns</dt>
            <dd>{columns.length}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</dt>
            <dd>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{info?.type ?? 'table'}</span>
            </dd>
          </div>
        </dl>
      </TabsContent>

      <TabsContent value="structure" className="mt-0 flex-1 overflow-auto data-[state=inactive]:hidden">
        <table className={dbTableClass}>
          <thead>
            <tr>
              <th className={dbThClass}>Column</th>
              <th className={dbThClass}>Type</th>
              <th className={dbThClass}>Nullable</th>
              <th className={dbThClass}>Default</th>
              <th className={dbThClass}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c, i) => (
              <tr key={c.name} className={cn(dbRowStripe(i), 'hover:bg-muted/70')}>
                <td className={cn(dbTdClass, 'font-medium')}>{c.name}</td>
                <td className={cn(dbTdClass, 'font-mono')}>{c.dataType}</td>
                <td className={dbTdClass}>
                  <span
                    className={cn(
                      'rounded px-1 py-0.5 text-[10px] font-medium',
                      c.nullable ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                    )}
                  >
                    {c.nullable ? 'YES' : 'NO'}
                  </span>
                </td>
                <td className={cn(dbTdClass, 'font-mono')}>{formatDisplayValue(c.defaultValue)}</td>
                <td className={dbTdClass}>
                  <div className="flex flex-wrap gap-1">
                    {c.isPrimaryKey && (
                      <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">PK</span>
                    )}
                    {c.isForeignKey && (
                      <span className="rounded bg-sky-500/10 px-1 py-0.5 text-[10px] text-sky-700">FK</span>
                    )}
                    {c.isUnique && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px]">UQ</span>
                    )}
                    {c.isAutoIncrement && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px]">AI</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabsContent>

      <TabsContent value="indexes" className="mt-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
        {(info?.indexes ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No indexes</p>
        ) : (
          <table className={dbTableClass}>
            <thead>
              <tr>
                <th className={dbThClass}>Index</th>
                <th className={dbThClass}>Columns</th>
                <th className={dbThClass}>Type</th>
              </tr>
            </thead>
            <tbody>
              {info?.indexes.map((idx, i) => (
                <tr key={idx.name} className={cn(dbRowStripe(i), 'hover:bg-muted/70')}>
                  <td className={cn(dbTdClass, 'font-medium')}>
                    {idx.name}
                    {idx.primary && <span className="ml-1 text-[10px] text-primary">PK</span>}
                    {idx.unique && <span className="ml-1 text-[10px] text-muted-foreground">UNIQUE</span>}
                  </td>
                  <td className={dbTdClass}>{idx.columns.join(', ') || '—'}</td>
                  <td className={dbTdClass}>{idx.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabsContent>

      <TabsContent value="foreignKeys" className="mt-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
        {(info?.foreignKeys ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No foreign keys</p>
        ) : (
          <table className={dbTableClass}>
            <thead>
              <tr>
                <th className={dbThClass}>Name</th>
                <th className={dbThClass}>Column</th>
                <th className={dbThClass}>References</th>
              </tr>
            </thead>
            <tbody>
              {info?.foreignKeys.map((fk, i) => (
                <tr key={fk.name} className={cn(dbRowStripe(i), 'hover:bg-muted/70')}>
                  <td className={cn(dbTdClass, 'font-medium')}>{fk.name}</td>
                  <td className={dbTdClass}>{fk.column}</td>
                  <td className={cn(dbTdClass, 'font-mono')}>
                    {fk.referencedTable}.{fk.referencedColumn}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabsContent>

      <TabsContent value="links" className="mt-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No project links yet. Link from Requirements, Flows, or Knowledge.
          </p>
        ) : (
          <table className={dbTableClass}>
            <thead>
              <tr>
                <th className={dbThClass}>Type</th>
                <th className={dbThClass}>Target</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l, i) => (
                <tr key={l.id} className={cn(dbRowStripe(i), 'hover:bg-muted/70')}>
                  <td className={dbTdClass}>{l.linkType}</td>
                  <td className={cn(dbTdClass, 'font-medium')}>{l.targetLabel || l.targetId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabsContent>

      <TabsContent value="ai" className="mt-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
        <div className="flex flex-wrap gap-1">
          {TABLE_AI_ACTIONS.map(({ action, label }) => (
            <Button
              key={action}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={aiLoading}
              onClick={() =>
                void runAi(connectionId, action, {
                  table,
                  database,
                  schema,
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
    </Tabs>
  )
}
