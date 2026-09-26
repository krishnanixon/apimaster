import { History, RotateCcw, Trash2 } from 'lucide-react'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { HTTP_METHODS, METHOD_COLORS } from '../types/api.types'
import type { HttpMethod } from '../types/api.types'

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function HistoryPanel({ embedded = false }: { embedded?: boolean }) {
  const history = useApiStudioStore((s) => s.history)
  const methodFilter = useApiStudioStore((s) => s.historyMethodFilter)
  const setHistoryMethodFilter = useApiStudioStore((s) => s.setHistoryMethodFilter)
  const clearHistory = useApiStudioStore((s) => s.clearHistory)
  const openHistoryEntry = useApiStudioStore((s) => s.openHistoryEntry)
  const sendTabRequest = useApiStudioStore((s) => s.sendTabRequest)

  const filtered = methodFilter === 'all' ? history : history.filter((h) => h.request.method === methodFilter)

  function rerun(entryId: string) {
    const entry = history.find((h) => h.id === entryId)
    if (!entry) return
    openHistoryEntry(entry)
    // openHistoryEntry sets the new tab active synchronously via zustand; grab it next tick.
    queueMicrotask(() => {
      const activeTabId = useApiStudioStore.getState().activeTabId
      if (activeTabId) void sendTabRequest(activeTabId)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('flex shrink-0 items-center gap-1 border-b border-border/60', embedded ? 'p-1.5' : 'gap-1.5 border-border p-2')}>
        <select
          value={methodFilter}
          onChange={(e) => setHistoryMethodFilter(e.target.value as HttpMethod | 'all')}
          className="h-7 flex-1 rounded border border-input bg-background px-2 text-[11px]"
        >
          <option value="all">All methods</option>
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Clear history" onClick={clearHistory}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <EmptyState icon={<History className="h-5 w-5" />} title="No history yet" description="Sent requests will show up here." />
        ) : (
          <div className="space-y-0.5 p-1.5">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="group flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-accent/60"
              >
                <button
                  type="button"
                  onClick={() => openHistoryEntry(entry)}
                  className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left"
                  title={entry.request.url}
                >
                  <span className={cn('shrink-0 font-mono text-[9px] font-bold', METHOD_COLORS[entry.request.method])}>
                    {entry.request.method}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px]">{entry.request.url}</p>
                    <p className="truncate text-[9px] text-muted-foreground">{timeAgo(entry.timestamp)}</p>
                  </div>
                  <Badge variant={entry.response.ok ? 'success' : 'destructive'} className="shrink-0 px-1 py-0 text-[9px]">
                    {entry.response.status || 'ERR'}
                  </Badge>
                </button>
                <button
                  onClick={() => rerun(entry.id)}
                  title="Re-run request"
                  className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background group-hover:flex"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
