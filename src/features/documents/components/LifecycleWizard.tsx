import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileCheck,
  Loader2,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import type { DocumentLength, DocumentStyle, DocumentType, ExtractKnowledgeResult } from '@shared/types'
import {
  ANALYSIS_STARTER_PACK,
  DOCUMENT_TYPE_LABELS,
  LIFECYCLE_STAGES,
  listOpenQuestions,
  type LifecycleStageId
} from '@shared/lib/project-lifecycle'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useKnowledgeStore } from '@/features/knowledge/stores/knowledge.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { PageContent } from '@/shared/components/layout/PageHeader'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { EmptyStateIllustrated } from '@/shared/components/ui/empty-state'
import { cn } from '@/shared/lib/utils'
import { DEFAULT_DOCUMENT_LENGTH, getLengthPreset } from '@/features/documents/lib/generation-options'
import { DocumentLengthControl } from '@/features/documents/components/DocumentLengthControl'
import { buildLifecycleDocumentPrompt } from '@/features/documents/lib/lifecycle-prompt'
import {
  GenerationProgressPanel,
  yieldToPaint,
  type GenerationJob
} from '@/features/documents/components/GenerationProgressPanel'

const STEPS = [
  { id: 'intake', title: 'Requirement', subtitle: 'Paste the request' },
  { id: 'analyze', title: 'Analyze', subtitle: 'Extract & questions' },
  { id: 'pack', title: 'Documents', subtitle: 'Choose the pack' },
  { id: 'generate', title: 'Generate', subtitle: 'Style & create' }
] as const

