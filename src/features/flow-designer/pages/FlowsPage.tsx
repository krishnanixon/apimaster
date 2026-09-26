import { useEffect, useMemo, useState, useCallback, type MouseEvent, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus,
  GitBranch,
  Copy,
  Trash2,
  Pin,
  Sparkles,
  Search,
  Boxes,
  Database,
  Map,
  ListChecks,
  Network,
  Workflow,
  MoreHorizontal,
  ChevronDown,
  X,
  ExternalLink,
  ArrowUpRight
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useFlowStore } from '../stores/flow.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { ViewToggle, type ViewMode } from '@/shared/components/ui/view-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { FLOW_TEMPLATES, templateToPayload } from '../lib/templates'
import { FlowThumbnail, MiniFlowPreview } from '../components/FlowThumbnail'
import { ModulePage, ModuleTab, ModuleToolbar, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { formatRelativeTime, cn } from '@/shared/lib/utils'
import { toast } from 'sonner'
import type { FlowCategory, FlowDiagram } from '@shared/types'

const CATEGORY_LABELS: Record<FlowCategory, string> = {
  process: 'Process',
  architecture: 'Architecture',
  api: 'API',
  database: 'Database',
  uml: 'UML',
  bpmn: 'BPMN',
  journey: 'Journey',
  requirements: 'Reqs'
}

const CATEGORY_ICONS: Record<FlowCategory, LucideIcon> = {
  process: GitBranch,
  architecture: Boxes,
  api: Network,
  database: Database,
  uml: Workflow,
  bpmn: Workflow,
  journey: Map,
  requirements: ListChecks
}

const CATEGORY_ACCENT: Record<FlowCategory, { icon: string; soft: string; ring: string }> = {
  process: { icon: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-500/10', ring: 'ring-violet-500/20' },
  architecture: { icon: 'text-blue-600 dark:text-blue-400', soft: 'bg-blue-500/10', ring: 'ring-blue-500/20' },
  api: { icon: 'text-cyan-600 dark:text-cyan-400', soft: 'bg-cyan-500/10', ring: 'ring-cyan-500/20' },
  database: { icon: 'text-teal-600 dark:text-teal-400', soft: 'bg-teal-500/10', ring: 'ring-teal-500/20' },
  uml: { icon: 'text-fuchsia-600 dark:text-fuchsia-400', soft: 'bg-fuchsia-500/10', ring: 'ring-fuchsia-500/20' },
  bpmn: { icon: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
  journey: { icon: 'text-rose-600 dark:text-rose-400', soft: 'bg-rose-500/10', ring: 'ring-rose-500/20' },
  requirements: { icon: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' }
}

const ALL_CATEGORIES: (FlowCategory | 'all')[] = [
  'all',
  'process',
  'architecture',
  'api',
  'database',
  'journey',
  'requirements'
]

const CREATE_CATEGORIES: FlowCategory[] = [
  'process',
  'architecture',
  'api',
  'database',
  'journey',
  'requirements'
]

function CategoryIcon({
  category,
  size = 'sm'
}: {
  category: FlowCategory
  size?: 'sm' | 'md'
}) {
  const Icon = CATEGORY_ICONS[category] ?? GitBranch
  const accent = CATEGORY_ACCENT[category] ?? CATEGORY_ACCENT.process
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md ring-1 ring-inset',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
        accent.soft,
        accent.ring
      )}
    >
      <Icon className={cn(size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5', accent.icon)} />
    </span>
  )
}

function CategoryTag({ category }: { category: FlowCategory }) {
  const accent = CATEGORY_ACCENT[category] ?? CATEGORY_ACCENT.process
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1 py-px text-[10px] font-medium ring-1 ring-inset',
        accent.soft,
        accent.icon,
        accent.ring
      )}
    >
      {CATEGORY_LABELS[category]}
    </span>
  )
}

function getNodeCount(flow: FlowDiagram): number {
  try {
    return (JSON.parse(flow.nodes || '[]') as unknown[]).length
  } catch {
    return 0
  }
}

