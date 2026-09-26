import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { useFlowValidation } from '../hooks/useFlowValidation'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { cn } from '@/shared/lib/utils'

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'text-destructive bg-destructive/10',
  HIGH: 'text-orange-600 bg-orange-500/10 dark:text-orange-400',
  MEDIUM: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
  LOW: 'text-muted-foreground bg-muted'
}

export function ValidationPanel() {
  const { nodes, edges, setSelection, focusSelection } = useFlowEditorStore()
  const { score, issues } = useFlowValidation(nodes, edges)

  const jumpToNode = (nodeId?: string) => {
    if (!nodeId) return
    setSelection([nodeId])
    focusSelection()
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Validation score</p>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-bold',
                score >= 80
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : score >= 50
                    ? 'bg-amber-500/10 text-amber-600'
                    : 'bg-destructive/10 text-destructive'
              )}
            >
              {score}%
            </span>
          </div>
          {issues.length === 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              No issues detected
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {issues.length} issue{issues.length === 1 ? '' : 's'} · badges shown on canvas
            </p>
          )}
        </div>

        {issues.length > 0 && (
          <div className="space-y-1.5">
            {issues.map((issue, i) => (
              <button
                key={`${issue.type}-${i}`}
                type="button"
                onClick={() => jumpToNode(issue.node)}
                disabled={!issue.node}
                className={cn(
                  'w-full rounded-lg border bg-card p-2.5 text-left text-xs shadow-sm transition-colors',
                  issue.node ? 'hover:bg-accent/40' : 'opacity-80'
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'mr-1.5 inline rounded px-1 py-0.5 text-[9px] font-semibold uppercase',
                        SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.LOW
                      )}
                    >
                      {issue.severity}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{issue.type}</span>
                    <p className="mt-1 leading-snug">{issue.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
