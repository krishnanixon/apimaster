import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppWindow,
  Check,
  ExternalLink,
  Plus,
  Search,
  Settings2,
  SquareArrowOutUpRight,
  X
} from 'lucide-react'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { cn } from '@/shared/lib/utils'
import {
  APP_CATALOG_CATEGORIES,
  filterAppCatalog,
  getAppSettingsTab,
  groupAppsByCatalogCategory,
  isBuiltinAppEnabled,
  type AppDefinition
} from '@/shared/lib/app-catalog'
import { useModulesStore } from '@/shared/stores/modules.store'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { useDbWorkspaceStore } from '@/modules/database-studio/stores/dbWorkspace.store'
import { useVectorWorkspaceStore } from '@/modules/vector-studio/stores/vectorWorkspace.store'
import { useVPSStore } from '@/modules/vps-manager/stores/vps.store'
import {
  mapAiIntegrationStatus,
  mapProfileIntegrationStatus,
  mapVpsIntegrationStatus
} from '@/shared/lib/app-catalog'
import type { AppCatalogCategory, AppConnectionStatus, AppKind } from '@shared/types/apps'
import { toast } from 'sonner'
import { isPopoutModulePath } from '@shared/lib/module-windows'
import { openModuleWindow } from '@/shared/lib/windows'

type ViewTab = 'discover' | 'my-apps' | 'connections'

const TAB_META: { id: ViewTab; label: string; description: string }[] = [
  { id: 'discover', label: 'Discover', description: 'Browse and enable studio apps' },
  { id: 'my-apps', label: 'My Apps', description: 'Tools enabled in your sidebar' },
  { id: 'connections', label: 'Connections', description: 'AI, databases, vectors, and VPS' }
]

