import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import {
  Database,
  Plus,
  Settings2,
  GitBranch,
  PanelLeft,
  PanelBottom,
  Sparkles,
  FileCode2,
  Plug,
  Braces
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { cn } from '@/shared/lib/utils'
import { useScopeContext } from '@/core/scope/useScopeContext'
import { useDbWorkspaceStore } from '../stores/dbWorkspace.store'
import { DbExplorerPanel } from '../components/explorer/DbExplorerPanel'
import { DbTabBar } from '../components/tabs/DbTabBar'
import { TableTabView } from '../components/tabs/TableTabView'
import { SqlQueryEditor } from '../components/query/SqlQueryEditor'
import { ErDiagramTabView } from '../components/tabs/ErDiagramTabView'
import { DbAiAssistantPanel } from '../components/ai/DbAiAssistantPanel'
import { DbBottomPanel } from '../components/bottom/DbBottomPanel'
import { ConnectionManagerDialog } from '../components/connections/ConnectionManagerDialog'
import { DbWorkspaceSettingsDialog } from '../components/settings/DbWorkspaceSettingsDialog'
import { CollectionTabView } from '../components/documents/CollectionTabView'
import { ProviderBadge } from '../components/connections/ConnectionManagerPanel'
import { describeConnectionTarget, useConnectionMeta } from '../lib/providers'
import { DB_PROVIDER_KIND_LABELS, getProviderMeta, isDocumentProvider } from '@shared/types/database-workspace'

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
      className={cn('h-7 w-7', active && 'bg-muted text-foreground')}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  )
}

