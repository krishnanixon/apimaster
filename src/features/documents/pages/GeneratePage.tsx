import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
  Building2,
  Users,
  Boxes,
  Plug,
  Cpu,
  FileCheck,
  Loader2,
  Brain,
  Zap,
  LayoutList,
  Database,
  Shield,
  Clock,
  AlertTriangle,
  Network,
  TestTube2,
  MessageSquareText,
  FileSignature,
  Rocket,
  Handshake,
  Calculator,
  RotateCcw
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { useKnowledgeStore } from '@/features/knowledge/stores/knowledge.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { EmptyStateIllustrated } from '@/shared/components/ui/empty-state'
import { DOCUMENT_TYPE_LABELS, cn } from '@/shared/lib/utils'
import { buildDocumentCreationPrompt } from '@/features/documents/templates/document-templates'
import {
  DEFAULT_DOCUMENT_LENGTH,
  formatTypeSupportingPrompts,
  getLengthPreset
} from '@/features/documents/lib/generation-options'
import { ModuleFeatureSelector } from '@/features/documents/components/ModuleFeatureSelector'
import { WizardKnowledgePreview } from '@/features/documents/components/WizardKnowledgePreview'
import { DocumentLengthControl } from '@/features/documents/components/DocumentLengthControl'
import { TypeSupportingPrompts } from '@/features/documents/components/TypeSupportingPrompts'
import { QuickGenerateDialog } from '@/features/documents/components/QuickGenerateDialog'
import { LifecycleWizard } from '@/features/documents/components/LifecycleWizard'
import {
  GenerationProgressPanel,
  yieldToPaint,
  type GenerationJob
} from '@/features/documents/components/GenerationProgressPanel'
import type { DocumentLength, DocumentStyle, DocumentType, KnowledgeBundle } from '@shared/types'
import { toast } from 'sonner'

const STEPS = [
  { id: 'project', title: 'Project', subtitle: 'Name & description', icon: Building2 },
  { id: 'business', title: 'Business', subtitle: 'Goals & audience', icon: Zap },
  { id: 'modules', title: 'Modules', subtitle: 'System areas', icon: Boxes },
  { id: 'users', title: 'Roles', subtitle: 'User types', icon: Users },
  { id: 'features', title: 'Features', subtitle: 'Capabilities', icon: Sparkles },
  { id: 'integrations', title: 'Integrations', subtitle: 'External systems', icon: Plug },
  { id: 'technology', title: 'Technology', subtitle: 'Stack & constraints', icon: Cpu },
  { id: 'style', title: 'Output', subtitle: 'Type & format', icon: FileCheck },
  { id: 'review', title: 'Generate', subtitle: 'Review & create', icon: Check }
] as const

const DOC_TYPES: { type: DocumentType; icon: LucideIcon; desc: string }[] = [
  { type: 'discovery', icon: Sparkles, desc: 'Problem, users, open questions' },
  { type: 'brd', icon: Building2, desc: 'Business requirements' },
  { type: 'prd', icon: Rocket, desc: 'Product vision & roadmap' },
  { type: 'scope', icon: LayoutList, desc: 'In / out / future scope' },
  { type: 'requirements', icon: LayoutList, desc: 'Full SRS document' },
  { type: 'functional', icon: Check, desc: 'Functional specs' },
  { type: 'non_functional', icon: Shield, desc: 'Quality attributes' },
  { type: 'product_definition', icon: Boxes, desc: 'Roles, modules, features' },
  { type: 'user_stories', icon: MessageSquareText, desc: 'Agile user stories' },
  { type: 'ui_ux', icon: LayoutList, desc: 'Screen inventory & states' },
  { type: 'database_schema', icon: Database, desc: 'Data models' },
  { type: 'api_spec', icon: Network, desc: 'API documentation' },
  { type: 'timeline', icon: Clock, desc: 'Project schedule' },
  { type: 'risks', icon: AlertTriangle, desc: 'Risk register' },
  { type: 'architecture', icon: Boxes, desc: 'System architecture' },
  { type: 'system_design', icon: Network, desc: 'SDD with in-doc flowcharts' },
  { type: 'technical_design', icon: Cpu, desc: 'Technology & components' },
  { type: 'testing', icon: TestTube2, desc: 'Test strategy' },
  { type: 'uat', icon: FileCheck, desc: 'Acceptance & sign-off' },
  { type: 'deployment', icon: Rocket, desc: 'Environments & rollback' },
  { type: 'release_notes', icon: FileCheck, desc: 'Versioned changes' },
  { type: 'user_guide', icon: MessageSquareText, desc: 'End-user documentation' },
  { type: 'handover', icon: Handshake, desc: 'Technical handover' },
  { type: 'change_request', icon: AlertTriangle, desc: 'Impact & approval' },
  { type: 'contract', icon: FileSignature, desc: 'Contract terms and conditions' },
  { type: 'proposal', icon: Handshake, desc: 'Pre-sales client proposal' },
  { type: 'estimation_report', icon: Calculator, desc: 'Effort & cost estimate' }
]

