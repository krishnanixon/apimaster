import { useEffect, useMemo } from 'react'
import { ClipboardList, Eraser, Globe } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { Badge } from '@/shared/components/ui/badge'
import { formatRelativeTime } from '@/shared/lib/utils'
import { CLIPBOARD_MAX_ITEMS } from '../types/clipboard.types'
import { useClipboardStore } from '../stores/clipboard.store'
import { ClipboardSearch } from './ClipboardSearch'
import { ClipboardItemRow } from './ClipboardItem'

export function ClipboardPanel() {
  const {
    initialized,
    isLoading,
    loadError,
    filteredItems,
    items,
    selectedId,
    init,
    subscribeLiveUpdates,
    selectItem,
    copyItem,
    togglePin,
    removeItem,
    clearUnpinned,
    searchWeb
  } = useClipboardStore()

  useEffect(() => {
    void init()
    const unsubscribe = subscribeLiveUpdates()
    const refreshTimer = window.setInterval(() => {
      void useClipboardStore.getState().refresh()
    }, 4000)

    return () => {
      unsubscribe()
      window.clearInterval(refreshTimer)
    }
    // Mount once: live subscription + polling fallback for clipboard sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document
      .querySelector('[data-clipboard-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.id === selectedId) ?? null,
    [filteredItems, selectedId]
  )

  const selectedLines = selectedItem ? selectedItem.content.split('\n').length : 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border/50 bg-card/40 px-3 py-2 md:px-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <ClipboardSearch />
          </div>
          <div className="flex items-center gap-2 self-start lg:self-auto lg:pb-0.5">
            <Badge variant="secondary" className="h-6 text-[11px]">
              {items.length} / {CLIPBOARD_MAX_ITEMS}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void clearUnpinned()}
              disabled={items.every((item) => item.pinned)}
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear unpinned
            </Button>
          </div>
        </div>
        {loadError && (
          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {loadError}
          </p>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,20rem)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden border-b border-border/40 bg-muted/20 lg:border-b-0 lg:border-r">
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading && !initialized ? (
              <div className="flex h-32 items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="h-5 w-5" />}
                title="No clipboard items"
                description="Copy text anywhere on your system and it will appear here automatically."
              />
            ) : (
              <div className="flex flex-col gap-1">
                {filteredItems.map((item) => (
                  <ClipboardItemRow
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={selectItem}
                    onCopy={(id) => void copyItem(id)}
                    onTogglePin={(id) => void togglePin(id)}
                    onRemove={(id) => void removeItem(id)}
                    onSearchWeb={(content) => void searchWeb(content)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {selectedItem ? (
            <>
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase">
                      {selectedItem.type}
                    </Badge>
                    {selectedItem.pinned && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        Pinned
                      </Badge>
                    )}
                    {selectedItem.sourceApp && (
                      <Badge variant="outline" className="h-5 max-w-[10rem] truncate px-1.5 text-[10px]">
                        {selectedItem.sourceApp}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(new Date(selectedItem.timestamp))}
                    {' · '}
                    {selectedLines > 1 ? `${selectedLines} lines` : `${selectedItem.content.length} chars`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => void searchWeb(selectedItem.content)}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {selectedItem.type === 'url' ? 'Open' : 'Web'}
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => void copyItem(selectedItem.id)}>
                    Copy
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <pre className="mx-auto max-w-4xl whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
                  {selectedItem.content}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex min-h-[160px] flex-1 items-center justify-center p-4">
              <EmptyState
                icon={<ClipboardList className="h-5 w-5" />}
                title="Select an item"
                description="Choose a clipboard entry to preview its full content."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
