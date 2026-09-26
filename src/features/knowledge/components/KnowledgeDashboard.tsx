import type { KnowledgeStats, KnowledgeSuggestion } from '@shared/types'
import { Card, CardContent } from '@/shared/components/ui/card'
import { AlertTriangle, Boxes, Info, Lightbulb, ListChecks, Target } from 'lucide-react'
import { LoadSampleDataButton } from './LoadSampleDataButton'
import { cn } from '@/shared/lib/utils'

interface KnowledgeDashboardProps {
  stats: KnowledgeStats | null
  suggestions: KnowledgeSuggestion[]
  onNavigate?: (section: string) => void
  onSeedSample?: (force?: boolean) => Promise<{ skipped: boolean; message: string; itemsCreated: number } | null>
  isSeeding?: boolean
  hasExistingData?: boolean
}

export function KnowledgeDashboard({
  stats,
  suggestions,
  onNavigate,
  onSeedSample,
  isSeeding = false,
  hasExistingData = false
}: KnowledgeDashboardProps) {
  if (!stats) return null

  const isEmpty = stats.completionPercent < 25

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
              <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  className="stroke-muted"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  className="stroke-primary transition-all duration-500"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${stats.completionPercent} 100`}
                />
              </svg>
              <span className="absolute text-[11px] font-semibold tabular-nums">
                {stats.completionPercent}%
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">Knowledge completeness</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Basics, modules, and requirements feed AI, documents, and flows.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isEmpty && onSeedSample && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Lightbulb className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Start with sample data</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pre-fill an example, or add your own content below.
              </p>
            </div>
            <LoadSampleDataButton
              hasExistingData={hasExistingData}
              isSeeding={isSeeding}
              onSeed={onSeedSample}
              variant="outline"
              size="sm"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Basics"
          icon={Target}
          value={stats.completionPercent >= 33 ? 'Complete' : 'Incomplete'}
          highlight={stats.completionPercent >= 33}
          onClick={() => onNavigate?.('overview')}
        />
        <StatCard
          label="Modules"
          icon={Boxes}
          value={String(stats.modules)}
          sub={`${stats.features} features`}
          onClick={() => onNavigate?.('modules')}
        />
        <StatCard
          label="Requirements"
          icon={ListChecks}
          value={String(stats.requirements)}
          onClick={() => onNavigate?.('requirements')}
        />
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Suggestions
          </p>
          {suggestions.map((s) => {
            const Icon = s.type === 'warning' ? AlertTriangle : s.type === 'tip' ? Lightbulb : Info
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => s.section && onNavigate?.(s.section)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-accent/50',
                  s.type === 'warning' && 'border-amber-500/30',
                  s.type === 'tip' && 'border-emerald-500/30',
                  s.type === 'info' && 'border-blue-500/30'
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    s.type === 'warning' && 'text-amber-500',
                    s.type === 'info' && 'text-blue-500',
                    s.type === 'tip' && 'text-emerald-500'
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  icon: Icon,
  value,
  sub,
  highlight,
  onClick
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  sub?: string
  highlight?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            highlight ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </button>
  )
}
