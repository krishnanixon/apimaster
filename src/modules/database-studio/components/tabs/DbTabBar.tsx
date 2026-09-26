import { Plus, Table2, FileCode2, GitBranch, X, Braces } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { isDocumentProvider } from '@shared/types/database-workspace'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'

const TAB_ICONS = {
  table: Table2,
  query: FileCode2,
  'er-diagram': GitBranch
} as const

export function DbTabBar() {
  const tabs = useDbWorkspaceStore((s) => s.tabs)
  const activeTabId = useDbWorkspaceStore((s) => s.activeTabId)
  const activeConnectionId = useDbWorkspaceStore((s) => s.activeConnectionId)
  const setActiveTab = useDbWorkspaceStore((s) => s.setActiveTab)
  const closeTab = useDbWorkspaceStore((s) => s.closeTab)
  const openQueryTab = useDbWorkspaceStore((s) => s.openQueryTab)
  const connections = useDbWorkspaceStore((s) => s.connections)
  const documentConnectionIds = new Set(connections.filter((c) => isDocumentProvider(c.provider)).map((c) => c.id))

  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/10">
      {tabs.map((tab) => {
        const isDocument = documentConnectionIds.has(tab.connectionId)
        const Icon = tab.type === 'table' && isDocument ? Braces : TAB_ICONS[tab.type as keyof typeof TAB_ICONS]
        const active = activeTabId === tab.id
        return (
          <div
            key={tab.id}
            className={cn(
              'group flex h-7 max-w-[200px] shrink-0 cursor-pointer items-center gap-1 border-r border-border px-2 text-[11px] transition-colors',
              active
                ? 'border-b-2 border-b-primary bg-background font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/40'
            )}
            onClick={() => setActiveTab(tab.id)}
            onAuxClick={(e) => {
              // Middle-click closes, like browser tabs
              if (e.button === 1) {
                e.preventDefault()
                closeTab(tab.id)
              }
            }}
            title={tab.database ? `${tab.database}${tab.schema && tab.schema !== tab.database ? `.${tab.schema}` : ''} · ${tab.title}` : tab.title}
          >
            {Icon && <Icon className="h-3 w-3 shrink-0 opacity-70" />}
            <span className="truncate">{tab.title}</span>
            {tab.dirty && <span className="text-amber-500">●</span>}
            <button
              type="button"
              className="ml-auto rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="flex h-7 shrink-0 items-center gap-1 px-2 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
        disabled={!activeConnectionId}
        title="New query tab"
        onClick={() =>
          activeConnectionId &&
          openQueryTab(activeConnectionId, '', documentConnectionIds.has(activeConnectionId) ? 'Shell' : 'Query')
        }
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
