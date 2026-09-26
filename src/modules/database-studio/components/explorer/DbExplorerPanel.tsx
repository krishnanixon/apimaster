import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Database,
  Table2,
  Eye,
  Key,
  Layers,
  FolderOpen,
  RefreshCw,
  Copy,
  FileCode2,
  GitBranch,
  Sparkles,
  Rows3,
  Braces,
  Search,
  X,
  Plus
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { DbExplorerNode } from '@shared/types/database-workspace'
import { buildBrowseQuery, getProviderMeta } from '@shared/types/database-workspace'
import { useConnectionMeta } from '../../lib/providers'
import { ProviderBadge } from '../connections/ConnectionManagerPanel'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'
import { Spinner } from '@/shared/components/ui/spinner'
import { toast } from 'sonner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/shared/components/ui/context-menu'

const ICONS: Partial<Record<DbExplorerNode['type'], typeof Database>> = {
  connection: Database,
  database: Database,
  schema: Layers,
  table: Table2,
  view: Eye,
  index: Key,
  materializedView: Eye,
  collection: Braces
}

/** Keep nodes whose name matches, plus the folders that contain them. */
function filterTree(nodes: DbExplorerNode[], q: string): DbExplorerNode[] {
  if (!q) return nodes
  const out: DbExplorerNode[] = []
  for (const node of nodes) {
    const children = node.children ? filterTree(node.children, q) : undefined
    if (node.name.toLowerCase().includes(q) && node.type !== 'schema' && node.type !== 'connection') {
      out.push(node)
    } else if (children?.length) {
      out.push({ ...node, children })
    }
  }
  return out
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text)
  toast.success('Copied to clipboard')
}

