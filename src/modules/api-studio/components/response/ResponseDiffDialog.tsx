import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Minus, Plus, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Badge } from '@/shared/components/ui/badge'
import { Switch } from '@/shared/components/ui/switch'
import { cn } from '@/shared/lib/utils'
import {
  compareRequests,
  compareResponses,
  formatSignedDelta,
  type FieldChange,
  type JsonChange,
  type LineOp
} from '@shared/lib/response-diff'
import { formatBytes } from '@shared/lib/response-content'
import { useApiStudioStore, type ResponseSnapshot } from '../../stores/apiStudioStore'

type BodyView = 'changes' | 'lines'

interface Source {
  id: string
  label: string
  snapshot: ResponseSnapshot
}

/** Keep unchanged context around edits and collapse the rest, like `diff -U3`. */
const CONTEXT_LINES = 3
const MAX_RENDERED_LINES = 3000

function useSources(tabId: string): { current: ResponseSnapshot | null; sources: Source[] } {
  const tabs = useApiStudioStore((s) => s.tabs)
  return useMemo(() => {
    const tab = tabs.find((t) => t.id === tabId)
    const current =
      tab?.lastRun ??
      (tab?.response
        ? { request: tab.request, response: tab.response, capturedAt: '', label: 'Current' }
        : null)
    const sources: Source[] = []
    if (tab?.previousRun) sources.push({ id: 'previous', label: `Previous run (${tab.previousRun.label})`, snapshot: tab.previousRun })
    if (tab?.baseline) sources.push({ id: 'baseline', label: tab.baseline.label, snapshot: tab.baseline })
    for (const other of tabs) {
      if (other.id === tabId) continue
      const snap =
        other.lastRun ??
        (other.response ? { request: other.request, response: other.response, capturedAt: '', label: '' } : null)
      if (!snap) continue
      sources.push({
        id: `tab:${other.id}`,
        label: `Tab: ${other.request.name || other.request.url || 'Untitled'} (${snap.response.status || 'error'})`,
        snapshot: snap
      })
    }
    return { current, sources }
  }, [tabId, tabs])
}