export function FlowsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const { flows, isLoading, loadFlows, createFlow, deleteFlow, duplicateFlow, updateFlow } =
    useFlowStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<FlowCategory | 'all'>('all')
  const [view, setView] = useState<ViewMode>('grid')
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'diagrams' | 'templates'>('diagrams')

  useEffect(() => {
    if (projectId) loadFlows(projectId)
  }, [projectId, loadFlows])

  const query = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    return flows.filter((f) => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
      if (!query) return true
      return f.title.toLowerCase().includes(query) || f.description.toLowerCase().includes(query)
    })
  }, [flows, categoryFilter, query])

  const filteredTemplates = useMemo(() => {
    return FLOW_TEMPLATES.filter((t) => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      if (!query) return true
      return t.title.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)
    })
  }, [categoryFilter, query])

  const pinned = filtered.filter((f) => f.isPinned)
  const rest = filtered.filter((f) => !f.isPinned)
  const isFiltered = Boolean(query || categoryFilter !== 'all')

  const handleCreate = async (category: FlowCategory = 'process') => {
    if (!projectId || creating) return
    setCreating(true)
    toast.message('Opening flow…')
    try {
      const flow = await createFlow({ projectId, title: 'Untitled Flow', category })
      if (flow) navigate(`/project/${projectId}/flows/${flow.id}`)
    } finally {
      setCreating(false)
    }
  }

  const handleCreateFromTemplate = async (templateId: string) => {
    if (!projectId || creating) return
    const template = FLOW_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    setCreating(true)
    toast.message(`Creating “${template.title}”…`)
    try {
      const { nodes, edges } = templateToPayload(template)
      const flow = await createFlow({
        projectId,
        title: template.title,
        description: template.description,
        category: template.category,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges)
      })
      if (flow) navigate(`/project/${projectId}/flows/${flow.id}`)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (flow: FlowDiagram) => {
    if (!confirm(`Delete "${flow.title}"?`)) return
    await deleteFlow(flow.id)
  }

  if (!projectId) return null

  return (
    <ModulePage>
      <PageHeader
        title="Flow Designer"
        description={
          currentProject?.name
            ? `${currentProject.name} · diagrams for this project`
            : 'Process and architecture diagrams'
        }
        fluid
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-7 gap-1.5" disabled={creating}>
                <Plus className="h-3.5 w-3.5" />
                {creating ? 'Creating…' : 'New Flow'}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => void handleCreate('process')}>
                <GitBranch className="mr-2 h-3.5 w-3.5" />
                Blank flow
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {CREATE_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat]
                return (
                  <DropdownMenuItem key={cat} onClick={() => void handleCreate(cat)}>
                    <Icon className="mr-2 h-3.5 w-3.5" />
                    {CATEGORY_LABELS[cat]}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <ModuleToolbar>
        <ModuleTab active={tab === 'diagrams'} onClick={() => setTab('diagrams')} count={flows.length}>
          Diagrams
        </ModuleTab>
        <ModuleTab active={tab === 'templates'} onClick={() => setTab('templates')}>
          Templates
        </ModuleTab>

        <div className="relative min-w-[140px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={tab === 'templates' ? 'Search templates…' : 'Search diagrams…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 pr-7 text-xs shadow-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="hidden max-w-[52%] items-center gap-0.5 overflow-x-auto md:flex">
          {ALL_CATEGORIES.map((cat) => {
            const Icon = cat === 'all' ? Sparkles : CATEGORY_ICONS[cat]
            return (
              <ModuleTab
                key={cat}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
              >
                <Icon className="h-3 w-3" />
                {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
              </ModuleTab>
            )
          })}
        </div>

        {tab === 'diagrams' && <ViewToggle value={view} onChange={setView} className="rounded-md p-px" />}
      </ModuleToolbar>

      <PageContent fluid>
        {tab === 'templates' ? (
          filteredTemplates.length === 0 ? (
            <EmptyPanel
              title="No templates match"
              detail="Try a different search or category."
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={creating}
                  onClick={() => void handleCreateFromTemplate(t.id)}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-foreground/15 hover:bg-accent/30"
                >
                  <div className="relative h-16 border-b border-border/60">
                    <MiniFlowPreview
                      nodes={t.nodes}
                      edges={t.edges}
                      className="h-full rounded-none border-0"
                    />
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium opacity-0 shadow-sm group-hover:opacity-100">
                      <Plus className="h-3 w-3" />
                      Use
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <CategoryIcon category={t.category} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{t.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t.description}</p>
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {t.nodes.length}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyPanel
            title={isFiltered ? 'No diagrams match' : 'No diagrams yet'}
            detail={
              isFiltered
                ? 'Try a different search or category.'
                : 'Create a blank flow or start from a template.'
            }
            action={
              isFiltered ? undefined : (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" className="h-7" disabled={creating} onClick={() => void handleCreate()}>
                    <Plus className="h-3.5 w-3.5" />
                    New flow
                  </Button>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setTab('templates')}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Templates
                  </Button>
                </div>
              )
            }
          >
            {!isFiltered && (
              <div className="mt-4 grid w-full max-w-2xl gap-1.5 sm:grid-cols-3">
                {FLOW_TEMPLATES.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={creating}
                    onClick={() => void handleCreateFromTemplate(t.id)}
                    className="rounded-md border border-border bg-card px-2.5 py-2 text-left hover:border-foreground/15 hover:bg-accent/40"
                  >
                    <p className="truncate text-xs font-medium">{t.title}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{CATEGORY_LABELS[t.category]}</p>
                  </button>
                ))}
              </div>
            )}
          </EmptyPanel>
        ) : view === 'grid' ? (
          <div className="space-y-4">
            {pinned.length > 0 && (
              <FlowGrid
                flows={pinned}
                title="Pinned"
                onNavigate={(id) => navigate(`/project/${projectId}/flows/${id}`)}
                onDuplicate={duplicateFlow}
                onTogglePin={(id, isPinned) => updateFlow(id, { isPinned: !isPinned })}
                onDelete={handleDelete}
              />
            )}
            {rest.length > 0 && (
              <FlowGrid
                flows={rest}
                title={pinned.length > 0 ? 'All' : undefined}
                onNavigate={(id) => navigate(`/project/${projectId}/flows/${id}`)}
                onDuplicate={duplicateFlow}
                onTogglePin={(id, isPinned) => updateFlow(id, { isPinned: !isPinned })}
                onDelete={handleDelete}
              />
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {filtered.map((flow) => (
              <FlowListRow
                key={flow.id}
                flow={flow}
                onOpen={() => navigate(`/project/${projectId}/flows/${flow.id}`)}
                onDuplicate={() => duplicateFlow(flow.id)}
                onTogglePin={() => updateFlow(flow.id, { isPinned: !flow.isPinned })}
                onDelete={() => handleDelete(flow)}
              />
            ))}
          </div>
        )}
      </PageContent>
    </ModulePage>
  )
}

function EmptyPanel({
  title,
  detail,
  action,
  children
}: {
  title: string
  detail: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <GitBranch className="h-4 w-4" />
      </span>
      <p className="mt-2.5 text-sm font-medium">{title}</p>
      <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">{detail}</p>
      {action && <div className="mt-3">{action}</div>}
      {children}
    </div>
  )
}

function FlowGrid({
  flows,
  title,
  onNavigate,
  onDuplicate,
  onTogglePin,
  onDelete
}: {
  flows: FlowDiagram[]
  title?: string
  onNavigate: (id: string) => void
  onDuplicate: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  onDelete: (flow: FlowDiagram) => void
}) {
  return (
    <div>
      {title && <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {flows.map((flow) => (
          <FlowCard
            key={flow.id}
            flow={flow}
            onOpen={() => onNavigate(flow.id)}
            onDuplicate={() => onDuplicate(flow.id)}
            onTogglePin={() => onTogglePin(flow.id, flow.isPinned)}
            onDelete={() => onDelete(flow)}
          />
        ))}
      </div>
    </div>
  )
}

function FlowCard({
  flow,
  onOpen,
  onDuplicate,
  onTogglePin,
  onDelete
}: {
  flow: FlowDiagram
  onOpen: () => void
  onDuplicate: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const nodeCount = getNodeCount(flow)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <>
      <div
        className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/15 hover:bg-accent/20"
        onContextMenu={handleContextMenu}
      >
        <button type="button" onClick={onOpen} className="flex w-full flex-col text-left">
          <div className="relative">
            <FlowThumbnail flow={flow} className="h-20 rounded-none border-x-0 border-t-0" />
            {flow.isPinned && (
              <span className="absolute left-1.5 top-1.5 rounded bg-background/90 p-0.5 shadow-sm">
                <Pin className="h-3 w-3 fill-current" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2">
            <CategoryIcon category={flow.category} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{flow.title}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <CategoryTag category={flow.category} />
                <span className="truncate text-[10px] text-muted-foreground">
                  {nodeCount} · {formatRelativeTime(flow.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-6 w-6 bg-background/90 opacity-0 shadow-sm group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onOpen}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              <Pin className="h-3.5 w-3.5" />
              {flow.isPinned ? 'Unpin' : 'Pin'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {menu && (
        <FlowListContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
          isPinned={flow.isPinned}
        />
      )}
    </>
  )
}

function FlowListRow({
  flow,
  onOpen,
  onDuplicate,
  onTogglePin,
  onDelete
}: {
  flow: FlowDiagram
  onOpen: () => void
  onDuplicate: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const nodeCount = getNodeCount(flow)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  return (
    <>
      <div
        className="group flex items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-b-0 hover:bg-accent/40"
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <CategoryIcon category={flow.category} />
          <p className="min-w-0 flex-1 truncate text-xs font-medium">{flow.title}</p>
          {flow.isPinned && <Pin className="h-3 w-3 shrink-0 fill-current text-muted-foreground" />}
          <CategoryTag category={flow.category} />
          <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
            {nodeCount} nodes · {formatRelativeTime(flow.updatedAt)}
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onOpen}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              <Pin className="h-3.5 w-3.5" />
              {flow.isPinned ? 'Unpin' : 'Pin'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {menu && (
        <FlowListContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
          isPinned={flow.isPinned}
        />
      )}
    </>
  )
}

function FlowListContextMenu({
  x,
  y,
  onClose,
  onOpen,
  onDuplicate,
  onTogglePin,
  onDelete,
  isPinned
}: {
  x: number
  y: number
  onClose: () => void
  onOpen: () => void
  onDuplicate: () => void
  onTogglePin: () => void
  onDelete: () => void
  isPinned: boolean
}) {
  const run = (action: () => void) => {
    action()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-[101] min-w-[9rem] overflow-hidden rounded-lg border border-border bg-popover p-0.5 text-popover-foreground shadow-md"
        style={{ left: x, top: y }}
      >
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent" onClick={() => run(onOpen)}>
          <ExternalLink className="h-3.5 w-3.5 opacity-70" /> Open
        </button>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent" onClick={() => run(onDuplicate)}>
          <Copy className="h-3.5 w-3.5 opacity-70" /> Duplicate
        </button>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent" onClick={() => run(onTogglePin)}>
          <Pin className="h-3.5 w-3.5 opacity-70" /> {isPinned ? 'Unpin' : 'Pin'}
        </button>
        <div className="-mx-0.5 my-0.5 h-px bg-border" />
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10" onClick={() => run(onDelete)}>
          <Trash2 className="h-3.5 w-3.5 opacity-70" /> Delete
        </button>
      </div>
    </>
  )
}
