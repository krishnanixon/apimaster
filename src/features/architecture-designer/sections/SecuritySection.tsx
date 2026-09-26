import { useMemo } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { getConnectionKindMeta } from '@shared/lib/architecture-catalog'
import { Button } from '@/shared/components/ui/button'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { SectionShell, SectionEmpty } from './SectionShell'
import { cn } from '@/shared/lib/utils'

/**
 * A deterministic security overview. Full AI-driven validation arrives with the
 * validation phase; this surfaces what the model already knows.
 */
export function SecuritySection() {
  const { model, selectComponents } = useArchitectureEditorStore()

  const rows = useMemo(
    () =>
      model.components.map((component) => ({
        component,
        hasAuth: Boolean(component.security.authentication?.trim()),
        hasAuthz: Boolean(component.security.authorization?.trim())
      })),
    [model.components]
  )

  const unencrypted = useMemo(
    () => model.connections.filter((conn) => conn.kind === 'http' || conn.kind === 'tcp'),
    [model.connections]
  )

  const nameById = useMemo(
    () => new Map(model.components.map((c) => [c.id, c.name])),
    [model.components]
  )

  if (model.components.length === 0) {
    return (
      <SectionShell title="Security" description="Authentication and trust boundaries">
        <SectionEmpty
          title="Nothing to review yet"
          description="Add components and the security posture of each one will appear here."
        />
      </SectionShell>
    )
  }

  const covered = rows.filter((r) => r.hasAuth).length

  return (
    <SectionShell
      title="Security"
      description={`${covered} of ${rows.length} components declare authentication`}
    >
      <div className="flex flex-col gap-4">
        {unencrypted.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-800 dark:text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5" />
              {unencrypted.length} unencrypted connection{unencrypted.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {unencrypted.map((conn) => (
                <li key={conn.id} className="text-[11px] text-amber-700 dark:text-amber-400">
                  {nameById.get(conn.from)} to {nameById.get(conn.to)} over{' '}
                  {getConnectionKindMeta(conn.kind)?.label ?? conn.kind}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="flex flex-col gap-1.5">
          {rows.map(({ component, hasAuth, hasAuthz }) => (
            <li
              key={component.id}
              className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2.5"
            >
              <ShieldCheck
                className={cn(
                  'h-4 w-4 shrink-0',
                  hasAuth ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/40'
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium leading-tight">{component.name}</p>
                <p className="truncate text-[11px] leading-tight text-muted-foreground">
                  {hasAuth ? component.security.authentication : 'No authentication declared'}
                  {hasAuthz && ` · ${component.security.authorization}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 text-[11px]"
                onClick={() => selectComponents([component.id])}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  )
}
