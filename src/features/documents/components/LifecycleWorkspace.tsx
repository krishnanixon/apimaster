import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  GitBranch,
  HeartPulse,
  Loader2,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import type { Document, DocumentStyle, DocumentType, KnowledgeBundle } from '@shared/types'
import {
  ANALYSIS_STARTER_PACK,
  DOCUMENT_TYPE_LABELS,
  LIFECYCLE_STAGES,
  computeProjectHealth,
  computeStageProgress,
  inferCurrentStage,
  listOpenQuestions,
  type LifecycleStageId
} from '@shared/lib/project-lifecycle'
import { DEFAULT_DOCUMENT_LENGTH, getLengthPreset } from '@/features/documents/lib/generation-options'
import { buildLifecycleDocumentPrompt } from '@/features/documents/lib/lifecycle-prompt'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_STYLES } from '@/features/documents/lib/document-meta'

interface LifecycleWorkspaceProps {
  projectId: string
  projectName: string
  projectStyle?: DocumentStyle
  documents: Document[]
  bundle: KnowledgeBundle | null
  onOpenDocument: (doc: Document) => void
}

const HEALTH_STYLES: Record<string, string> = {
  healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  at_risk: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  critical: 'border-destructive/30 bg-destructive/10 text-destructive'
}

export function LifecycleWorkspace({
  projectId,
  projectName,
  projectStyle = 'professional',
  documents,
  bundle,
  onOpenDocument
}: LifecycleWorkspaceProps) {
  const navigate = useNavigate()
  const { generateRequirement, isGenerating, beginGeneration, updateGeneration, endGeneration } = useDocumentStore()
  const health = useMemo(() => computeProjectHealth(documents, bundle), [documents, bundle])
  const currentStageId = health.currentStageId
  const [selectedStageId, setSelectedStageId] = useState<LifecycleStageId>(currentStageId)
  const [generatingType, setGeneratingType] = useState<DocumentType | null>(null)
  const [packIndex, setPackIndex] = useState<{ current: number; total: number } | null>(null)

  const selectedStage = LIFECYCLE_STAGES.find((s) => s.id === selectedStageId) ?? LIFECYCLE_STAGES[0]
  const stageProgress = computeStageProgress(documents, selectedStage)
  const openQuestions = listOpenQuestions(bundle)
  const lengthPreset = getLengthPreset(DEFAULT_DOCUMENT_LENGTH)

  const generateOne = async (type: DocumentType, openEditor: boolean) => {
    setGeneratingType(type)
    try {
      const prompt = buildLifecycleDocumentPrompt({
        projectName,
        type,
        style: projectStyle,
        bundle,
        documentLength: DEFAULT_DOCUMENT_LENGTH,
        wordTarget: lengthPreset.wordTarget
      })
      const { document: doc, error } = await generateRequirement(projectId, type, projectStyle, prompt, {
        title: `${DOCUMENT_TYPE_LABELS[type]} — ${projectName}`,
        documentLength: DEFAULT_DOCUMENT_LENGTH,
        wordTarget: lengthPreset.wordTarget,
        maxTokens: lengthPreset.maxTokens
      })
      if (doc) {
        toast.success(`${DOCUMENT_TYPE_LABELS[type]} generated`)
        if (openEditor) navigate(`/project/${projectId}/editor/${doc.id}`)
        return true
      }
      toast.error(error ?? 'Generation failed. Check your API key in Settings.')
      return false
    } finally {
      setGeneratingType(null)
    }
  }

  const generateMissing = async (types: DocumentType[]) => {
    if (types.length === 0) return
    setPackIndex({ current: 0, total: types.length })
    beginGeneration({
      title: 'Generating documents',
      detail: 'Writing from Knowledge…',
      current: 1,
      total: types.length,
      jobs: types.map((type) => ({
        id: type,
        label: DOCUMENT_TYPE_LABELS[type],
        status: 'queued'
      }))
    })
    try {
      for (let i = 0; i < types.length; i++) {
        setPackIndex({ current: i + 1, total: types.length })
        updateGeneration({
          current: i + 1,
          detail: `Writing ${DOCUMENT_TYPE_LABELS[types[i]]}…`
        })
        const last = i === types.length - 1
        const ok = await generateOne(types[i], last)
        if (!ok) break
      }
    } finally {
      setPackIndex(null)
      endGeneration()
    }
  }

  return (
    <div className="grid min-h-0 gap-2.5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="rounded-md border border-border/70 bg-card/40 p-1.5">
        <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Lifecycle
        </p>
        <nav className="flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto">
          {LIFECYCLE_STAGES.map((stage) => {
            const progress = computeStageProgress(documents, stage)
            const active = stage.id === selectedStageId
            const current = stage.id === currentStageId
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelectedStageId(stage.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                  active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold',
                    progress.missing.length === 0
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : current
                        ? 'border-primary/40 bg-primary/15 text-primary'
                        : 'border-border'
                  )}
                >
                  {progress.missing.length === 0 ? <Check className="h-3 w-3" /> : stage.order}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{stage.label}</span>
                <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                  {progress.existing.length}/{stage.documentTypes.length}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="space-y-2.5">
        <div className={cn('rounded-md border px-3 py-2.5', HEALTH_STYLES[health.status])}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <HeartPulse className="h-3.5 w-3.5" />
                Project health: {health.status === 'at_risk' ? 'At risk' : health.status === 'critical' ? 'Critical' : 'Healthy'}
              </p>
              <p className="mt-1 text-[11px] opacity-90">
                Score {Math.round(health.score * 100)} from weighted factors — not an arbitrary percentage.
                Current stage: {LIFECYCLE_STAGES.find((s) => s.id === currentStageId)?.label}.
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => navigate(`/project/${projectId}/generate`)}
            >
              <Sparkles className="h-3.5 w-3.5" /> Start from requirement
            </Button>
          </div>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {health.factors.map((factor) => (
              <li key={factor.id} className="text-[11px] leading-snug">
                <span className="font-medium">{factor.label}</span>
                <span className="opacity-80"> · {Math.round(factor.score * 100)}% · {factor.note}</span>
              </li>
            ))}
          </ul>
        </div>

        {openQuestions.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <CircleHelp className="h-3.5 w-3.5" />
              {openQuestions.length} open question{openQuestions.length === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Answer these in Knowledge before treating later-stage documents as complete. The analyzer does not invent answers.
            </p>
            <ul className="mt-1.5 space-y-1">
              {openQuestions.slice(0, 5).map((q) => (
                <li key={q.id} className="text-[11px]">
                  <span className="font-medium">{q.question}</span>
                  <span className="text-muted-foreground"> · {q.affectedArea} · {q.priority}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-md border border-border/70 bg-card/30 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{selectedStage.label}</h2>
              <p className="mt-0.5 max-w-xl text-[11px] text-muted-foreground">{selectedStage.description}</p>
            </div>
            {stageProgress.missing.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={isGenerating}
                onClick={() => void generateMissing(stageProgress.missing)}
              >
                {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {packIndex
                  ? `Generating ${packIndex.current}/${packIndex.total}`
                  : `Generate missing (${stageProgress.missing.length})`}
              </Button>
            )}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {selectedStage.documentTypes.map((type) => {
              const existing = stageProgress.existing.filter((d) => d.type === type)
              const doc = existing[0]
              return (
                <div key={type} className="rounded-md border border-border/60 bg-background px-2.5 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium">{DOCUMENT_TYPE_LABELS[type]}</p>
                      {doc ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{doc.title}</p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Not generated yet</p>
                      )}
                    </div>
                    {doc ? (
                      <Badge variant="outline" className={cn('h-5 text-[9px]', DOCUMENT_STATUS_STYLES[doc.status])}>
                        {DOCUMENT_STATUS_LABELS[doc.status]}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="h-5 text-[9px]">Missing</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex gap-1">
                    {doc ? (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => {
                        const full = documents.find((d) => d.id === doc.id)
                        if (full) onOpenDocument(full)
                      }}>
                        <FileText className="h-3 w-3" /> Open
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px]"
                        disabled={isGenerating}
                        onClick={() => void generateOne(type, true)}
                      >
                        {generatingType === type ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Generate
                      </Button>
                    )}
                    {existing.length > 1 && (
                      <span className="self-center text-[10px] text-muted-foreground">+{existing.length - 1} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {selectedStage.id === 'flows' && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 h-7 px-2 text-xs"
              onClick={() => navigate(`/project/${projectId}/flows`)}
            >
              <GitBranch className="h-3.5 w-3.5" /> Open Flow Designer
            </Button>
          )}
        </div>

        {documents.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Paste an unstructured requirement in Generate to analyze gaps, populate Knowledge, then create the
              starter pack ({ANALYSIS_STARTER_PACK.map((t) => DOCUMENT_TYPE_LABELS[t]).join(', ')}).
              <button
                type="button"
                className="ml-1 inline-flex items-center font-medium text-foreground"
                onClick={() => navigate(`/project/${projectId}/generate`)}
              >
                Go to Generate <ChevronRight className="h-3 w-3" />
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
