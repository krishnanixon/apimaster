import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Boxes,
  Brain,
  ChevronDown,
  Cloud,
  Copy,
  ExternalLink,
  Globe,
  Layers,
  MoreHorizontal,
  Network,
  Pin,
  Plus,
  Search,
  Server,
  Smartphone,
  Sparkles,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { ArchitectureDiagram } from '@shared/types'
import {
  ARCH_SYSTEM_TYPES,
  PRIMARY_ARCH_SYSTEM_TYPES,
  getComponentKindMeta
} from '@shared/lib/architecture-catalog'
import {
  createEmptyModel,
  getModelStats,
  parseModel,
  serializeModel
} from '@shared/lib/architecture-model'
import { useArchitectureStore } from '../stores/architecture.store'
import { ARCH_TEMPLATES, type ArchTemplate } from '../lib/templates'
import { useProjectStore } from '@/shared/stores/project.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { ViewToggle, type ViewMode } from '@/shared/components/ui/view-toggle'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { openModuleWindow } from '@/shared/lib/windows'
import {
  ModulePage,
  ModuleTab,
  ModuleToolbar,
  PageContent,
  PageHeader
} from '@/shared/components/layout/ModulePage'
import { cn, formatRelativeTime } from '@/shared/lib/utils'

type Tab = 'designs' | 'templates'
type SystemFilter = 'all' | string

const SYSTEM_ICONS: Record<string, LucideIcon> = {
  web: Globe,
  mobile: Smartphone,
  desktop: Layers,
  saas: Cloud,
  microservices: Server,
  monolith: Boxes,
  serverless: Zap,
  'rest-api': Network,
  graphql: Network,
  'event-driven': Zap,
  cloud: Cloud,
  ai: Brain,
  hybrid: Layers
}

const SYSTEM_ACCENT: Record<string, { icon: string; soft: string; ring: string; bar: string }> = {
  web: {
    icon: 'text-blue-600 dark:text-blue-400',
    soft: 'bg-blue-500/10',
    ring: 'ring-blue-500/20',
    bar: 'bg-blue-500/70'
  },
  mobile: {
    icon: 'text-violet-600 dark:text-violet-400',
    soft: 'bg-violet-500/10',
    ring: 'ring-violet-500/20',
    bar: 'bg-violet-500/70'
  },
  desktop: {
    icon: 'text-slate-600 dark:text-slate-300',
    soft: 'bg-slate-500/10',
    ring: 'ring-slate-500/20',
    bar: 'bg-slate-500/70'
  },
  saas: {
    icon: 'text-cyan-600 dark:text-cyan-400',
    soft: 'bg-cyan-500/10',
    ring: 'ring-cyan-500/20',
    bar: 'bg-cyan-500/70'
  },
  microservices: {
    icon: 'text-sky-600 dark:text-sky-400',
    soft: 'bg-sky-500/10',
    ring: 'ring-sky-500/20',
    bar: 'bg-sky-500/70'
  },
  monolith: {
    icon: 'text-amber-600 dark:text-amber-400',
    soft: 'bg-amber-500/10',
    ring: 'ring-amber-500/20',
    bar: 'bg-amber-500/70'
  },
  serverless: {
    icon: 'text-orange-600 dark:text-orange-400',
    soft: 'bg-orange-500/10',
    ring: 'ring-orange-500/20',
    bar: 'bg-orange-500/70'
  },
  'rest-api': {
    icon: 'text-teal-600 dark:text-teal-400',
    soft: 'bg-teal-500/10',
    ring: 'ring-teal-500/20',
    bar: 'bg-teal-500/70'
  },
  graphql: {
    icon: 'text-fuchsia-600 dark:text-fuchsia-400',
    soft: 'bg-fuchsia-500/10',
    ring: 'ring-fuchsia-500/20',
    bar: 'bg-fuchsia-500/70'
  },
  'event-driven': {
    icon: 'text-rose-600 dark:text-rose-400',
    soft: 'bg-rose-500/10',
    ring: 'ring-rose-500/20',
    bar: 'bg-rose-500/70'
  },
  cloud: {
    icon: 'text-indigo-600 dark:text-indigo-400',
    soft: 'bg-indigo-500/10',
    ring: 'ring-indigo-500/20',
    bar: 'bg-indigo-500/70'
  },
  ai: {
    icon: 'text-purple-600 dark:text-purple-400',
    soft: 'bg-purple-500/10',
    ring: 'ring-purple-500/20',
    bar: 'bg-purple-500/70'
  },
  hybrid: {
    icon: 'text-emerald-600 dark:text-emerald-400',
    soft: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/20',
    bar: 'bg-emerald-500/70'
  }
}

