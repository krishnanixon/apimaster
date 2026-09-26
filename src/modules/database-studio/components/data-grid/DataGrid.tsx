import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Save,
  Plus,
  Trash2,
  Download,
  Copy,
  CopyPlus,
  RefreshCw,
  Loader2,
  Sparkles
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import type { DbColumnInfo, DbRowChange } from '@shared/types/database-workspace'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'
import { formatDisplayValue } from '../../lib/formatValue'
import { dbTableClass, dbTdClass, dbThClass, sanitizeRowsForAi, dbRowStripe } from '../../lib/aiContext'

interface DataGridProps {
  connectionId: string
  database: string
  schema: string
  table: string
  columns: DbColumnInfo[]
  rows: Record<string, unknown>[]
  totalCount: number | null
  density?: 'compact' | 'comfortable' | 'spacious'
  readonly?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  exportFormat?: 'csv' | 'json' | 'sql' | 'xlsx'
  onRefresh: () => void
  onLoadMore?: () => void
  onRowsChange?: (rows: Record<string, unknown>[]) => void
  onLiveContextChange?: (ctx: {
    selectedRows: Record<string, unknown>[]
    loadedRows: Record<string, unknown>[]
  }) => void
  onAskAi?: (selectedRows: Record<string, unknown>[]) => void
}

interface CellEdit {
  rowIndex: number
  column: string
  original: unknown
  value: unknown
}

type LocalRowMeta = { __localInsert?: boolean; __tempId?: string }

function pkKey(row: Record<string, unknown>, pkCols: string[]): Record<string, unknown> {
  return Object.fromEntries(pkCols.map((c) => [c, row[c]]))
}

function rowsToCsv(columns: DbColumnInfo[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => c.name).join(',')
  const body = rows
    .map((r) => columns.map((c) => JSON.stringify(r[c.name] ?? '')).join(','))
    .join('\n')
  return header + '\n' + body
}

function rowsToJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2)
}

function rowsToTsv(columns: DbColumnInfo[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => c.name).join('\t')
  const body = rows
    .map((r) => columns.map((c) => (r[c.name] == null ? '' : String(r[c.name]))).join('\t'))
    .join('\n')
  return header + '\n' + body
}

