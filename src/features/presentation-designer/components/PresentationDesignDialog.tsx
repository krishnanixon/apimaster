import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Layers3, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Document, GeneratePresentationInput, PresentationThemeId } from '@shared/types'
import { PRESENTATION_THEMES, parseCards } from '@shared/lib/presentation-model'
import { migrateLegacyCards } from '@shared/lib/presentation-migrations'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { DOCUMENT_TYPE_LABELS, cn } from '@/shared/lib/utils'
import { usePresentationDocumentStore } from '../stores/presentation-document.store'
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

export type PresentationDesignMode = 'deck' | 'slide' | 'redesign'

interface PresentationDesignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  presentationId: string
  documents: Document[]
  mode?: PresentationDesignMode
}

const MODE_META: Record<
  PresentationDesignMode,
  { title: string; description: string; placeholder: string; icon: typeof Sparkles }
> = {
  deck: {
    title: 'Generate presentation',
    description: 'Describe the full deck. AI will build slides you can freely edit on the canvas.',
    placeholder: 'Create a 8-slide pitch deck for our inventory module: problem, solution, demo, pricing, roadmap…',
    icon: Sparkles
  },
  slide: {
    title: 'Generate slide',
    description: 'Describe one slide to add to the current deck.',
    placeholder: 'Add a slide comparing our plan vs competitors with 3 bullet points each…',
    icon: Layers3
  },
  redesign: {
    title: 'Redesign with AI',
    description: 'Describe how to rework the current slide layout and content.',
    placeholder: 'Turn this into a metrics slide with 3 KPIs and a short summary…',
    icon: Wand2
  }
}

export function PresentationDesignDialog({
  open,
  onOpenChange,
  projectId,
  presentationId,
  documents,
  mode: initialMode = 'deck'
}: PresentationDesignDialogProps) {
  const document = usePresentationDocumentStore((state) => state.document)
  const replaceDocument = usePresentationDocumentStore((state) => state.replaceDocument)
  const dispatch = usePresentationDocumentStore((state) => state.dispatch)
  const setActiveSlide = usePresentationDocumentStore((state) => state.setActiveSlide)

  const [mode, setMode] = useState<PresentationDesignMode>(initialMode)
  const [prompt, setPrompt] = useState('')
  const [tone, setTone] = useState('professional')
  const [themeId, setThemeId] = useState<PresentationThemeId>('professional')
  const [cardCount, setCardCount] = useState('8')
  const [includeKnowledge, setIncludeKnowledge] = useState(true)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [docQuery, setDocQuery] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    if (document?.themeId) setThemeId(document.themeId as PresentationThemeId)
  }, [open, initialMode, document?.themeId])

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

  const meta = MODE_META[mode]
  const Icon = meta.icon

  const handleGenerate = async () => {
    if (!prompt.trim() && selectedDocIds.length === 0) {
      toast.error('Add a prompt or select at least one document')
      return
    }
    if (!document) return

    setIsGenerating(true)
    try {
      const api = await waitForDesktopApi()
      if (!api?.presentations) throw new Error('Presentation API unavailable')

      const slideCount = mode === 'slide' || mode === 'redesign' ? 1 : Number(cardCount) || 8
      const effectivePrompt =
        mode === 'redesign'
          ? `Redesign the current slide for presentation "${document.title}". ${prompt.trim()}`
          : mode === 'slide'
            ? `Create exactly one slide for presentation "${document.title}": ${prompt.trim()}`
            : prompt.trim()

      const input: GeneratePresentationInput = {
        projectId,
        prompt: effectivePrompt,
        themeId,
        tone,
        cardCount: slideCount,
        documentIds: selectedDocIds,
        includeKnowledge
      }

      toast.loading('Designing your presentation…', { id: 'presentation-design' })
      const result = await api.presentations.generate(input)
      if (!result.success || !result.data) throw new Error(result.error ?? 'Generation failed')

      const generated = migrateLegacyCards({
        id: document.id,
        projectId,
        title: mode === 'deck' ? result.data.title : document.title,
        description: result.data.summary,
        themeId: result.data.themeId,
        cards: parseCards(result.data.cards),
        createdAt: document.createdAt,
        updatedAt: new Date().toISOString()
      })

      if (mode === 'deck') {
        replaceDocument({ ...generated, title: result.data.title, description: result.data.summary })
        toast.success(result.data.summary || 'Presentation generated — edit freely on the canvas', {
          id: 'presentation-design'
        })
      } else if (mode === 'slide') {
        const newSlide = generated.slides[0]
        if (!newSlide) throw new Error('AI did not return a usable slide')
        const slide = {
          ...newSlide,
          id: crypto.randomUUID(),
          order: document.slides.length,
          elements: (newSlide.elements ?? []).map((element) => ({ ...element, id: crypto.randomUUID() }))
        }
        dispatch({ type: 'ADD_SLIDE', slide })
        setActiveSlide(slide.id)
        toast.success('Slide added — drag elements to customize', { id: 'presentation-design' })
      } else {
        const activeSlideId = usePresentationDocumentStore.getState().activeSlideId
        const redesigned = generated.slides[0]
        if (!activeSlideId || !redesigned) throw new Error('No active slide to redesign')
        dispatch({
          type: 'SET_SLIDE_ELEMENTS',
          slideId: activeSlideId,
          layout: redesigned.layout,
          elements: (redesigned.elements ?? []).map((element) => ({ ...element, id: crypto.randomUUID() }))
        })
        toast.success('Slide redesigned — adjust layout and styling as needed', { id: 'presentation-design' })
      }

      onOpenChange(false)
      setPrompt('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Design generation failed', {
        id: 'presentation-design'
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {meta.title}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {(['deck', 'slide', 'redesign'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                'rounded-md px-2 py-1.5 text-[11px] font-medium capitalize transition-all',
                mode === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {id}
            </button>
          ))}
        </div>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Prompt</label>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={meta.placeholder}
              className="min-h-[120px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Theme</label>
              <select
                value={themeId}
                onChange={(event) => setThemeId(event.target.value as PresentationThemeId)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {PRESENTATION_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>
            {mode === 'deck' ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Slides</label>
                <Input value={cardCount} onChange={(event) => setCardCount(event.target.value)} inputMode="numeric" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tone</label>
                <Input value={tone} onChange={(event) => setTone(event.target.value)} placeholder="professional…" />
              </div>
            )}
          </div>

          {mode === 'deck' ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tone</label>
              <Input value={tone} onChange={(event) => setTone(event.target.value)} placeholder="executive, technical…" />
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <span className="text-sm">Include project knowledge</span>
            <Switch checked={includeKnowledge} onCheckedChange={setIncludeKnowledge} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Source documents</label>
            <Input
              value={docQuery}
              onChange={(event) => setDocQuery(event.target.value)}
              placeholder="Search documents…"
              className="h-8 text-xs"
            />
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
              {filteredDocs.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">No documents in this project.</p>
              ) : (
                filteredDocs.map((doc) => {
                  const selected = selectedDocIds.includes(doc.id)
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() =>
                        setSelectedDocIds((prev) =>
                          prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
                        )
                      }
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-muted/50',
                        selected && 'bg-primary/10'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                        )}
                      >
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{doc.title}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleGenerate()} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Design
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
