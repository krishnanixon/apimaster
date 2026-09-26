import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Archive,
  ArrowRight,
  Brain,
  Bot,
  Copy,
  Database,
  FileText,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  SquarePlus,
  Webhook
} from 'lucide-react'
import { toast } from 'sonner'
import { useProjectStore } from '@/shared/stores/project.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { useNavHistoryStore } from '@/shared/stores/nav-history.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { formatRelativeTime, cn, DOCUMENT_TYPE_LABELS } from '@/shared/lib/utils'
import { getModuleById } from '@/shared/lib/module-registry'
import type { Document, KnowledgeStats, KnowledgeSuggestion, Project } from '@shared/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import {
  AppleCanvas,
  AppleLink,
  AppleProgress,
  AppleSection,
  AppleStat,
  AppleTile
} from '../components/project-chrome'
import { CreateProjectDialog } from '../components/CreateProjectDialog'
import { useCreateProjectDialog } from '../hooks/useCreateProjectDialog'
import { openModuleWindow, openProjectWindow } from '@/shared/lib/windows'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

const ACTIVITY_DAYS = 7

const PROJECT_SHORTCUTS: Array<{ section: string; label: string; icon: LucideIcon }> = [
  { section: 'overview', label: 'Overview', icon: LayoutDashboard },
  { section: 'knowledge', label: 'Knowledge', icon: Brain },
  { section: 'documents', label: 'Documents', icon: FileText },
  { section: 'chat', label: 'Project AI', icon: MessageSquare },
  { section: 'flows', label: 'Flows', icon: GitBranch },
  { section: 'generate', label: 'Generate', icon: Sparkles }
]

const TOOL_LINKS: Array<{ path: string; label: string; icon: LucideIcon }> = [
  { path: '/assistant', label: 'New Chat', icon: Sparkles },
  { path: '/api-studio', label: 'API Studio', icon: Webhook },
  { path: '/database-studio', label: 'Database', icon: Database },
  { path: '/apps', label: 'Apps', icon: LayoutDashboard }
]

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function buildProjectActivity(projects: Array<{ updatedAt: string; lastOpenedAt: string }>) {
  const today = startOfDay(new Date())
  return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const timestamp = today - (ACTIVITY_DAYS - 1 - index) * 86_400_000
    const nextTimestamp = timestamp + 86_400_000
    const value = projects.filter((project) => {
      const activityAt = Math.max(
        new Date(project.updatedAt).getTime(),
        new Date(project.lastOpenedAt).getTime()
      )
      return activityAt >= timestamp && activityAt < nextTimestamp
    }).length
    return {
      label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(timestamp),
      value
    }
  })
}

interface FocusSnapshot {
  stats: KnowledgeStats | null
  suggestions: KnowledgeSuggestion[]
  documents: Document[]
}

interface NextStep {
  id: string
  title: string
  detail: string
  onClick: () => void
}