function stringifyValue(value: unknown): string {
  if (value === undefined) return ''
  const text = JSON.stringify(value)
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

function KindIcon({ kind }: { kind: 'added' | 'removed' | 'changed' }) {
  if (kind === 'added') return <Plus className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
  if (kind === 'removed') return <Minus className="h-3 w-3 text-red-600 dark:text-red-400" />
  return <RefreshCw className="h-3 w-3 text-amber-600 dark:text-amber-400" />
}

function FieldTable({ changes, empty }: { changes: FieldChange[]; empty: string }) {
  if (changes.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>
  return (
    <table className="w-full table-fixed text-[11px]">
      <thead>
        <tr className="border-b border-border/60 text-left text-muted-foreground">
          <th className="w-6 py-1" />
          <th className="w-1/4 py-1 font-medium">Field</th>
          <th className="py-1 font-medium">A</th>
          <th className="py-1 font-medium">B</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.key} className="border-b border-border/30 align-top">
            <td className="py-1">
              <KindIcon kind={c.kind} />
            </td>
            <td className="break-all py-1 pr-2 font-mono">{c.key}</td>
            <td className="whitespace-pre-wrap break-all py-1 pr-2 font-mono text-red-700 dark:text-red-300">
              {c.before ?? '—'}
            </td>
            <td className="whitespace-pre-wrap break-all py-1 font-mono text-emerald-700 dark:text-emerald-300">
              {c.after ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function JsonChangeList({ changes }: { changes: JsonChange[] }) {
  return (
    <div className="divide-y divide-border/30 font-mono text-[11px]">
      {changes.map((c, i) => (
        <div key={`${c.path}-${i}`} className="flex items-start gap-2 py-1">
          <KindIcon kind={c.kind} />
          <span className="w-1/3 shrink-0 break-all text-sky-700 dark:text-sky-400">{c.path}</span>
          <span className="min-w-0 flex-1 break-all">
            {c.kind !== 'added' && <span className="text-red-700 line-through decoration-red-500/40 dark:text-red-300">{stringifyValue(c.before)}</span>}
            {c.kind === 'changed' && <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />}
            {c.kind !== 'removed' && <span className="text-emerald-700 dark:text-emerald-300">{stringifyValue(c.after)}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

type Hunk = { type: 'lines'; lines: LineOp[] } | { type: 'skip'; count: number }

function toHunks(lines: LineOp[]): Hunk[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.type === 'equal') return
    for (let k = Math.max(0, i - CONTEXT_LINES); k <= Math.min(lines.length - 1, i + CONTEXT_LINES); k++) keep[k] = true
  })
  const hunks: Hunk[] = []
  let i = 0
  while (i < lines.length) {
    if (keep[i]) {
      const chunk: LineOp[] = []
      while (i < lines.length && keep[i]) chunk.push(lines[i++])
      hunks.push({ type: 'lines', lines: chunk })
    } else {
      let count = 0
      while (i < lines.length && !keep[i]) {
        count++
        i++
      }
      hunks.push({ type: 'skip', count })
    }
  }
  return hunks
}

function LineDiff({ lines }: { lines: LineOp[] }) {
  const hunks = useMemo(() => toHunks(lines), [lines])
  let rendered = 0
  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-border/60 font-mono text-[11px] leading-5">
      {hunks.map((hunk, h) => {
        if (hunk.type === 'skip') {
          return (
            <div key={h} className="bg-muted/40 px-2 text-center text-[10px] text-muted-foreground">
              ⋯ {hunk.count} unchanged line{hunk.count === 1 ? '' : 's'} ⋯
            </div>
          )
        }
        if (rendered > MAX_RENDERED_LINES) return null
        rendered += hunk.lines.length
        return hunk.lines.map((line, i) => (
          <div
            key={`${h}-${i}`}
            className={cn(
              'grid grid-cols-[3rem_3rem_1rem_1fr] whitespace-pre',
              line.type === 'added' && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
              line.type === 'removed' && 'bg-red-500/10 text-red-800 dark:text-red-200'
            )}
          >
            <span className="select-none pr-2 text-right text-muted-foreground/70">{line.leftLine ?? ''}</span>
            <span className="select-none pr-2 text-right text-muted-foreground/70">{line.rightLine ?? ''}</span>
            <span className="select-none">{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span>
            <span>{line.text}</span>
          </div>
        ))
      })}
      {rendered > MAX_RENDERED_LINES && (
        <p className="px-2 py-1 text-[10px] text-muted-foreground">Diff truncated for display.</p>
      )}
    </div>
  )
}

function Metric({ label, a, b, delta, changed }: { label: string; a: string; b: string; delta?: string; changed: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-lg border px-3 py-2', changed ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60')}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-xs" title={a === b ? a : `${a} → ${b}`}>
        {a === b && !delta ? (
          <span className="truncate">{a}</span>
        ) : (
          <>
            <span className="truncate">{a}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className={cn('truncate', changed && 'font-semibold')}>{b}</span>
          </>
        )}
      </div>
      {delta && <div className="text-[10px] text-muted-foreground">{delta}</div>}
    </div>
  )
}

export function ResponseDiffDialog({
  tabId,
  open,
  onOpenChange
}: {
  tabId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { current, sources } = useSources(tabId)
  const [sourceId, setSourceId] = useState<string>('')
  const [ignoreVolatile, setIgnoreVolatile] = useState(true)
  const [bodyView, setBodyView] = useState<BodyView>('changes')

  useEffect(() => {
    if (!open) return
    if (!sources.some((s) => s.id === sourceId)) setSourceId(sources[0]?.id ?? '')
  }, [open, sourceId, sources])

  const source = sources.find((s) => s.id === sourceId)
  // A = the other snapshot (older / reference), B = this tab's latest run.
  const comparison = useMemo(() => {
    if (!source || !current) return null
    return {
      response: compareResponses(source.snapshot.response, current.response, { ignoreVolatileHeaders: ignoreVolatile }),
      request: compareRequests(source.snapshot.request, current.request)
    }
  }, [current, ignoreVolatile, source])

  useEffect(() => {
    if (comparison?.response.body.mode === 'text') setBodyView('lines')
    else if (comparison?.response.body.mode === 'json') setBodyView('changes')
  }, [comparison?.response.body.mode])

  const r = comparison?.response

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Compare responses</DialogTitle>
          <DialogDescription>
            A is the run you pick; B is this tab’s latest response.
          </DialogDescription>
        </DialogHeader>

        {!current ? (
          <p className="text-sm text-muted-foreground">Send the request first — there is no response to compare yet.</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to compare with yet. Send this request again, pin this response as a baseline, or send a request in another tab.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="font-medium" htmlFor="diff-source">
                A
              </label>
              <select
                id="diff-source"
                className="h-8 min-w-0 max-w-md flex-1 rounded-md border border-input bg-background px-2 text-xs"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">B</span>
              <span className="text-muted-foreground">Latest ({current.response.status || 'error'})</span>
              <label className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                <Switch checked={ignoreVolatile} onCheckedChange={setIgnoreVolatile} aria-label="Ignore volatile headers" />
                Ignore volatile headers
              </label>
            </div>

            {r && comparison && (
              <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric
                    label="Status"
                    a={`${r.status.before} ${r.status.beforeText}`.trim()}
                    b={`${r.status.after} ${r.status.afterText}`.trim()}
                    changed={r.status.changed}
                  />
                  <Metric
                    label="Time"
                    a={`${r.timeMs.before} ms`}
                    b={`${r.timeMs.after} ms`}
                    delta={formatSignedDelta(r.timeMs.delta, ' ms')}
                    changed={false}
                  />
                  <Metric
                    label="Size"
                    a={formatBytes(r.sizeBytes.before)}
                    b={formatBytes(r.sizeBytes.after)}
                    delta={formatSignedDelta(r.sizeBytes.delta, ' B')}
                    changed={r.sizeBytes.delta !== 0}
                  />
                  <Metric
                    label="Content type"
                    a={r.contentType.before.split(';')[0] || '—'}
                    b={r.contentType.after.split(';')[0] || '—'}
                    changed={r.contentType.changed}
                  />
                </div>

                <section className="space-y-1.5">
                  <h3 className="text-xs font-semibold">
                    Request <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{comparison.request.changes.length}</Badge>
                  </h3>
                  <FieldTable changes={comparison.request.changes} empty="Requests are identical." />
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-xs font-semibold">
                    Response headers <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{r.headers.length}</Badge>
                  </h3>
                  <FieldTable changes={r.headers} empty="Headers are identical." />
                </section>

                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold">Body</h3>
                    {r.body.mode === 'json' && (
                      <div className="flex gap-0.5 rounded-md bg-muted p-0.5 text-[11px]">
                        {(['changes', 'lines'] as BodyView[]).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setBodyView(v)}
                            className={cn('rounded px-2 py-0.5', bodyView === v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                          >
                            {v === 'changes' ? `JSON changes (${r.body.jsonChanges?.length ?? 0})` : 'Text diff'}
                          </button>
                        ))}
                      </div>
                    )}
                    {(r.body.truncated || r.body.approximate) && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        {r.body.truncated ? 'Large body — text diff covers the first 400 KB. ' : ''}
                        {r.body.approximate ? 'Coarse diff (too many changed lines for an exact diff).' : ''}
                      </span>
                    )}
                  </div>
                  {r.body.mode === 'identical' && <p className="text-xs text-muted-foreground">Bodies are identical.</p>}
                  {r.body.mode === 'binary' && <p className="text-xs text-muted-foreground">Binary bodies differ.</p>}
                  {r.body.mode === 'json' && bodyView === 'changes' && r.body.jsonChanges && (
                    <JsonChangeList changes={r.body.jsonChanges} />
                  )}
                  {(r.body.mode === 'text' || (r.body.mode === 'json' && bodyView === 'lines')) && r.body.lines && (
                    <LineDiff lines={r.body.lines} />
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
