import { useState } from 'react'
import { Check, Globe, Plus, Settings2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { EnvironmentManagerDialog } from './EnvironmentManagerDialog'
import { NamePromptDialog } from './NamePromptDialog'

export function EnvironmentPanel() {
  const environments = useApiStudioStore((s) => s.environments)
  const activeEnvironmentId = useApiStudioStore((s) => s.activeEnvironmentId)
  const setActiveEnvironment = useApiStudioStore((s) => s.setActiveEnvironment)
  const createEnvironment = useApiStudioStore((s) => s.createEnvironment)
  const [managerOpen, setManagerOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <p className="min-w-0 flex-1 truncate px-1 text-[11px] text-muted-foreground">
          Variables as {'{{name}}'}
        </p>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="New environment" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Manage environments" onClick={() => setManagerOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {environments.length === 0 ? (
          <EmptyState
            icon={<Globe className="h-5 w-5" />}
            title="No environments"
            description="Create an environment for base URLs, tokens, and other variables."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5" /> New Environment
              </Button>
            }
          />
        ) : (
          <div className="space-y-0.5 p-1.5">
            <button
              type="button"
              onClick={() => setActiveEnvironment(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/60',
                !activeEnvironmentId && 'bg-accent'
              )}
            >
              <span className="min-w-0 flex-1 truncate text-muted-foreground">No environment</span>
              {!activeEnvironmentId && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
            {environments.map((env) => {
              const active = env.id === activeEnvironmentId
              const count = env.variables.filter((v) => v.enabled && v.key.trim()).length
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => setActiveEnvironment(env.id)}
                  onDoubleClick={() => setManagerOpen(true)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/60',
                    active && 'bg-accent'
                  )}
                  title="Click to activate · Double-click to edit"
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                  <span className="min-w-0 flex-1 truncate">{env.name}</span>
                  <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{count}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>

      <EnvironmentManagerDialog open={managerOpen} onOpenChange={setManagerOpen} initialSelectedId={activeEnvironmentId} />
      <NamePromptDialog
        open={creating}
        onOpenChange={setCreating}
        title="New Environment"
        confirmLabel="Create"
        onSubmit={(name) => {
          const env = createEnvironment(name)
          setActiveEnvironment(env.id)
        }}
      />
    </div>
  )
}