export function DashboardPage() {
  const navigate = useNavigate()
  const {
    projects,
    recentProjects,
    isLoading,
    loadProjects,
    loadRecentProjects,
    openProject,
    duplicateProject,
    archiveProject
  } = useProjectStore()
  const { apiKeyStatus } = useSettingsStore()
  const recentNav = useNavHistoryStore((s) => s.entries ?? [])
  const create = useCreateProjectDialog()

  const [query, setQuery] = useState('')
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<FocusSnapshot>({
    stats: null,
    suggestions: [],
    documents: []
  })
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [now] = useState(() => new Date())

  useEffect(() => {
    loadProjects()
    loadRecentProjects()
  }, [loadProjects, loadRecentProjects])

  useEffect(() => {
    if (focusedId && projects.some((project) => project.id === focusedId)) return
    setFocusedId(recentProjects[0]?.id ?? projects.find((project) => project.status === 'active')?.id ?? null)
  }, [focusedId, projects, recentProjects])

  useEffect(() => {
    if (!focusedId) {
      setSnapshot({ stats: null, suggestions: [], documents: [] })
      return
    }

    let cancelled = false
    setSnapshotLoading(true)
    void (async () => {
      const api = await waitForDesktopApi()
      if (cancelled) return
      if (!api?.knowledge || !api.documents) {
        setSnapshot({ stats: null, suggestions: [], documents: [] })
        setSnapshotLoading(false)
        return
      }
      try {
        const [statsResult, suggestionsResult, documentsResult] = await Promise.all([
          api.knowledge.getStats(focusedId),
          api.knowledge.getSuggestions(focusedId),
          api.documents.list(focusedId)
        ])
        if (cancelled) return
        setSnapshot({
          stats: statsResult.success ? statsResult.data ?? null : null,
          suggestions: suggestionsResult.success ? suggestionsResult.data ?? [] : [],
          documents: documentsResult.success ? documentsResult.data ?? [] : []
        })
        setSnapshotLoading(false)
      } catch {
        if (cancelled) return
        setSnapshot({ stats: null, suggestions: [], documents: [] })
        setSnapshotLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [focusedId])

  const focusedProject = projects.find((project) => project.id === focusedId) ?? null
  const activeProjects = projects.filter((project) => project.status === 'active')
  const archivedCount = projects.length - activeProjects.length
  const activity = useMemo(() => buildProjectActivity(projects), [projects])

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = recentProjects.length ? recentProjects : activeProjects
    if (!q) return source.slice(0, 8)
    return projects
      .filter(
        (project) =>
          project.name.toLowerCase().includes(q) || project.description.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query, recentProjects, activeProjects, projects])

  const openFocused = async (section = 'overview') => {
    if (!focusedId) {
      create.setOpen(true)
      return
    }
    await openProject(focusedId)
    await openProjectWindow(focusedId, section)
  }

  const nextSteps: NextStep[] = (() => {
    if (!focusedProject) return []
    const steps: NextStep[] = []
    const go = (section: string) => () => {
      void openFocused(section)
    }

    if (!apiKeyStatus?.isSet) {
      steps.push({
        id: 'ai',
        title: 'Connect AI',
        detail: 'Required for Project AI and document generation',
        onClick: () => navigate('/settings?tab=ai')
      })
    }
    if (!focusedProject.description.trim()) {
      steps.push({
        id: 'description',
        title: 'Add a project description',
        detail: 'Helps AI and generated documents stay on topic',
        onClick: go('overview')
      })
    }
    if (!snapshot.stats || snapshot.stats.completionPercent < 20) {
      steps.push({
        id: 'knowledge',
        title: 'Capture project knowledge',
        detail: 'Modules, requirements, and APIs feed every other tool',
        onClick: go('knowledge')
      })
    } else if (snapshot.stats.requirements === 0) {
      steps.push({
        id: 'requirements',
        title: 'Add requirements',
        detail: 'Nothing is documented as must-have yet',
        onClick: go('knowledge')
      })
    }
    if (snapshot.documents.length === 0) {
      steps.push({
        id: 'document',
        title: 'Generate the first document',
        detail: 'Turn captured knowledge into a spec',
        onClick: go('generate')
      })
    }
    const warning = snapshot.suggestions.find((item) => item.type === 'warning') ?? snapshot.suggestions[0]
    if (warning) {
      steps.push({
        id: `suggestion-${warning.id}`,
        title: warning.title,
        detail: warning.description,
        onClick: go('knowledge')
      })
    }
    if (steps.length === 0) {
      steps.push({
        id: 'continue',
        title: 'Continue in Project AI',
        detail: 'Ask questions against this workspace',
        onClick: go('chat')
      })
    }
    return steps
  })()

  const recentDocuments = useMemo(
    () =>
      [...snapshot.documents]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 4),
    [snapshot.documents]
  )

  const openDocument = async (documentId: string) => {
    if (!focusedId) return
    await openProject(focusedId)
    await openProjectWindow(focusedId, `editor/${documentId}`)
  }

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    const first = filteredProjects[0]
    if (!first) {
      create.setOpen(true)
      return
    }
    setFocusedId(first.id)
    if (filteredProjects.length === 1) {
      void openProject(first.id).then(() => openProjectWindow(first.id, 'overview'))
    }
  }

  const handleDuplicate = async () => {
    if (!focusedId) return
    const copy = await duplicateProject(focusedId)
    if (copy) {
      toast.success('Project duplicated')
      setFocusedId(copy.id)
    }
  }

  const handleArchive = async () => {
    if (!focusedId) return
    await archiveProject(focusedId)
    toast.success('Project archived')
    const next = projects.find((project) => project.id !== focusedId && project.status === 'active')
    setFocusedId(next?.id ?? null)
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(now)
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const weekTotal = activity.reduce((sum, item) => sum + item.value, 0)
  const focusedCompletion = Math.round(snapshot.stats?.completionPercent ?? 0)
  const summaryCards: Array<{
    label: string
    value: string | number
    detail: string
    icon: LucideIcon
    onClick?: () => void
  }> = [
    {
      label: 'Projects',
      value: isLoading ? '—' : activeProjects.length,
      detail: archivedCount > 0 ? `active · ${archivedCount} archived` : 'active',
      icon: FolderKanban,
      onClick: () => navigate('/projects')
    },
    {
      label: 'Knowledge',
      value: !focusedProject || snapshotLoading ? '—' : `${focusedCompletion}%`,
      detail: focusedProject ? 'complete in focused project' : 'no project selected',
      icon: Brain,
      onClick: focusedProject ? () => void openFocused('knowledge') : undefined
    },
    {
      label: 'Documents',
      value: !focusedProject || snapshotLoading ? '—' : snapshot.documents.length,
      detail: focusedProject ? 'in focused project' : 'no project selected',
      icon: FileText,
      onClick: focusedProject ? () => void openFocused('documents') : undefined
    },
    {
      label: 'This week',
      value: weekTotal,
      detail: 'projects opened or updated',
      icon: Activity
    }
  ]

  return (
    <AppleCanvas wide>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{dateLabel}</p>
          <h1 className="font-display mt-1 text-[1.75rem] leading-tight text-foreground md:text-[2rem]">{greeting}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {focusedProject
              ? `Continue with ${focusedProject.name} or pick another workspace.`
              : 'Create a project to start capturing knowledge and documents.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void openModuleWindow('/assistant')}>
            <Bot className="h-3.5 w-3.5" />
            Ask Tess
          </Button>
          <Button size="sm" variant="outline" onClick={() => create.setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New project
          </Button>
          <Button size="sm" onClick={() => void openFocused('overview')} disabled={!focusedProject}>
            Open workspace
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map(({ label, value, detail, icon: Icon, onClick }) => (
          <AppleTile key={label} onClick={onClick} className="flex items-start justify-between gap-3 p-4">
            <AppleStat label={label} value={value} detail={detail} />
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
          </AppleTile>
        ))}
      </div>

      {!apiKeyStatus?.isSet && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-soft dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100">
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="text-sm">Connect an OpenAI key to generate documents and use Project AI.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/settings?tab=ai')}>
            Open AI Settings
          </Button>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.85fr)]">
        <FocusedProjectPanel
          project={focusedProject}
          snapshot={snapshot}
          loading={snapshotLoading || isLoading}
          nextSteps={nextSteps}
          onOpen={openFocused}
          onDuplicate={handleDuplicate}
          onArchive={handleArchive}
          onOpenInNewWindow={() => {
            if (focusedId) void openProjectWindow(focusedId, 'overview')
          }}
          onCreate={() => create.setOpen(true)}
        />

        <AppleTile padded={false} className="flex min-h-[320px] flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Projects</h2>
              <p className="text-[11px] text-muted-foreground">
                {activeProjects.length} active
                {archivedCount > 0 ? ` · ${archivedCount} archived` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <form onSubmit={handleSearchSubmit} className="relative hidden w-36 sm:block">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find…"
                  className="h-7 bg-muted/60 pl-7 text-[11px]"
                  aria-label="Find a project"
                />
              </form>
              <AppleLink onClick={() => navigate('/projects')}>All</AppleLink>
            </div>
          </div>
          <div className="mx-4 h-px bg-border/80" />
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
              <p className="text-sm font-medium">{query ? 'No matches' : 'No projects yet'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {query ? 'Try a different name.' : 'Create a workspace to get started.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] flex-1 overflow-y-auto py-1">
              {filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setFocusedId(project.id)}
                  onDoubleClick={() => {
                    setFocusedId(project.id)
                    void openProject(project.id).then(() => openProjectWindow(project.id, 'overview'))
                  }}
                  aria-current={project.id === focusedId ? 'true' : undefined}
                  className={cn(
                    'relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50',
                    project.id === focusedId && 'bg-muted/70'
                  )}
                >
                  {project.id === focusedId && (
                    <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
                  )}
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold',
                      project.id === focusedId
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {(project.name.trim()[0] ?? 'P').toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatRelativeTime(project.lastOpenedAt)}
                      {project.status === 'archived' ? ' · Archived' : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </AppleTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AppleSection title="Documents" description={focusedProject ? focusedProject.name : 'Select a project'}>
          <AppleTile padded={false} className="min-h-[188px]">
            {!focusedProject ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                Select a project to see documents.
              </p>
            ) : snapshotLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : recentDocuments.length === 0 ? (
              <div className="flex h-full min-h-[188px] flex-col items-start justify-center gap-3 px-4 py-5">
                <p className="text-xs text-muted-foreground">No documents in this project yet.</p>
                <Button size="sm" variant="outline" onClick={() => void openFocused('generate')}>
                  Generate
                </Button>
              </div>
            ) : (
              recentDocuments.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => void openDocument(doc.id)}
                  className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left last:border-b-0 hover:bg-accent/40"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type} · {formatRelativeTime(doc.updatedAt)}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))
            )}
          </AppleTile>
        </AppleSection>

        <AppleSection title="Jump back" description="Recently opened in this session">
          <AppleTile padded={false} className="min-h-[188px]">
            {recentNav.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                Places you open will show up here.
              </p>
            ) : (
              recentNav.slice(0, 5).map((entry) => {
                const mod = getModuleById(entry.moduleId)
                const Icon = mod?.icon
                return (
                  <button
                    key={`${entry.path}-${entry.visitedAt}`}
                    type="button"
                    onClick={() => navigate(entry.path)}
                    className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left last:border-b-0 hover:bg-accent/40"
                  >
                    {Icon && (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {entry.projectName ?? entry.description ?? 'Workbench'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(new Date(entry.visitedAt))}
                    </span>
                  </button>
                )
              })
            )}
          </AppleTile>
        </AppleSection>

        <AppleSection title="This week" description="Projects opened or updated">
          <ActivityChart data={activity} />
        </AppleSection>
      </div>

      <AppleSection title="Tools" description="Open each tool in its own window">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {TOOL_LINKS.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              type="button"
              onClick={() => void openModuleWindow(path)}
              title={`Open ${label} in a new window`}
              className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-card px-3 py-2.5 text-left shadow-soft transition-colors hover:border-foreground/15 hover:bg-accent/40"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
              <SquarePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </AppleSection>

      <CreateProjectDialog
        open={create.open}
        onOpenChange={create.setOpen}
        name={create.name}
        description={create.description}
        onNameChange={create.setName}
        onDescriptionChange={create.setDescription}
        onCreate={create.handleCreate}
        creating={create.creating}
      />
    </AppleCanvas>
  )
}

function FocusedProjectPanel({
  project,
  snapshot,
  loading,
  nextSteps,
  onOpen,
  onDuplicate,
  onArchive,
  onOpenInNewWindow,
  onCreate
}: {
  project: Project | null
  snapshot: FocusSnapshot
  loading: boolean
  nextSteps: NextStep[]
  onOpen: (section?: string) => void
  onDuplicate: () => void
  onArchive: () => void
  onOpenInNewWindow: () => void
  onCreate: () => void
}) {
  if (!project) {
    return (
      <AppleTile className="flex min-h-[320px] flex-col justify-center gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <FolderKanban className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Start with a project</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Projects hold knowledge, documents, diagrams, and a context-aware assistant.
          </p>
        </div>
        <Button size="sm" className="w-fit" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" />
          New Project
        </Button>
      </AppleTile>
    )
  }

  const completion = Math.round(snapshot.stats?.completionPercent ?? 0)

  return (
    <AppleTile featured className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Continue</p>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">{project.name}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {project.description || 'No description yet.'}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="capitalize">{project.status}</span>
            {' · '}
            <span className="capitalize">{project.style}</span>
            {' · Opened '}
            {formatRelativeTime(project.lastOpenedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" aria-label="Project actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenInNewWindow}>
                <SquarePlus className="h-3.5 w-3.5" /> Open in new window
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              {project.status === 'active' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onArchive}>
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => onOpen('overview')}>
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Knowledge</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {loading ? '—' : `${completion}% complete`}
          </p>
        </div>
        <AppleProgress value={loading ? 0 : completion} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AppleStat inset label="Knowledge" value={loading ? '—' : `${completion}%`} detail="complete" />
        <AppleStat
          inset
          label="Requirements"
          value={loading ? '—' : snapshot.stats?.requirements ?? 0}
          detail="captured"
        />
        <AppleStat inset label="Documents" value={loading ? '—' : snapshot.documents.length} detail="in workspace" />
        <AppleStat inset label="Modules" value={loading ? '—' : snapshot.stats?.modules ?? 0} detail="in knowledge" />
      </div>

      {nextSteps.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Next</p>
          <div className="space-y-1.5">
            {nextSteps.slice(0, 3).map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={step.onClick}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-left transition-colors hover:bg-accent dark:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{step.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{step.detail}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {PROJECT_SHORTCUTS.map(({ section, label, icon: Icon }) => (
          <button
            key={section}
            type="button"
            onClick={() => void onOpen(section)}
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </AppleTile>
  )
}

function ActivityChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(1, ...data.map((item) => item.value))
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <AppleTile className="min-h-[188px]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">Last 7 days</p>
        <p className="text-lg font-semibold tabular-nums">{total}</p>
      </div>
      <div
        className="mt-4 grid h-24 grid-cols-7 items-end gap-2"
        role="img"
        aria-label={`Project activity: ${data.map((item) => `${item.label} ${item.value}`).join(', ')}`}
      >
        {data.map((item) => {
          const height = item.value === 0 ? 10 : Math.max(18, (item.value / maxValue) * 100)
          return (
            <div key={item.label} className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5">
              <div className="flex h-16 w-full items-end justify-center">
                <div
                  className={cn(
                    'w-full max-w-3 rounded-sm bg-primary transition-[height] duration-300',
                    item.value === 0 && 'bg-muted-foreground/20'
                  )}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          )
        })}
      </div>
    </AppleTile>
  )
}
