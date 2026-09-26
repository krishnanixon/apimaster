import {
  AlertCircle,
  Bot,
  Brain,
  FolderCode,
  GitBranch,
  ListTree,
  Search,
  SearchCheck,
  Settings
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip'
import { cn } from '@/shared/lib/utils'
import { useProblemsStore } from '../stores/problems.store'
import { useGitStore } from '../stores/git.store'
import { useSeoAuditStore } from '../stores/seoAudit.store'
import { useAgentStore } from '../stores/agent.store'
import { useWorkbenchLayoutStore, type EditorLeftTab } from '../stores/workbench.store'

const ITEMS: Array<{ id: EditorLeftTab; label: string; shortcut: string; icon: typeof FolderCode }> = [
  { id: 'files', label: 'Explorer', shortcut: 'Ctrl+Shift+E', icon: FolderCode },
  { id: 'search', label: 'Search', shortcut: 'Ctrl+Shift+F', icon: Search },
  { id: 'git', label: 'Source Control', shortcut: 'Ctrl+Shift+G', icon: GitBranch },
  { id: 'outline', label: 'Outline', shortcut: '', icon: ListTree },
  { id: 'ai', label: 'Agent Intel', shortcut: '', icon: Brain },
  { id: 'seo', label: 'Search Intelligence', shortcut: '', icon: SearchCheck },
  { id: 'problems', label: 'Problems', shortcut: 'Ctrl+Shift+M', icon: AlertCircle }
]

function badgeLabel(count: number): string | number {
  return count > 99 ? '99+' : count
}

export function ActivityBar() {
  const leftTab = useWorkbenchLayoutStore((s) => s.leftTab)
  const setLeftTab = useWorkbenchLayoutStore((s) => s.setLeftTab)
  const sidebarOpen = useWorkbenchLayoutStore((s) => s.sidebarOpen)
  const setSidebarOpen = useWorkbenchLayoutStore((s) => s.setSidebarOpen)
  const agentOpen = useWorkbenchLayoutStore((s) => s.agentOpen)
  const toggleAgent = useWorkbenchLayoutStore((s) => s.toggleAgent)
  const setSettingsOpen = useWorkbenchLayoutStore((s) => s.setSettingsOpen)
  const problems = useProblemsStore((s) => s.items.length)
  const gitDirty = useGitStore((s) => s.snapshot?.entries.length ?? 0)
  const seoFindings = useSeoAuditStore((s) => s.report?.findings.length ?? 0)
  const pendingPatches = useAgentStore(
    (s) => s.patches.filter((patch) => patch.status === 'pending').length
  )

  return (
    <div className="wb-glass-chrome flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-[var(--wb-border)] bg-[var(--wb-activity)] py-1">
      {ITEMS.map((item) => {
        const Icon = item.icon
        const active = sidebarOpen && leftTab === item.id
        const badge =
          item.id === 'problems' && problems > 0
            ? badgeLabel(problems)
            : item.id === 'git' && gitDirty > 0
              ? badgeLabel(gitDirty)
              : item.id === 'seo' && seoFindings > 0
                ? badgeLabel(seoFindings)
                : null
        return (
          <Tooltip key={item.id} delayDuration={180}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={item.label}
                data-active={active}
                className="wb-activity-btn"
                onClick={() => {
                  if (active) setSidebarOpen(false)
                  else {
                    setLeftTab(item.id)
                    if (item.id === 'git') void useGitStore.getState().refresh()
                    if (item.id === 'seo' && !useSeoAuditStore.getState().report) {
                      void useSeoAuditStore.getState().run()
                    }
                  }
                }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
                {badge ? <span className="wb-activity-badge">{badge}</span> : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-[11px]">
              {item.label}
              {item.shortcut ? <span className="ml-2 text-muted-foreground">{item.shortcut}</span> : null}
            </TooltipContent>
          </Tooltip>
        )
      })}

      <div className="mt-auto flex flex-col items-center gap-0.5 pb-0.5">
        <Tooltip delayDuration={180}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Toggle Agent"
              data-active={agentOpen}
              className="wb-activity-btn"
              onClick={toggleAgent}
            >
              <Bot className="h-[18px] w-[18px]" strokeWidth={1.7} />
              {pendingPatches > 0 ? (
                <span className="wb-activity-badge" data-tone="warn">
                  {badgeLabel(pendingPatches)}
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-[11px]">
            Agent <span className="ml-2 text-muted-foreground">Ctrl+L</span>
            {pendingPatches > 0 ? (
              <span className="ml-2 text-muted-foreground">{pendingPatches} pending</span>
            ) : null}
          </TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={180}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Editor Settings"
              className="wb-activity-btn"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-[11px]">
            Editor Settings
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
