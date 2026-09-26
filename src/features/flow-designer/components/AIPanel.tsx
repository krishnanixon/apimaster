import { useState } from 'react'
import {
  Sparkles,
  Loader2,
  Wand2,
  ArrowLeftRight,
  ShieldCheck,
  Network,
  FileSearch
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { useFlowStore } from '../stores/flow.store'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import type {
  FlowAnalysisResult,
  FlowArchitectureResult,
  FlowExplanationResult,
  RequirementCoverageResult
} from '@shared/types'
import { toast } from 'sonner'

const PROMPT_SUGGESTIONS = [
  'Create an e-commerce checkout process',
  'Generate a hospital patient registration workflow',
  'Design an authentication process',
  'Generate a CRM lead management workflow'
]

type ResultView =
  | { kind: 'text'; content: string }
  | { kind: 'analysis'; content: FlowAnalysisResult }
  | { kind: 'explanation'; content: FlowExplanationResult }
  | { kind: 'architecture'; content: FlowArchitectureResult }
  | { kind: 'coverage'; content: RequirementCoverageResult }

interface AIPanelProps {
  flowId?: string
  onGenerated?: (nodes: string, edges: string) => void
}

export function AIPanel({ flowId, onGenerated }: AIPanelProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { nodes, edges, loadSnapshot, fitViewToContent } = useFlowEditorStore()
  const currentFlow = useFlowStore((s) => s.currentFlow)
  const { documents } = useDocumentStore()
  const [prompt, setPrompt] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRunningAction, setIsRunningAction] = useState(false)
  const [result, setResult] = useState<ResultView | null>(null)

  const flowPayload = () => ({
    projectId: projectId!,
    flowId: flowId!,
    nodes: JSON.stringify(nodes),
    edges: JSON.stringify(edges)
  })

  const handleGenerate = async () => {
    if (!projectId || !prompt.trim()) return
    setIsGenerating(true)
    setResult(null)
    try {
      const res = await window.electronAPI.flows.generate({
        projectId,
        prompt,
        documentId: documentId || undefined,
        category: currentFlow?.category
      })
      if (res.success && res.data) {
        const parsedNodes = JSON.parse(res.data.nodes)
        const parsedEdges = JSON.parse(res.data.edges)
        loadSnapshot(parsedNodes, parsedEdges, undefined, { recordHistory: true })
        fitViewToContent()
        onGenerated?.(res.data.nodes, res.data.edges)
        setResult({ kind: 'text', content: res.data.summary ?? 'Flow generated successfully.' })
        toast.success('Flow generated')
      } else {
        toast.error(res.error ?? 'Generation failed')
      }
    } catch {
      toast.error('Failed to generate flow')
    } finally {
      setIsGenerating(false)
    }
  }

  const runImprove = async () => {
    if (!projectId || !flowId) return
    setIsRunningAction(true)
    setResult(null)
    try {
      const res = await window.electronAPI.flows.aiAction({
        projectId,
        flowId,
        action: 'improve',
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges)
      })
      if (res.success && res.data) {
        setResult({ kind: 'text', content: res.data })
      } else {
        toast.error(res.error ?? 'AI action failed')
      }
    } catch {
      toast.error('AI action failed')
    } finally {
      setIsRunningAction(false)
    }
  }

  const runAnalyze = async () => {
    if (!projectId || !flowId) return
    setIsRunningAction(true)
    setResult(null)
    try {
      const res = await window.electronAPI.flows.analyze(flowPayload())
      if (res.success && res.data) {
        setResult({ kind: 'analysis', content: res.data })
      } else {
        toast.error(res.error ?? 'Analysis failed')
      }
    } catch {
      toast.error('Analysis failed')
    } finally {
      setIsRunningAction(false)
    }
  }

  const runExplain = async () => {
    if (!projectId || !flowId) return
    setIsRunningAction(true)
    setResult(null)
    try {
      const res = await window.electronAPI.flows.explain(flowPayload())
      if (res.success && res.data) {
        setResult({ kind: 'explanation', content: res.data })
      } else {
        toast.error(res.error ?? 'Explanation failed')
      }
    } catch {
      toast.error('Explanation failed')
    } finally {
      setIsRunningAction(false)
    }
  }

  const runCoverage = async () => {
    if (!projectId || !flowId) return
    setIsRunningAction(true)
    setResult(null)
    try {
      const res = await window.electronAPI.flows.requirementCoverage(flowPayload())
      if (res.success && res.data) {
        setResult({ kind: 'coverage', content: res.data })
      } else {
        toast.error(res.error ?? 'Requirement coverage check failed')
      }
    } catch {
      toast.error('Requirement coverage check failed')
    } finally {
      setIsRunningAction(false)
    }
  }

  const runArchitecture = async () => {
    if (!projectId || !flowId) return
    setIsRunningAction(true)
    setResult(null)
    try {
      const res = await window.electronAPI.flows.architecture(flowPayload())
      if (res.success && res.data) {
        setResult({ kind: 'architecture', content: res.data })
      } else {
        toast.error(res.error ?? 'Architecture generation failed')
      }
    } catch {
      toast.error('Architecture generation failed')
    } finally {
      setIsRunningAction(false)
    }
  }

  const handleReverse = async (
    outputType:
      | 'requirements'
      | 'user_stories'
      | 'acceptance_criteria'
      | 'api_spec'
      | 'database'
      | 'test_cases'
      | 'business_rules'
  ) => {
    if (!projectId || !flowId) return
    setIsRunningAction(true)
    try {
      const res = await window.electronAPI.flows.reverse({
        projectId,
        flowId,
        outputType
      })
      if (res.success && res.data) {
        const docType =
          outputType === 'api_spec'
            ? 'api_spec'
            : outputType === 'user_stories'
              ? 'user_stories'
              : 'requirements'
        const doc = await window.electronAPI.documents.create({
          projectId,
          title: `Generated ${outputType.replace(/_/g, ' ')}`,
          type: docType,
          htmlContent: res.data
        })
        if (doc.success && doc.data) {
          toast.success('Document created from flow')
          navigate(`/project/${projectId}/editor/${doc.data.id}`, { replace: true })
        }
      } else {
        toast.error(res.error ?? 'Reverse engineering failed')
      }
    } catch {
      toast.error('Reverse engineering failed')
    } finally {
      setIsRunningAction(false)
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <PanelCard
          icon={Sparkles}
          title="AI Flow Generation"
          description="Describe a process to generate nodes and connections"
        >
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the process or workflow to generate..."
            rows={4}
            className="text-xs"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PROMPT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPrompt(s)}
                className="rounded-md border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-background hover:text-foreground"
              >
                {s.length > 32 ? `${s.slice(0, 32)}…` : s}
              </button>
            ))}
          </div>
          {documents.length > 0 && (
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">From prompt only</option>
              <option value="" disabled>— Or from requirement document —</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          )}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="mt-3 w-full gap-2"
            size="sm"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Generate Flow
          </Button>
        </PanelCard>

        {(isGenerating || isRunningAction) && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {isGenerating ? 'Generating flow…' : 'Working…'}
          </div>
        )}

        <PanelCard
          icon={ShieldCheck}
          title="Flow Intelligence"
          description="Validate, analyze complexity, and detect missing flows"
        >
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-auto justify-start px-2 py-2 text-[10px] font-normal"
              disabled={isRunningAction || nodes.length === 0}
              onClick={runAnalyze}
            >
              Validate & Analyze
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-auto justify-start px-2 py-2 text-[10px] font-normal"
              disabled={isRunningAction || nodes.length === 0}
              onClick={runExplain}
            >
              Explain Flow
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 h-auto justify-start gap-1.5 px-2 py-2 text-[10px] font-normal"
              disabled={isRunningAction || nodes.length === 0}
              onClick={runArchitecture}
            >
              <Network className="h-3 w-3" />
              Generate API + DB Architecture
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 h-auto justify-start gap-1.5 px-2 py-2 text-[10px] font-normal"
              disabled={isRunningAction || nodes.length === 0}
              onClick={runCoverage}
            >
              <FileSearch className="h-3 w-3" />
              Check Requirement Coverage
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 h-auto justify-start gap-1.5 px-2 py-2 text-[10px] font-normal"
              disabled={isRunningAction || nodes.length === 0}
              onClick={runImprove}
            >
              Suggest improvements
            </Button>
          </div>
        </PanelCard>

        <PanelCard
          icon={ArrowLeftRight}
          title="Reverse AI"
          description="Generate documents from this flow"
        >
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['requirements', 'Requirements'],
                ['user_stories', 'User Stories'],
                ['acceptance_criteria', 'Acceptance Criteria'],
                ['api_spec', 'API Spec'],
                ['database', 'Database'],
                ['test_cases', 'Test Cases'],
                ['business_rules', 'Business Rules']
              ] as const
            ).map(([type, label]) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                className="text-[10px] font-normal"
                disabled={isRunningAction || nodes.length === 0}
                onClick={() => handleReverse(type)}
              >
                {label}
              </Button>
            ))}
          </div>
        </PanelCard>

        {result && (
          <div className="rounded-lg border bg-muted/30 p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5">
              <FileSearch className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Result
              </p>
            </div>
            <ResultContent result={result} />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

function ResultContent({ result }: { result: ResultView }) {
  if (result.kind === 'text') {
    return <p className="whitespace-pre-wrap text-xs leading-relaxed">{result.content}</p>
  }

  if (result.kind === 'analysis') {
    const { validation, missingFlows, complexity } = result.content
    return (
      <div className="space-y-3 text-xs leading-relaxed">
        <div className="grid grid-cols-2 gap-2">
          <ScoreBadge label="Validation" score={validation.validationScore} />
          <ScoreBadge label="Complexity" score={complexity.complexityScore} sub={complexity.level} />
        </div>
        <Section title={`Issues (${validation.issues.length})`}>
          {validation.issues.length === 0 ? (
            <p className="text-muted-foreground">No issues detected.</p>
          ) : (
            <ul className="space-y-1">
              {validation.issues.map((issue, i) => (
                <li key={i}>
                  <SeverityBadge severity={issue.severity} /> {issue.description}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`Missing Flows (${missingFlows.length})`}>
          {missingFlows.length === 0 ? (
            <p className="text-muted-foreground">No missing flows detected.</p>
          ) : (
            <ul className="space-y-1.5">
              {missingFlows.map((m, i) => (
                <li key={i}>
                  <SeverityBadge severity={m.severity} /> <strong>{m.category}</strong>: {m.description}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Add: {m.suggestedNodes.join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <p className="text-[10px] text-muted-foreground">{complexity.reasoning}</p>
      </div>
    )
  }

  if (result.kind === 'explanation') {
    const e = result.content
    return (
      <div className="space-y-2 text-xs leading-relaxed">
        <p>{e.summary}</p>
        <Section title="Execution Sequence">
          <ol className="list-decimal pl-4">
            {e.executionSequence.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>
        {e.failureFlows.length > 0 && (
          <Section title="Failure Flows">
            <ul className="list-disc pl-4">
              {e.failureFlows.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Section>
        )}
        {e.externalDependencies.length > 0 && (
          <Section title="External Dependencies">
            <ul className="list-disc pl-4">
              {e.externalDependencies.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    )
  }

  if (result.kind === 'coverage') {
    const c = result.content
    return (
      <div className="space-y-3 text-xs leading-relaxed">
        <div className="grid grid-cols-2 gap-2">
          <ScoreBadge label="Coverage" score={c.coveragePercent} />
          <div className="rounded-md border bg-background px-2 py-1.5">
            <p className="text-[10px] text-muted-foreground">Covered</p>
            <p className="font-semibold">
              {c.coveredCount}/{c.totalRequirements + c.totalFeatures}
            </p>
          </div>
        </div>
        <Section title={`Uncovered Requirements & Features (${c.uncovered.length})`}>
          {c.uncovered.length === 0 ? (
            <p className="text-muted-foreground">Every requirement and feature appears represented in this flow.</p>
          ) : (
            <ul className="space-y-1.5">
              {c.uncovered.map((u) => (
                <li key={u.id}>
                  <SeverityBadge severity={u.severity} /> <strong>[{u.kind}]</strong> {u.title}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{u.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    )
  }

  const arch = result.content
  return (
    <div className="space-y-2 text-xs leading-relaxed">
      <Section title={`APIs (${arch.apis.length})`}>
        {arch.apis.length === 0 ? (
          <p className="text-muted-foreground">No API endpoints inferred.</p>
        ) : (
          <ul className="space-y-1">
            {arch.apis.map((api) => (
              <li key={api.nodeId}>
                <code className="text-[10px]">
                  {api.method} {api.path}
                </code>{' '}
                — {api.name}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={`Tables (${arch.database.tables.length})`}>
        {arch.database.tables.map((t) => (
          <p key={t.name}>
            <strong>{t.name}</strong> — {t.fields.map((f) => f.name).join(', ')}
          </p>
        ))}
      </Section>
      <Section title="Service Structure">
        <p className="text-[10px] text-muted-foreground">
          {arch.services.controllers.length} controllers, {arch.services.services.length} services,{' '}
          {arch.services.repositories.length} repositories
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}

function ScoreBadge({ label, score, sub }: { label: string; score: number; sub?: string }) {
  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold">
        {score}/100{sub ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">({sub})</span> : null}
      </p>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: 'text-red-600',
    HIGH: 'text-orange-600',
    MEDIUM: 'text-amber-600',
    LOW: 'text-muted-foreground'
  }
  return <span className={`text-[10px] font-semibold ${colors[severity] ?? ''}`}>[{severity}]</span>
}

function PanelCard({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold">{title}</h4>
          {description && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
