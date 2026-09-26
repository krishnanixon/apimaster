import { AlertCircle, Bug, GitCompare, SquareTerminal, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { TerminalPanel } from '@/modules/terminal/components/TerminalPanel'
import { useProblemsStore } from '../stores/problems.store'
import { useAgentStore } from '../stores/agent.store'
import { useWorkbenchLayoutStore, type EditorBottomTab } from '../stores/workbench.store'
import { ProblemsPanel } from './ProblemsPanel'
import { ChangesPanel } from './ChangesPanel'
import { DebugPanel } from './DebugPanel'
import { setWorkbenchTerminalOpen } from '../lib/terminal-workbench'

const TABS: { id: EditorBottomTab; label: string; icon: typeof SquareTerminal }[] = [
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'problems', label: 'Problems', icon: AlertCircle },
  { id: 'changes', label: 'Changes', icon: GitCompare },
  { id: 'debug', label: 'Debug', icon: Bug }
]

export function WorkbenchBottomPanel() {
  const bottomTab = useWorkbenchLayoutStore((s) => s.bottomTab)
  const setBottomTab = useWorkbenchLayoutStore((s) => s.setBottomTab)
  const problems = useProblemsStore((s) => s.items.length)
  const pendingPatches = useAgentStore(
    (s) => s.patches.filter((patch) => patch.status === 'pending').length
  )
  const patches = useAgentStore((s) => s.patches.length)

  if (!bottomTab) return null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--wb-editor)]">
      <div className="wb-glass-chrome flex h-8 shrink-0 items-center justify-between border-b border-[var(--wb-border)] bg-[var(--wb-tabbar)] px-1.5">
        <div className="flex min-w-0 items-center gap-0.5 rounded-[8px] bg-[color-mix(in_srgb,var(--wb-fg)_4%,transparent)] p-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const count =
              tab.id === 'problems' ? problems : tab.id === 'changes' ? pendingPatches || patches : 0
            const active = bottomTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  tab.id === 'terminal' ? void setWorkbenchTerminalOpen(true) : setBottomTab(tab.id)
                }
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2 text-[11px] font-medium',
                  active
                    ? 'bg-[var(--wb-editor)] text-[var(--wb-fg)] shadow-[var(--wb-shadow-sm)]'
                    : 'text-[var(--wb-muted)] hover:text-[var(--wb-fg)]'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {count > 0 ? (
                  <span
                    className={cn(
                      'rounded px-1 text-[10px] tabular-nums',
                      tab.id === 'changes' && pendingPatches > 0
                        ? 'text-[var(--wb-warn)]'
                        : 'text-[var(--wb-muted)]'
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            bottomTab === 'terminal' ? void setWorkbenchTerminalOpen(false) : setBottomTab(null)
          }
          title="Hide panel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={cn('h-full', bottomTab !== 'terminal' && 'hidden')}>
          <TerminalPanel onClose={() => void setWorkbenchTerminalOpen(false)} />
        </div>
        {bottomTab === 'problems' ? <ProblemsPanel /> : null}
        {bottomTab === 'changes' ? <ChangesPanel /> : null}
        {bottomTab === 'debug' ? <DebugPanel /> : null}
      </div>
    </div>
  )
}
