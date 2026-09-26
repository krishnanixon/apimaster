import { useState } from 'react'
import { Check, ChevronDown, Globe, Settings2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { EnvironmentManagerDialog } from './EnvironmentManagerDialog'

export function EnvironmentSelector({ compact = false }: { compact?: boolean }) {
  const environments = useApiStudioStore((s) => s.environments)
  const activeEnvironmentId = useApiStudioStore((s) => s.activeEnvironmentId)
  const setActiveEnvironment = useApiStudioStore((s) => s.setActiveEnvironment)
  const [managerOpen, setManagerOpen] = useState(false)

  const active = environments.find((e) => e.id === activeEnvironmentId)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-1 rounded border border-border/60 bg-background font-medium hover:bg-muted/40',
              compact ? 'h-6 px-2 text-[10px]' : 'h-8 px-2.5 text-xs'
            )}
          >
            <Globe className={cn('text-muted-foreground', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            <span className="max-w-[100px] truncate">{active ? active.name : 'No env'}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setActiveEnvironment(null)}>
            <span className="flex-1 text-xs">No Environment</span>
            {!active && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
          {environments.length > 0 && <DropdownMenuSeparator />}
          {environments.map((env) => (
            <DropdownMenuItem key={env.id} onSelect={() => setActiveEnvironment(env.id)}>
              <span className="flex-1 truncate text-xs">{env.name}</span>
              {active?.id === env.id && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setManagerOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Manage Environments...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EnvironmentManagerDialog open={managerOpen} onOpenChange={setManagerOpen} initialSelectedId={activeEnvironmentId} />
    </>
  )
}
