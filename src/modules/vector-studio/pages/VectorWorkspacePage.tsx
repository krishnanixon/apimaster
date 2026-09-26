import { useEffect, useRef, useState } from 'react'
import { Boxes, PanelLeft, Plus, Search, Settings2, Upload } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { cn } from '@/shared/lib/utils'
import { useScopeContext } from '@/core/scope/useScopeContext'
import { useVectorWorkspaceStore } from '../stores/vectorWorkspace.store'
import { VectorExplorerPanel } from '../components/explorer/VectorExplorerPanel'
import { VectorTabBar } from '../components/tabs/VectorTabBar'
import { CollectionTabView } from '../components/tabs/CollectionTabView'
import { SearchTabView } from '../components/tabs/SearchTabView'
import { UpsertTabView } from '../components/tabs/UpsertTabView'
import { StatsTabView } from '../components/tabs/StatsTabView'
import { VectorConnectionManagerDialog } from '../components/connections/VectorConnectionManagerDialog'
import { VectorWorkspaceSettingsDialog } from '../components/settings/VectorWorkspaceSettingsDialog'

function PanelToggle({
  active,
  onClick,
  title,
  children
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8', active && 'bg-primary/10 text-primary')}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  )
}

function TabContent() {
  const tabs = useVectorWorkspaceStore((s) => s.tabs)
  const activeTabId = useVectorWorkspaceStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)

  if (!tab) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyState
          icon={<Boxes className="h-5 w-5" />}
          title="Vector Studio"
          description="Connect to LiteChroma, browse collections, upsert documents or embeddings, and run text or vector similarity search."
        />
      </div>
    )
  }

  if (tab.type === 'collection' && tab.collection) {
    return <CollectionTabView connectionId={tab.connectionId} collection={tab.collection} />
  }
  if (tab.type === 'search') {
    return <SearchTabView tabId={tab.id} connectionId={tab.connectionId} />
  }
  if (tab.type === 'upsert') {
    return <UpsertTabView tabId={tab.id} connectionId={tab.connectionId} />
  }
  if (tab.type === 'stats') {
    return <StatsTabView connectionId={tab.connectionId} />
  }

  return (
    <div className="flex h-full items-center justify-center text-caption text-muted-foreground">
      Unsupported tab
    </div>
  )
}

export function VectorWorkspacePage() {
  const { scope, projectId } = useScopeContext()
  const setScope = useVectorWorkspaceStore((s) => s.setScope)
  const loadConnections = useVectorWorkspaceStore((s) => s.loadConnections)
  const loadSettings = useVectorWorkspaceStore((s) => s.loadSettings)
  const activeConnectionId = useVectorWorkspaceStore((s) => s.activeConnectionId)
  const connections = useVectorWorkspaceStore((s) => s.connections)
  const connect = useVectorWorkspaceStore((s) => s.connect)
  const refreshExplorer = useVectorWorkspaceStore((s) => s.refreshExplorer)
  const explorerPanelOpen = useVectorWorkspaceStore((s) => s.explorerPanelOpen)
  const toggleExplorerPanel = useVectorWorkspaceStore((s) => s.toggleExplorerPanel)
  const connectionManagerOpen = useVectorWorkspaceStore((s) => s.connectionManagerOpen)
  const setConnectionManagerOpen = useVectorWorkspaceStore((s) => s.setConnectionManagerOpen)
  const openSearchTab = useVectorWorkspaceStore((s) => s.openSearchTab)
  const openUpsertTab = useVectorWorkspaceStore((s) => s.openUpsertTab)
  const openStatsTab = useVectorWorkspaceStore((s) => s.openStatsTab)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const bootedRef = useRef(false)

  useEffect(() => {
    setScope(scope, projectId)
  }, [scope, projectId, setScope])

  useEffect(() => {
    void (async () => {
      await loadSettings()
      await loadConnections()
      if (!bootedRef.current) {
        bootedRef.current = true
        const id = useVectorWorkspaceStore.getState().activeConnectionId
        const list = useVectorWorkspaceStore.getState().connections
        if (id && list.some((c) => c.id === id)) {
          await connect(id)
        }
      }
    })()
  }, [loadSettings, loadConnections, connect, scope, projectId])

  useEffect(() => {
    void loadConnections()
  }, [scope, projectId, loadConnections])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <Boxes className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Vector Studio</span>
        <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          {scope === 'PROJECT' ? 'Project' : 'Global'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <PanelToggle
            active={explorerPanelOpen}
            onClick={() => toggleExplorerPanel()}
            title="Toggle explorer"
          >
            <PanelLeft className="h-4 w-4" />
          </PanelToggle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!activeConnectionId}
            onClick={() => activeConnectionId && openSearchTab(activeConnectionId)}
          >
            <Search className="h-3.5 w-3.5" /> Search
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!activeConnectionId}
            onClick={() => activeConnectionId && openUpsertTab(activeConnectionId)}
          >
            <Upload className="h-3.5 w-3.5" /> Upsert
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!activeConnectionId}
            onClick={() => {
              if (activeConnectionId) {
                openStatsTab(activeConnectionId)
                void refreshExplorer(activeConnectionId)
              }
            }}
          >
            Stats
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setConnectionManagerOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Connection
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {explorerPanelOpen && (
          <div className="w-[min(280px,28vw)] shrink-0">
            <VectorExplorerPanel />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <VectorTabBar />
          <div className="min-h-0 flex-1">
            <TabContent />
          </div>
          {!activeConnectionId && connections.length === 0 && (
            <div className="pointer-events-none absolute inset-0" aria-hidden />
          )}
        </div>
      </div>

      <VectorConnectionManagerDialog
        open={connectionManagerOpen}
        onOpenChange={setConnectionManagerOpen}
      />
      <VectorWorkspaceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