function ExplorerNodeItem({ node, depth = 0, forceOpen = false }: { node: DbExplorerNode; depth?: number; forceOpen?: boolean }) {
  const [openState, setOpen] = useState(depth < 2)
  const open = forceOpen || openState
  const openTableTab = useDbWorkspaceStore((s) => s.openTableTab)
  const openQueryTab = useDbWorkspaceStore((s) => s.openQueryTab)
  const openErDiagramTab = useDbWorkspaceStore((s) => s.openErDiagramTab)
  const selectDatabase = useDbWorkspaceStore((s) => s.selectDatabase)
  const refreshExplorer = useDbWorkspaceStore((s) => s.refreshExplorer)
  const runAi = useDbWorkspaceStore((s) => s.runAi)
  const selectedExplorerNodeId = useDbWorkspaceStore((s) => s.selectedExplorerNodeId)
  const setSelectedExplorerNode = useDbWorkspaceStore((s) => s.setSelectedExplorerNode)
  const activeDatabase = useDbWorkspaceStore((s) => s.activeDatabase)
  const settings = useDbWorkspaceStore((s) => s.settings)
  const connections = useDbWorkspaceStore((s) => s.connections)

  const hasChildren = Boolean(node.children?.length)
  const Icon = ICONS[node.type] ?? FolderOpen
  const isObject = node.type === 'table' || node.type === 'view' || node.type === 'collection' || node.type === 'materializedView'
  const selected = selectedExplorerNodeId === node.id
  const conn = connections.find((c) => c.id === node.connectionId)
  const providerMeta = getProviderMeta(conn?.provider)
  const isDocument = providerMeta.kind === 'document'
  const database = node.database ?? activeDatabase ?? conn?.config.database ?? ''
  const schema =
    node.schema ??
    conn?.config.schema ??
    conn?.config.defaultSchema ??
    settings.defaultSchema ??
    'public'

  const openData = () => {
    if (node.table && database && schema) {
      openTableTab(node.connectionId, database, schema, node.table)
    }
  }

  const openSelectQuery = (limit = 1000) => {
    if (!node.table) return
    openQueryTab(
      node.connectionId,
      buildBrowseQuery(conn?.provider, node.table, { schema, limit }),
      `${node.table} — ${isDocument ? 'shell' : `top ${limit}`}`
    )
  }

  const handleClick = () => {
    setSelectedExplorerNode(node.id)
    if (node.type === 'database' && node.database) {
      void selectDatabase(node.connectionId, node.database)
      return
    }
    if (hasChildren) {
      setOpen((o) => !o)
      return
    }
    if (isObject && node.table && database && schema) {
      openTableTab(node.connectionId, database, schema, node.table)
    }
  }

  const row = (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] transition-colors',
        selected
          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
          : 'hover:bg-muted/60',
        (isObject || node.type === 'database') && 'cursor-pointer',
        node.type === 'schema' && 'font-medium text-muted-foreground'
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={handleClick}
    >
      {hasChildren ? (
        open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <Icon className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
      <span className="truncate">{node.name}</span>
      {node.type === 'schema' && node.children && (
        <span className="ml-auto pr-1 text-[10px] tabular-nums text-muted-foreground/70">{node.children.length}</span>
      )}
    </button>
  )

  const isTableOrView = isObject && node.table && database

  return (
    <div>
      {isTableOrView ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuItem onSelect={openData}>
              {isDocument ? <Braces className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
              {isDocument ? 'Open documents' : 'Open data'}
            </ContextMenuItem>
            {isDocument ? (
              <ContextMenuItem onSelect={() => openSelectQuery(50)}>
                <FileCode2 className="h-3.5 w-3.5" /> Open in shell
              </ContextMenuItem>
            ) : (
              <>
                <ContextMenuItem onSelect={() => openSelectQuery(1000)}>
                  <FileCode2 className="h-3.5 w-3.5" /> Select top 1000
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => openSelectQuery(100)}>
                  <FileCode2 className="h-3.5 w-3.5" /> Select top 100
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => copyText(node.table!)}>
              <Copy className="h-3.5 w-3.5" /> Copy name
            </ContextMenuItem>
            {providerMeta.supportsRelations && (
              <ContextMenuItem onSelect={() => openErDiagramTab(node.connectionId, database, schema)}>
                <GitBranch className="h-3.5 w-3.5" /> ER diagram
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() =>
                void runAi(node.connectionId, 'explain_table', {
                  table: node.table,
                  database,
                  schema
                })
              }
            >
              <Sparkles className="h-3.5 w-3.5" /> AI explain {isDocument ? 'collection' : 'table'}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                void runAi(node.connectionId, 'generate_documentation', {
                  table: node.table,
                  database,
                  schema
                })
              }
            >
              <Sparkles className="h-3.5 w-3.5" /> Generate docs
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : node.type === 'database' && node.database ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onSelect={() => void selectDatabase(node.connectionId, node.database!)}>
              <Database className="h-3.5 w-3.5" /> Set active database
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void refreshExplorer(node.connectionId, node.database)}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => copyText(node.database!)}>
              <Copy className="h-3.5 w-3.5" /> Copy name
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        row
      )}
      {open &&
        node.children?.map((child) => (
          <ExplorerNodeItem key={child.id} node={child} depth={depth + 1} forceOpen={forceOpen} />
        ))}
    </div>
  )
}

