import { useCallback, useEffect, useState } from 'react'
import { Activity, BarChart3, Coins, Cpu, Hash, RefreshCw, Trash2, Zap } from 'lucide-react'
import type { ApiUsageSummary } from '@shared/types'
import { getModelLabel } from '@shared/lib/ai-models'
import { Button } from '@/shared/components/ui/button'
import { Card, StatCard } from '@/shared/components/ui/card'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn, formatRelativeTime } from '@/shared/lib/utils'
import { toast } from 'sonner'

const FEATURE_LABELS: Record<string, string> = {
  chat: 'Chat',
  title: 'Chat titles',
  generate: 'Document generation',
  'edit-selection': 'Inline edit',
  'edit-document': 'Document edit',
  'edit-section': 'Section edit',
  flow: 'Flow generation',
  'flow-reverse': 'Flow reverse-engineer',
  'flow-action': 'Flow AI actions',
  knowledge: 'Knowledge extraction'
}

const numberFmt = new Intl.NumberFormat(undefined)

function formatTokens(n: number): string {
  return numberFmt.format(Math.round(n))
}

function formatCost(n: number): string {
  if (n <= 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(n < 1 ? 3 : 2)}`
}

function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature
}

export function UsageDashboard() {
  const [summary, setSummary] = useState<ApiUsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.usage.getSummary()
    if (result.success && result.data) {
      setSummary(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleClear = async () => {
    if (!window.confirm('Clear all recorded API usage data? This cannot be undone.')) return
    setClearing(true)
    const result = await window.electronAPI.usage.clear()
    setClearing(false)
    if (result.success) {
      toast.success('Usage data cleared')
      void load()
    } else {
      toast.error('Failed to clear usage data')
    }
  }

  const hasData = !!summary && summary.totalRequests > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          Estimates are tracked locally on this device and may differ slightly from your provider’s
          bill.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} disabled={clearing || !hasData}>
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : !hasData ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <BarChart3 className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium">No usage recorded yet</p>
          <p className="max-w-sm text-caption text-muted-foreground">
            Token usage and estimated cost will appear here after you use AI features like chat,
            document generation, or flows.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total requests"
              value={formatTokens(summary!.totalRequests)}
              icon={Activity}
            />
            <StatCard label="Total tokens" value={formatTokens(summary!.totalTokens)} icon={Hash} />
            <StatCard label="Estimated cost" value={formatCost(summary!.totalCost)} icon={Coins} />
            <StatCard label="Models used" value={summary!.byModel.length} icon={Cpu} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TokenSplit
              label="Prompt (input) tokens"
              value={summary!.totalPromptTokens}
              total={summary!.totalTokens}
            />
            <TokenSplit
              label="Completion (output) tokens"
              value={summary!.totalCompletionTokens}
              total={summary!.totalTokens}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <BreakdownCard
              title="By model"
              icon={Cpu}
              rows={summary!.byModel.map((m) => ({
                key: m.model,
                label: getModelLabel(m.model),
                sub: `${formatTokens(m.requests)} req · ${formatTokens(m.totalTokens)} tokens`,
                value: m.estimatedCost,
                valueLabel: formatCost(m.estimatedCost)
              }))}
            />
            <BreakdownCard
              title="By feature"
              icon={Zap}
              rows={summary!.byFeature.map((f) => ({
                key: f.feature,
                label: featureLabel(f.feature),
                sub: `${formatTokens(f.requests)} req · ${formatCost(f.estimatedCost)}`,
                value: f.totalTokens,
                valueLabel: formatTokens(f.totalTokens)
              }))}
            />
          </div>

          <DailyChart summary={summary!} />

          <RecentActivity summary={summary!} />
        </>
      )}
    </div>
  )
}

function TokenSplit({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-caption font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{formatTokens(value)}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{pct}% of total</p>
    </Card>
  )
}

interface BreakdownRow {
  key: string
  label: string
  sub: string
  value: number
  valueLabel: string
}

function BreakdownCard({
  title,
  icon: Icon,
  rows
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  rows: BreakdownRow[]
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <p className="text-caption text-muted-foreground">No data</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium">{r.label}</p>
                <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {r.valueLabel}
                </p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{r.sub}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function DailyChart({ summary }: { summary: ApiUsageSummary }) {
  const days = summary.daily
  if (days.length === 0) return null
  const max = Math.max(1, ...days.map((d) => d.totalTokens))

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold tracking-tight">Daily tokens (last 30 days)</h4>
      </div>
      <div className="flex h-32 items-end gap-1">
        {days.map((d) => (
          <div
            key={d.date}
            className="group relative flex flex-1 flex-col items-center justify-end"
          >
            <div
              className="w-full min-w-[3px] rounded-t bg-primary/70 transition-all group-hover:bg-primary"
              style={{ height: `${Math.max(2, (d.totalTokens / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-md group-hover:block">
              <span className="font-medium">{d.date}</span>
              <br />
              {formatTokens(d.totalTokens)} tokens · {formatCost(d.estimatedCost)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function RecentActivity({ summary }: { summary: ApiUsageSummary }) {
  if (summary.recent.length === 0) return null
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold tracking-tight">Recent activity</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">When</th>
              <th className="pb-2 pr-3 font-medium">Feature</th>
              <th className="pb-2 pr-3 font-medium">Model</th>
              <th className="pb-2 pr-3 text-right font-medium">Prompt</th>
              <th className="pb-2 pr-3 text-right font-medium">Completion</th>
              <th className="pb-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {summary.recent.map((r) => (
              <tr key={r.id} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-3 text-muted-foreground">
                  {formatRelativeTime(r.createdAt)}
                </td>
                <td className="py-2 pr-3">{featureLabel(r.feature)}</td>
                <td className="py-2 pr-3 text-muted-foreground">{getModelLabel(r.model)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatTokens(r.promptTokens)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatTokens(r.completionTokens)}
                </td>
                <td className="py-2 text-right tabular-nums">{formatCost(r.estimatedCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
