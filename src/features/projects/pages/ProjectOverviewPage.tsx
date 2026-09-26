import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CalendarDays,
  FileText,
  GitBranch,
  ImagePlus,
  MessageSquare,
  Pencil,
  Sparkles,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { useProjectStore } from '@/shared/stores/project.store'
import { useKnowledgeStore } from '@/features/knowledge/stores/knowledge.store'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useFlowStore } from '@/features/flow-designer/stores/flow.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { DOCUMENT_TYPE_LABELS, formatRelativeTime, cn } from '@/shared/lib/utils'
import type { DocumentStyle } from '@shared/types'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { DocumentGenerationRulesField } from '@/features/documents/components/DocumentGenerationRulesField'
import {
  AppleCanvas,
  AppleLink,
  AppleProgress,
  AppleSection,
  AppleStat,
  AppleTile
} from '../components/project-chrome'

const workspaceTiles = [
  { section: 'chat', icon: MessageSquare, label: 'Project AI', desc: 'Context-aware assistant' },
  { section: 'knowledge', icon: Brain, label: 'Knowledge', desc: 'Modules, requirements, APIs' },
  { section: 'documents', icon: FileText, label: 'Documents', desc: 'Specs for this project' },
  { section: 'flows', icon: GitBranch, label: 'Flows', desc: 'Process and architecture' },
  { section: 'generate', icon: Sparkles, label: 'Generate', desc: 'AI document wizard' }
]

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject, updateProject } = useProjectStore()
  const { stats, suggestions } = useKnowledgeStore()
  const { documents } = useDocumentStore()
  const { flows, loadFlows } = useFlowStore()
  const [showEdit, setShowEdit] = useState(false)

  useEffect(() => {
    if (projectId) void loadFlows(projectId)
  }, [projectId, loadFlows])

  const recentDocuments = useMemo(
    () =>
      [...documents]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 4),
    [documents]
  )
  const recentFlows = useMemo(
    () =>
      [...flows]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 4),
    [flows]
  )
  const nextSteps = useMemo(() => {
    if (!currentProject) return []
    const steps: Array<{ id: string; title: string; detail: string; section: string }> = []
    if (!currentProject.description.trim()) {
      steps.push({
        id: 'desc',
        title: 'Add a project description',
        detail: 'Improves AI context and generated docs',
        section: 'overview'
      })
    }
    if (!stats || stats.completionPercent < 20) {
      steps.push({
        id: 'kb',
        title: 'Capture knowledge',
        detail: 'Modules and requirements power chat and documents',
        section: 'knowledge'
      })
    }
    if (documents.length === 0) {
      steps.push({
        id: 'doc',
        title: 'Create the first document',
        detail: 'Specs stay scoped to this project',
        section: 'documents'
      })
    }
    if (flows.length === 0) {
      steps.push({
        id: 'flow',
        title: 'Sketch a flow',
        detail: 'Process or architecture in Flow Designer',
        section: 'flows'
      })
    }
    const warning = suggestions.find((item) => item.type === 'warning')
    if (warning) {
      steps.push({
        id: warning.id,
        title: warning.title,
        detail: warning.description,
        section: 'knowledge'
      })
    }
    if (steps.length === 0) {
      steps.push({
        id: 'ai',
        title: 'Ask Project AI',
        detail: 'This workspace already has enough context to help',
        section: 'chat'
      })
    }
    return steps.slice(0, 3)
  }, [currentProject, stats, documents.length, flows.length, suggestions])

  if (!projectId || !currentProject) return null

  const go = (section: string) => navigate(`/project/${projectId}/${section}`)
  const completion = stats?.completionPercent ?? 0
  const requirementTotal = stats?.requirements ?? 0
  const statusLabel = currentProject.status === 'active' ? 'Active' : 'Archived'
  const knowledgeItems = [
    { label: 'Modules', value: stats?.modules ?? 0 },
    { label: 'Features', value: stats?.features ?? 0 },
    { label: 'API endpoints', value: stats?.apiEndpoints ?? 0 },
    { label: 'Data entities', value: stats?.entities ?? 0 },
    { label: 'Risks', value: stats?.risks ?? 0 }
  ]
  const functional = stats?.functionalRequirements ?? 0
  const nonFunctional = stats?.nonFunctionalRequirements ?? 0

  return (
    <AppleCanvas muted>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">
          {statusLabel} · {currentProject.description || 'Project overview'}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7" onClick={() => setShowEdit(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button size="sm" className="h-7" onClick={() => go('chat')}>
            <MessageSquare className="h-3.5 w-3.5" />
            Project AI
          </Button>
        </div>
      </div>
      <AppleTile padded={false} className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <SpecItem label="Status" value={statusLabel} live={currentProject.status === 'active'} />
        <SpecItem label="Company" value={currentProject.companyName || 'Not specified'} />
        <SpecItem label="Document style" value={currentProject.style} capitalize />
        <SpecItem label="Last opened" value={formatRelativeTime(currentProject.lastOpenedAt)} />
      </AppleTile>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.85fr)]">
        <AppleTile>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Health</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Coverage across this workspace</p>
            </div>
            <p className="text-lg font-semibold tabular-nums">{Math.round(completion)}%</p>
          </div>
          <AppleProgress className="mt-3" value={completion} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => go('documents')} className="text-left">
              <AppleStat inset label="Documents" value={documents.length} />
            </button>
            <button type="button" onClick={() => go('knowledge')} className="text-left">
              <AppleStat inset label="Requirements" value={requirementTotal} />
            </button>
            <button type="button" onClick={() => go('flows')} className="text-left">
              <AppleStat inset label="Flows" value={flows.length} />
            </button>
          </div>
          <div className="mt-5 space-y-2.5">
            {knowledgeItems.map((item) => {
              const max = Math.max(...knowledgeItems.map((entry) => entry.value), 1)
              return (
                <div key={item.label}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="tabular-nums">{item.value}</span>
                  </div>
                  <AppleProgress value={(item.value / max) * 100} />
                </div>
              )
            })}
          </div>
        </AppleTile>

        <div className="flex flex-col gap-4">
          <AppleTile>
            <h3 className="text-sm font-semibold tracking-tight">Requirements</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Functional vs non-functional</p>
            {requirementTotal > 0 ? (
              <div className="mt-4 space-y-4">
                <RequirementMeter label="Functional" value={functional} total={requirementTotal} />
                <RequirementMeter label="Non-functional" value={nonFunctional} total={requirementTotal} />
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm font-medium">No requirements yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Capture what this product must do.</p>
                <div className="mt-2">
                  <AppleLink onClick={() => go('knowledge')}>Add knowledge</AppleLink>
                </div>
              </div>
            )}
          </AppleTile>

          <AppleTile padded={false} className="flex-1">
            <div className="px-5 pt-4">
              <h3 className="text-sm font-semibold tracking-tight">Next</h3>
            </div>
            <div className="mt-2">
              {nextSteps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => (step.section === 'overview' ? setShowEdit(true) : go(step.section))}
                  className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{step.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{step.detail}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </AppleTile>
        </div>
      </div>

      <AppleSection title="Workspace">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {workspaceTiles.map((tile) => {
            const Icon = tile.icon
            return (
              <button
                key={tile.section}
                type="button"
                onClick={() => go(tile.section)}
                className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-card px-3 py-3 text-left shadow-soft transition-colors hover:border-foreground/15 hover:bg-accent/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{tile.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{tile.desc}</p>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground" />
              </button>
            )
          })}
        </div>
      </AppleSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppleSection title="Documents" action={<AppleLink onClick={() => go('documents')}>All</AppleLink>}>
          <AppleTile padded={false}>
            {recentDocuments.length === 0 ? (
              <div className="flex items-center justify-between gap-3 px-4 py-5">
                <p className="text-xs text-muted-foreground">No documents in this project yet.</p>
                <Button size="sm" variant="outline" onClick={() => go('documents')}>
                  Open
                </Button>
              </div>
            ) : (
              recentDocuments.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => navigate(`/project/${projectId}/editor/${doc.id}`)}
                  className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left last:border-b-0 hover:bg-accent/40"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type} · {formatRelativeTime(doc.updatedAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </AppleTile>
        </AppleSection>

        <AppleSection title="Flows" action={<AppleLink onClick={() => go('flows')}>All</AppleLink>}>
          <AppleTile padded={false}>
            {recentFlows.length === 0 ? (
              <div className="flex items-center justify-between gap-3 px-4 py-5">
                <p className="text-xs text-muted-foreground">No diagrams in this project yet.</p>
                <Button size="sm" variant="outline" onClick={() => go('flows')}>
                  Open
                </Button>
              </div>
            ) : (
              recentFlows.map((flow) => (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => navigate(`/project/${projectId}/flows/${flow.id}`)}
                  className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left last:border-b-0 hover:bg-accent/40"
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{flow.title}</p>
                    <p className="truncate text-[11px] capitalize text-muted-foreground">
                      {flow.category} · {formatRelativeTime(flow.updatedAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </AppleTile>
        </AppleSection>
      </div>

      <AppleTile className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-semibold">Generate a document</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Turn this workspace into a polished spec.
          </p>
        </div>
        <Button size="sm" onClick={() => go('generate')}>
          <Sparkles className="h-3.5 w-3.5" />
          Generate
        </Button>
      </AppleTile>

      <EditProjectDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        project={currentProject}
        onSave={async (data) => {
          await updateProject(currentProject.id, {
            name: data.name,
            description: data.description,
            companyName: data.companyName,
            companyLogo: data.companyLogo,
            style: data.style
          })
          const api = await waitForDesktopApi()
          if (api?.projects.updateSettings) {
            await api.projects.updateSettings(currentProject.id, {
              documentGenerationRules: data.documentGenerationRules
            })
          }
          setShowEdit(false)
          toast.success('Project details updated')
        }}
      />
    </AppleCanvas>
  )
}

function SpecItem({
  label,
  value,
  live,
  capitalize
}: {
  label: string
  value: string
  live?: boolean
  capitalize?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 flex items-center gap-1.5 truncate text-sm font-semibold', capitalize && 'capitalize')}>
        {live !== undefined && (
          <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-emerald-500' : 'bg-muted-foreground')} />
        )}
        {value}
      </p>
    </div>
  )
}

function RequirementMeter({
  label,
  value,
  total
}: {
  label: string
  value: number
  total: number
}) {
  const percent = total ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{percent}%</span>
      </div>
      <AppleProgress className="mt-1.5" value={percent} />
      <p className="mt-1 text-[11px] text-muted-foreground">{value} captured</p>
    </div>
  )
}

function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSave
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: {
    id: string
    name: string
    description: string
    companyName: string
    companyLogo: string
    style: DocumentStyle
  }
  onSave: (data: {
    name: string
    description: string
    companyName: string
    companyLogo: string
    style: DocumentStyle
    documentGenerationRules: string
  }) => Promise<void>
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [companyName, setCompanyName] = useState(project.companyName)
  const [companyLogo, setCompanyLogo] = useState(project.companyLogo)
  const [style, setStyle] = useState<DocumentStyle>(project.style)
  const [generationRules, setGenerationRules] = useState('')
  const [saving, setSaving] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(project.name)
    setDescription(project.description)
    setCompanyName(project.companyName)
    setCompanyLogo(project.companyLogo)
    setStyle(project.style)
    setGenerationRules('')
    void (async () => {
      const api = await waitForDesktopApi()
      const result = await api?.projects.get(project.id)
      if (result?.success && result.data?.settings) {
        setGenerationRules(result.data.settings.documentGenerationRules ?? '')
      }
    })()
  }, [open, project])

  const selectLogo = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be smaller than 5 MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const maxWidth = 600
        const maxHeight = 240
        const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          toast.error('Could not process this logo')
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        setCompanyLogo(canvas.toDataURL('image/png'))
      }
      image.onerror = () => toast.error('Could not read this image')
      image.src = String(reader.result)
    }
    reader.onerror = () => toast.error('Could not read this image')
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      name: name.trim(),
      description: description.trim(),
      companyName: companyName.trim(),
      companyLogo,
      style,
      documentGenerationRules: generationRules
    })
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit project details</DialogTitle>
          <DialogDescription>Update the information used across this project workspace.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium">Project name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="flex w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-soft outline-none transition focus:border-foreground/25 focus:ring-2 focus:ring-ring/15"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium">Company</span>
              <Input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium">Document style</span>
              <select
                value={style}
                onChange={(event) => setStyle(event.target.value as DocumentStyle)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-soft outline-none transition focus:border-foreground/25 focus:ring-2 focus:ring-ring/15"
              >
                <option value="basic">Basic</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
                <option value="chatgpt">ChatGPT</option>
              </select>
            </label>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Document logo</span>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                selectLogo(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <div className="flex items-center gap-3 rounded-lg border border-input bg-background p-3">
              <div className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/50">
                {companyLogo ? (
                  <img src={companyLogo} alt="Company logo" className="max-h-10 max-w-20 object-contain" />
                ) : (
                  <ImagePlus className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{companyLogo ? 'Logo selected' : 'No logo selected'}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Appears in exported document headers.</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                    <ImagePlus className="h-3.5 w-3.5" />
                    {companyLogo ? 'Replace' : 'Select logo'}
                  </Button>
                  {companyLogo && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCompanyLogo('')}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Document generation rules</span>
            <p className="text-[11px] text-muted-foreground">
              Optional rules for AI documents in this project. Leave empty to follow workspace rules or the
              default. Project rules win if they conflict with workspace rules.
            </p>
            <DocumentGenerationRulesField
              scope="project"
              value={generationRules}
              onChange={setGenerationRules}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Changes apply to future generated documents.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
