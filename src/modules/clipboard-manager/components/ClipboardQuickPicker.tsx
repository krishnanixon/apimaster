import { useEffect, useMemo, useRef } from 'react'
import { ClipboardList, ExternalLink, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { useClipboardStore } from '../stores/clipboard.store'
import { ClipboardSearch } from './ClipboardSearch'
import { ClipboardItemRow } from './ClipboardItem'

export function ClipboardQuickPicker() {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const {
    initialized,
    isLoading,
    loadError,
    filteredItems,
    selectedId,
    init,
    subscribeLiveUpdates,
    selectItem,
    copyItem,
    pickAndPaste,
    closePicker,
    togglePin,
    removeItem,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function focusSearch() {
      const input = searchInputRef.current
      if (!input) return
      input.focus()
      input.select()
    }

    focusSearch()
    window.addEventListener('focus', focusSearch)
    return () => window.removeEventListener('focus', focusSearch)
  }, [])

  useEffect(() => {
    document
      .querySelector('[data-clipboard-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const selectedIndex = useMemo(
    () => filteredItems.findIndex((item) => item.id === selectedId),
    [filteredItems, selectedId]
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey
      const inField =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement

      if (event.key === 'Escape') {
        event.preventDefault()
        void closePicker()
        return
      }

      if (isMod && event.key >= '1' && event.key <= '9') {
        const item = filteredItems[Number(event.key) - 1]
        if (item) {
          event.preventDefault()
          void pickAndPaste(item.id)
        }
        return
      }

      if (isMod && (event.key === 'p' || event.key === 'P') && selectedId) {
        event.preventDefault()
        void togglePin(selectedId)
        return
      }

      if (inField) {
        if (event.key === 'Enter' && isMod && useClipboardStore.getState().searchQuery.trim()) {
          event.preventDefault()
          void searchWeb(useClipboardStore.getState().searchQuery)
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const delta = event.key === 'ArrowDown' ? 1 : -1
          const next = filteredItems[Math.max(0, Math.min(selectedIndex + delta, filteredItems.length - 1))]
          if (next) selectItem(next.id)
          return
        }
        if (event.key === 'Enter' && selectedId) {
          event.preventDefault()
          void pickAndPaste(selectedId)
        }
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const next = filteredItems[Math.min(selectedIndex + 1, filteredItems.length - 1)]
        if (next) selectItem(next.id)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const next = filteredItems[Math.max(selectedIndex - 1, 0)]
        if (next) selectItem(next.id)
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        void removeItem(selectedId)
        return
      }

      if (event.key === 'Enter' && selectedId) {
        event.preventDefault()
        void pickAndPaste(selectedId)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    closePicker,
    filteredItems,
    pickAndPaste,
    removeItem,
    searchWeb,
    selectItem,
    selectedId,
    selectedIndex,
    togglePin
  ])

  async function openFullManager() {
    await closePicker()
    if (window.electronAPI?.clipboard) {
      await window.electronAPI.clipboard.openPanel()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div
        className="flex h-8 shrink-0 cursor-default items-center justify-between border-b border-border/60 px-2.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <ClipboardList className="h-3.5 w-3.5 text-primary" />
          Clipboard
          {initialized && (
            <span className="text-[10px] font-normal text-muted-foreground">
              {filteredItems.length}
            </span>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => void closePicker()}
          title="Close"
          aria-label="Close clipboard picker"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        className="shrink-0 border-b border-border/40 px-2 py-1.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ClipboardSearch compact autoFocus inputRef={searchInputRef} />
        {loadError && (
          <p className="mt-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {loadError}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {isLoading && !initialized ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex h-full min-h-[8rem] flex-col items-center justify-center px-4 text-center">
            <ClipboardList className="mb-2 h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium">No clipboard items</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Copy text and it will appear here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredItems.map((item, index) => (
              <ClipboardItemRow
                key={item.id}
                item={item}
                compact
                index={index}
                selected={item.id === selectedId}
                onSelect={selectItem}
                onCopy={(id) => void copyItem(id)}
                onActivate={(id) => void pickAndPaste(id)}
                onTogglePin={(id) => void togglePin(id)}
                onRemove={(id) => void removeItem(id)}
                onSearchWeb={(content) => void searchWeb(content)}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="flex h-8 shrink-0 items-center justify-between gap-2 border-t border-border/60 px-2.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <p className="truncate text-[10px] text-muted-foreground">
          ↵ paste · {/mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'}1–9 · Esc
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => void openFullManager()}
        >
          <ExternalLink className="h-3 w-3" />
          Manager
        </Button>
      </div>
    </div>
  )
}
