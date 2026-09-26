import { useState } from 'react'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'
import { cn } from '@/shared/lib/utils'
import { formatDisplayValue, formatTimestamp } from '../../lib/formatValue'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { Braces, Copy, Table2, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useConnectionMeta } from '../../lib/providers'
import { JsonTree } from '../documents/JsonTree'

const RESULT_RENDER_LIMIT = 200
import { dbTableClass, dbTdClass, dbThClass, dbRowStripe } from '../../lib/aiContext'

export function DbBottomPanel() {
  const bottomPanelTab = useDbWorkspaceStore((s) => s.bottomPanelTab)
  const setBottomPanelTab = useDbWorkspaceStore((s) => s.setBottomPanelTab)
  const lastQueryResult = useDbWorkspaceStore((s) => s.lastQueryResult)
  const lastQueryError = useDbWorkspaceStore((s) => s.lastQueryError)
  const queryHistory = useDbWorkspaceStore((s) => s.queryHistory)
  const savedQueries = useDbWorkspaceStore((s) => s.savedQueries)
  const openQueryTab = useDbWorkspaceStore((s) => s.openQueryTab)
  const activeConnectionId = useDbWorkspaceStore((s) => s.activeConnectionId)
  const deleteSavedQuery = useDbWorkspaceStore((s) => s.deleteSavedQuery)
  const queryRunning = useDbWorkspaceStore((s) => s.queryRunning)
  const { isDocument, terms } = useConnectionMeta()
  const [resultView, setResultView] = useState<'table' | 'json'>('table')
  const view = isDocument ? resultView : 'table'

  const tabs = [
    { id: 'results' as const, label: 'Results' },
    { id: 'history' as const, label: 'History' },
    { id: 'saved' as const, label: 'Saved' },
    { id: 'messages' as const, label: 'Messages' },
    { id: 'problems' as const, label: 'Problems' }
  ]

  const messages = queryHistory.slice(0, 40).map((h) => ({
    id: h.id,
    at: h.executedAt,
    ok: h.success,
    text: h.success
      ? `OK · ${h.rowCount} rows · ${h.executionTimeMs}ms`
      : `ERROR · ${h.error ?? 'Query failed'} · ${h.executionTimeMs}ms`,
    sql: h.sql
  }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              'px-2.5 py-1 text-[11px] transition-colors',
              bottomPanelTab === t.id
                ? 'border-b-2 border-primary font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setBottomPanelTab(t.id)}
          >
            {t.label}
            {t.id === 'saved' && savedQueries.length > 0 ? ` (${savedQueries.length})` : ''}
            {t.id === 'problems' && lastQueryError ? (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-destructive align-middle" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5 font-mono text-[11px]">
        {bottomPanelTab === 'results' && queryRunning && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner size="sm" /> Running…
          </div>
        )}
        {bottomPanelTab === 'results' && !queryRunning && lastQueryError && (
          <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-destructive">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <pre className="whitespace-pre-wrap">{lastQueryError}</pre>
          </div>
        )}
        {bottomPanelTab === 'results' && !queryRunning && lastQueryResult && (
          <>
            <div className="mb-1.5 flex items-center gap-2 font-sans text-muted-foreground">
              <span>
                {lastQueryResult.columns.length > 0
                  ? `${lastQueryResult.rowCount} ${lastQueryResult.rowCount === 1 ? terms.row : terms.rows}`
                  : `${lastQueryResult.affectedRows} affected`}{' '}
                · {lastQueryResult.executionTimeMs}ms
                {lastQueryResult.truncated && ' · truncated to max rows'}
                {lastQueryResult.rows.length > RESULT_RENDER_LIMIT && ` · showing first ${RESULT_RENDER_LIMIT}`}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {isDocument && (
                  <div className="inline-flex rounded border border-border p-px">
                    <button
                      type="button"
                      className={cn('rounded px-1 py-0.5', view === 'table' ? 'bg-muted text-foreground' : '')}
                      onClick={() => setResultView('table')}
                      title="Table view"
                    >
                      <Table2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className={cn('rounded px-1 py-0.5', view === 'json' ? 'bg-muted text-foreground' : '')}
                      onClick={() => setResultView('json')}
                      title="Document view"
                    >
                      <Braces className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {lastQueryResult.rows.length > 0 && (
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted hover:text-foreground"
                    title="Copy results as JSON"
                    onClick={() => {
                      void navigator.clipboard.writeText(JSON.stringify(lastQueryResult.rows, null, 2))
                      toast.success('Results copied')
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            {view === 'json' ? (
              <div className="space-y-1.5">
                {lastQueryResult.rows.slice(0, RESULT_RENDER_LIMIT).map((row, i) => (
                  <div key={i} className="rounded border border-border/70 px-2 py-1">
                    <JsonTree value={row} />
                  </div>
                ))}
              </div>
            ) : lastQueryResult.columns.length > 0 ? (
              <table className={dbTableClass}>
                <thead>
                  <tr>
                    <th className={cn(dbThClass, 'w-8 text-right')}>#</th>
                    {lastQueryResult.columns.map((c) => (
                      <th key={c.name} className={dbThClass}>{c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lastQueryResult.rows.slice(0, RESULT_RENDER_LIMIT).map((row, i) => (
                    <tr key={i} className={`${dbRowStripe(i)} hover:bg-muted/70`}>
                      <td className={cn(dbTdClass, 'text-right text-muted-foreground')}>{i + 1}</td>
                      {lastQueryResult.columns.map((c) => (
                        <td key={c.name} className={dbTdClass} title={formatDisplayValue(row[c.name])}>
                          {row[c.name] == null ? (
                            <span className="italic text-muted-foreground">NULL</span>
                          ) : (
                            formatDisplayValue(row[c.name])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="font-sans text-emerald-600">Statement executed successfully.</p>
            )}
          </>
        )}
        {bottomPanelTab === 'results' && !queryRunning && !lastQueryResult && !lastQueryError && (
          <p className="font-sans text-muted-foreground">
            Run a {isDocument ? 'MongoDB command' : 'query'} to see results · {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
          </p>
        )}
        {bottomPanelTab === 'history' &&
          (queryHistory.length === 0 ? (
            <p className="text-muted-foreground">No query history yet</p>
          ) : (
            queryHistory.map((h) => (
              <div key={h.id} className="mb-2 border-b border-border/50 pb-2">
                <div className={cn('text-[10px]', h.success ? 'text-emerald-600' : 'text-red-600')}>
                  {formatTimestamp(h.executedAt)} · {h.executionTimeMs}ms · {h.rowCount} rows
                </div>
                <pre className="mt-1 whitespace-pre-wrap">{h.sql.slice(0, 300)}</pre>
                {activeConnectionId && (
                  <button
                    type="button"
                    className="mt-1 text-[10px] text-primary hover:underline"
                    onClick={() => openQueryTab(activeConnectionId, h.sql, 'History query')}
                  >
                    Open in editor
                  </button>
                )}
              </div>
            ))
          ))}
        {bottomPanelTab === 'saved' &&
          (savedQueries.length === 0 ? (
            <p className="text-muted-foreground">Save a query from the SQL editor to reuse it here</p>
          ) : (
            savedQueries.map((q) => (
              <div key={q.id} className="mb-2 flex items-start gap-2 border-b border-border/50 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-sans text-xs font-medium text-foreground">{q.name}</div>
                  <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{q.sql.slice(0, 240)}</pre>
                  <button
                    type="button"
                    className="mt-1 text-[10px] text-primary hover:underline"
                    onClick={() => {
                      const connectionId = q.connectionId ?? activeConnectionId
                      if (connectionId) openQueryTab(connectionId, q.sql, q.name)
                    }}
                  >
                    Open in editor
                  </button>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-destructive"
                  title="Delete saved query"
                  onClick={() => void deleteSavedQuery(q.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          ))}
        {bottomPanelTab === 'messages' &&
          (messages.length === 0 ? (
            <p className="text-muted-foreground">Execution logs appear here after you run queries</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="mb-2 border-b border-border/50 pb-2">
                <div className={cn('text-[10px]', m.ok ? 'text-emerald-600' : 'text-red-600')}>
                  {formatTimestamp(m.at)} · {m.text}
                </div>
                <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{m.sql.slice(0, 200)}</pre>
              </div>
            ))
          ))}
        {bottomPanelTab === 'problems' && lastQueryError && (
          <pre className="whitespace-pre-wrap text-red-600">{lastQueryError}</pre>
        )}
        {bottomPanelTab === 'problems' && !lastQueryError && (
          <p className="text-muted-foreground">No problems</p>
        )}
      </div>
    </div>
  )
}
