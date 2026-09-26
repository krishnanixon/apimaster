import { useState } from 'react'
import { Loader2, Sparkles, Check, X, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { PresentationAction, PresentationActionProposal } from '@shared/types/presentation'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { serializeCards } from '@shared/lib/presentation-model'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Switch } from '@/shared/components/ui/switch'

interface AIAssistPanelProps {
  projectId: string
  open: boolean
  onClose: () => void
}

export function AIAssistPanel({ projectId, open, onClose }: AIAssistPanelProps) {
  const cards = usePresentationEditorStore((s) => s.cards)
  const themeId = usePresentationEditorStore((s) => s.themeId)
  const title = usePresentationEditorStore((s) => s.title)
  const selectedCardId = usePresentationEditorStore((s) => s.selectedCardId)
  const linkedDocumentIds = usePresentationEditorStore((s) => s.linkedDocumentIds)
  const includeKnowledge = usePresentationEditorStore((s) => s.includeKnowledge)
  const setIncludeKnowledge = usePresentationEditorStore((s) => s.setIncludeKnowledge)
  const pendingProposal = usePresentationEditorStore((s) => s.pendingProposal)
  const setPendingProposal = usePresentationEditorStore((s) => s.setPendingProposal)
  const applyPendingProposal = usePresentationEditorStore((s) => s.applyPendingProposal)

  const [instruction, setInstruction] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  if (!open) return null

  const runAssist = async () => {
    if (!instruction.trim()) {
      toast.error('Describe the change you want')
      return
    }
    setIsBusy(true)
    try {
      const api = await waitForDesktopApi()
      if (!api?.presentations) throw new Error('Presentation API unavailable')
      const result = await api.presentations.assist({
        projectId,
        instruction: instruction.trim(),
        cards: serializeCards(cards),
        themeId,
        title,
        selectedCardIds: selectedCardId ? [selectedCardId] : undefined,
        documentIds: linkedDocumentIds,
        includeKnowledge
      })
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Assistant failed')
      }
      let actions: PresentationAction[] = []
      try {
        actions = JSON.parse(result.data.actions) as PresentationAction[]
      } catch {
        actions = []
      }
      const proposal: PresentationActionProposal = {
        id: crypto.randomUUID(),
        summary: result.data.summary,
        rationale: result.data.rationale,
        actions
      }
      setPendingProposal(proposal)
      toast.success(
        linkedDocumentIds.length
          ? `Proposal ready (grounded on ${linkedDocumentIds.length} linked doc${linkedDocumentIds.length === 1 ? '' : 's'})`
          : 'Review the proposed changes'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assistant failed')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-border/80 bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Sparkles className="h-3.5 w-3.5" />
          AI Assist
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-[11px] text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          {linkedDocumentIds.length > 0
            ? `${linkedDocumentIds.length} linked document${linkedDocumentIds.length === 1 ? '' : 's'} will ground this edit`
            : 'No linked docs — link them in Properties for better grounding'}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5">
          <span className="text-[11px]">Use knowledge base</span>
          <Switch checked={includeKnowledge} onCheckedChange={setIncludeKnowledge} />
        </div>

        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Make this more executive… Shorten card 3… Align risks with the BRD…"
          className="min-h-[100px] text-[12px]"
        />
        <Button type="button" size="sm" onClick={() => void runAssist()} disabled={isBusy}>
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Propose changes
        </Button>

        {pendingProposal && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-[12px] font-medium">{pendingProposal.summary}</p>
            {pendingProposal.rationale && (
              <p className="text-[11px] text-muted-foreground">{pendingProposal.rationale}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {pendingProposal.actions.length} action
              {pendingProposal.actions.length === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7"
                onClick={() => {
                  applyPendingProposal()
                  setInstruction('')
                  toast.success('Changes applied')
                }}
              >
                <Check className="h-3.5 w-3.5" />
                Apply
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setPendingProposal(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
