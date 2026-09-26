import { Check, Circle, Loader2, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export type GenerationJobStatus = 'queued' | 'preparing' | 'writing' | 'saving' | 'done' | 'error'

export interface GenerationJob {
  id: string
  label: string
  status: GenerationJobStatus
  detail?: string
}

const STATUS_LABEL: Record<GenerationJobStatus, string> = {
  queued: 'Waiting',
  preparing: 'Preparing Knowledge…',
  writing: 'Writing from Knowledge…',
  saving: 'Saving…',
  done: 'Ready',
  error: 'Failed'
}

export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

export function GenerationProgressPanel({
  jobs,
  kbPercent,
  percent
}: {
  jobs: GenerationJob[]
  kbPercent?: number
  percent?: number
}) {
  const done = jobs.filter((j) => j.status === 'done').length
  const failed = jobs.some((j) => j.status === 'error')
  const active = jobs.find(
    (j) => j.status === 'preparing' || j.status === 'writing' || j.status === 'saving'
  )
  const total = jobs.length
  const fallbackPct = total === 0 ? 0 : Math.round(((done + (active ? 0.35 : 0)) / total) * 100)
  const pct = typeof percent === 'number' ? percent : fallbackPct

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {failed ? 'Generation stopped' : active ? 'Generating documents' : done === total ? 'Generation complete' : 'Queued'}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {active
              ? `${STATUS_LABEL[active.status]} ${active.label} (${done + 1} of ${total})`
              : `${done} of ${total} document${total === 1 ? '' : 's'} ready`}
            {typeof kbPercent === 'number' ? ` · Knowledge ${kbPercent}%` : ''}
          </p>
        </div>
        {active ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /> : null}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(6, pct))}%` }}
        />
      </div>

      <ul className="mt-3 space-y-1.5">
        {jobs.map((job) => {
          const busy = job.status === 'preparing' || job.status === 'writing' || job.status === 'saving'
          return (
            <li
              key={job.id}
              className={cn(
                'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs',
                job.status === 'done' && 'border-emerald-500/25 bg-emerald-500/5',
                job.status === 'error' && 'border-destructive/30 bg-destructive/5',
                busy && 'border-primary/30 bg-primary/5',
                job.status === 'queued' && 'border-border bg-muted/20'
              )}
            >
              <span className="mt-0.5 shrink-0">
                {job.status === 'done' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : job.status === 'error' ? (
                  <X className="h-3.5 w-3.5 text-destructive" />
                ) : busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{job.label}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {job.detail || STATUS_LABEL[job.status]}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
