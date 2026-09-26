import { X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useVectorWorkspaceStore } from '../../stores/vectorWorkspace.store'

export function VectorTabBar() {
  const tabs = useVectorWorkspaceStore((s) => s.tabs)
  const activeTabId = useVectorWorkspaceStore((s) => s.activeTabId)
  const setActiveTab = useVectorWorkspaceStore((s) => s.setActiveTab)
  const closeTab = useVectorWorkspaceStore((s) => s.closeTab)

  if (tabs.length === 0) return null

  return (
    <div className="flex h-9 items-center gap-0.5 overflow-x-auto border-b border-border bg-muted/20 px-1">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            'group flex max-w-[200px] items-center gap-1 rounded-md px-2 py-1 text-xs',
            activeTabId === tab.id
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:bg-muted/50'
          )}
        >
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.title}
          </button>
          <button
            type="button"
            className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
            onClick={() => closeTab(tab.id)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