const FILTER_TYPES: SystemFilter[] = ['all', ...PRIMARY_ARCH_SYSTEM_TYPES]

function systemLabel(systemType: string): string {
  return ARCH_SYSTEM_TYPES.find((t) => t.id === systemType)?.label ?? systemType
}

function SystemIcon({ systemType, size = 'sm' }: { systemType: string; size?: 'sm' | 'md' }) {
  const Icon = SYSTEM_ICONS[systemType] ?? Network
  const accent = SYSTEM_ACCENT[systemType] ?? SYSTEM_ACCENT.web
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

function SystemTag({ systemType }: { systemType: string }) {
  const accent = SYSTEM_ACCENT[systemType] ?? SYSTEM_ACCENT.web
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1 py-px text-[10px] font-medium ring-1 ring-inset',
        accent.soft,
        accent.icon,
        accent.ring
      )}
    >
      {systemLabel(systemType)}
    </span>
  )
}

/** Compact composition strip so cards feel like Flow thumbnails without React Flow. */
function ArchitecturePreview({
  modelJson,
  systemType,
  className
}: {
  modelJson: string
  systemType: string
  className?: string
}) {
  const chips = useMemo(() => {
    try {
      const model = parseModel(modelJson)
      return model.components.slice(0, 8).map((component) => {
        const meta = getComponentKindMeta(component.kind)
        return {
          id: component.id,
          name: component.name,
          color: meta?.color ?? '#64748b'
        }
      })
    } catch {
      return []
    }
  }, [modelJson])

  const accent = SYSTEM_ACCENT[systemType] ?? SYSTEM_ACCENT.web

  return (
    <div
      className={cn(
        'relative flex h-16 items-center justify-center gap-1.5 overflow-hidden border-b border-border/60 px-3',
        accent.soft,
        className
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-0.5', accent.bar)} />
      {chips.length === 0 ? (
        <span className="text-[10px] text-muted-foreground">Empty diagram</span>
      ) : (
        chips.map((chip, index) => (
          <span
            key={chip.id}
            title={chip.name}
            className="h-7 min-w-[1.75rem] max-w-[4.5rem] truncate rounded-md border border-border/50 bg-background/80 px-1.5 text-center text-[9px] font-medium leading-7 shadow-sm"
            style={{
              borderColor: `${chip.color}55`,
              color: chip.color,
              transform: `translateY(${(index % 2) * 4 - 2}px)`
            }}
          >
            {chip.name}
          </span>
        ))
      )}
    </div>
  )
}

export function ArchitectureListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.currentProject)
  const { diagrams, isLoading, loadDiagrams, createDiagram, deleteDiagram, duplicateDiagram, updateDiagram } =
    useArchitectureStore()

  const [tab, setTab] = useState<Tab>('designs')
  const [search, setSearch] = useState('')
  const [systemFilter, setSystemFilter] = useState<SystemFilter>('all')
  const [view, setView] = useState<ViewMode>('grid')
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ArchitectureDiagram | null>(null)

  useEffect(() => {
    if (projectId) void loadDiagrams(projectId)
  }, [projectId, loadDiagrams])

  const query = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    return diagrams.filter((diagram) => {
      if (systemFilter !== 'all' && diagram.systemType !== systemFilter) return false
      if (!query) return true
      return (
        diagram.title.toLowerCase().includes(query) ||
        diagram.description.toLowerCase().includes(query) ||
        diagram.systemType.toLowerCase().includes(query) ||
        systemLabel(diagram.systemType).toLowerCase().includes(query)
      )
    })
  }, [diagrams, systemFilter, query])

  const filteredTemplates = useMemo(() => {
    return ARCH_TEMPLATES.filter((template) => {
      if (systemFilter !== 'all' && template.systemType !== systemFilter) return false
      if (!query) return true
      return (
        template.title.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.systemType.toLowerCase().includes(query)
      )
    })
  }, [systemFilter, query])

  const pinned = filtered.filter((d) => d.isPinned)
  const rest = filtered.filter((d) => !d.isPinned)
  const isFiltered = Boolean(query || systemFilter !== 'all')

  const openDiagram = useCallback(
    (id: string) => navigate(`/project/${projectId}/architecture-designer/${id}`),
    [navigate, projectId]
  )

  const handleCreate = useCallback(
    async (systemType: string, title = 'Untitled Architecture') => {
      if (!projectId || creating) return
      setCreating(true)
      toast.message('Opening architecture…')
      try {
        const model = createEmptyModel(title, systemType)
        const created = await createDiagram({
          projectId,
          title,
          systemType,
          model: serializeModel(model)
        })
        if (created) openDiagram(created.id)
      } finally {
        setCreating(false)
      }
    },
    [projectId, creating, createDiagram, openDiagram]
  )

  const handleUseTemplate = useCallback(
    async (templateId: string) => {
      if (!projectId || creating) return
      const template = ARCH_TEMPLATES.find((t) => t.id === templateId)
      if (!template) return

      setCreating(true)
      toast.message(`Creating “${template.title}”…`)
      try {
        const model = template.build()
        const created = await createDiagram({
          projectId,
          title: template.title,
          description: template.description,
          systemType: template.systemType,
          model: serializeModel(model)
        })
        if (created) {
          toast.success(`Created from ${template.title}`)
          openDiagram(created.id)
        }
      } finally {
        setCreating(false)
      }
    },
    [projectId, creating, createDiagram, openDiagram]
  )

  if (!projectId) return null

  return (
    <ModulePage>
      <PageHeader
        title="Architecture Designer"
        description={
          currentProject?.name
            ? `${currentProject.name} · system designs for this project`
            : 'System designs and infrastructure diagrams'
        }
        fluid
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-7 gap-1.5" disabled={creating}>
                <Plus className="h-3.5 w-3.5" />
                {creating ? 'Creating…' : 'New Architecture'}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => void handleCreate('web')}>
                <Plus className="h-3.5 w-3.5" />
                Blank architecture
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {ARCH_SYSTEM_TYPES.filter((type) =>
                (PRIMARY_ARCH_SYSTEM_TYPES as readonly string[]).includes(type.id)
              ).map((type) => {
                const Icon = SYSTEM_ICONS[type.id] ?? Network
                return (
                  <DropdownMenuItem
                    key={type.id}
                    onSelect={() => void handleCreate(type.id, type.label)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {type.label}
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTab('templates')}>
                <Sparkles className="h-3.5 w-3.5" />
                Browse templates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <ModuleToolbar>
        <ModuleTab
          active={tab === 'designs'}
          onClick={() => setTab('designs')}
          count={diagrams.length}
        >
          Designs
        </ModuleTab>
        <ModuleTab active={tab === 'templates'} onClick={() => setTab('templates')}>
          Templates
        </ModuleTab>

        <div className="relative min-w-[140px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={tab === 'templates' ? 'Search templates…' : 'Search architectures…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 pr-7 text-xs shadow-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="hidden max-w-[52%] items-center gap-0.5 overflow-x-auto md:flex">
          {FILTER_TYPES.map((type) => {
            const Icon = type === 'all' ? Sparkles : SYSTEM_ICONS[type] ?? Network
            return (
              <ModuleTab
                key={type}
                active={systemFilter === type}
                onClick={() => setSystemFilter(type)}
              >
                <Icon className="h-3 w-3" />
                {type === 'all'
                  ? 'All'
                  : systemLabel(type).replace(' Application', '').replace(' Platform', '')}
              </ModuleTab>
            )
          })}
        </div>

        {tab === 'designs' && (
          <ViewToggle value={view} onChange={setView} className="rounded-md p-px" />
        )}
      </ModuleToolbar>

      <PageContent fluid>
        {tab === 'templates' ? (
          filteredTemplates.length === 0 ? (
            <EmptyPanel title="No templates match" detail="Try a different search or system type." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  disabled={creating}
                  onUse={() => void handleUseTemplate(template.id)}
                />
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyPanel
            title={isFiltered ? 'No architectures match' : 'No architectures yet'}
            detail={
              isFiltered
                ? 'Try a different search or system type.'
                : 'Create a blank design or start from a template.'
            }
            action={
              isFiltered ? undefined : (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-7"
                    disabled={creating}
                    onClick={() => void handleCreate('web')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New architecture
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => setTab('templates')}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Templates
                  </Button>
                </div>
              )
            }
          >
            {!isFiltered && (
              <div className="mt-4 grid w-full max-w-2xl gap-1.5 sm:grid-cols-3">
                {ARCH_TEMPLATES.slice(0, 3).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={creating}
                    onClick={() => void handleUseTemplate(template.id)}
                    className="rounded-md border border-border bg-card px-2.5 py-2 text-left hover:border-foreground/15 hover:bg-accent/40"
                  >
                    <p className="truncate text-xs font-medium">{template.title}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {systemLabel(template.systemType)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </EmptyPanel>
        ) : view === 'grid' ? (
          <div className="space-y-4">
            {pinned.length > 0 && (
              <DiagramGrid
                diagrams={pinned}
                title="Pinned"
                projectId={projectId}
                onOpen={openDiagram}
                onDuplicate={(id) => void duplicateDiagram(id)}
                onTogglePin={(diagram) =>
                  void updateDiagram(diagram.id, { isPinned: !diagram.isPinned })
                }
                onDelete={setPendingDelete}
              />
            )}
            {rest.length > 0 && (
              <DiagramGrid
                diagrams={rest}
                title={pinned.length > 0 ? 'All' : undefined}
                projectId={projectId}
                onOpen={openDiagram}
                onDuplicate={(id) => void duplicateDiagram(id)}
                onTogglePin={(diagram) =>
                  void updateDiagram(diagram.id, { isPinned: !diagram.isPinned })
                }
                onDelete={setPendingDelete}
              />
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {filtered.map((diagram) => (
              <DiagramListRow
                key={diagram.id}
                diagram={diagram}
                projectId={projectId}
                onOpen={() => openDiagram(diagram.id)}
                onDuplicate={() => void duplicateDiagram(diagram.id)}
                onTogglePin={() => void updateDiagram(diagram.id, { isPinned: !diagram.isPinned })}
                onDelete={() => setPendingDelete(diagram)}
              />
            ))}
          </div>
        )}
      </PageContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.title}"?`}
        description="This permanently removes the architecture and all of its versions. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) void deleteDiagram(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
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
        <Network className="h-4 w-4" />
      </span>
      <p className="mt-2.5 text-sm font-medium">{title}</p>
      <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">{detail}</p>
      {action && <div className="mt-3">{action}</div>}
      {children}
    </div>
  )
}

function DiagramGrid({
  diagrams,
  title,
  projectId,
  onOpen,
  onDuplicate,
  onTogglePin,
  onDelete
}: {
  diagrams: ArchitectureDiagram[]
  title?: string
  projectId: string
  onOpen: (id: string) => void
  onDuplicate: (id: string) => void
  onTogglePin: (diagram: ArchitectureDiagram) => void
  onDelete: (diagram: ArchitectureDiagram) => void
}) {
  return (
    <div>
      {title && <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {diagrams.map((diagram) => (
          <DiagramCard
            key={diagram.id}
            diagram={diagram}
            projectId={projectId}
            onOpen={() => onOpen(diagram.id)}
            onDuplicate={() => onDuplicate(diagram.id)}
            onTogglePin={() => onTogglePin(diagram)}
            onDelete={() => onDelete(diagram)}
          />
        ))}
      </div>
    </div>
  )
}

function DiagramCard({
  diagram,
  projectId,
  onOpen,
  onDuplicate,
  onDelete,
  onTogglePin
}: {
  diagram: ArchitectureDiagram
  projectId: string
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  const stats = useMemo(() => getModelStats(parseModel(diagram.model)), [diagram.model])

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/15 hover:bg-accent/20">
      <button type="button" onClick={onOpen} className="flex w-full flex-col text-left">
        <div className="relative">
          <ArchitecturePreview modelJson={diagram.model} systemType={diagram.systemType} />
          {diagram.isPinned && (
            <span className="absolute left-1.5 top-1.5 rounded bg-background/90 p-0.5 shadow-sm">
              <Pin className="h-3 w-3 fill-current" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <SystemIcon systemType={diagram.systemType} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{diagram.title}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <SystemTag systemType={diagram.systemType} />
              <span className="truncate text-[10px] text-muted-foreground">
                {stats.components} · {formatRelativeTime(diagram.updatedAt)}
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
            aria-label="Architecture actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={onOpen}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void openModuleWindow(`/project/${projectId}/architecture-designer/${diagram.id}`)
            }
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            New window
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTogglePin}>
            <Pin className="h-3.5 w-3.5" />
            {diagram.isPinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function DiagramListRow({
  diagram,
  projectId,
  onOpen,
  onDuplicate,
  onTogglePin,
  onDelete
}: {
  diagram: ArchitectureDiagram
  projectId: string
  onOpen: () => void
  onDuplicate: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const stats = useMemo(() => getModelStats(parseModel(diagram.model)), [diagram.model])

  return (
    <div className="group flex items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-b-0 hover:bg-accent/40">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <SystemIcon systemType={diagram.systemType} />
        <p className="min-w-0 flex-1 truncate text-xs font-medium">{diagram.title}</p>
        {diagram.isPinned && <Pin className="h-3 w-3 shrink-0 fill-current text-muted-foreground" />}
        <SystemTag systemType={diagram.systemType} />
        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
          {stats.components} modules · {formatRelativeTime(diagram.updatedAt)}
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label="Architecture actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onOpen}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void openModuleWindow(`/project/${projectId}/architecture-designer/${diagram.id}`)
            }
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            New window
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTogglePin}>
            <Pin className="h-3.5 w-3.5" />
            {diagram.isPinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function TemplateCard({
  template,
  disabled,
  onUse
}: {
  template: ArchTemplate
  disabled?: boolean
  onUse: () => void
}) {
  const preview = useMemo(() => serializeModel(template.build()), [template])
  const stats = useMemo(() => getModelStats(parseModel(preview)), [preview])

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onUse}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-foreground/15 hover:bg-accent/30 disabled:opacity-60"
    >
      <div className="relative">
        <ArchitecturePreview modelJson={preview} systemType={template.systemType} />
        <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium opacity-0 shadow-sm group-hover:opacity-100">
          <Plus className="h-3 w-3" />
          Use
        </span>
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <SystemIcon systemType={template.systemType} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{template.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">{template.description}</p>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {stats.components}
        </span>
      </div>
    </button>
  )
}