const STYLES: {
  value: DocumentStyle
  label: string
  desc: string
  preview: string
}[] = [
  {
    value: 'basic',
    label: 'Basic',
    desc: 'Concise bullets',
    preview: 'bg-muted/60'
  },
  {
    value: 'professional',
    label: 'Professional',
    desc: 'Business standard',
    preview: 'bg-blue-500/5 border-blue-500/20'
  },
  {
    value: 'enterprise',
    label: 'Enterprise',
    desc: 'Compliance & traceability',
    preview: 'bg-violet-500/5 border-violet-500/20'
  },
  {
    value: 'chatgpt',
    label: 'ChatGPT',
    desc: 'Clean & conversational',
    preview: 'bg-[#f7f7f8] dark:bg-[#212121]'
  }
]

interface WizardData {
  projectName: string
  projectDescription: string
  businessGoals: string
  targetAudience: string
  modules: string
  userRoles: string
  features: string
  integrations: string
  techStack: string
  docType: DocumentType
  style: DocumentStyle
  additionalNotes: string
  documentLength: DocumentLength
  customWordCount: number
  selectedModuleIds: string[]
  selectedFeatureIds: string[]
  typePrompts: Record<string, string>
}

const INITIAL: WizardData = {
  projectName: '',
  projectDescription: '',
  businessGoals: '',
  targetAudience: '',
  modules: '',
  userRoles: '',
  features: '',
  integrations: '',
  techStack: '',
  docType: 'requirements',
  style: 'chatgpt',
  additionalNotes: '',
  documentLength: DEFAULT_DOCUMENT_LENGTH,
  customWordCount: 7500,
  selectedModuleIds: [],
  selectedFeatureIds: [],
  typePrompts: {}
}

const WIZARD_STORAGE_PREFIX = 'generate-wizard:'

/** Load previously saved wizard inputs for a project (roles, tech, length, etc.). */
function loadSavedWizard(projectId?: string): WizardData | null {
  if (!projectId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(WIZARD_STORAGE_PREFIX + projectId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WizardData>
    // Merge over INITIAL so newly added fields always have a sane default.
    return { ...INITIAL, ...parsed }
  } catch {
    return null
  }
}

function saveWizard(projectId: string, data: WizardData): void {
  try {
    window.localStorage.setItem(WIZARD_STORAGE_PREFIX + projectId, JSON.stringify(data))
  } catch {
    /* ignore storage quota / private mode errors */
  }
}

function clearSavedWizard(projectId: string): void {
  try {
    window.localStorage.removeItem(WIZARD_STORAGE_PREFIX + projectId)
  } catch {
    /* ignore */
  }
}

function parseJsonLines(json: string): string {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.join('\n') : json
  } catch {
    return json
  }
}

function bundleToWizardData(bundle: KnowledgeBundle, projectName: string): Partial<WizardData> {
  const o = bundle.overview
  const modules = bundle.modules.map((m) => m.title).join('\n')
  const features = bundle.features.map((f) => {
    const mod = bundle.modules.find((m) => m.id === f.moduleId)
    return mod ? `${f.title} (${mod.title})` : f.title
  }).join('\n')
  const roles = bundle.roles.map((r) => r.name).join('\n')
  const integrations = bundle.integrations.map((i) => i.name).join('\n')
  const techFromDecisions = bundle.decisions
    .filter((d) => d.category.toLowerCase().includes('tech') || d.category.toLowerCase().includes('stack'))
    .map((d) => `${d.title}: ${d.decision}`)
    .join('\n')

  return {
    projectName,
    projectDescription: o?.projectSummary || o?.scope || '',
    businessGoals: o ? parseJsonLines(o.goals) : '',
    targetAudience: o?.targetUsers || '',
    modules,
    userRoles: roles,
    features,
    integrations,
    techStack: techFromDecisions
  }
}

