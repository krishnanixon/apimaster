import {
  Key,
  Star,
  AlertTriangle,
  Pin,
  Globe,
  User
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/components/ui/badge'
import { Spinner } from '@/shared/components/ui/spinner'
import type { VaultItemListEntry } from '@shared/types/vault'
import { formatDistanceToNow } from 'date-fns'

interface VaultItemListProps {
  items: VaultItemListEntry[]
  selectedItemId: string | null
  isLoading: boolean
  onSelectItem: (id: string) => void
}

export function VaultItemList({ items, selectedItemId, isLoading, onSelectItem }: VaultItemListProps) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <Key className="h-10 w-10 shrink-0 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">No credentials yet</p>
        <p className="max-w-[200px] text-xs leading-relaxed text-muted-foreground/70">
          Press <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl+N</kbd> to add one
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/40">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40',
            selectedItemId === item.id && 'bg-primary/5 border-l-2 border-l-primary'
          )}
          onClick={() => onSelectItem(item.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {item.isPinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
                {item.favorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                <span className="truncate text-sm font-medium">{item.title}</span>
              </div>
              {item.username && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  {item.username}
                </p>
              )}
              {item.url && (
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground/80">
                  <Globe className="h-3 w-3" />
                  {item.url}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="secondary" className="text-[10px] capitalize">
                {item.itemType.replace('_', ' ')}
              </Badge>
              {(item.isWeak || item.isDuplicate || item.isExpired) && (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
            {item.lastUsedAt && (
              <span>Used {formatDistanceToNow(new Date(item.lastUsedAt), { addSuffix: true })}</span>
            )}
            {item.tagNames.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded bg-muted px-1 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  )
}

export function VaultItemListHeader({ count }: { count: number }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-muted/10 px-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Credentials
      </span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {count}
      </span>
    </div>
  )
}
