import { memo } from 'react'
import { Code2, Copy, FileText, Globe, Link2, Pin, PinOff, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { cn, formatRelativeTime } from '@/shared/lib/utils'
import type { ClipboardItem } from '../types/clipboard.types'
import { CLIPBOARD_COMPACT_PREVIEW_LENGTH, CLIPBOARD_PREVIEW_LENGTH } from '../types/clipboard.types'

const TYPE_DOT: Record<ClipboardItem['type'], string> = {
  text: 'bg-sky-500',
  code: 'bg-violet-500',
  url: 'bg-emerald-500'
}

const TYPE_ICON = {
  text: FileText,
  code: Code2,
  url: Link2
}

interface ClipboardItemProps {
  item: ClipboardItem
  selected: boolean
  compact?: boolean
  index?: number
  onSelect: (id: string) => void
  onCopy: (id: string) => void
  onActivate?: (id: string) => void
  onTogglePin: (id: string) => void
  onRemove: (id: string) => void
  onSearchWeb?: (content: string) => void
}

function preview(content: string, maxLength: number): string {
  const singleLine = content.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength)}…`
}

function formatMeta(item: ClipboardItem): string {
  const lines = item.content.split('\n').length
  const size = lines > 1 ? `${lines} lines` : `${item.content.length} chars`
  return [formatRelativeTime(new Date(item.timestamp)), size, item.sourceApp]
    .filter(Boolean)
    .join(' · ')
}

export const ClipboardItemRow = memo(function ClipboardItemRow({
  item,
  selected,
  compact = false,
  index,
  onSelect,
  onCopy,
  onActivate,
  onTogglePin,
  onRemove,
  onSearchWeb
}: ClipboardItemProps) {
  const shortcut = typeof index === 'number' && index >= 0 && index < 9 ? String(index + 1) : null
  const TypeIcon = TYPE_ICON[item.type]

  return (
    <div
      role="button"
      tabIndex={0}
      data-clipboard-selected={selected ? 'true' : undefined}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => {
        if (onActivate) onActivate(item.id)
        else onCopy(item.id)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (onActivate) onActivate(item.id)
          else onSelect(item.id)
        }
      }}
      className={cn(
        'group relative border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
        compact ? 'rounded-md px-2 py-1.5' : 'rounded-lg px-3 py-2.5',
        selected
          ? 'border-primary/50 bg-primary/7 shadow-sm'
          : 'border-border/60 bg-card/55 hover:border-border hover:bg-card'
      )}
    >
      {selected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className={cn('flex items-center gap-1.5', compact ? 'mb-0.5' : 'mb-1.5')}>
            {shortcut && (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border/70 bg-muted/80 text-[10px] font-medium text-muted-foreground">
                {shortcut}
              </span>
            )}
            <span
              className={cn(
                'inline-flex shrink-0 items-center justify-center rounded border border-border/70 bg-background/70 text-muted-foreground',
                compact ? 'h-4 w-4' : 'h-5 w-5'
              )}
            >
              <TypeIcon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            </span>
            {!compact && (
              <>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                  {item.type}
                </Badge>
                {item.pinned && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                    Pinned
                  </Badge>
                )}
              </>
            )}
            {compact && item.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TYPE_DOT[item.type])} />
            <span className="truncate text-[10px] text-muted-foreground">{formatMeta(item)}</span>
          </div>
          <p
            className={cn(
              'whitespace-pre-wrap break-words text-foreground/90',
              item.type === 'code' && 'font-mono',
              compact ? 'line-clamp-2 text-[11px] leading-snug' : 'line-clamp-3 text-xs leading-relaxed'
            )}
          >
            {preview(item.content, compact ? CLIPBOARD_COMPACT_PREVIEW_LENGTH : CLIPBOARD_PREVIEW_LENGTH)}
          </p>
        </div>

        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 transition-opacity',
            compact
              ? cn(
                  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                  selected && 'opacity-100'
                )
              : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
          )}
        >
          <Button
            size="icon"
            variant="ghost"
            className={compact ? 'h-6 w-6' : 'h-8 w-8'}
            onClick={(event) => {
              event.stopPropagation()
              onCopy(item.id)
            }}
            title="Copy to clipboard"
          >
            <Copy className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
          </Button>
          {onSearchWeb && (
            <Button
              size="icon"
              variant="ghost"
              className={compact ? 'h-6 w-6' : 'h-8 w-8'}
              onClick={(event) => {
                event.stopPropagation()
                onSearchWeb(item.content)
              }}
              title={item.type === 'url' ? 'Open in browser' : 'Search the web'}
            >
              <Globe className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className={compact ? 'h-6 w-6' : 'h-8 w-8'}
            onClick={(event) => {
              event.stopPropagation()
              onTogglePin(item.id)
            }}
            title={item.pinned ? 'Unpin' : 'Pin'}
          >
            {item.pinned ? (
              <PinOff className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            ) : (
              <Pin className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              'text-destructive hover:text-destructive',
              compact ? 'h-6 w-6' : 'h-8 w-8'
            )}
            onClick={(event) => {
              event.stopPropagation()
              onRemove(item.id)
            }}
            title="Remove"
          >
            <Trash2 className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
          </Button>
        </div>
      </div>
    </div>
  )
})
