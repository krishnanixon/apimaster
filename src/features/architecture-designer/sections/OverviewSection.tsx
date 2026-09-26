import { useMemo } from 'react'
import { ArrowRight, Network, Sparkles } from 'lucide-react'
import type { ArchSectionId } from '@shared/types/architecture'
import { ARCH_SYSTEM_TYPES, getComponentKindMeta } from '@shared/lib/architecture-catalog'
import { getModelStats } from '@shared/lib/architecture-model'
import { Button } from '@/shared/components/ui/button'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { SectionShell, SectionEmpty } from './SectionShell'
import { DynamicIcon } from '../lib/dynamic-icon'

export function OverviewSection({ onNavigate }: { onNavigate: (section: ArchSectionId) => void }) {
  const model = useArchitectureEditorStore((s) => s.model)
  const stats = useMemo(() => getModelStats(model), [model])

  const systemLabel =
    ARCH_SYSTEM_TYPES.find((t) => t.id === model.metadata.systemType)?.label ??
    model.metadata.systemType

  const byCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const component of model.components) {
      counts.set(component.category, (counts.get(component.category) ?? 0) + 1)
    }
    return counts
  }, [model.components])

  return (
    <SectionShell title="Overview" description={systemLabel}>
      {model.components.length === 0 ? (
        <SectionEmpty
          title="Start designing"
          description="Open the diagram to place modules, or let AI propose a first draft from your requirements."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => onNavigate('architecture')}>
                <Network className="h-3.5 w-3.5" />
                Open diagram
              </Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate('ai-architect')}>
                <Sparkles className="h-3.5 w-3.5" />
                Generate with AI
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onNavigate('architecture')}>
              Open diagram
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate('components')}>
              Browse components
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate('documentation')}>
              {model.metadata.linkedSddDocumentId ? 'Manage docs' : 'Generate docs'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Components" value={stats.components} onClick={() => onNavigate('components')} />
            <StatCard label="Connections" value={stats.connections} onClick={() => onNavigate('architecture')} />
            <StatCard label="Services" value={stats.services} onClick={() => onNavigate('components')} />
            <StatCard label="Data stores" value={stats.databases} onClick={() => onNavigate('components')} />
            <StatCard label="Integrations" value={stats.integrations} onClick={() => onNavigate('components')} />
            <StatCard label="Endpoints" value={stats.apis} onClick={() => onNavigate('api')} />
          </div>

          <Panel title="Composition">
            <div className="flex flex-col gap-1.5">
              {[...byCategory.entries()].map(([category, count]) => {
                const share = Math.round((count / model.components.length) * 100)
                return (
                  <div key={category} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-[11px] capitalize text-muted-foreground">
                      {category}
                    </span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </Panel>

          <Panel title="Components">
            <ul className="flex flex-wrap gap-1.5">
              {model.components.map((component) => {
                const meta = getComponentKindMeta(component.kind)
                return (
                  <li key={component.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate('architecture')}
                      className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 transition-colors hover:border-border hover:bg-muted/50"
                    >
                      <DynamicIcon name={meta?.icon} className="h-3 w-3 shrink-0" />
                      <span className="text-[11.5px]">{component.name}</span>
                      {component.technology && (
                        <span className="text-[10px] text-muted-foreground">{component.technology}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Panel>

          {model.metadata.description && (
            <Panel title="Description">
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                {model.metadata.description}
              </p>
            </Panel>
          )}
        </div>
      )}
    </SectionShell>
  )
}

function StatCard({
  label,
  value,
  onClick
}: {
  label: string
  value: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border/60 bg-card p-2.5 text-left transition-colors duration-fast hover:border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <p className="text-lg font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </button>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-3">
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}
