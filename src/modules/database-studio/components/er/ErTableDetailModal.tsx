import { useEffect, useState } from 'react'
import { Key, Link2, Rows3, FileCode2, X } from 'lucide-react'
import type { DbTableInfo } from '@shared/types/database-workspace'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import { formatDisplayValue } from '../../lib/formatValue'

interface ErTableDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  database: string
  schema: string
  table: string | null
  colorIndex?: number
  onOpenData?: () => void
  onOpenQuery?: (sql: string) => void
}

const HEADER_GRADIENTS = [
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
  'from-indigo-500 to-blue-700',
  'from-lime-500 to-green-600'
]

export function ErTableDetailModal({
  open,
  onOpenChange,
  connectionId,
  database,
  schema,
  table,
  colorIndex = 0,
  onOpenData,
  onOpenQuery
}: ErTableDetailModalProps) {
  const [info, setInfo] = useState<DbTableInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !table) {
      setInfo(null)
      setError(null)
      return
    }

    void (async () => {
      setLoading(true)
      setError(null)
      const res = await window.electronAPI.dbWorkspace.getTableInfo(connectionId, database, schema, table)
      if (res.success && res.data) {
        setInfo(res.data)
      } else {
        setError(res.error ?? 'Failed to load table details')
        setInfo(null)
      }
      setLoading(false)
    })()
  }, [open, table, connectionId, database, schema])

  const gradient = HEADER_GRADIENTS[colorIndex % HEADER_GRADIENTS.length]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,820px)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className={cn('shrink-0 bg-gradient-to-r px-6 py-4 text-white', gradient)}>
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-lg font-semibold text-white">{table ?? 'Table'}</DialogTitle>
            <p className="text-xs text-white/80">
              {database} · {schema}
              {info?.rowCount != null && ` · ~${info.rowCount.toLocaleString()} rows`}
            </p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          )}
          {error && (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          )}
          {!loading && !error && info && (
            <div className="space-y-6">
              {info.comment && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{info.comment}</p>
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Columns ({info.columns.length})
                </h4>
                <div className="overflow-hidden rounded border border-border">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-muted/80">
                      <tr>
                        <th className="border border-border px-2 py-1 text-left font-medium">Name</th>
                        <th className="border border-border px-2 py-1 text-left font-medium">Type</th>
                        <th className="border border-border px-2 py-1 text-left font-medium">Null</th>
                        <th className="border border-border px-2 py-1 text-left font-medium">Key</th>
                        <th className="border border-border px-2 py-1 text-left font-medium">Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.columns.map((col, i) => (
                        <tr key={col.name} className={cn(i % 2 === 0 ? 'bg-background' : 'bg-muted/50', 'hover:bg-muted/70')}>
                          <td className="border border-border px-2 py-1 font-medium">
                            <span className="flex items-center gap-1.5">
                              {col.isPrimaryKey && <Key className="h-3 w-3 text-amber-500" />}
                              {col.isForeignKey && !col.isPrimaryKey && <Link2 className="h-3 w-3 text-sky-500" />}
                              {col.name}
                            </span>
                          </td>
                          <td className="border border-border px-2 py-1 text-muted-foreground">{col.dataType}</td>
                          <td className="border border-border px-2 py-1">{col.nullable ? 'YES' : 'NO'}</td>
                          <td className="border border-border px-2 py-1 text-muted-foreground">
                            {col.isPrimaryKey ? 'PK' : col.isForeignKey ? 'FK' : col.isUnique ? 'UNI' : '—'}
                          </td>
                          <td className="max-w-[120px] truncate border border-border px-2 py-1 text-muted-foreground">
                            {formatDisplayValue(col.defaultValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {info.foreignKeys.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Foreign keys
                  </h4>
                  <div className="space-y-2">
                    {info.foreignKeys.map((fk) => (
                      <div key={fk.name} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                        <span className="font-medium">{fk.column}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="font-medium">{fk.referencedTable}.{fk.referencedColumn}</span>
                        {(fk.onDelete || fk.onUpdate) && (
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            ON DELETE {fk.onDelete ?? '—'} · ON UPDATE {fk.onUpdate ?? '—'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {info.indexes.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Indexes ({info.indexes.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {info.indexes.map((idx) => (
                      <span
                        key={idx.name}
                        className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[10px]"
                      >
                        {idx.primary ? 'PK ' : idx.unique ? 'UNIQUE ' : ''}
                        {idx.name} ({idx.columns.join(', ')})
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-3.5 w-3.5" /> Close
          </Button>
          <div className="flex gap-2">
            {onOpenQuery && table && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenQuery(`SELECT * FROM \`${table}\` LIMIT 100;`)
                  onOpenChange(false)
                }}
              >
                <FileCode2 className="mr-1 h-3.5 w-3.5" /> Query
              </Button>
            )}
            {onOpenData && (
              <Button
                size="sm"
                onClick={() => {
                  onOpenData()
                  onOpenChange(false)
                }}
              >
                <Rows3 className="mr-1 h-3.5 w-3.5" /> Open data
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