function statusBadgeVariant(
  tone: AppConnectionStatus['tone']
): 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info' {
  switch (tone) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'info':
      return 'info'
    case 'destructive':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function AppsPage() {
  const navigate = useNavigate()
  const { enabled, sidebarTreeDepth, setModuleEnabled, isEnabled } = useModulesStore()
  const preferences = useMemo(() => ({ enabled, sidebarTreeDepth }), [enabled, sidebarTreeDepth])

  const [tab, setTab] = useState<ViewTab>('discover')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<AppCatalogCategory | 'all'>('all')

  const loadAiStatus = useAIStore((s) => s.loadStatus)
  const aiProviders = useAIStore((s) => s.providers)
  const apiKeyStatus = useSettingsStore((s) => s.apiKeyStatus)
  const loadApiKeyStatus = useSettingsStore((s) => s.loadApiKeyStatus)

  const dbConnections = useDbWorkspaceStore((s) => s.connections)
  const dbActiveId = useDbWorkspaceStore((s) => s.activeConnectionId)
  const loadDbConnections = useDbWorkspaceStore((s) => s.loadConnections)

  const vectorConnections = useVectorWorkspaceStore((s) => s.connections)
  const vectorActiveId = useVectorWorkspaceStore((s) => s.activeConnectionId)
  const loadVectorConnections = useVectorWorkspaceStore((s) => s.loadConnections)

  const vpsServers = useVPSStore((s) => s.servers)
  const pendingServerActions = useVPSStore((s) => s.pendingServerActions)
  const loadServers = useVPSStore((s) => s.loadServers)
  const subscribeToEvents = useVPSStore((s) => s.subscribeToEvents)

  useEffect(() => {
    void loadAiStatus()
    void loadApiKeyStatus()
    void loadDbConnections()
    void loadVectorConnections()
    void loadServers()
    return subscribeToEvents()
  }, [
    loadAiStatus,
    loadApiKeyStatus,
    loadDbConnections,
    loadVectorConnections,
    loadServers,
    subscribeToEvents
  ])

  const integrationStatus = useMemo(() => {
    const map = new Map<string, AppConnectionStatus>()
    map.set(
      'integration-ai',
      mapAiIntegrationStatus({
        providers: aiProviders,
        hasApiKey: apiKeyStatus?.isSet
      })
    )
    map.set(
      'integration-database',
      mapProfileIntegrationStatus({
        profileCount: dbConnections.length,
        activeConnectionId: dbActiveId,
        healthyCount: dbConnections.filter((c) => c.health === 'healthy').length,
        offlineCount: dbConnections.filter((c) => c.health === 'offline' || c.health === 'degraded')
          .length
      })
    )
    map.set(
      'integration-vector',
      mapProfileIntegrationStatus({
        profileCount: vectorConnections.length,
        activeConnectionId: vectorActiveId,
        healthyCount: vectorConnections.filter((c) => c.health === 'healthy').length,
        offlineCount: vectorConnections.filter(
          (c) => c.health === 'offline' || c.health === 'degraded'
        ).length
      })
    )
    const connectingCount = Object.values(pendingServerActions ?? {}).filter(
      (a) => a === 'connect' || a === 'reconnect'
    ).length
    map.set(
      'integration-vps',
      mapVpsIntegrationStatus({
        serverCount: vpsServers.length,
        connectedCount: vpsServers.filter((s) => s.status === 'connected').length,
        connectingCount,
        errorCount: vpsServers.filter((s) => s.status === 'error').length
      })
    )
    return map
  }, [
    aiProviders,
    apiKeyStatus?.isSet,
    dbConnections,
    dbActiveId,
    vectorConnections,
    vectorActiveId,
    vpsServers,
    pendingServerActions
  ])

  const kindFilter: AppKind | 'all' =
    tab === 'connections' ? 'integration' : tab === 'my-apps' ? 'builtin' : 'all'

  const filtered = useMemo(
    () =>
      filterAppCatalog({
        query,
        kind: kindFilter,
        category,
        enabledOnly: tab === 'my-apps',
        preferences
      }).filter((app) => {
        if (tab === 'discover') return app.kind === 'builtin'
        if (tab === 'connections') return app.kind === 'integration'
        return true
      }),
    [query, kindFilter, category, preferences, tab]
  )

  const grouped = useMemo(() => groupAppsByCatalogCategory(filtered), [filtered])

  const enabledCount = useMemo(
    () =>
      filterAppCatalog({ kind: 'builtin', preferences }).filter((app) =>
        isBuiltinAppEnabled(app, preferences)
      ).length,
    [preferences]
  )

  const configuredConnections = useMemo(
    () =>
      [...integrationStatus.values()].filter((s) => s.id !== 'not-configured').length,
    [integrationStatus]
  )

  const toggleApp = useCallback(
    (app: AppDefinition) => {
      if (!app.moduleId || app.required || !app.selectable) return
      const next = !isEnabled(app.moduleId)
      setModuleEnabled(app.moduleId, next)
      toast.success(next ? `${app.label} added to sidebar` : `${app.label} removed from sidebar`)
    },
    [isEnabled, setModuleEnabled]
  )

  const openApp = (app: AppDefinition) => {
    if (app.openPath) navigate(app.openPath)
  }

  const configureApp = (app: AppDefinition) => {
    const tabId = getAppSettingsTab(app)
    if (tabId === 'apps') {
      navigate('/apps')
      return
    }
    navigate(`/settings?tab=${tabId}`)
  }

  return (
    <ModulePage>
      <PageHeader
        title="Apps"
        description="Choose the tools for your development studio and review connected services. Configuration stays in Settings."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/settings?tab=apps')}>
            <Settings2 className="h-3.5 w-3.5" />
            Connected in Settings
          </Button>
        }
      />

      <PageContent>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps…"
              className="h-9 pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
              All
            </FilterChip>
            {APP_CATALOG_CATEGORIES.filter((c) =>
              tab === 'connections' ? c.id === 'connections' : c.id !== 'connections'
            ).map((c) => (
              <FilterChip
                key={c.id}
                active={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {TAB_META.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setCategory('all')
              }}
              className={cn(
                'rounded-lg border px-3 py-2 text-left transition-colors',
                tab === t.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border/60 hover:bg-muted/50'
              )}
            >
              <p className={cn('text-sm font-medium', tab === t.id && 'text-primary')}>
                {t.label}
                {t.id === 'my-apps' && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {enabledCount}
                  </span>
                )}
                {t.id === 'connections' && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {configuredConnections}/{integrationStatus.size}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>

        {grouped.length === 0 ? (
          <EmptyState
            icon={<AppWindow className="h-5 w-5" />}
            title={tab === 'my-apps' ? 'No apps enabled yet' : 'No matching apps'}
            description={
              tab === 'my-apps'
                ? 'Browse Discover and enable the tools you want in your sidebar.'
                : 'Try a different search or category filter.'
            }
            action={
              tab === 'my-apps' ? (
                <Button size="sm" onClick={() => setTab('discover')}>
                  Browse apps
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-8">
            {grouped.map(({ category: cat, apps }) => (
              <section key={cat.id}>
                <div className="mb-3">
                  <h2 className="text-sm font-semibold tracking-tight">{cat.label}</h2>
                  <p className="text-[11px] text-muted-foreground">{cat.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {apps.map((app) => {
                    const enabledApp =
                      app.kind === 'builtin' && isBuiltinAppEnabled(app, preferences)
                    const status =
                      app.kind === 'integration' ? integrationStatus.get(app.id) : undefined
                    return (
                      <AppCard
                        key={app.id}
                        app={app}
                        enabled={enabledApp}
                        status={status}
                        onToggle={() => toggleApp(app)}
                        onOpen={() => openApp(app)}
                        onOpenInWindow={
                          app.openPath && isPopoutModulePath(app.openPath)
                            ? () => void openModuleWindow(app.openPath!)
                            : undefined
                        }
                        onConfigure={() => configureApp(app)}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageContent>
    </ModulePage>
  )
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

function AppCard({
  app,
  enabled,
  status,
  onToggle,
  onOpen,
  onOpenInWindow,
  onConfigure
}: {
  app: AppDefinition
  enabled: boolean
  status?: AppConnectionStatus
  onToggle: () => void
  onOpen: () => void
  onOpenInWindow?: () => void
  onConfigure: () => void
}) {
  const Icon = app.icon

  return (
    <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-soft">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            enabled || status?.tone === 'success'
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border bg-muted/40 text-muted-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{app.label}</h3>
            {app.kind === 'builtin' && enabled && (
              <Badge variant="success" className="text-[10px]">
                Enabled
              </Badge>
            )}
            {status && (
              <Badge variant={statusBadgeVariant(status.tone)} className="text-[10px]" title={status.detail}>
                {status.label}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {app.description}
          </p>
          {status?.detail && (
            <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground/80">{status.detail}</p>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5">
        {app.openPath && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpen}>
            <ExternalLink className="h-3 w-3" />
            Open
          </Button>
        )}
        {onOpenInWindow && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onOpenInWindow}>
            <SquareArrowOutUpRight className="h-3 w-3" />
            Window
          </Button>
        )}
        {getAppSettingsTab(app) !== 'apps' && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onConfigure}>
            <Settings2 className="h-3 w-3" />
            Configure
          </Button>
        )}
        {app.selectable && app.moduleId && !app.required && (
          <Button
            size="sm"
            variant={enabled ? 'secondary' : 'default'}
            className="ml-auto h-7 text-xs"
            onClick={onToggle}
          >
            {enabled ? (
              <>
                <X className="h-3 w-3" />
                Remove
              </>
            ) : (
              <>
                <Plus className="h-3 w-3" />
                Add
              </>
            )}
          </Button>
        )}
        {app.kind === 'integration' && status?.id !== 'not-configured' && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Check className="h-3 w-3 text-emerald-500" />
            Linked
          </span>
        )}
      </div>
    </Card>
  )
}
