import { useMemo, useState } from 'react'
import { Check, FileText, Link2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Document } from '@shared/types'
import { cardsFromDocuments, parseCards } from '@shared/lib/presentation-model'
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/utils'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { cn } from '@/shared/lib/utils'

interface DocumentReferencesPanelProps {
  projectId: string
  documents: Document[]
  onOpenGenerate: () => void
}

export function DocumentReferencesPanel({
  projectId,
  documents,
  onOpenGenerate
}: DocumentReferencesPanelProps) {
  const linkedDocumentIds = usePresentationEditorStore((s) => s.linkedDocumentIds)
  const includeKnowledge = usePresentationEditorStore((s) => s.includeKnowledge)
  const lastSources = usePresentationEditorStore((s) => s.lastSources)
  const themeId = usePresentationEditorStore((s) => s.themeId)
  const title = usePresentationEditorStore((s) => s.title)
  const toggleLinkedDocument = usePresentationEditorStore((s) => s.toggleLinkedDocument)
  const setIncludeKnowledge = usePresentationEditorStore((s) => s.setIncludeKnowledge)
  const setLastSources = usePresentationEditorStore((s) => s.setLastSources)
  const replaceCards = usePresentationEditorStore((s) => s.replaceCards)
  const setThemeId = usePresentationEditorStore((s) => s.setThemeId)

  const [query, setQuery] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...documents].sort((a, b) => a.title.localeCompare(b.title))
    if (!q) return sorted
    return sorted.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        (DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type).toLowerCase().includes(q)
    )
  }, [documents, query])

  const linkedDocs = useMemo(
    () => documents.filter((doc) => linkedDocumentIds.includes(doc.id)),
    [documents, linkedDocumentIds]
  )

  const importStructure = () => {
    if (linkedDocs.length === 0) {
      toast.error('Link at least one document first')
      return
    }
    setIsImporting(true)
    try {
      const cards = cardsFromDocuments(
        linkedDocs.map((doc) => ({
          title: doc.title,
          htmlContent: doc.htmlContent,
          content: doc.content
        }))
      )
      replaceCards(cards, {
        title: linkedDocs.length === 1 ? linkedDocs[0].title : title,
        description: `Imported structure from ${linkedDocs.map((d) => d.title).join(', ')}`
      })
      setLastSources(linkedDocs.map((d) => d.title))
      toast.success(`Imported ${cards.length} cards from documents`)
    } finally {
      setIsImporting(false)
    }
  }

  const refreshWithAi = async () => {
    if (linkedDocs.length === 0 && !includeKnowledge) {
      toast.error('Link documents or enable knowledge first')
      return
    }
    setIsRefreshing(true)
    try {
      const api = await waitForDesktopApi()
      if (!api?.presentations) throw new Error('Presentation API unavailable')
      const result = await api.presentations.generate({
        projectId,
        prompt: `Rebuild this presentation from the linked project documents. Keep a clear narrative suitable for stakeholders. Current deck title: ${title}`,
        themeId: themeId as never,
        documentIds: linkedDocumentIds,
        includeKnowledge,
        cardCount: Math.min(14, Math.max(6, linkedDocs.length * 3 || 8))
      })
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Refresh failed')
      }
      const cards = parseCards(result.data.cards)
      replaceCards(cards, {
        title: result.data.title,
        description: result.data.summary
      })
      setThemeId(result.data.themeId)
      setLastSources(result.data.sources)
      toast.success(
        result.data.sources.length
          ? `Regenerated from: ${result.data.sources.join(', ')}`
          : result.data.summary || 'Presentation refreshed'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Refresh failed')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold">
        <Link2 className="h-3.5 w-3.5" />
        Document references
      </div>
      <p className="text-[11px] text-muted-foreground">
        Link project documents so AI generate, assist, and import stay grounded in your specs.
      </p>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search documents…"
        className="h-7 text-[12px]"
      />

      <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border/60 p-1.5">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
            No documents in this project yet.
          </p>
        ) : (
          filtered.map((doc) => {
            const linked = linkedDocumentIds.includes(doc.id)
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => toggleLinkedDocument(doc.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                  linked ? 'bg-primary/10' : 'hover:bg-muted/60'
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    linked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                  )}
                >
                  {linked ? <Check className="h-3 w-3" /> : null}
                </span>
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px]">{doc.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5">
        <span className="text-[11px]">Include knowledge base</span>
        <Switch checked={includeKnowledge} onCheckedChange={setIncludeKnowledge} />
      </div>

      {lastSources.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Last read from: {lastSources.join(', ')}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 justify-start text-[11px]"
          disabled={isImporting || linkedDocumentIds.length === 0}
          onClick={importStructure}
        >
          Import structure from docs
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 justify-start text-[11px]"
          disabled={isRefreshing}
          onClick={() => void refreshWithAi()}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          AI regenerate from linked docs
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 justify-start text-[11px]"
          onClick={onOpenGenerate}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Open generate wizard
        </Button>
      </div>
    </div>
  )
}
