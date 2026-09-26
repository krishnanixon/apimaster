import { useMemo, useState } from 'react'
import { ArrowRight, BookMarked, LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { DOCUMENT_TEMPLATES } from '@/features/documents/templates/document-templates'
import {
  deleteSavedTemplate,
  loadSavedTemplates
} from '@/features/documents/templates/saved-templates'
import { cn } from '@/shared/lib/utils'
import { toast } from 'sonner'
import type { DocumentType } from '@shared/types'

interface TemplateLibraryProps {
  onUseBuiltIn: (type: DocumentType) => void
  onUseSaved: (id: string, type: DocumentType) => void
}

export function TemplateLibrary({ onUseBuiltIn, onUseSaved }: TemplateLibraryProps) {
  const [saved, setSaved] = useState(() => loadSavedTemplates())
  const [category, setCategory] = useState('All')
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(DOCUMENT_TEMPLATES.map((template) => template.category)))],
    []
  )
  const visibleTemplates =
    category === 'All'
      ? DOCUMENT_TEMPLATES
      : DOCUMENT_TEMPLATES.filter((template) => template.category === category)

  return (
    <div className="space-y-6">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
              category === item
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Built-in templates</h2>
          <p className="text-xs text-muted-foreground">Compact, ready-to-use structures grouped by module.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTemplates.map((template) => (
            <article
              key={template.type}
              className="group flex min-h-44 flex-col rounded-xl border border-border/70 bg-card p-4 shadow-soft transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <LayoutTemplate className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{template.label}</h3>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {template.description}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <Badge variant="secondary" className="rounded-full text-[9px]">
                  {template.category}
                </Badge>
                <Badge variant="outline" className="rounded-full text-[9px]">
                  ~{template.estimatedPages} pages
                </Badge>
              </div>
              <div className="mt-auto flex items-center justify-between pt-3">
                <span className="text-[10px] text-muted-foreground">
                  {template.sections.length} sections · {template.complexity}
                </span>
                <Button size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => onUseBuiltIn(template.type)}>
                  <Plus className="h-3.5 w-3.5" /> Use
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Saved templates</h2>
          <p className="text-xs text-muted-foreground">Reusable templates created from your documents.</p>
        </div>
        {saved.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/50 p-8 text-center">
            <BookMarked className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
            <p className="text-xs font-medium">No saved templates yet</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Save any document as a template from the editor.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((template) => (
              <article
                key={template.id}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-soft"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                  <BookMarked className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xs font-semibold">{template.name}</h3>
                  <p className="truncate text-[10px] text-muted-foreground">{template.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onUseSaved(template.id, template.type)}
                  title="Use template"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    deleteSavedTemplate(template.id)
                    setSaved(loadSavedTemplates())
                    toast.success('Template deleted')
                  }}
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