export function DataGrid({
  connectionId,
  database,
  schema,
  table,
  columns,
  rows: initialRows,
  totalCount,
  density = 'comfortable',
  readonly = false,
  hasMore = false,
  loadingMore = false,
  exportFormat = 'csv',
  onRefresh,
  onLoadMore,
  onRowsChange,
  onLiveContextChange,
  onAskAi
}: DataGridProps) {
  const [rows, setRows] = useState<(Record<string, unknown> & LocalRowMeta)[]>(initialRows)
  const [edits, setEdits] = useState<CellEdit[]>([])
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const lastClickedRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreLock = useRef(false)

  useEffect(() => {
    setRows(initialRows)
    setEdits([])
    setSelectedRows(new Set())
    lastClickedRef.current = null
    loadMoreLock.current = false
  }, [initialRows])

  useEffect(() => {
    onRowsChange?.(rows)
  }, [rows, onRowsChange])

  useEffect(() => {
    const selected = [...selectedRows]
      .sort((a, b) => a - b)
      .map((i) => rows[i])
      .filter(Boolean)
    onLiveContextChange?.({
      selectedRows: sanitizeRowsForAi(selected, 40),
      loadedRows: sanitizeRowsForAi(rows, 20)
    })
  }, [rows, selectedRows, onLiveContextChange])

  const pkCols = useMemo(() => columns.filter((c) => c.isPrimaryKey).map((c) => c.name), [columns])
  const rowH = density === 'compact' ? 24 : density === 'spacious' ? 36 : 30
  const allSelected = rows.length > 0 && selectedRows.size === rows.length

  const isModified = (rowIndex: number, col: string) =>
    edits.some((e) => e.rowIndex === rowIndex && e.column === col)

  const getCellValue = (rowIndex: number, col: string) => {
    const edit = edits.find((e) => e.rowIndex === rowIndex && e.column === col)
    if (edit) return edit.value
    return rows[rowIndex]?.[col]
  }

  const setCellValue = (rowIndex: number, column: string, value: unknown) => {
    const original = rows[rowIndex]?.[column]
    setEdits((prev) => {
      const filtered = prev.filter((e) => !(e.rowIndex === rowIndex && e.column === column))
      // Cells are edited as text: a blur on an untouched number/date/object cell must not count as an edit
      const unchanged =
        value === original ||
        (value == null && original == null) ||
        (typeof value === 'string' && original != null && value === formatDisplayValue(original))
      if (unchanged) return filtered
      return [...filtered, { rowIndex, column, original, value }]
    })
  }

  const toggleRow = (index: number, shiftKey: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedRef.current != null) {
        const start = Math.min(lastClickedRef.current, index)
        const end = Math.max(lastClickedRef.current, index)
        for (let i = start; i <= end; i++) next.add(i)
      } else if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
    lastClickedRef.current = index
  }

  const toggleSelectAll = () => {
    if (allSelected) setSelectedRows(new Set())
    else setSelectedRows(new Set(rows.map((_, i) => i)))
  }

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasMore || loadingMore || !onLoadMore || loadMoreLock.current) return
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120
    if (nearBottom) {
      loadMoreLock.current = true
      onLoadMore()
      window.setTimeout(() => {
        loadMoreLock.current = false
      }, 400)
    }
  }, [hasMore, loadingMore, onLoadMore])

  const buildUpdateChanges = (): DbRowChange[] => {
    const changes: DbRowChange[] = []
    const byRow = new Map<number, CellEdit[]>()
    for (const e of edits) {
      const list = byRow.get(e.rowIndex) ?? []
      list.push(e)
      byRow.set(e.rowIndex, list)
    }
    for (const [rowIndex, rowEdits] of byRow) {
      const row = rows[rowIndex]
      if (!row || row.__localInsert) continue
      const after = { ...row }
      for (const e of rowEdits) after[e.column] = e.value
      delete (after as LocalRowMeta).__localInsert
      delete (after as LocalRowMeta).__tempId
      changes.push({
        type: 'update',
        primaryKey: pkKey(row, pkCols.length ? pkCols : ([columns[0]?.name].filter(Boolean) as string[])),
        before: row,
        after
      })
    }
    return changes
  }

  const buildInsertChanges = (): DbRowChange[] => {
    const changes: DbRowChange[] = []
    rows.forEach((row, rowIndex) => {
      if (!row.__localInsert) return
      const after: Record<string, unknown> = { ...row }
      for (const e of edits.filter((ed) => ed.rowIndex === rowIndex)) {
        after[e.column] = e.value
      }
      delete (after as LocalRowMeta).__localInsert
      delete (after as LocalRowMeta).__tempId
      changes.push({
        type: 'insert',
        primaryKey: {},
        after
      })
    })
    return changes
  }

  const handleSave = async () => {
    const changes = [...buildInsertChanges(), ...buildUpdateChanges()]
    if (changes.length === 0) return
    setSaving(true)
    const res = await window.electronAPI.dbWorkspace.saveDataChanges({
      connectionId,
      database,
      schema,
      table,
      changes
    })
    setSaving(false)
    if (res.success) {
      toast.success(`Saved ${res.data?.affectedRows ?? changes.length} row(s)`)
      setEdits([])
      onRefresh()
    } else {
      toast.error(res.error ?? 'Save failed')
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0 || readonly) return
    if (!window.confirm(`Delete ${selectedRows.size} selected row(s)?`)) return

    const localOnly = [...selectedRows].filter((i) => rows[i]?.__localInsert)
    const persisted = [...selectedRows].filter((i) => rows[i] && !rows[i].__localInsert)

    if (localOnly.length > 0) {
      setRows((prev) => prev.filter((_, i) => !localOnly.includes(i)))
      setEdits((prev) => prev.filter((e) => !localOnly.includes(e.rowIndex)))
      setSelectedRows(new Set())
    }

    if (persisted.length === 0) return

    const changes: DbRowChange[] = persisted.map((i) => {
      const row = rows[i]
      return {
        type: 'delete' as const,
        primaryKey: pkKey(row, pkCols.length ? pkCols : ([columns[0]?.name].filter(Boolean) as string[])),
        before: row
      }
    })

    setSaving(true)
    const res = await window.electronAPI.dbWorkspace.saveDataChanges({
      connectionId,
      database,
      schema,
      table,
      changes
    })
    setSaving(false)
    if (res.success) {
      toast.success(`Deleted ${res.data?.affectedRows ?? changes.length} row(s)`)
      setSelectedRows(new Set())
      onRefresh()
    } else {
      toast.error(res.error ?? 'Delete failed')
    }
  }

  const handleInsertRow = () => {
    if (readonly) return
    const empty: Record<string, unknown> & LocalRowMeta = {
      __localInsert: true,
      __tempId: crypto.randomUUID()
    }
    for (const col of columns) {
      if (!col.isAutoIncrement) empty[col.name] = null
    }
    setRows((prev) => [...prev, empty])
    setSelectedRows(new Set([rows.length]))
  }

  const handleDuplicateSelected = () => {
    if (readonly || selectedRows.size === 0) return
    const last = Math.max(...selectedRows)
    const source = rows[last]
    if (!source) return
    const clone: Record<string, unknown> & LocalRowMeta = {
      ...source,
      __localInsert: true,
      __tempId: crypto.randomUUID()
    }
    for (const col of columns) {
      if (col.isAutoIncrement || col.isPrimaryKey) clone[col.name] = null
    }
    setRows((prev) => [...prev, clone])
    setSelectedRows(new Set([rows.length]))
  }

  const selectedRowData = () =>
    [...selectedRows]
      .sort((a, b) => a - b)
      .map((i) => rows[i])
      .filter(Boolean)

  const handleExport = (onlySelected: boolean) => {
    const data = onlySelected ? selectedRowData() : rows
    if (data.length === 0) {
      toast.error('Nothing to export')
      return
    }
    const cleaned = data.map(({ __localInsert: _a, __tempId: _b, ...rest }) => rest)
    let content: string
    let mime: string
    let ext: string
    if (exportFormat === 'json') {
      content = rowsToJson(cleaned)
      mime = 'application/json'
      ext = 'json'
    } else {
      content = rowsToCsv(columns, cleaned)
      mime = 'text/csv'
      ext = 'csv'
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${table}${onlySelected ? '-selected' : ''}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    const data = selectedRows.size > 0 ? selectedRowData() : rows
    const cleaned = data.map(({ __localInsert: _a, __tempId: _b, ...rest }) => rest)
    try {
      await navigator.clipboard.writeText(rowsToTsv(columns, cleaned))
      toast.success(`Copied ${cleaned.length} row(s)`)
    } catch {
      toast.error('Copy failed')
    }
  }

  const handleDiscard = () => {
    setEdits([])
    setRows(initialRows)
    setSelectedRows(new Set())
  }

  const hasChanges = edits.length > 0 || rows.some((r) => r.__localInsert)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2">
        <span className="text-[11px] text-muted-foreground">
          {rows.length} loaded
          {totalCount != null ? ` of ${totalCount}` : ''}
          {selectedRows.size > 0 ? ` · ${selectedRows.size} selected` : ''}
        </span>
        {hasChanges && <span className="text-[11px] font-medium text-amber-600">Unsaved</span>}
        {saving && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-0.5">
          {selectedRows.size > 0 && onAskAi && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={() => onAskAi(selectedRowData())}
              title="Ask AI about selected rows"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Ask AI
            </Button>
          )}
          {!readonly && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                disabled={saving || !hasChanges}
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={!hasChanges || saving} onClick={handleDiscard}>
                Discard
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 px-0" disabled={saving} onClick={handleInsertRow} title="Insert row">
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 px-0"
                disabled={selectedRows.size === 0 || saving}
                onClick={handleDuplicateSelected}
                title="Duplicate selected"
              >
                <CopyPlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 px-0 text-destructive"
                disabled={selectedRows.size === 0 || saving}
                onClick={() => void handleDeleteSelected()}
                title="Delete selected"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => void handleCopy()} title="Copy as TSV">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => handleExport(selectedRows.size > 0)} title="Export">
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={onRefresh} title="Refresh" disabled={saving}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" onScroll={handleScroll}>
        <table className={dbTableClass}>
          <thead className="sticky top-0 z-10 bg-muted/95">
            <tr>
              <th className={`${dbThClass} w-8`}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all rows"
                  className="accent-primary"
                />
              </th>
              {columns.map((col) => (
                <th key={col.name} className={dbThClass} title={col.dataType}>
                  {col.isPrimaryKey && <span className="mr-1 text-primary">PK</span>}
                  {col.isForeignKey && <span className="mr-1 text-sky-600">FK</span>}
                  {!col.nullable && <span className="mr-1 text-muted-foreground">*</span>}
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const selected = selectedRows.has(rowIndex)
              return (
                <tr
                  key={row.__tempId ?? `${rowIndex}-${pkCols.map((c) => formatDisplayValue(row[c])).join('|')}`}
                  className={cn(
                    dbRowStripe(rowIndex),
                    'hover:bg-muted/70',
                    selected && 'bg-primary/15 hover:bg-primary/20',
                    row.__localInsert && !selected && 'bg-emerald-500/10 hover:bg-emerald-500/15'
                  )}
                  style={{ height: rowH }}
                >
                  <td className={dbTdClass}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleRow(rowIndex, e.shiftKey)
                      }}
                      onChange={() => undefined}
                      aria-label={`Select row ${rowIndex + 1}`}
                      className="accent-primary"
                    />
                  </td>
                  {columns.map((col) => {
                    const val = getCellValue(rowIndex, col.name)
                    const modified = isModified(rowIndex, col.name)
                    return (
                      <td
                        key={col.name}
                        className={cn(dbTdClass, modified && 'bg-amber-500/10')}
                        contentEditable={!readonly && !col.isAutoIncrement}
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          const text = e.currentTarget.textContent ?? ''
                          setCellValue(rowIndex, col.name, text === 'NULL' || text === '' ? null : text)
                        }}
                        title={val == null ? 'NULL' : formatDisplayValue(val)}
                      >
                        {val == null ? (
                          <span className="italic text-muted-foreground">NULL</span>
                        ) : (
                          formatDisplayValue(val)
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="sticky bottom-0 flex items-center justify-center gap-2 border-t border-border bg-background/95 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {loadingMore && (
            <>
              <Spinner size="sm" /> Loading more…
            </>
          )}
          {!loadingMore && hasMore && <span>Scroll for more rows</span>}
          {!loadingMore && !hasMore && rows.length > 0 && (
            <span>
              End of table · {rows.length}
              {totalCount != null ? ` / ${totalCount}` : ''} rows
            </span>
          )}
          {!loadingMore && rows.length === 0 && <span>No rows</span>}
        </div>
      </div>
    </div>
  )
}