export function DbExplorerPanel() {
  const explorerTree = useDbWorkspaceStore((s) => s.explorerTree)
  const explorerLoading = useDbWorkspaceStore((s) => s.explorerLoading)
  const activeConnectionId = useDbWorkspaceStore((s) => s.activeConnectionId)
  const connections = useDbWorkspaceStore((s) => s.connections)
  const availableDatabases = useDbWorkspaceStore((s) => s.availableDatabases)
  const activeDatabase = useDbWorkspaceStore((s) => s.activeDatabase)
  const refreshExplorer = useDbWorkspaceStore((s) => s.refreshExplorer)
  const setActiveConnection = useDbWorkspaceStore((s) => s.setActiveConnection)
  const selectDatabase = useDbWorkspaceStore((s) => s.selectDatabase)
  const loadDatabases = useDbWorkspaceStore((s) => s.loadDatabases)
  const openQueryTab = useDbWorkspaceStore((s) => s.openQueryTab)
  const setConnectionManagerOpen = useDbWorkspaceStore((s) => s.setConnectionManagerOpen)
  const [filter, setFilter] = useState('')
  const { connection: activeConn, meta, isDocument, terms } = useConnectionMeta()

  const connectionHasDatabase = Boolean(activeConn?.config.database?.trim())
  // Document servers host many databases; relational connections pinned to one database hide the picker
  const showDatabasePicker =
    Boolean(activeConnectionId) && availableDatabases.length > 1 && (!connectionHasDatabase || isDocument)
  const q = filter.trim().toLowerCase()
  const visibleTree = useMemo(() => filterTree(explorerTree, q), [explorerTree, q])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border px-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Explorer</span>
        <button
          type="button"
          className="rounded p-1 hover:bg-muted"
          onClick={() => activeConnectionId && void refreshExplorer(activeConnectionId)}
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', explorerLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="space-y-1.5 border-b border-border p-1.5">
        <select
          className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] focus:ring-1 focus:ring-primary"
          value={activeConnectionId ?? ''}
          onChange={(e) => setActiveConnection(e.target.value || null)}
        >
          <option value="">Select connection…</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.isFavorite ? '★ ' : ''}{c.name} · {getProviderMeta(c.provider).label}
            </option>
          ))}
        </select>

        {showDatabasePicker && (
          <select
            className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] focus:ring-1 focus:ring-primary"
            value={activeDatabase ?? ''}
            onChange={(e) => {
              const db = e.target.value
              if (db) void selectDatabase(activeConnectionId!, db)
            }}
          >
            {availableDatabases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </select>
        )}

        {activeConn && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ProviderBadge provider={activeConn.provider} className="h-4 w-4 rounded text-[8px]" />
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                activeConn.health === 'healthy' ? 'bg-emerald-500' : activeConn.health === 'offline' ? 'bg-red-500' : 'bg-amber-500'
              )}
            />
            <span className="truncate">
              {meta.label}
              {activeConn.latencyMs != null && ` · ${activeConn.latencyMs}ms`}
              {activeDatabase && ` · ${activeDatabase}`}
            </span>
          </div>
        )}

        {activeConn && explorerTree.length > 0 && (
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${terms.tables}…`}
              className="w-full rounded border border-border bg-background py-1 pl-5 pr-5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {filter && (
              <button
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => setFilter('')}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-1">
        {explorerLoading && (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        )}
        {!explorerLoading && !activeConnectionId && (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center">
            <Database className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">
              {connections.length ? 'Select a connection to explore' : 'No connections yet'}
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
              onClick={() => setConnectionManagerOpen(true)}
            >
              <Plus className="h-3 w-3" /> New connection
            </button>
          </div>
        )}
        {!explorerLoading && activeConnectionId && explorerTree.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center">
            <Table2 className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">
              {isDocument
                ? 'No collections found in this database.'
                : connectionHasDatabase
                  ? 'No objects found. Check the database name in connection settings.'
                  : 'No objects found. Set a database on the connection in settings.'}
            </p>
          </div>
        )}
        {!explorerLoading && q && visibleTree.length === 0 && (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No {terms.tables} match “{filter}”</p>
        )}
        {!explorerLoading &&
          visibleTree.map((node) => <ExplorerNodeItem key={node.id} node={node} forceOpen={Boolean(q)} />)}
      </div>

      {activeConnectionId && (
        <div className="shrink-0 space-y-1 border-t border-border p-1.5">
          {!availableDatabases.length && !connectionHasDatabase && (
            <button
              type="button"
              className="w-full rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
              onClick={() => void loadDatabases(activeConnectionId)}
            >
              Load databases
            </button>
          )}
          <button
            type="button"
            className="w-full rounded bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/15"
            onClick={() => openQueryTab(activeConnectionId, '', terms.queryEditor)}
          >
            + New {terms.queryEditor}
          </button>
        </div>
      )}
    </div>
  )
}
