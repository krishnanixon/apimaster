import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, ExternalLink, FilePlus2, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  buildSddHtmlFromArchitecture,
  SDD_FLOW_SLOTS
} from '@shared/lib/architecture-to-sdd'
import { DOCUMENT_TYPE_LABELS } from '@shared/lib/project-lifecycle'
import { Button } from '@/shared/components/ui/button'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { SectionShell } from './SectionShell'

function extractFlowIdsFromHtml(html: string): Partial<Record<string, string>> {
  const flowIds: Partial<Record<string, string>> = {}
  const re =
    /data-type="flow-block"[^>]*data-flow-id="([^"]*)"[^>]*data-slot-key="([^"]*)"|data-type="flow-block"[^>]*data-slot-key="([^"]*)"[^>]*data-flow-id="([^"]*)"/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const flowId = (match[1] || match[4] || '').trim()
    const slotKey = (match[2] || match[3] || '').trim()
    if (slotKey && flowId) flowIds[slotKey] = flowId
  }
  return flowIds
}

export function DocumentationSection() {
  const { projectId } = useParams<{ projectId: string; diagramId: string }>()
  const navigate = useNavigate()
  const model = useArchitectureEditorStore((s) => s.model)
  const dispatch = useArchitectureEditorStore((s) => s.dispatch)
  const createDocument = useDocumentStore((s) => s.createDocument)
  const updateDocument = useDocumentStore((s) => s.updateDocument)
  const currentProject = useProjectStore((s) => s.currentProject)
  const [busy, setBusy] = useState(false)

  const linkedSddId = model.metadata.linkedSddDocumentId
  const projectName = currentProject?.name || model.metadata.name || 'Project'

  const previewHtml = useMemo(
    () =>
      buildSddHtmlFromArchitecture(model, {
        projectName,
        includeFlowSlots: true
      }),
    [model, projectName]
  )

  const ensureFlowIds = async (
    existing?: Partial<Record<string, string>>
  ): Promise<Partial<Record<string, string>>> => {
    if (!projectId || !window.electronAPI?.flows) return { ...(existing ?? {}) }
    const flowIds: Partial<Record<string, string>> = { ...(existing ?? {}) }
    for (const slot of SDD_FLOW_SLOTS) {
      if (flowIds[slot.key]) continue
      const title = `${model.metadata.name || 'Architecture'} — ${slot.title}`
      const result = await window.electronAPI.flows.create({
        projectId,
        title,
        description: slot.description ?? '',
        category: 'architecture'
      })
      if (result.success && result.data) {
        flowIds[slot.key] = result.data.id
      }
    }
    return flowIds
  }

  const createOrUpdateSdd = async (mode: 'create' | 'update') => {
    if (!projectId) return
    setBusy(true)
    try {
      let existingFlowIds: Partial<Record<string, string>> = {}
      if (mode === 'update' && linkedSddId) {
        const existing = await window.electronAPI.documents.get(linkedSddId)
        if (existing.success && existing.data) {
          existingFlowIds = extractFlowIdsFromHtml(
            existing.data.htmlContent || existing.data.content || ''
          )
        }
      }

      const flowIds = await ensureFlowIds(existingFlowIds)
      const title = `${DOCUMENT_TYPE_LABELS.system_design} — ${model.metadata.name || projectName}`
      const html = buildSddHtmlFromArchitecture(model, {
        projectName,
        documentTitle: title,
        flowIds,
        includeFlowSlots: true
      })

      if (mode === 'update' && linkedSddId) {
        await updateDocument(linkedSddId, {
          title,
          type: 'system_design',
          htmlContent: html,
          content: html
        })
        toast.success('System Design Document updated')
        navigate(`/project/${projectId}/editor/${linkedSddId}`)
        return
      }

      const doc = await createDocument(projectId, {
        type: 'system_design',
        title,
        style: currentProject?.style ?? 'professional',
        htmlContent: html
      })
      if (!doc) {
        toast.error('Failed to create System Design Document')
        return
      }

      dispatch({
        type: 'UPDATE_METADATA',
        patch: { linkedSddDocumentId: doc.id }
      })
      toast.success('System Design Document created')
      navigate(`/project/${projectId}/editor/${doc.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate SDD')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionShell
      title="Documentation"
      description="Generate a System Design Document from this architecture model"
      actions={
        <div className="flex items-center gap-1.5">
          {linkedSddId && projectId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/project/${projectId}/editor/${linkedSddId}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open SDD
            </Button>
          )}
          {linkedSddId ? (
            <Button size="sm" disabled={busy} onClick={() => void createOrUpdateSdd('update')}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Update SDD
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void createOrUpdateSdd('create')}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FilePlus2 className="h-3.5 w-3.5" />
              )}
              Create SDD
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          <p className="flex items-start gap-2">
            <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            <span>
              Creates a{' '}
              <strong className="text-foreground">{DOCUMENT_TYPE_LABELS.system_design}</strong> with
              component tables, APIs, environments, ADRs, and editable flowchart slots for system
              context, primary request, and async data flows.
            </span>
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/60">
          <div className="border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
            Preview
          </div>
          <div
            className="prose prose-sm dark:prose-invert max-h-[min(60vh,640px)] max-w-none overflow-y-auto p-4 text-[13px]"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </SectionShell>
  )
}
