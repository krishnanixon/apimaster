/**
 * Architecture Designer — AI Architect.
 *
 * Link the project's requirement documents, then let AI design the whole
 * architecture from them, or refine the current one with a plain-language
 * instruction. Refinements always land as a proposal the user approves first.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BookOpen, Check, FileText, Loader2, Sparkles, Wand2, X } from 'lucide-react'
import type { ArchSectionId } from '@shared/types/architecture'
import { ARCH_SYSTEM_TYPES } from '@shared/lib/architecture-catalog'
import { parseModel, serializeModel } from '@shared/lib/architecture-model'
import { describeAction } from '@shared/lib/architecture-generation'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { cn } from '@/shared/lib/utils'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { SectionEmpty, SectionShell } from './SectionShell'

export function AIArchitectSection({ onNavigate }: { onNavigate: (section: ArchSectionId) => void }) {
  const { projectId } = useParams<{ projectId: string }>()

  const { model, dispatch, replaceModel, pendingProposal, setPendingProposal, applyPendingProposal } =
    useArchitectureEditorStore()
  const { documents, loadDocuments } = useDocumentStore()

  const [instruction, setInstruction] = useState('')
  const [includeKnowledge, setIncludeKnowledge] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [lastRun, setLastRun] = useState<{ summary: string; sources: string[] } | null>(null)

  useEffect(() => {
    if (projectId) void loadDocuments(projectId)
  }, [projectId, loadDocuments])

  const linkedIds = useMemo(() => model.metadata.linkedDocumentIds ?? [], [model.metadata])
  const hasExistingWork = model.components.length > 0
  const isBusy = isGenerating || isRefining

  const toggleDocument = useCallback(
    (id: string) => {
      const next = linkedIds.includes(id)
        ? linkedIds.filter((existing) => existing !== id)
        : [...linkedIds, id]
      dispatch({ type: 'UPDATE_METADATA', patch: { linkedDocumentIds: next } })
    },
    [linkedIds, dispatch]
  )

  const handleGenerate = useCallback(async () => {
    if (!projectId) return

    const api = await waitForDesktopApi()
    if (!api?.architectures) {
      toast.error('Desktop API is unavailable. Restart the application.')
      return
    }

    setIsGenerating(true)
    setLastRun(null)
    try {
      const result = await api.architectures.generate({
        projectId,
        prompt: model.metadata.requirements,
        systemType: model.metadata.systemType,
        documentIds: linkedIds,
        includeKnowledge
      })

      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Generation failed')
        return
      }

      const generated = parseModel(result.data.model)
      // The diagram title is the user's; only the contents are the AI's.
      generated.metadata.name = model.metadata.name
      replaceModel(generated)

      setLastRun({ summary: result.data.summary, sources: result.data.sources })
      toast.success(`Generated ${generated.components.length} components`)
      onNavigate('architecture')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate architecture')
    } finally {
      setIsGenerating(false)
    }
  }, [projectId, model.metadata, linkedIds, includeKnowledge, replaceModel, onNavigate])

  const handleRefine = useCallback(async () => {
    if (!projectId || !instruction.trim()) return

    const api = await waitForDesktopApi()
    if (!api?.architectures) {
      toast.error('Desktop API is unavailable. Restart the application.')
      return
    }

    setIsRefining(true)
    try {
      const result = await api.architectures.assist({
        projectId,
        instruction,
        model: serializeModel(model),
        documentIds: linkedIds,
        includeKnowledge
      })

      if (!result.success || !result.data) {
        toast.error(result.error ?? 'The assistant could not answer that')
        return
      }

      setPendingProposal({
        id: `proposal-${Date.now()}`,
        summary: result.data.summary,
        rationale: result.data.rationale,
        actions: JSON.parse(result.data.actions)
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reach the assistant')
    } finally {
      setIsRefining(false)
    }
  }, [projectId, instruction, model, linkedIds, includeKnowledge, setPendingProposal])

  const acceptProposal = useCallback(() => {
    const count = pendingProposal?.actions.length ?? 0
    applyPendingProposal()
    setInstruction('')
    toast.success(`Applied ${count} change${count === 1 ? '' : 's'}`)
    onNavigate('architecture')
  }, [pendingProposal, applyPendingProposal, onNavigate])

  return (
    <SectionShell
      title="AI Architect"
      description="Design the architecture from your project documents"
    >
      <div className="flex max-w-3xl flex-col gap-5">
        <Card
          title="Source documents"
          description="Everything you link here is read as source material for the design"
        >
          {documents.length === 0 ? (
            <SectionEmpty
              title="No documents in this project"
              description="Create a requirement document first, then link it here so the AI has something concrete to design from."
            />
          ) : (
            <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
              {documents.map((doc) => {
                const linked = linkedIds.includes(doc.id)
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => toggleDocument(doc.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60',
                      linked && 'bg-muted/40'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        linked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      )}
                    >
                      {linked && <Check className="h-3 w-3" />}
                    </span>
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{doc.title}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {doc.type}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setIncludeKnowledge((value) => !value)}
            className="flex items-center gap-2.5 rounded-lg border border-border/70 px-3 py-2 text-left transition-colors hover:bg-muted/60"
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                includeKnowledge
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background'
              )}
            >
              {includeKnowledge && <Check className="h-3 w-3" />}
            </span>
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-[12px]">
              Include the project knowledge base
              <span className="block text-[11px] text-muted-foreground">
                Requirements, modules, entities and integrations already extracted for this project
              </span>
            </span>
          </button>
        </Card>

        <Card
          title="Design brief"
          description="Shared with the Requirements section — the AI reads this alongside the documents"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              System type
            </span>
            <select
              value={model.metadata.systemType}
              onChange={(e) =>
                dispatch({ type: 'UPDATE_METADATA', patch: { systemType: e.target.value } })
              }
              className="ui-control-sm w-full max-w-xs rounded-md border border-input bg-background text-[12px]"
            >
              {ARCH_SYSTEM_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <Textarea
            value={model.metadata.requirements}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_METADATA', patch: { requirements: e.target.value } })
            }
            rows={6}
            placeholder="Anything the documents do not say. For example: must run on a single VPS, prefer PostgreSQL over MongoDB, no Kubernetes."
            className="resize-none text-[12px] leading-relaxed"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={handleGenerate} disabled={isBusy}>
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {hasExistingWork ? 'Regenerate architecture' : 'Generate architecture'}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {linkedIds.length > 0
                ? `${linkedIds.length} document${linkedIds.length === 1 ? '' : 's'} linked`
                : 'No documents linked'}
            </span>
          </div>

          {hasExistingWork && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Generating replaces all {model.components.length} current components. Undo (Ctrl+Z)
              brings them back. To keep what you have, use Refine below instead.
            </p>
          )}

          {lastRun && (
            <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
              <p className="text-[12px] leading-relaxed">{lastRun.summary}</p>
              {lastRun.sources.length > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Read from: {lastRun.sources.join(', ')}
                </p>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Refine"
          description="Describe a change and review it before anything is applied"
        >
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder="Add a Redis cache in front of the database, and split the payments logic into its own service."
            className="resize-none text-[12px] leading-relaxed"
          />
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefine}
              disabled={isBusy || !instruction.trim() || !hasExistingWork}
            >
              {isRefining ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Propose changes
            </Button>
            {!hasExistingWork && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Generate an architecture first — refining needs something to change.
              </p>
            )}
          </div>

          {pendingProposal && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-[12px] font-medium">{pendingProposal.summary}</p>
              {pendingProposal.rationale && (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {pendingProposal.rationale}
                </p>
              )}

              <ul className="mt-2.5 flex flex-col gap-1">
                {pendingProposal.actions.map((action, index) => (
                  <li
                    key={`${action.type}-${index}`}
                    className="flex items-start gap-2 text-[12px] leading-relaxed"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    {describeAction(action, model)}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={acceptProposal}>
                  <Check className="h-3.5 w-3.5" />
                  Apply {pendingProposal.actions.length} change
                  {pendingProposal.actions.length === 1 ? '' : 's'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingProposal(null)}>
                  <X className="h-3.5 w-3.5" />
                  Discard
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </SectionShell>
  )
}

function Card({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[12px] font-semibold">{title}</h3>
        <p className="text-[11px] leading-tight text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}
