import { ListTree } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { extractOutline, outlineOccurrenceIndex, type OutlineItem } from '@/features/editor/lib/document-outline'

export type { OutlineItem }
export { extractOutline }

interface DocumentOutlineProps {
  html?: string
  items?: OutlineItem[]
  className?: string
  onNavigate?: (text: string, item: OutlineItem, occurrence: number) => void
}

export function DocumentOutline({ html, items: providedItems, className, onNavigate }: DocumentOutlineProps) {
  const items = providedItems ?? extractOutline(html ?? '')
  const outline = Array.isArray(items) ? items : []
  const counts = outline.reduce<Record<string, number>>((acc, item) => {
    const key = item.text.toLowerCase()
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const duplicates = outline.filter((item) => counts[item.text.toLowerCase()] > 1)

  if (outline.length === 0) {
    return (
      <div className={cn('py-4 text-center', className)}>
        <ListTree className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">Add headings to build an outline</p>
      </div>
    )
  }

  return (
    <nav className={cn('space-y-0.5', className)} aria-label="Document outline">
      {duplicates.length > 0 && (
        <p className="mb-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-400">
          Duplicate headings: {Array.from(new Set(duplicates.map((d) => d.text))).join(', ')}
        </p>
      )}
      {outline.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() =>
            onNavigate?.(item.text, item, outlineOccurrenceIndex(outline, index))
          }
          className={cn(
            'block w-full truncate rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-muted',
            item.level === 1 && 'font-semibold',
            item.level === 2 && 'pl-4 text-muted-foreground',
            item.level >= 3 && 'pl-6 text-muted-foreground',
            item.level >= 4 && 'pl-8 text-[11px]',
            counts[item.text.toLowerCase()] > 1 && 'text-amber-700 dark:text-amber-400'
          )}
        >
          {item.text}
        </button>
      ))}
    </nav>
  )
}
