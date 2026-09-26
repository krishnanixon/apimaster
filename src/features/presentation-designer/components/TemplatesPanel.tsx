import { useMemo, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { PRESENTATION_LAYOUTS, applySlideLayout } from '@shared/lib/presentation-layouts'
import {
  PRESENTATION_SLIDE_TEMPLATES,
  buildDocumentFromSlideTemplate,
  getTemplatePreviewSlide,
  getTemplateSlideCount,
  type PresentationSlideTemplate,
  type PresentationTemplateCategory,
  type PresentationTemplateStyle
} from '@shared/lib/presentation-slide-templates'
import { usePresentationDocumentStore } from '../stores/presentation-document.store'
import { TemplatePreviewCard, LayoutPreviewCard, LayoutWireframe } from './TemplatePreviewCard'
import { cn } from '@/shared/lib/utils'

interface TemplatesPanelProps {
  projectId: string
  onOpenDesign: (mode: 'deck' | 'slide' | 'redesign') => void
  onApplied?: () => void
}

const CATEGORIES: Array<{ id: PresentationTemplateCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'business', label: 'Business' },
  { id: 'product', label: 'Product' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'education', label: 'Education' },
  { id: 'creative', label: 'Creative' }
]

const STYLES: Array<{ id: PresentationTemplateStyle | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'bold', label: 'Bold' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'dark', label: 'Dark' },
  { id: 'glass', label: 'Glass' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'warm', label: 'Warm' }
]

function FilterChip<T extends string>({
  items,
  value,
  onChange
}: {
  items: Array<{ id: T; label: string }>
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'h-6 shrink-0 rounded-md px-2 text-[10px] font-medium transition-colors',
            value === item.id
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function TemplatesPanel({ projectId, onOpenDesign, onApplied }: TemplatesPanelProps) {
  const document = usePresentationDocumentStore((state) => state.document)
  const activeSlideId = usePresentationDocumentStore((state) => state.activeSlideId)
  const dispatch = usePresentationDocumentStore((state) => state.dispatch)
  const replaceDocument = usePresentationDocumentStore((state) => state.replaceDocument)
  const appendTemplateSlides = usePresentationDocumentStore((state) => state.appendTemplateSlides)
  const [category, setCategory] = useState<PresentationTemplateCategory | 'all'>('all')
  const [style, setStyle] = useState<PresentationTemplateStyle | 'all'>('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      PRESENTATION_SLIDE_TEMPLATES.filter((template) => {
        const categoryMatch = category === 'all' || template.category === category
        const styleMatch = style === 'all' || template.style === style
        return categoryMatch && styleMatch
      }),
    [category, style]
  )

  if (!document) return null
  const activeSlide = document.slides.find((slide) => slide.id === activeSlideId)

  const applyDeckTemplate = (template: PresentationSlideTemplate, mode: 'replace' | 'append') => {
    if (mode === 'append') {
      appendTemplateSlides(template.id)
      setSelectedTemplateId(null)
      onApplied?.()
      return
    }
    const next = buildDocumentFromSlideTemplate(template.id, {
      id: document.id,
      projectId,
      title: document.title
    })
    if (!next) return
    if (document.slides.some((item) => (item?.elements?.length ?? 0) > 0)) {
      const ok = window.confirm('Replace the current deck with this template?')
      if (!ok) return
    }
    replaceDocument(next)
    setSelectedTemplateId(null)
    onApplied?.()
  }

  const applyLayout = (layoutId: string) => {
    if (!activeSlide) return
    if ((activeSlide.elements?.length ?? 0) > 0) {
      const ok = window.confirm('Apply this layout? Current slide content will be replaced.')
      if (!ok) return
    }
    const next = applySlideLayout(activeSlide, layoutId)
    dispatch({
      type: 'SET_SLIDE_ELEMENTS',
      slideId: activeSlide.id,
      layout: next.layout,
      elements: next.elements ?? []
    })
    onApplied?.()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border/70 px-2 pb-2 pt-1">
        <button
          type="button"
          onClick={() => onOpenDesign('deck')}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2 text-left transition-colors hover:bg-muted/50"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-3 w-3" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium leading-none">Design with AI</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">Generate or redesign</span>
          </span>
        </button>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Style</p>
            <span className="text-[10px] tabular-nums text-muted-foreground">{filtered.length}</span>
          </div>
          <FilterChip items={STYLES} value={style} onChange={setStyle} />
        </div>

        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
          <FilterChip items={CATEGORIES} value={category} onChange={setCategory} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Predesigned decks
        </p>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 py-6 text-center text-[11px] text-muted-foreground">
              No templates match these filters.
            </p>
          ) : null}

          {filtered.map((template) => {
            const previewSlide = getTemplatePreviewSlide(template.id)
            if (!previewSlide) return null
            const selected = selectedTemplateId === template.id
            return (
              <div
                key={template.id}
                className={cn(
                  'overflow-hidden rounded-lg border bg-card transition-colors',
                  selected ? 'border-primary/40 shadow-sm' : 'border-border/70'
                )}
              >
                <TemplatePreviewCard
                  slide={previewSlide}
                  logicalSize={document.logicalSize}
                  title={template.title}
                  description={template.description}
                  badge={template.category}
                  style={template.style}
                  slideCount={getTemplateSlideCount(template.id)}
                  accentGradient={template.preview.gradient}
                  accentColor={template.preview.accent}
                  selected={selected}
                  compact
                  onClick={() => setSelectedTemplateId((current) => (current === template.id ? null : template.id))}
                />
                {selected ? (
                  <div className="flex gap-1 border-t border-border/70 bg-muted/30 p-1.5">
                    <button
                      type="button"
                      onClick={() => applyDeckTemplate(template, 'replace')}
                      className="h-7 flex-1 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      Replace deck
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDeckTemplate(template, 'append')}
                      className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-border/70 bg-background px-2 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                      Append
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Slide layouts
        </p>
        <div className="grid grid-cols-2 gap-1.5 pb-2">
          {PRESENTATION_LAYOUTS.filter((layout) => layout.id !== 'blank').map((layout) => (
            <LayoutPreviewCard
              key={layout.id}
              name={layout.name}
              active={activeSlide?.layout === layout.id}
              preview={<LayoutWireframe variant={layout.id} />}
              onClick={() => applyLayout(layout.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
