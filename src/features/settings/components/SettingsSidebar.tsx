import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Search, X } from 'lucide-react'
import type { SettingsTabId } from '@shared/settings'
import {
  SETTINGS_GROUPS,
  searchSettingsTabs,
  type SettingsTabEntry
} from '@/features/settings/registry/settings-tabs'
import { cn } from '@/shared/lib/utils'

export function SettingsSidebar({
  activeTab,
  onSelect
}: {
  activeTab: SettingsTabId
  onSelect: (tab: SettingsTabId) => void
}) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const results = useMemo(() => searchSettingsTabs(query), [query])
  const searching = query.trim().length > 0

  // ⌘F / Ctrl+F or "/" jumps to settings search
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]')
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') || (e.key === '/' && !typing)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const focusItem = (index: number) => {
    const items = navRef.current?.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')
    if (!items?.length) return
    items[(index + items.length) % items.length]?.focus()
  }

  const onNavKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const items = Array.from(
      navRef.current?.querySelectorAll<HTMLButtonElement>('[data-settings-tab]') ?? []
    )
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      focusItem(current + 1)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      focusItem(current - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(items.length - 1)
    }
  }

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && results[0]) {
      onSelect(results[0].id)
      setQuery('')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'Escape') {
      setQuery('')
    }
  }

  const selectTab = (id: SettingsTabId) => {
    onSelect(id)
    if (searching) setQuery('')
  }

  return (
    <aside className="flex shrink-0 flex-col border-b border-border/60 bg-muted/20 md:w-64 md:border-b-0 md:border-r">
      <div className="p-3 md:p-4 md:pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search settings"
            aria-label="Search settings"
            className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-12 text-sm shadow-soft transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15"
          />
          {searching ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-sans text-[10px] text-muted-foreground md:inline-block">
              /
            </kbd>
          )}
        </div>
      </div>

      <nav
        ref={navRef}
        aria-label="Settings sections"
        onKeyDown={onNavKeyDown}
        className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto md:px-3 md:pb-4"
      >
        {searching ? (
          results.length ? (
            <div className="flex gap-1 md:flex-col md:gap-0.5">
              <p className="hidden px-2.5 pb-1.5 text-[11px] text-muted-foreground md:block">
                {results.length} {results.length === 1 ? 'match' : 'matches'} · Enter to open
              </p>
              {results.map((tab) => (
                <NavItem
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeTab}
                  showDescription
                  onClick={() => selectTab(tab.id)}
                />
              ))}
            </div>
          ) : (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              No settings match “{query.trim()}”.
            </p>
          )
        ) : (
          SETTINGS_GROUPS.map((group) => {
            const tabs = results.filter((tab) => tab.group === group.id)
            if (!tabs.length) return null
            return (
              <div key={group.id} className="flex gap-1 md:mb-4 md:flex-col md:gap-0.5">
                <p className="hidden px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 md:block">
                  {group.label}
                </p>
                {tabs.map((tab) => (
                  <NavItem
                    key={tab.id}
                    tab={tab}
                    active={tab.id === activeTab}
                    onClick={() => selectTab(tab.id)}
                  />
                ))}
              </div>
            )
          })
        )}
      </nav>
    </aside>
  )
}

function NavItem({
  tab,
  active,
  showDescription,
  onClick
}: {
  tab: SettingsTabEntry
  active: boolean
  showDescription?: boolean
  onClick: () => void
}) {
  const Icon = tab.icon
  return (
    <button
      type="button"
      data-settings-tab={tab.id}
      aria-current={active ? 'page' : undefined}
      title={tab.description}
      onClick={onClick}
      className={cn(
        'group flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:w-full',
        active
          ? 'bg-background font-medium text-foreground shadow-soft ring-1 ring-border/70'
          : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
          active ? 'bg-primary/10 text-primary' : 'bg-muted/70 group-hover:bg-background'
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate whitespace-nowrap">{tab.label}</span>
        {showDescription && (
          <span className="hidden truncate text-[11px] font-normal text-muted-foreground md:block">
            {tab.description}
          </span>
        )}
      </span>
    </button>
  )
}
