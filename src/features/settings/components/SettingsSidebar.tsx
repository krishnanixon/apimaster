import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'
import type { SettingsTabId } from '@shared/settings'
import { PRODUCT_NAME } from '@shared/constants/product'
import { UserAvatar } from '@/features/settings/components/UserAvatar'
import { useProfileStore } from '@/features/settings/stores/profile.store'
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
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    void window.electronAPI?.app?.getVersion().then(setVersion).catch(() => undefined)
  }, [])

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
    <aside className="flex shrink-0 flex-col border-b border-border bg-sidebar/40 md:w-60 md:border-b-0 md:border-r">
      <ProfileCard active={activeTab === 'profile'} onClick={() => selectTab('profile')} />
      <div className="p-3 md:px-4 md:pb-3 md:pt-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search settings"
            aria-label="Search settings"
            className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-12 text-[13px] shadow-soft transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15"
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
              <div
                key={group.id}
                // On desktop the profile card above the search box stands in for this group
                className={cn(
                  'flex gap-1 md:mb-4 md:flex-col md:gap-0.5',
                  group.id === 'account' && 'md:hidden'
                )}
              >
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

      <footer className="hidden items-center justify-between border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground md:flex">
        <span>{PRODUCT_NAME}</span>
        {version && <span className="font-mono">v{version}</span>}
      </footer>
    </aside>
  )
}

/** Who's signed in to this copy of the app — doubles as the shortcut to the profile tab. */
function ProfileCard({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { profile, loaded, loadProfile } = useProfileStore()

  useEffect(() => {
    if (!loaded) void loadProfile()
  }, [loaded, loadProfile])

  const name = profile?.displayName ?? ''
  const subtitle = profile?.role || profile?.email || (name ? 'View profile' : 'Add your name and photo')

  return (
    <div className="hidden p-4 pb-3 md:block">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          active
            ? 'border-primary/30 bg-primary/5 shadow-soft'
            : 'border-border/60 bg-background/70 hover:border-border hover:bg-background hover:shadow-soft'
        )}
      >
        <UserAvatar name={name} src={profile?.avatarDataUrl} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{name || 'Your profile'}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
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
        'group relative flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:w-full',
        active
          ? 'bg-background font-medium text-foreground shadow-soft ring-1 ring-border/70'
          : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute -left-3 top-1/2 hidden h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary md:block"
        />
      )}
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors',
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
