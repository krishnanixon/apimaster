import { Search, Globe } from 'lucide-react'
import type { Ref } from 'react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import type { ClipboardSearchFilter } from '../types/clipboard.types'
import { useClipboardStore } from '../stores/clipboard.store'

const FILTERS: { id: ClipboardSearchFilter; label: string; compactLabel: string }[] = [
  { id: 'all', label: 'All', compactLabel: 'All' },
  { id: 'pinned', label: 'Pinned', compactLabel: 'Pin' },
  { id: 'code', label: 'Code', compactLabel: 'Code' },
  { id: 'url', label: 'URLs', compactLabel: 'URL' },
  { id: 'text', label: 'Text', compactLabel: 'Text' }
]

interface ClipboardSearchProps {
  showWebSearch?: boolean
  compact?: boolean
  autoFocus?: boolean
  inputRef?: Ref<HTMLInputElement>
}

export function ClipboardSearch({
  showWebSearch = true,
  compact = false,
  autoFocus = false,
  inputRef
}: ClipboardSearchProps) {
  const { searchQuery, filter, setSearchQuery, setFilter, searchWeb } = useClipboardStore()

  const trimmedQuery = searchQuery.trim()

  return (
    <div className={cn('flex flex-col', compact ? 'gap-1.5' : 'gap-3')}>
      <div className="relative">
        <Search
          className={cn(
            'pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground',
            compact ? 'h-3.5 w-3.5' : 'h-4 w-4 left-3'
          )}
        />
        <Input
          ref={inputRef}
          value={searchQuery}
          autoFocus={autoFocus}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && trimmedQuery) {
              event.preventDefault()
              void searchWeb(trimmedQuery)
            }
          }}
          placeholder={compact ? 'Search…' : 'Search clipboard history...'}
          className={cn(compact ? 'h-8 pl-8 text-xs' : 'pl-9')}
        />
      </div>

      {showWebSearch && trimmedQuery && (
        <button
          type="button"
          onClick={() => void searchWeb(trimmedQuery)}
          className={cn(
            'flex items-center gap-2 border border-border/60 bg-muted/30 text-left transition-colors hover:border-primary/30 hover:bg-primary/5',
            compact ? 'rounded-md px-2 py-1 text-[11px]' : 'rounded-lg px-3 py-2 text-xs'
          )}
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-muted-foreground">
            {compact ? 'Web: ' : 'Search the web for '}
            <span className="font-medium text-foreground">&ldquo;{trimmedQuery}&rdquo;</span>
          </span>
        </button>
      )}

      <div className={cn('flex flex-wrap', compact ? 'gap-1' : 'gap-2')}>
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={filter === item.id ? 'default' : 'outline'}
            className={cn(
              'rounded-full text-xs',
              compact ? 'h-6 px-2 text-[10px]' : 'h-7 px-3'
            )}
            onClick={() => setFilter(item.id)}
          >
            {compact ? item.compactLabel : item.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