function stepHasContent(stepIndex: number, data: WizardData): boolean {
  switch (stepIndex) {
    case 0:
      return !!(data.projectName || data.projectDescription)
    case 1:
      return !!(data.businessGoals || data.targetAudience)
    case 2:
      return !!data.modules
    case 3:
      return !!data.userRoles
    case 4:
      return !!data.features
    case 5:
      return !!data.integrations
    case 6:
      return !!data.techStack
    case 7:
      return true
    case 8:
      return true
    default:
      return false
  }
}

export function GeneratePage() {
  const [mode, setMode] = useState<'lifecycle' | 'wizard'>(() =>
    useSettingsStore.getState().settings?.documentWorkflowMode === 'expert' ? 'wizard' : 'lifecycle'
  )
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const { generateRequirement, createDocument, isGenerating, beginGeneration, updateGeneration, endGeneration } =
    useDocumentStore()
  const { bundle, stats, loadKnowledge, extractKnowledge } = useKnowledgeStore()
  const { apiKeyStatus, settings } = useSettingsStore()
  const [step, setStep] = useState(0)
  const [quickOpen, setQuickOpen] = useState(false)
  const [genJobs, setGenJobs] = useState<GenerationJob[]>([])
  // Restore any previously saved wizard inputs so users can build multiple
  // documents from the same project context without re-entering everything.
  const [restoredFromSave] = useState(() => !!loadSavedWizard(projectId))
  const [kbImported, setKbImported] = useState(restoredFromSave)
  const [data, setData] = useState<WizardData>(() => {
    const saved = loadSavedWizard(projectId)
    if (saved) return saved
    return {
      ...INITIAL,
      projectName: currentProject?.name ?? '',
      projectDescription: currentProject?.description ?? '',
      style: (currentProject?.style as DocumentStyle) ?? 'professional'
    }
  })

  useEffect(() => {
    if (projectId) loadKnowledge(projectId)
  }, [projectId, loadKnowledge])

  useEffect(() => {
    if (!settings) return
    setMode(settings.documentWorkflowMode === 'expert' ? 'wizard' : 'lifecycle')
  }, [settings?.documentWorkflowMode])

  // Persist wizard inputs on every change so they survive navigation / reopening.
  useEffect(() => {
    if (projectId) saveWizard(projectId, data)
  }, [projectId, data])

  useEffect(() => {
    if (restoredFromSave) {
      toast.info('Restored your previous inputs for this project')
    }
    // Only announce once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const importFromKnowledge = useCallback(() => {
    if (!bundle || !currentProject) return
    const imported = bundleToWizardData(bundle, currentProject.name)
    setData((d) => ({
      ...d,
      ...imported,
      selectedModuleIds: bundle.modules.map((m) => m.id),
      selectedFeatureIds: bundle.features.map((f) => f.id)
    }))
    setKbImported(true)
    toast.success('Fields filled from Knowledge Base')
  }, [bundle, currentProject])

  useEffect(() => {
    if (bundle && stats && stats.completionPercent >= 20 && !kbImported) {
      importFromKnowledge()
    }
  }, [bundle, stats, kbImported, importFromKnowledge])

  const update = (partial: Partial<WizardData>) => setData((d) => ({ ...d, ...partial }))

  const handleReset = () => {
    if (projectId) clearSavedWizard(projectId)
    setData({
      ...INITIAL,
      projectName: currentProject?.name ?? '',
      projectDescription: currentProject?.description ?? '',
      style: (currentProject?.style as DocumentStyle) ?? 'professional'
    })
    setStep(0)
    setKbImported(false)
    toast.success('Wizard reset — start fresh')
  }

  const selectedModulesText = useMemo(() => {
    if (!bundle) return data.modules
    const selected = bundle.modules.filter((m) => data.selectedModuleIds.includes(m.id))
    if (selected.length === 0) return data.modules
    return selected.map((m) => `- ${m.title}: ${m.description || 'No description'}`).join('\n')
  }, [bundle, data.selectedModuleIds, data.modules])

  const selectedFeaturesText = useMemo(() => {
    if (!bundle) return data.features
    const selected = bundle.features.filter((f) => data.selectedFeatureIds.includes(f.id))
    if (selected.length === 0) return data.features
    return selected
      .map((f) => {
        const mod = bundle.modules.find((m) => m.id === f.moduleId)
        return `- ${f.title}${mod ? ` [${mod.title}]` : ''}: ${f.description || ''}`
      })
      .join('\n')
  }, [bundle, data.selectedFeatureIds, data.features])

  const lengthPreset = useMemo(
    () => getLengthPreset(data.documentLength, data.customWordCount),
    [data.documentLength, data.customWordCount]
  )

  const typeSupportingText = useMemo(
    () => formatTypeSupportingPrompts(data.docType, data.typePrompts),
    [data.docType, data.typePrompts]
  )

  const buildPrompt = (): string =>
    buildDocumentCreationPrompt({
      projectName: data.projectName,
      projectDescription: data.projectDescription,
      documentTitle: `${DOCUMENT_TYPE_LABELS[data.docType]} — ${data.projectName}`,
      documentDescription: data.projectDescription,
      type: data.docType,
      style: data.style,
      businessGoals: data.businessGoals,
      targetAudience: data.targetAudience,
      modules: data.modules,
      userRoles: data.userRoles,
      features: data.features,
      integrations: data.integrations,
      techStack: data.techStack,
      additionalNotes: data.additionalNotes,
      documentLength: data.documentLength,
      wordTarget: lengthPreset.wordTarget,
      selectedModules: selectedModulesText,
      selectedFeatures: selectedFeaturesText,
      typeSupportingPrompts: typeSupportingText,
      contractTemplate: data.docType === 'contract' ? data.typePrompts.templateVariant : undefined,
      contractTerms: data.docType === 'contract' ? data.typePrompts.termsConditions : undefined,
      contractConditions: data.docType === 'contract' ? data.typePrompts.specialConditions : undefined
    })

  const handleGenerate = async () => {
    if (!projectId) return
    const docTitle = `${DOCUMENT_TYPE_LABELS[data.docType]} — ${data.projectName}`
    const jobs: GenerationJob[] = [
      {
        id: data.docType,
        label: DOCUMENT_TYPE_LABELS[data.docType],
        status: 'preparing',
        detail: kbImported || bundle ? 'Using project Knowledge…' : 'Preparing prompt…'
      }
    ]
    setGenJobs(jobs)
    beginGeneration({
      title: 'Generating documents',
      detail: jobs[0].detail,
      current: 1,
      total: 1,
      jobs,
      kbPercent: stats?.completionPercent
    })
    let createdDocId: string | null = null
    try {
      await yieldToPaint()
      const prompt = buildPrompt()
      const writing = jobs.map((job) => ({
        ...job,
        status: 'writing' as const,
        detail: 'Writing sections from Knowledge…'
      }))
      setGenJobs(writing)
      updateGeneration({ jobs: writing, detail: 'Writing sections from Knowledge…' })
      await yieldToPaint()
      const { document: doc, error } = await generateRequirement(
        projectId,
        data.docType,
        data.style,
        prompt,
        {
          title: docTitle,
          documentLength: data.documentLength,
          customWordCount: data.documentLength === 'custom' ? data.customWordCount : undefined,
          wordTarget: lengthPreset.wordTarget,
          maxTokens: lengthPreset.maxTokens,
          knowledgeAlreadyInPrompt: Boolean(kbImported || bundle)
        }
      )
      if (doc) {
        createdDocId = doc.id
        setGenJobs((prev) => prev.map((job) => ({ ...job, status: 'done', detail: doc.title })))
        const wizardText = [
          `Project: ${data.projectName}`,
          data.projectDescription,
          `Business Goals: ${data.businessGoals}`,
          `Target Audience: ${data.targetAudience}`,
          `Modules: ${data.modules}`,
          `User Roles: ${data.userRoles}`,
          `Features: ${data.features}`,
          `Integrations: ${data.integrations}`,
          `Technology: ${data.techStack}`,
          data.additionalNotes
        ]
          .filter(Boolean)
          .join('\n')
        void extractKnowledge(projectId, wizardText)
        toast.success('Document generated from knowledge!')
      } else {
        setGenJobs((prev) =>
          prev.map((job) => ({ ...job, status: 'error', detail: error ?? 'Generation failed' }))
        )
        toast.error(error ?? 'Generation failed. Check your API key and try again.')
      }
    } finally {
      endGeneration()
    }
    // Open the generated doc after the blocking overlay clears.
    if (createdDocId) {
      navigate(`/project/${projectId}/editor/${createdDocId}`, { replace: true })
    }
  }

  const filledSteps = useMemo(
    () => STEPS.map((_, i) => stepHasContent(i, data)),
    [data]
  )

  if (!apiKeyStatus?.isSet) {
    return (
      <EmptyStateIllustrated
        variant="documents"
        onAction={() => navigate(`/project/${projectId}/settings`)}
      />
    )
  }

  if (mode === 'lifecycle') {
    return <LifecycleWizard onUseDetailed={() => setMode('wizard')} />
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <ModulePage>
      <PageHeader
        title="Generate document"
        description={
          currentProject?.name
            ? `${currentProject.name} · wizard for this project`
            : 'Step through context and generate with AI'
        }
        fluid
        actions={
          <>
            {stats && (
              <span className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium">
                <Brain className="h-3 w-3 text-primary" />
                KB {stats.completionPercent}%
              </span>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setMode('lifecycle')}>
              <Sparkles className="h-3.5 w-3.5" />
              Lifecycle flow
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setQuickOpen(true)}>
              <Zap className="h-3.5 w-3.5" />
              Quick generate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                if (!projectId) return
                void createDocument(projectId, {
                  title: 'Untitled Document',
                  type: data.docType,
                  style: data.style,
                  htmlContent: ''
                }).then((doc) => {
                  if (doc) {
                    toast.success('Blank document created')
                    navigate(`/project/${projectId}/editor/${doc.id}`)
                  } else {
                    toast.error('Could not create a blank document')
                  }
                })
              }}
            >
              Skip — blank
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={importFromKnowledge}>
              <Brain className="h-3.5 w-3.5" />
              Sync KB
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button size="sm" variant="ghost" className="h-7" asChild>
              <Link to={`/project/${projectId}/knowledge`}>Knowledge</Link>
            </Button>
          </>
        }
      />

      <PageContent fullBleed className="relative min-h-0 flex-1 overflow-hidden p-0">
        <div className="flex h-full min-h-0">
          {/* Step sidebar */}
          <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
            <div className="shrink-0 border-b border-border px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Wizard steps
              </p>
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Progress</span>
                  <span className="text-muted-foreground">{step + 1} / {STEPS.length}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3">
              <ul className="flex flex-col gap-1">
                {STEPS.map((s, i) => {
                  const active = i === step
                  const done = i < step
                  const Icon = s.icon
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setStep(i)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                          active && 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm',
                          !active && done && 'text-foreground hover:bg-sidebar-accent/60',
                          i > step && 'text-muted-foreground/70 hover:bg-sidebar-accent/40 hover:text-foreground'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold',
                            active && 'border-primary/20 bg-primary text-primary-foreground',
                            !active && done && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                            !active && !done && 'border-border bg-background text-muted-foreground'
                          )}
                        >
                          {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn('text-sm font-medium', active && 'text-foreground')}>
                              {s.title}
                            </span>
                            {filledSteps[i] && !active && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {s.subtitle}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            {kbImported && (
              <div className="shrink-0 border-t border-border p-3">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <Brain className="h-3.5 w-3.5" />
                    Knowledge linked
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Fields synced with your Knowledge Base.
                  </p>
                </div>
              </div>
            )}
          </aside>

          {/* Main panel */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Mobile progress */}
            <div className="border-b border-border px-6 py-4 lg:hidden">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">{STEPS[step].title}</span>
                <span className="text-muted-foreground">
                  {step + 1} / {STEPS.length}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-10">
              <div className={cn('mx-auto', step === 7 ? 'max-w-3xl' : 'max-w-2xl')}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {step === 0 && (
                      <StepShell
                        icon={Building2}
                        title="Project Information"
                        description="Core identity — usually pre-filled from your project and knowledge base"
                      >
                        <Field
                          label="Project Name"
                          value={data.projectName}
                          onChange={(v) => update({ projectName: v })}
                        />
                        <Field
                          label="Description"
                          value={data.projectDescription}
                          onChange={(v) => update({ projectDescription: v })}
                          multiline
                          hint="Pulled from Knowledge Base business summary when available"
                        />
                      </StepShell>
                    )}

                    {step === 1 && (
                      <StepShell
                        icon={Zap}
                        title="Business Context"
                        description="Goals and who the system serves"
                      >
                        <Field
                          label="Business Goals"
                          value={data.businessGoals}
                          onChange={(v) => update({ businessGoals: v })}
                          multiline
                          placeholder="What problems does this solve?"
                        />
                        <Field
                          label="Target Audience"
                          value={data.targetAudience}
                          onChange={(v) => update({ targetAudience: v })}
                          multiline
                          placeholder="Who will use this system?"
                        />
                      </StepShell>
                    )}

                    {step === 2 && (
                      <StepShell
                        icon={Boxes}
                        title="Modules"
                        description="Major functional areas — synced from Knowledge Base when available"
                      >
                        <WizardKnowledgePreview
                          projectId={projectId!}
                          bundle={bundle}
                          variant="modules"
                          onSyncText={(text) => update({ modules: text })}
                        />
                        <Field
                          label="Modules"
                          value={data.modules}
                          onChange={(v) => update({ modules: v })}
                          multiline
                          placeholder="One module per line — e.g. Appointment, Billing, CRM"
                          rows={6}
                        />
                      </StepShell>
                    )}

                    {step === 3 && (
                      <StepShell
                        icon={Users}
                        title="User Roles"
                        description="Types of users and their access"
                      >
                        <Field
                          label="Roles"
                          value={data.userRoles}
                          onChange={(v) => update({ userRoles: v })}
                          multiline
                          placeholder="One role per line — e.g. Admin, Manager, Customer"
                          rows={5}
                        />
                      </StepShell>
                    )}

                    {step === 4 && (
                      <StepShell
                        icon={Sparkles}
                        title="Features"
                        description="Key capabilities grouped by module from your knowledge base"
                      >
                        <WizardKnowledgePreview
                          projectId={projectId!}
                          bundle={bundle}
                          variant="features"
                          onSyncText={(text) => update({ features: text })}
                        />
                        <Field
                          label="Features"
                          value={data.features}
                          onChange={(v) => update({ features: v })}
                          multiline
                          placeholder="List features — synced from Knowledge Base when available"
                          rows={6}
                        />
                      </StepShell>
                    )}

                    {step === 5 && (
                      <StepShell
                        icon={Plug}
                        title="Integrations"
                        description="External services and third-party connections"
                      >
                        <Field
                          label="Integrations"
                          value={data.integrations}
                          onChange={(v) => update({ integrations: v })}
                          multiline
                          placeholder="Stripe, WhatsApp, Google Calendar..."
                          rows={5}
                        />
                      </StepShell>
                    )}

                    {step === 6 && (
                      <StepShell
                        icon={Cpu}
                        title="Technology"
                        description="Stack, platforms, and technical constraints"
                      >
                        <Field
                          label="Tech Stack"
                          value={data.techStack}
                          onChange={(v) => update({ techStack: v })}
                          multiline
                          placeholder="React, Node.js, PostgreSQL, AWS..."
                          rows={5}
                        />
                      </StepShell>
                    )}

                    {step === 7 && (
                      <StepShell
                        icon={FileCheck}
                        title="Document Output"
                        description="Type, style, scope, length, and type-specific prompts"
                      >
                        <div className="space-y-8">
                          <WizardSection title="Document type" description="Choose what kind of deliverable to generate">
                            <div className="grid gap-2 sm:grid-cols-2">
                              {DOC_TYPES.map(({ type, icon: Icon, desc }) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => update({ docType: type, typePrompts: {} })}
                                  className={cn(
                                    'flex items-start gap-3 rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-accent/30',
                                    data.docType === type
                                      ? 'border-primary ring-1 ring-primary/20'
                                      : 'border-border'
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                      data.docType === type
                                        ? 'bg-primary/15 text-primary'
                                        : 'bg-muted text-muted-foreground'
                                    )}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <span>
                                    <span className="block text-sm font-medium">
                                      {DOCUMENT_TYPE_LABELS[type]}
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground">{desc}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </WizardSection>

                          <TypeSupportingPrompts
                            docType={data.docType}
                            values={data.typePrompts}
                            onChange={(id, value) =>
                              update({ typePrompts: { ...data.typePrompts, [id]: value } })
                            }
                          />

                          <WizardSection
                            title="Scope"
                            description="Limit which modules and features are included in the document"
                          >
                            <ModuleFeatureSelector
                              modules={bundle?.modules ?? []}
                              features={bundle?.features ?? []}
                              selectedModuleIds={data.selectedModuleIds}
                              selectedFeatureIds={data.selectedFeatureIds}
                              onModuleToggle={(id) =>
                                update({
                                  selectedModuleIds: data.selectedModuleIds.includes(id)
                                    ? data.selectedModuleIds.filter((x) => x !== id)
                                    : [...data.selectedModuleIds, id]
                                })
                              }
                              onFeatureToggle={(id) =>
                                update({
                                  selectedFeatureIds: data.selectedFeatureIds.includes(id)
                                    ? data.selectedFeatureIds.filter((x) => x !== id)
                                    : [...data.selectedFeatureIds, id]
                                })
                              }
                              onSelectAllModules={() =>
                                update({ selectedModuleIds: bundle?.modules.map((m) => m.id) ?? [] })
                              }
                              onClearModules={() => update({ selectedModuleIds: [] })}
                              onSelectAllFeatures={() =>
                                update({ selectedFeatureIds: bundle?.features.map((f) => f.id) ?? [] })
                              }
                              onClearFeatures={() => update({ selectedFeatureIds: [] })}
                            />
                          </WizardSection>

                          <DocumentLengthControl
                            length={data.documentLength}
                            customWordCount={data.customWordCount}
                            onLengthChange={(documentLength) => update({ documentLength })}
                            onCustomWordCountChange={(customWordCount) => update({ customWordCount })}
                          />

                          <WizardSection title="Document style" description="Visual tone and formatting of the output">
                            <div className="grid gap-2 sm:grid-cols-2">
                              {STYLES.map((s) => (
                                <button
                                  key={s.value}
                                  type="button"
                                  onClick={() => update({ style: s.value })}
                                  className={cn(
                                    'overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-all',
                                    data.style === s.value
                                      ? 'border-primary ring-1 ring-primary/20'
                                      : 'border-border hover:bg-accent/30'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'border-b border-border/40 px-3 py-2',
                                      s.preview
                                    )}
                                  >
                                    <div className="space-y-1">
                                      <div
                                        className={cn(
                                          'h-1.5 rounded',
                                          s.value === 'chatgpt'
                                            ? 'w-2/3 bg-neutral-300 dark:bg-neutral-600'
                                            : 'w-1/2 bg-primary/30'
                                        )}
                                      />
                                      <div className="h-1 w-full rounded bg-muted-foreground/15" />
                                      <div className="h-1 w-4/5 rounded bg-muted-foreground/10" />
                                      {s.value === 'chatgpt' && (
                                        <div className="h-1 w-3/5 rounded bg-muted-foreground/10" />
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-3">
                                    <p className="text-sm font-medium">{s.label}</p>
                                    <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                                    {s.value === 'chatgpt' && data.style === 'chatgpt' && (
                                      <p className="mt-1 text-[10px] text-primary">
                                        Recommended for detailed, readable output
                                      </p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </WizardSection>
                        </div>
                      </StepShell>
                    )}

                    {step === 8 && (
                      <StepShell
                        icon={Check}
                        title="Review & Generate"
                        description="Confirm inputs — AI uses Knowledge Base + wizard data"
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <SummaryCard label="Project" value={data.projectName} />
                          <SummaryCard label="Type" value={DOCUMENT_TYPE_LABELS[data.docType]} />
                          <SummaryCard label="Style" value={data.style} className="capitalize" />
                          <SummaryCard label="Length" value={lengthPreset.description} />
                          <SummaryCard
                            label="Modules"
                            value={
                              data.selectedModuleIds.length > 0
                                ? `${data.selectedModuleIds.length} selected`
                                : bundle?.modules.length
                                  ? `${bundle.modules.length} (all)`
                                  : 'From wizard'
                            }
                          />
                          <SummaryCard
                            label="Features"
                            value={
                              data.selectedFeatureIds.length > 0
                                ? `${data.selectedFeatureIds.length} selected`
                                : bundle?.features.length
                                  ? `${bundle.features.length} (all)`
                                  : 'From wizard'
                            }
                          />
                          <SummaryCard
                            label="Knowledge"
                            value={stats ? `${stats.completionPercent}% complete` : '—'}
                          />
                        </div>

                        {(data.modules || data.features) && (
                          <Card className="bg-muted/30">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm">Context preview</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm">
                              <ul className="space-y-1.5">
                                {data.modules && (
                                  <li>
                                    <span className="text-muted-foreground">Modules: </span>
                                    {data.modules.split('\n').slice(0, 4).join(', ')}
                                    {data.modules.split('\n').length > 4 && '…'}
                                  </li>
                                )}
                                {data.features && (
                                  <li>
                                    <span className="text-muted-foreground">Features: </span>
                                    {data.features.split('\n').slice(0, 3).join(', ')}
                                    {data.features.split('\n').length > 3 && '…'}
                                  </li>
                                )}
                              </ul>
                            </CardContent>
                          </Card>
                        )}

                        <Field
                          label="Additional Notes"
                          value={data.additionalNotes}
                          onChange={(v) => update({ additionalNotes: v })}
                          multiline
                          placeholder="Anything else for the AI to consider..."
                        />

                        <details className="group rounded-lg border bg-card shadow-sm">
                          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                            View full generation prompt
                          </summary>
                          <pre className="max-h-48 overflow-y-auto border-t p-4 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                            {buildPrompt()}
                          </pre>
                        </details>

                        {genJobs.length > 0 ? (
                          <GenerationProgressPanel jobs={genJobs} kbPercent={stats?.completionPercent} />
                        ) : null}
                      </StepShell>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Footer nav */}
            <div className="flex shrink-0 items-center justify-between border-t border-border bg-background px-6 py-3 lg:px-10">
              <Button
                variant="outline"
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="h-8 gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              <div className="hidden items-center gap-1.5 lg:flex">
                {STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.title}
                    onClick={() => setStep(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === step ? 'w-8 bg-primary' : i < step ? 'w-2 bg-primary/40 hover:bg-primary/60' : 'w-2 bg-muted hover:bg-muted-foreground/40'
                    )}
                  />
                ))}
              </div>

              {step < STEPS.length - 1 ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => setStep(STEPS.length - 1)}>
                    Skip to generate
                  </Button>
                  <Button onClick={() => setStep(step + 1)} className="h-8 gap-1">
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button onClick={handleGenerate} disabled={isGenerating} className="h-8 gap-1.5">
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Document
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </PageContent>

      <QuickGenerateDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        projectName={data.projectName || currentProject?.name || 'Project'}
        projectDescription={data.projectDescription || currentProject?.description}
        projectStyle={data.style}
        generating={isGenerating}
        onGenerate={async (input) => {
          if (!projectId) return
          const { document: doc, error } = await generateRequirement(
            projectId,
            input.type,
            input.style,
            input.prompt,
            {
              title: input.title,
              documentLength: input.documentLength,
              customWordCount: input.customWordCount,
              wordTarget: input.wordTarget,
              maxTokens: input.maxTokens
            }
          )
          if (doc) {
            setQuickOpen(false)
            toast.success('Document generated')
            navigate(`/project/${projectId}/editor/${doc.id}`, { replace: true })
          } else {
            toast.error(error ?? 'Generation failed')
          }
        }}
      />
    </ModulePage>
  )
}

function StepShell({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: LucideIcon
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <Icon className="h-5 w-5 text-foreground" />
          </span>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  )
}

function WizardSection({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  hint,
  rows = 4
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
  hint?: string
  rows?: number
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="resize-none"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  className
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold', className)}>{value}</p>
    </div>
  )
}
