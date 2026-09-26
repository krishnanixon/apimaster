import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Document, GeneratePresentationInput, PresentationThemeId } from '@shared/types'
import { PRESENTATION_THEMES, parseCards, serializeViewState } from '@shared/lib/presentation-model'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { DOCUMENT_TYPE_LABELS, cn } from '@/shared/lib/utils'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { usePresentationStore } from '../stores/presentation.store'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'

interface GenerateWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  documents: Document[]
  presentationId?: string
  onCreated?: (id: string) => void
}

export function GenerateWizard({
  open,
  onOpenChange,
  projectId,
  documents,
  presentationId,
  onCreated
}: GenerateWizardProps) {
  const createPresentation = usePresentationStore((s) => s.createPresentation)
  const updatePresentation = usePresentationStore((s) => s.updatePresentation)
  const loadDeck = usePresentationEditorStore((s) => s.loadDeck)
  const linkedDocumentIds = usePresentationEditorStore((s) => s.linkedDocumentIds)
  const storeIncludeKnowledge = usePresentationEditorStore((s) => s.includeKnowledge)
  const setLinkedDocumentIds = usePresentationEditorStore((s) => s.setLinkedDocumentIds)
  const setIncludeKnowledgeStore = usePresentationEditorStore((s) => s.setIncludeKnowledge)
  const setLastSources = usePresentationEditorStore((s) => s.setLastSources)

  const [prompt, setPrompt] = useState('')
  const [tone, setTone] = useState('professional')
  const [themeId, setThemeId] = useState<PresentationThemeId>('professional')
  const [cardCount, setCardCount] = useState('10')
  const [includeKnowledge, setIncludeKnowledge] = useState(true)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [docQuery, setDocQuery] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelectedDocIds(linkedDocumentIds)
    setIncludeKnowledge(storeIncludeKnowledge)
  }, [open, linkedDocumentIds, storeIncludeKnowledge])

  const filteredDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase()
    const sorted = [...documents].sort((a, b) => a.title.localeCompare(b.title))
    if (!q) return sorted
    return sorted.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        (DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type).toLowerCase().includes(q)
    )
  }, [documents, docQuery])

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleGenerate = async () => {
    if (!prompt.trim() && selectedDocIds.length === 0) {
      toast.error('Add a prompt/outline or select at least one document')
      return
    }

    setIsGenerating(true)
    try {
      const api = await waitForDesktopApi()
      if (!api?.presentations) throw new Error('Presentation API unavailable')

      const input: GeneratePresentationInput = {
        projectId,
        prompt: prompt.trim(),
        themeId,
        tone,
        cardCount: Number(cardCount) || undefined,
        documentIds: selectedDocIds,
        includeKnowledge
      }

      const result = await api.presentations.generate(input)
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Generation failed')
      }

      const cards = result.data.cards
      const title = result.data.title
      const nextTheme = result.data.themeId
      const viewState = serializeViewState({
        linkedDocumentIds: selectedDocIds,
        includeKnowledge,
        lastSources: result.data.sources
      })

      if (presentationId) {
        const saved = await updatePresentation(presentationId, {
          title,
          themeId: nextTheme,
          cards,
          description: result.data.summary,
          viewState
        })
        if (!saved) throw new Error('Generated presentation could not be saved')
        loadDeck({
          title,
          description: result.data.summary,
          themeId: nextTheme,
          cards: parseCards(cards),
          linkedDocumentIds: selectedDocIds,
          includeKnowledge,
          lastSources: result.data.sources
        })
        setLinkedDocumentIds(selectedDocIds)
        setIncludeKnowledgeStore(includeKnowledge)
        setLastSources(result.data.sources)
        toast.success(
          result.data.sources.length
            ? `Generated from: ${result.data.sources.join(', ')}`
            : result.data.summary || 'Presentation generated'
        )
        onOpenChange(false)
      } else {
        const created = await createPresentation({
          projectId,
          title,
          description: result.data.summary,
          themeId: nextTheme,
          cards
        })
        if (created) {
          const saved = await updatePresentation(created.id, { viewState })
          if (!saved) throw new Error('Presentation was created, but its document links could not be saved')
          toast.success(
            result.data.sources.length
              ? `Created from: ${result.data.sources.join(', ')}`
              : result.data.summary || 'Presentation created'
          )
          onOpenChange(false)
          onCreated?.(created.id)
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generate presentation
          </DialogTitle>
          <DialogDescription>
            Describe the deck, paste an outline, or ground it in project documents. Linked docs
            stay attached to this presentation for assist and refresh.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Prompt / outline</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Pitch deck for our inventory module covering problem, solution, scope, and roadmap…"
              className="min-h-[120px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Theme</label>
              <select
                value={themeId}
                onChange={(e) => setThemeId(e.target.value as PresentationThemeId)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {PRESENTATION_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Approx. cards</label>
              <Input
                value={cardCount}
                onChange={(e) => setCardCount(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tone</label>
            <Input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="executive, technical…"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span className="text-sm">Include project knowledge base</span>
            <Switch checked={includeKnowledge} onCheckedChange={setIncludeKnowledge} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Source documents</label>
            <Input
              value={docQuery}
              onChange={(e) => setDocQuery(e.target.value)}
              placeholder="Search documents…"
              className="h-8 text-xs"
            />
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {filteredDocs.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">No documents in this project.</p>
              ) : (
                filteredDocs.map((doc) => {
                  const selected = selectedDocIds.includes(doc.id)
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => toggleDoc(doc.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-muted/50',
                        selected && 'bg-primary/10'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border'
                        )}
                      >
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{doc.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            {selectedDocIds.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {selectedDocIds.length} document{selectedDocIds.length === 1 ? '' : 's'} selected
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleGenerate()} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