const STYLES: { value: DocumentStyle; label: string; desc: string }[] = [
  { value: 'chatgpt', label: 'ChatGPT', desc: 'Clear and conversational' },
  { value: 'professional', label: 'Professional', desc: 'Business standard' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Traceability & control' },
  { value: 'basic', label: 'Basic', desc: 'Concise bullets' }
]

interface LifecycleWizardProps {
  onUseDetailed: () => void
}

export function LifecycleWizard({ onUseDetailed }: LifecycleWizardProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const { generateRequirement, isGenerating, beginGeneration, updateGeneration, endGeneration } =
    useDocumentStore()
  const { bundle, stats, loadKnowledge, extractKnowledge, isExtracting } = useKnowledgeStore()
  const { apiKeyStatus } = useSettingsStore()
  const [step, setStep] = useState(0)
  const [rawRequirement, setRawRequirement] = useState(currentProject?.description ?? '')
  const [extractResult, setExtractResult] = useState<ExtractKnowledgeResult | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<DocumentType[]>([])
  const [style, setStyle] = useState<DocumentStyle>((currentProject?.style as DocumentStyle) ?? 'professional')
  const [documentLength, setDocumentLength] = useState<DocumentLength>(DEFAULT_DOCUMENT_LENGTH)
  const [customWordCount, setCustomWordCount] = useState(7500)
  const [packJobs, setPackJobs] = useState<GenerationJob[]>([])

  useEffect(() => {
    if (projectId) void loadKnowledge(projectId)
  }, [projectId, loadKnowledge])

  const openQuestions = listOpenQuestions(bundle)
  const lengthPreset = useMemo(
    () => getLengthPreset(documentLength, customWordCount),
    [documentLength, customWordCount]
  )
  const projectName = currentProject?.name ?? 'Project'

  const applyStagePack = (stageId: LifecycleStageId | 'starter') => {
    if (stageId === 'starter') {
      setSelectedTypes(ANALYSIS_STARTER_PACK)
      return
    }
    const stage = LIFECYCLE_STAGES.find((s) => s.id === stageId)
    if (stage) setSelectedTypes(stage.documentTypes)
  }

  const toggleType = (type: DocumentType) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))
  }

  const handleAnalyze = async () => {
    if (!projectId) return
    if (!rawRequirement.trim()) {
      toast.error('Paste an unstructured requirement first')
      return
    }
    const result = await extractKnowledge(projectId, rawRequirement.trim())
    if (!result) {
      toast.error('Analysis failed. Check your API key in Settings.')
      return
    }
    setExtractResult(result)
    setStep(1)
    toast.success('Requirement analyzed into Knowledge. Review open questions before generating.')
  }

  const handleGeneratePack = async () => {
    if (!projectId || selectedTypes.length === 0) return
    const jobs: GenerationJob[] = selectedTypes.map((type) => ({
      id: type,
      label: DOCUMENT_TYPE_LABELS[type],
      status: 'queued'
    }))
    setPackJobs(jobs)
    beginGeneration({
      title: 'Generating documents',
      detail: 'Preparing Knowledge…',
      current: 1,
      total: jobs.length,
      jobs,
      kbPercent: stats?.completionPercent
    })
    await yieldToPaint()

    const patchJob = (id: string, update: Partial<GenerationJob>) => {
      setPackJobs((prev) => {
        const next = prev.map((job) => (job.id === id ? { ...job, ...update } : job))
        updateGeneration({ jobs: next })
        return next
      })
    }

    let lastDocId: string | null = null
    let generatedCount = 0
    try {
      for (let index = 0; index < selectedTypes.length; index++) {
        const type = selectedTypes[index]
        updateGeneration({ current: index + 1, detail: `Writing ${DOCUMENT_TYPE_LABELS[type]}…` })
        patchJob(type, { status: 'preparing', detail: 'Building a compact Knowledge prompt…' })
        await yieldToPaint()
        const prompt = buildLifecycleDocumentPrompt({
          projectName,
          type,
          style,
          bundle,
          additionalNotes: rawRequirement.trim() ? `Source requirement:\n${rawRequirement.trim()}` : undefined,
          documentLength,
          wordTarget: lengthPreset.wordTarget
        })
        patchJob(type, { status: 'writing', detail: 'Writing sections from Knowledge…' })
        await yieldToPaint()
        const { document: doc, error } = await generateRequirement(projectId, type, style, prompt, {
          title: `${DOCUMENT_TYPE_LABELS[type]} — ${projectName}`,
          documentLength,
          customWordCount: documentLength === 'custom' ? customWordCount : undefined,
          wordTarget: lengthPreset.wordTarget,
          maxTokens: lengthPreset.maxTokens,
          knowledgeAlreadyInPrompt: Boolean(bundle)
        })
        if (!doc) {
          patchJob(type, { status: 'error', detail: error ?? 'Generation failed' })
          toast.error(error ?? 'Generation failed. Check your API key and try again.')
          break
        }
        lastDocId = doc.id
        generatedCount += 1
        patchJob(type, { status: 'done', detail: doc.title })
        await yieldToPaint()
      }
      if (generatedCount > 0) {
        toast.success(
          `Generated ${generatedCount} document${generatedCount === 1 ? '' : 's'} from project knowledge`
        )
      }
    } finally {
      endGeneration()
    }
    // Open the last generated document in the editor (same doc when only one was created).
    if (lastDocId) {
      navigate(`/project/${projectId}/editor/${lastDocId}`, { replace: true })
    }
  }

  const isPackRunning = packJobs.some(
    (job) => job.status === 'preparing' || job.status === 'writing' || job.status === 'saving'
  )
  const showProgress = packJobs.length > 0

  if (!apiKeyStatus?.isSet) {
    return (
      <EmptyStateIllustrated
        variant="documents"
        onAction={() => navigate(`/project/${projectId}/settings`)}
      />
    )
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Lifecycle generate</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {projectName} · requirement → analyze → documents
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {stats && (
            <span className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium">
              <Brain className="h-3 w-3 text-primary" />
              KB {stats.completionPercent}%
            </span>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onUseDetailed}>
            Detailed wizard
          </Button>
          <Button size="sm" variant="ghost" className="h-8" asChild>
            <Link to={`/project/${projectId}/knowledge`}>Knowledge</Link>
          </Button>
        </div>
      </div>

      <PageContent fullBleed className="relative min-h-0 flex-1 overflow-hidden p-0">
        <div className="flex h-full min-h-0">
          <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
            <div className="border-b border-border px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Process</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <nav className="p-3">
              <ul className="flex flex-col gap-1">
                {STEPS.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPackRunning) setStep(i)
                      }}
                      disabled={isPackRunning}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm',
                        i === step ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-semibold',
                          i < step && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
                          i === step && 'border-primary/20 bg-primary text-primary-foreground'
                        )}
                      >
                        {i < step ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <span>
                        <span className="block font-medium">{s.title}</span>
                        <span className="block text-[11px] text-muted-foreground">{s.subtitle}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-2xl space-y-4">
              {step === 0 && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-base font-semibold">Unstructured requirement</h2>
                    <p className="text-sm text-muted-foreground">
                      Paste any software request. Analysis extracts modules, features, roles, and open questions.
                      It will not invent platforms, vendors, or critical requirements.
                    </p>
                  </div>
                  <Textarea
                    value={rawRequirement}
                    onChange={(e) => setRawRequirement(e.target.value)}
                    rows={14}
                    placeholder="Example: We need a web app for our operations team to track jobs, assign technicians, and send the customer an SMS when a visit is complete…"
                    className="min-h-[220px] text-sm"
                  />
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStep(1)} disabled={!bundle}>
                      Skip — use existing Knowledge
                    </Button>
                    <Button size="sm" onClick={() => void handleAnalyze()} disabled={isExtracting || !rawRequirement.trim()}>
                      {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Analyze requirement
                    </Button>
                  </div>
                </section>
              )}

              {step === 1 && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-base font-semibold">Review analysis</h2>
                    <p className="text-sm text-muted-foreground">
                      Structured Knowledge is the source of truth. Documents are generated views of this data.
                    </p>
                  </div>
                  {extractResult && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ['Modules', extractResult.modules],
                          ['Features', extractResult.features],
                          ['Requirements', extractResult.requirements],
                          ['Roles', extractResult.roles],
                          ['Rules', extractResult.businessRules],
                          ['Integrations', extractResult.integrations],
                          ['Risks', extractResult.risks],
                          ['Questions', extractResult.openQuestions]
                        ] as const
                      ).map(([label, count]) => (
                        <div key={label} className="rounded-md border border-border bg-card px-2 py-2">
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                          <p className="text-lg font-semibold tabular-nums">{count}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-md border border-border bg-card/40 p-3 text-sm">
                    <p className="font-medium">In Knowledge now</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {bundle?.modules.length ?? 0} modules · {bundle?.features.length ?? 0} features ·{' '}
                      {bundle?.requirements.length ?? 0} requirements · {bundle?.roles.length ?? 0} roles
                    </p>
                    {bundle?.overview?.projectSummary && (
                      <p className="mt-2 text-[12px] leading-relaxed">{bundle.overview.projectSummary}</p>
                    )}
                  </div>
                  {openQuestions.length > 0 ? (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                        <CircleHelp className="h-4 w-4" /> Open questions — do not silently invent answers
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {openQuestions.map((q) => (
                          <li key={q.id} className="text-[12px]">
                            <span className="font-medium">{q.question}</span>
                            <span className="text-muted-foreground"> — {q.reason || 'Missing from the source'} ({q.affectedArea})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> No open analysis questions stored.
                    </p>
                  )}
                  <div className="flex justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                      <ChevronLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button size="sm" onClick={() => setStep(2)}>
                      Choose documents <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-base font-semibold">Document pack</h2>
                    <p className="text-sm text-muted-foreground">
                      Select only the documents you need for this requirement. Nothing is selected until you choose.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => applyStagePack('starter')}>
                      Starter pack
                    </Button>
                    {LIFECYCLE_STAGES.filter((s) => !s.optional).map((stage) => (
                      <Button
                        key={stage.id}
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        onClick={() => applyStagePack(stage.id)}
                      >
                        {stage.label}
                      </Button>
                    ))}
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {LIFECYCLE_STAGES.flatMap((stage) => stage.documentTypes)
                      .filter((type, index, all) => all.indexOf(type) === index)
                      .map((type) => {
                        const selected = selectedTypes.includes(type)
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => toggleType(type)}
                            className={cn(
                              'flex items-center gap-2 rounded-md border px-2 py-2 text-left text-xs',
                              selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-4 w-4 items-center justify-center rounded border',
                                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                              )}
                            >
                              {selected && <Check className="h-3 w-3" />}
                            </span>
                            {DOCUMENT_TYPE_LABELS[type]}
                          </button>
                        )
                      })}
                  </div>
                  {selectedTypes.length === 0 && (
                    <p className="flex items-center gap-1.5 text-[12px] text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> Select at least one document type.
                    </p>
                  )}
                  <div className="flex justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                      <ChevronLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button size="sm" disabled={selectedTypes.length === 0} onClick={() => setStep(3)}>
                      Output settings <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </section>
              )}

              {step === 3 && (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Generate from Knowledge</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedTypes.length} document{selectedTypes.length === 1 ? '' : 's'} will be created sequentially.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {STYLES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setStyle(item.value)}
                        className={cn(
                          'rounded-md border px-3 py-2 text-left',
                          style === item.value ? 'border-primary ring-1 ring-primary/20' : 'border-border'
                        )}
                      >
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                  <DocumentLengthControl
                    length={documentLength}
                    customWordCount={customWordCount}
                    onLengthChange={setDocumentLength}
                    onCustomWordCountChange={setCustomWordCount}
                  />
                  <ul className="flex flex-wrap gap-1">
                    {selectedTypes.map((type) => (
                      <li key={type} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px]">
                        {DOCUMENT_TYPE_LABELS[type]}
                      </li>
                    ))}
                  </ul>
                  {showProgress ? (
                    <GenerationProgressPanel jobs={packJobs} kbPercent={stats?.completionPercent} />
                  ) : null}
                  <div className="flex justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setStep(2)} disabled={isPackRunning}>
                      <ChevronLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleGeneratePack()}
                      disabled={isGenerating || isPackRunning}
                    >
                      {isPackRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                      {isPackRunning ? 'Generating…' : 'Generate pack'}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </PageContent>
    </div>
  )
}
