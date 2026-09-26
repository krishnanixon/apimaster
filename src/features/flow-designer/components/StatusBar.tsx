import { useFlowEditorStore } from '../stores/flow-editor.store'
import { useFlowValidation } from '../hooks/useFlowValidation'
import { cn } from '@/shared/lib/utils'

interface StatusBarProps {
  zoom?: number
}

const TOOL_LABELS: Record<string, string> = {
  select: 'Select',
  pan: 'Hand',
  connect: 'Connect',
  eraser: 'Eraser'
}

export function StatusBar({ zoom }: StatusBarProps) {
  const { nodes, edges, selectedNodeIds, snapToGrid, activeTool, turboMode } =
    useFlowEditorStore()
  const { score, issues } = useFlowValidation(nodes, edges)

  const stats = [
    { label: TOOL_LABELS[activeTool], active: activeTool !== 'select' },
    ...(turboMode ? [{ label: 'Turbo', active: true }] : []),
    { label: `${nodes.length} nodes` },
    { label: `${edges.length} connections` },
    ...(selectedNodeIds.length > 0 ? [{ label: `${selectedNodeIds.length} selected` }] : []),
    { label: `${Math.round((zoom ?? 1) * 100)}%` },
    ...(snapToGrid ? [{ label: 'Snap' }] : [])
  ]

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-border bg-background px-3 text-[10px] text-muted-foreground">
      <div className="flex items-center gap-2">
        {stats.map((stat, i) => (
          <span key={`${stat.label}-${i}`} className="flex items-center gap-2">
            {i > 0 && <span className="text-border">·</span>}
            <span
              className={cn(
                stat.active && 'rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary'
              )}
            >
              {stat.label}
            </span>
          </span>
        ))}
      </div>
      <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
        Scroll pan · Ctrl+scroll zoom · Space drag
      </span>
      <span
        className={cn(
          'ml-auto tabular-nums',
          issues.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
        )}
      >
        Validation {score}%
        {issues.length > 0 ? ` · ${issues.length} issue${issues.length === 1 ? '' : 's'}` : ''}
      </span>
    </footer>
  )
}