/** Landing view when no tab is open — adapts to whether a connection exists / is active. */
function WorkbenchHome() {
  const connections = useDbWorkspaceStore((s) => s.connections)
  const activeConnectionId = useDbWorkspaceStore((s) => s.activeConnectionId)
  const activeDatabase = useDbWorkspaceStore((s) => s.activeDatabase)
  const connect = useDbWorkspaceStore((s) => s.connect)
  const openQueryTab = useDbWorkspaceStore((s) => s.openQueryTab)
  const setConnectionManagerOpen = useDbWorkspaceStore((s) => s.setConnectionManagerOpen)
  const { connection, meta, isDocument, terms } = useConnectionMeta()

  if (connections.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold">Connect your first database</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            PostgreSQL, MySQL, MariaDB, SQL Server, CockroachDB, SQLite and MongoDB — with SSL and SSH tunnelling.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setConnectionManagerOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New connection
          </Button>
        </div>
      </div>
    )
  }

  if (!activeConnectionId || !connection) {
    const recent = [...connections]
      .sort(
        (a, b) =>
          Number(b.isFavorite) - Number(a.isFavorite) ||
          (b.lastConnectedAt ?? '').localeCompare(a.lastConnectedAt ?? '') ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 8)
    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto p-6">
        <div className="w-full max-w-lg">
          <h3 className="text-sm font-semibold">Open a connection</h3>
          <p className="mb-3 text-xs text-muted-foreground">Pick a saved connection to start browsing.</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {recent.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                onClick={() => void connect(c.id)}
              >
                <ProviderBadge provider={c.provider} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{c.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{describeConnectionTarget(c)}</span>
                </span>
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-3 text-xs" onClick={() => setConnectionManagerOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New connection
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <ProviderBadge provider={connection.provider} className="mx-auto mb-3 h-10 w-10 rounded-xl text-sm" />
        <h3 className="text-sm font-semibold">
          {connection.name}
          {activeDatabase ? <span className="font-normal text-muted-foreground"> / {activeDatabase}</span> : null}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {meta.label} · {DB_PROVIDER_KIND_LABELS[meta.kind]}. Select a {terms.table} in the explorer, or start a{' '}
          {isDocument ? 'shell session' : 'query'}.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" onClick={() => openQueryTab(connection.id, '', isDocument ? 'Shell' : 'Query')}>
            {isDocument ? <Braces className="mr-1 h-3.5 w-3.5" /> : <FileCode2 className="mr-1 h-3.5 w-3.5" />}
            New {terms.queryEditor.toLowerCase()}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TabContent() {
  const tabs = useDbWorkspaceStore((s) => s.tabs)
  const activeTabId = useDbWorkspaceStore((s) => s.activeTabId)
  const connections = useDbWorkspaceStore((s) => s.connections)
  const tab = tabs.find((t) => t.id === activeTabId)

  if (!tab) return <WorkbenchHome />

  const tabIsDocument = isDocumentProvider(connections.find((c) => c.id === tab.connectionId)?.provider)

  if (tab.type === 'table' && tab.table && tab.database && tab.schema && tabIsDocument) {
    return (
      <div className="h-full w-full min-h-0 min-w-0">
        <CollectionTabView
          key={tab.id}
          tabId={tab.id}
          connectionId={tab.connectionId}
          database={tab.database}
          schema={tab.schema}
          table={tab.table}
        />
      </div>
    )
  }

  if (tab.type === 'table' && tab.table && tab.database && tab.schema) {
    return (
      <div className="h-full w-full min-h-0 min-w-0">
        <TableTabView
          tabId={tab.id}
          connectionId={tab.connectionId}
          database={tab.database}
          schema={tab.schema}
          table={tab.table}
        />
      </div>
    )
  }

  if (tab.type === 'query') {
    return (
      <div className="h-full w-full min-h-0 min-w-0">
        <SqlQueryEditor tabId={tab.id} connectionId={tab.connectionId} initialSql={tab.sql} />
      </div>
    )
  }

  if (tab.type === 'er-diagram' && tab.database && tab.schema) {
    return (
      <div className="h-full w-full min-h-0 min-w-0">
        <ErDiagramTabView connectionId={tab.connectionId} database={tab.database} schema={tab.schema} />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <EmptyState
        icon={<Database className="h-5 w-5" />}
        title="Unsupported tab"
        description="Close this tab and open a table, query, or ER diagram."
      />
    </div>
  )
}

export function DatabaseWorkspacePage() {
  const scopeContext = useScopeContext()
  const setScope = useDbWorkspaceStore((s) => s.setScope)
  const loadSettings = useDbWorkspaceStore((s) => s.loadSettings)
  const loadConnections = useDbWorkspaceStore((s) => s.loadConnections)
  const loadQueryHistory = useDbWorkspaceStore((s) => s.loadQueryHistory)
  const connect = useDbWorkspaceStore((s) => s.connect)
  const connectionManagerOpen = useDbWorkspaceStore((s) => s.connectionManagerOpen)
  const setConnectionManagerOpen = useDbWorkspaceStore((s) => s.setConnectionManagerOpen)
  const bottomPanelOpen = useDbWorkspaceStore((s) => s.bottomPanelOpen)
  const aiPanelOpen = useDbWorkspaceStore((s) => s.aiPanelOpen)
  const explorerPanelOpen = useDbWorkspaceStore((s) => s.explorerPanelOpen)
  const toggleBottomPanel = useDbWorkspaceStore((s) => s.toggleBottomPanel)
  const toggleAiPanel = useDbWorkspaceStore((s) => s.toggleAiPanel)
  const toggleExplorerPanel = useDbWorkspaceStore((s) => s.toggleExplorerPanel)
  const activeConnectionId = useDbWorkspaceStore((s) => s.activeConnectionId)
  const activeDatabase = useDbWorkspaceStore((s) => s.activeDatabase)
  const settings = useDbWorkspaceStore((s) => s.settings)
  const openErDiagramTab = useDbWorkspaceStore((s) => s.openErDiagramTab)
  const openQueryTab = useDbWorkspaceStore((s) => s.openQueryTab)
  const connections = useDbWorkspaceStore((s) => s.connections)
  const layoutSizes = useDbWorkspaceStore((s) => s.layoutSizes)
  const setLayoutSizes = useDbWorkspaceStore((s) => s.setLayoutSizes)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const activeConn = connections.find((c) => c.id === activeConnectionId)
  const activeMeta = getProviderMeta(activeConn?.provider)
  const connectStartedRef = useRef(false)

  useEffect(() => {
    connectStartedRef.current = false
    setReady(false)
    setScope(scopeContext.scope, scopeContext.projectId)
    void loadSettings()
    void loadQueryHistory()
    void loadConnections().finally(() => setReady(true))
  }, [scopeContext.scope, scopeContext.projectId, setScope, loadSettings, loadConnections, loadQueryHistory])

  useEffect(() => {
    if (!ready || connectStartedRef.current) return
    const { activeConnectionId: id, connections } = useDbWorkspaceStore.getState()
    if (!id) return
    if (!connections.some((c) => c.id === id)) {
      useDbWorkspaceStore.setState({
        activeConnectionId: null,
        explorerTree: [],
        availableDatabases: [],
        activeDatabase: null
      })
      return
    }
    connectStartedRef.current = true
    void connect(id)
  }, [ready, connect])

  const layoutKey = `${explorerPanelOpen ? 'e' : ''}${aiPanelOpen ? 'a' : ''}${bottomPanelOpen ? 'b' : ''}`

  if (!ready) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading Database Workbench…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10">
            <Database className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="shrink-0 text-xs font-semibold">Database Workbench</span>
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            {scopeContext.isProjectScoped ? 'Project' : 'Global'}
          </span>
          {activeConn && (
            <>
              <span className="mx-1 h-4 w-px shrink-0 bg-border" />
              <span className="flex min-w-0 items-center gap-1.5 rounded-md border border-border/70 px-1.5 py-0.5">
                <ProviderBadge provider={activeConn.provider} className="h-4 w-4 rounded text-[8px]" />
                <span className="truncate text-[11px] font-medium">{activeConn.name}</span>
                {activeDatabase && <span className="truncate text-[11px] text-muted-foreground">/ {activeDatabase}</span>}
                {activeMeta.kind === 'document' && (
                  <span className="shrink-0 rounded bg-emerald-500/10 px-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    NoSQL
                  </span>
                )}
                {activeConn.config.readonly && (
                  <span className="shrink-0 rounded bg-amber-500/10 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Read-only
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <PanelToggle
            active={explorerPanelOpen}
            onClick={() => toggleExplorerPanel()}
            title={explorerPanelOpen ? 'Hide explorer' : 'Show explorer'}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </PanelToggle>
          <PanelToggle
            active={bottomPanelOpen}
            onClick={() => toggleBottomPanel()}
            title={bottomPanelOpen ? 'Hide results panel' : 'Show results panel'}
          >
            <PanelBottom className="h-3.5 w-3.5" />
          </PanelToggle>
          <PanelToggle
            active={aiPanelOpen}
            onClick={() => toggleAiPanel()}
            title={aiPanelOpen ? 'Hide AI panel' : 'Show AI panel'}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </PanelToggle>

          <div className="mx-1 h-4 w-px bg-border" />

          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConnectionManagerOpen(true)}>
            <Plug className="h-3.5 w-3.5" /> Connections
          </Button>
          {activeConnectionId && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => openQueryTab(activeConnectionId, '', activeMeta.kind === 'document' ? 'Shell' : 'Query')}
              >
                {activeMeta.kind === 'document' ? <Braces className="h-3.5 w-3.5" /> : <FileCode2 className="h-3.5 w-3.5" />}
                {activeMeta.kind === 'document' ? 'Shell' : 'Query'}
              </Button>
              {activeMeta.supportsRelations && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  const conn = connections.find((c) => c.id === activeConnectionId)
                  if (conn) {
                    openErDiagramTab(
                      activeConnectionId,
                      activeDatabase ?? conn.config.database ?? 'main',
                      (conn.config.schema ?? conn.config.defaultSchema ?? settings.defaultSchema) || 'public'
                    )
                  }
                }}
              >
                <GitBranch className="h-3.5 w-3.5" /> ER
              </Button>
              )}
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSettingsOpen(true)} title="Workbench settings">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Group
        key={`v-${layoutKey}`}
        id="db-studio-vertical"
        orientation="vertical"
        className="min-h-0 w-full flex-1"
        defaultLayout={
          layoutSizes.vertical ??
          (bottomPanelOpen
            ? { 'db-studio-upper': 72, 'db-studio-bottom': 28 }
            : { 'db-studio-upper': 100 })
        }
        onLayoutChanged={(layout, meta) => {
          if (meta.isUserInteraction) setLayoutSizes('vertical', layout)
        }}
      >
        <Panel id="db-studio-upper" className="min-h-0 min-w-0" minSize="30%">
          <Group
            key={`h-${layoutKey}`}
            id="db-studio-horizontal"
            orientation="horizontal"
            className="h-full min-h-0 w-full"
            defaultLayout={
              layoutSizes.horizontal ??
              (explorerPanelOpen && aiPanelOpen
                ? { 'db-studio-explorer': 20, 'db-studio-main': 52, 'db-studio-ai': 28 }
                : explorerPanelOpen
                  ? { 'db-studio-explorer': 22, 'db-studio-main': 78 }
                  : aiPanelOpen
                    ? { 'db-studio-main': 72, 'db-studio-ai': 28 }
                    : { 'db-studio-main': 100 })
            }
            onLayoutChanged={(layout, meta) => {
              if (meta.isUserInteraction) setLayoutSizes('horizontal', layout)
            }}
          >
            {explorerPanelOpen && (
              <>
                <Panel
                  id="db-studio-explorer"
                  defaultSize="20%"
                  minSize="180px"
                  maxSize="40%"
                  className="min-w-0"
                >
                  <div className="flex h-full min-w-0 flex-col overflow-hidden border-r border-border bg-muted/10">
                    <DbExplorerPanel />
                  </div>
                </Panel>
                <Separator className="w-1 shrink-0 bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50" />
              </>
            )}

            <Panel id="db-studio-main" className="min-w-0" minSize="280px">
              <div className="flex h-full min-w-0 flex-col overflow-hidden">
                <DbTabBar />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <TabContent />
                </div>
              </div>
            </Panel>

            {aiPanelOpen && (
              <>
                <Separator className="w-1 shrink-0 bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50" />
                <Panel
                  id="db-studio-ai"
                  defaultSize="28%"
                  minSize="260px"
                  maxSize="45%"
                  className="min-w-0"
                >
                  <div className="flex h-full min-w-0 flex-col overflow-hidden border-l border-border bg-background">
                    <DbAiAssistantPanel />
                  </div>
                </Panel>
              </>
            )}
          </Group>
        </Panel>

        {bottomPanelOpen && (
          <>
            <Separator className="h-1 shrink-0 bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50" />
            <Panel
              id="db-studio-bottom"
              defaultSize="28%"
              minSize="140px"
              maxSize="55%"
              className="min-h-0"
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden border-t border-border bg-background">
                <DbBottomPanel />
              </div>
            </Panel>
          </>
        )}
      </Group>

      <ConnectionManagerDialog open={connectionManagerOpen} onOpenChange={setConnectionManagerOpen} />
      <DbWorkspaceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

/** @deprecated Use DatabaseWorkspacePage */
export { DatabaseWorkspacePage as DatabaseStudioPage }
