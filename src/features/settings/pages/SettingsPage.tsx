import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { DEFAULT_SETTINGS_TAB, normalizeSettingsTab, type SettingsTabId } from '@shared/settings'
import { SETTINGS_GROUPS, getSettingsTabEntry } from '@/features/settings/registry/settings-tabs'
import { SettingsSidebar } from '@/features/settings/components/SettingsSidebar'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { FadeIn } from '@/shared/components/motion/PageTransition'
import { cn } from '@/shared/lib/utils'

export function SettingsPage() {
  return <SettingsPageContent global />
}

export function SettingsPageContent({ global }: { global?: boolean }) {
  const { loadSettings } = useSettingsStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeTab = useMemo<SettingsTabId>(() => {
    return normalizeSettingsTab(searchParams.get('tab'))
  }, [searchParams])

  const setActiveTab = (tab: SettingsTabId) => {
    setSearchParams(tab === DEFAULT_SETTINGS_TAB ? {} : { tab }, { replace: true })
  }

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeTab])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && normalizeSettingsTab(tab) !== tab) {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const entry = getSettingsTabEntry(activeTab)
  const Panel = entry?.Panel
  const groupLabel = SETTINGS_GROUPS.find((g) => g.id === entry?.group)?.label

  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">
      <SettingsSidebar activeTab={activeTab} onSelect={setActiveTab} />

      <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
        {entry && (
          <header className="sticky top-0 z-10 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-4 md:px-8">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/15">
                <entry.icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  Settings
                  {groupLabel && (
                    <>
                      <ChevronRight className="h-3 w-3" />
                      {groupLabel}
                    </>
                  )}
                </p>
                <h2 className="truncate text-base font-semibold tracking-tight">{entry.label}</h2>
                {entry.description && (
                  <p className="hidden truncate text-xs text-muted-foreground sm:block">
                    {entry.description}
                  </p>
                )}
              </div>
              <SaveIndicator />
            </div>
          </header>
        )}

        <div className="mx-auto max-w-4xl px-5 pb-28 pt-6 md:px-8">
          {entry?.description && (
            <p className="mb-6 text-sm text-muted-foreground sm:hidden">{entry.description}</p>
          )}
          <FadeIn key={activeTab}>{Panel ? <Panel global={global} /> : null}</FadeIn>
        </div>
      </div>
    </div>
  )
}

/** Briefly confirms that a change to app settings has been persisted. */
function SaveIndicator() {
  const lastSavedAt = useSettingsStore((s) => s.lastSavedAt)
  const mountedAt = useRef(Date.now())
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!lastSavedAt || lastSavedAt < mountedAt.current) return
    setJustSaved(true)
    const timer = window.setTimeout(() => setJustSaved(false), 1800)
    return () => window.clearTimeout(timer)
  }, [lastSavedAt])

  return (
    <span
      aria-live="polite"
      className={cn(
        'hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors sm:inline-flex',
        justSaved
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'text-muted-foreground'
      )}
    >
      <Check className="h-3 w-3" />
      {justSaved ? 'Saved' : 'Changes save automatically'}
    </span>
  )
}
