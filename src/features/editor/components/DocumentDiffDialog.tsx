import { useMemo, useState } from 'react'
import { Check, Eye, EyeOff, GitCompareArrows, Loader2, Sparkles, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Badge } from '@/shared/components/ui/badge'
import { diffHtmlDocuments, type BlockDiffEntry } from '@shared/lib/document-html'
import { cn } from '@/shared/lib/utils'

interface DocumentDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  originalHtml: string
  editedHtml: string
  title?: string
  description?: string
  mode?: 'review' | 'compare'
  originalLabel?: string
  editedLabel?: string
  isApplying?: boolean
  onAccept?: () => void
  onDiscard?: () => void
}

export function DocumentDiffDialog({
  open,
  onOpenChange,
  originalHtml,
  editedHtml,
  title = 'Review AI Edit',
  description,
  mode = 'review',
  originalLabel = 'Original',
  editedLabel = 'Updated',
  isApplying = false,
  onAccept,
  onDiscard
}: DocumentDiffDialogProps) {
  const [showUnchanged, setShowUnchanged] = useState(false)
  const entries = useMemo(
    () => (open ? diffHtmlDocuments(originalHtml, editedHtml) : []),
    [open, originalHtml, editedHtml]
  )

  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    let changed = 0
    for (const entry of entries) {
      if (entry.type === 'added') added++
      else if (entry.type === 'removed') removed++
      else if (entry.type === 'changed') changed++
    }
    return { added, removed, changed }
  }, [entries])

  const hasChanges = stats.added + stats.removed + stats.changed > 0
  const unchangedCount = entries.length - stats.added - stats.removed - stats.changed
  const visibleEntries = useMemo(
    () => (hasChanges && !showUnchanged ? entries.filter((entry) => entry.type !== 'equal') : entries),
    [entries, hasChanges, showUnchanged]
  )
  const isCompareMode = mode === 'compare'
  const handleOpenChange = (next: boolean) => {
    if (isApplying) return
    if (!next) onDiscard?.()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 px-6 pb-2 pt-6 text-left">
          <DialogTitle className="flex items-center gap-2">
            {isCompareMode ? (
              <GitCompareArrows className="h-4 w-4 text-primary" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>
            {description ??
              (hasChanges
                ? isCompareMode
                  ? `Comparing ${originalLabel} with ${editedLabel}.`
                  : 'Structured diff of what the AI changed. Review before applying to your document.'
                : 'No detectable content changes were found.')}
          </DialogDescription>
        </DialogHeader>

        {hasChanges && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-6">
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
              +{stats.added} added
            </Badge>
            <Badge variant="outline" className="gap-1 border-rose-500/30 text-[10px] text-rose-600 dark:text-rose-400">
              -{stats.removed} removed
            </Badge>
            <Badge variant="outline" className="gap-1 border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400">
              {stats.changed} changed
            </Badge>
            {unchangedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowUnchanged((value) => !value)}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {showUnchanged ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showUnchanged ? 'Hide' : 'Show'} {unchangedCount} unchanged
              </button>
            )}
          </div>
        )}

        <ScrollArea className="max-h-[55vh] min-h-[200px] px-6 py-4">
          <div className="space-y-2 text-sm leading-relaxed">
            {visibleEntries.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">No content to compare.</p>
            )}
            {visibleEntries.map((entry, i) => (
              <DiffBlock key={i} entry={entry} />
            ))}
          </div>
        </ScrollArea>

        {isCompareMode ? (
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              <X className="h-4 w-4" /> Close comparison
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="gap-2 border-t border-border px-6 py-4 sm:justify-between">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isApplying}>
              <X className="h-4 w-4" /> Discard
            </Button>
            <Button onClick={onAccept} disabled={isApplying || !hasChanges || !onAccept}>
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Applying…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Accept &amp; Apply
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DiffBlock({ entry }: { entry: BlockDiffEntry }) {
  if (entry.type === 'equal') {
    return <p className="truncate text-xs text-muted-foreground/70">{entry.text}</p>
  }

  if (entry.type === 'added') {
    return (
      <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-700 dark:text-emerald-300">
        <span className="mr-1.5 select-none font-semibold">+</span>
        {entry.text}
      </p>
    )
  }

  if (entry.type === 'removed') {
    return (
      <p className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-rose-700 line-through decoration-rose-400/60 dark:text-rose-300">
        <span className="mr-1.5 select-none font-semibold no-underline">-</span>
        {entry.text}
      </p>
    )
  }

  return (
    <p className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5">
      {(entry.wordDiff ?? []).map((token, i) => (
        <span
          key={i}
          className={cn(
            token.type === 'insert' && 'bg-emerald-500/25 text-emerald-800 dark:text-emerald-200',
            token.type === 'delete' && 'text-rose-700 line-through decoration-rose-400/60 dark:text-rose-300'
          )}
        >
          {token.value}
        </span>
      ))}
    </p>
  )
}
