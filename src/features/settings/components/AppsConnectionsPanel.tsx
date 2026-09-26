import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppWindow, ExternalLink, LayoutList, RotateCcw, Settings2 } from 'lucide-react'
import { Switch } from '@/shared/components/ui/switch'
import { useModulesStore } from '@/shared/stores/modules.store'
import {
  filterAppCatalog,
  getAppSettingsTab,
  getAppsByKind,
  isBuiltinAppEnabled,
  mapAiIntegrationStatus,
  mapProfileIntegrationStatus,
  mapVpsIntegrationStatus,
  type AppDefinition
} from '@/shared/lib/app-catalog'
import { getSelectableProjectMenuModules, isModuleEnabled } from '@/shared/lib/module-registry'
import { SIDEBAR_TREE_DEPTH_OPTIONS } from '@shared/types/modules'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'
import { toast } from 'sonner'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { useDbWorkspaceStore } from '@/modules/database-studio/stores/dbWorkspace.store'
import { useVectorWorkspaceStore } from '@/modules/vector-studio/stores/vectorWorkspace.store'
import { useVPSStore } from '@/modules/vps-manager/stores/vps.store'
import type { AppConnectionStatus } from '@shared/types/apps'

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

/**
 * Settings overview of enabled studio apps and connected integrations.
 * Full catalog lives on /apps; detailed credentials stay in Database / Vector / AI tabs.
 */
export function AppsConnectionsPanel() {
  const navigate = useNavigate()
  const {
    enabled,
    sidebarTreeDepth,
    setModuleEnabled,
    setCategoryEnabled,
    setSidebarTreeDepth,
    resetToDefaults,
    isEnabled
  } = useModulesStore()

  const preferences = useMemo(() => ({ enabled, sidebarTreeDepth }), [enabled, sidebarTreeDepth])

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

  const selectableApps = useMemo(
    () =>
      filterAppCatalog({ kind: 'builtin', preferences }).filter(
        (app) => app.selectable && app.moduleId
      ),
    [preferences]
  )

  const projectMenuModules = useMemo(() => getSelectableProjectMenuModules(), [])

  const projectMenuEnabledCount = useMemo(
    () => projectMenuModules.filter((mod) => isModuleEnabled(mod, preferences)).length,
    [projectMenuModules, preferences]
  )

  const enabledCount = useMemo(
    () => selectableApps.filter((app) => isBuiltinAppEnabled(app, preferences)).length,
    [selectableApps, preferences]
  )

  const integrations = useMemo(() => getAppsByKind('integration'), [])

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

  const handleReset = () => {
    resetToDefaults()
    toast.success('App selection reset to defaults')
  }

  const toggleApp = (app: AppDefinition) => {
    if (!app.moduleId || !app.selectable) return
    const next = !isEnabled(app.moduleId)
    setModuleEnabled(app.moduleId, next)
    toast.success(next ? `${app.label} enabled` : `${app.label} disabled`)
  }

  const enableAllTools = () => {
    setCategoryEnabled('developer-tools', true)
    toast.success('All tools enabled')
  }

  const disableAllTools = () => {
    setCategoryEnabled('developer-tools', false)
    toast.success('All tools disabled')
  }

  const enableAllProjectMenus = () => {
    setCategoryEnabled('project', true)
    toast.success('All project menus enabled')
  }

  const disableAllProjectMenus = () => {
    for (const mod of projectMenuModules) {
      setModuleEnabled(mod.id, false)
    }
    toast.success('Project menus disabled (Overview stays available)')
  }

  const toggleProjectModule = (id: string, label: string) => {
    const next = !isEnabled(id)
    setModuleEnabled(id, next)
    toast.success(next ? `${label} shown in project menu` : `${label} hidden from project menu`)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <AppWindow className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Apps catalog</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Add or remove studio tools from the Apps hub, or toggle them below. Tools appear in
              the sidebar directly under Projects.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate('/apps')}>
          <ExternalLink className="h-3.5 w-3.5" />
          Open Apps
        </Button>
      </div>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Sidebar density</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Control how nested project modules appear in the sidebar.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {SIDEBAR_TREE_DEPTH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSidebarTreeDepth(opt.value)}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                sidebarTreeDepth === opt.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              <div className="flex items-center gap-2">
                <LayoutList className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{opt.label}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Project menu</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Show or hide modules inside an open project (Chat, Documents, Presentations, and
              more). Overview cannot be turned off.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={enableAllProjectMenus}>
              Show all
            </Button>
            <Button variant="outline" size="sm" onClick={disableAllProjectMenus}>
              Hide all
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {projectMenuEnabledCount} of {projectMenuModules.length} project menu items visible
        </p>

        <div className="divide-y divide-border rounded-xl border border-border">
          {projectMenuModules.map((mod) => {
            const on = isEnabled(mod.id)
            const nested = Boolean(mod.parentId)
            return (
              <div
                key={mod.id}
                className={cn('flex items-center gap-3 px-3 py-2.5', !on && 'opacity-70')}
              >
                <mod.icon
                  className={cn('h-4 w-4 shrink-0 text-muted-foreground', nested && 'ml-5')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{mod.label}</p>
                    {nested && (
                      <Badge variant="outline" className="text-[10px]">
                        Nested
                      </Badge>
                    )}
                    {!on && (
                      <Badge variant="outline" className="text-[10px]">
                        Hidden
                      </Badge>
                    )}
                  </div>
                  {mod.description && (
                    <p className="truncate text-[11px] text-muted-foreground">{mod.description}</p>
                  )}
                </div>
                <Switch
                  aria-label={`Show ${mod.label} in project menu`}
                  checked={on}
                  onCheckedChange={() => toggleProjectModule(mod.id, mod.label)}
                />
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Tools & apps</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {enabledCount} of {selectableApps.length} enabled — shown under Projects in the
              sidebar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={enableAllTools}>
              Enable all tools
            </Button>
            <Button variant="outline" size="sm" onClick={disableAllTools}>
              Disable all tools
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>

        {selectableApps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No selectable apps found.{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => navigate('/apps')}
            >
              Browse the catalog
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {selectableApps.map((app) => {
              const on = Boolean(app.moduleId && isEnabled(app.moduleId))
              return (
                <div
                  key={app.id}
                  className={cn('flex items-center gap-3 px-3 py-2.5', !on && 'opacity-70')}
                >
                  <app.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{app.label}</p>
                      {!on && (
                        <Badge variant="outline" className="text-[10px]">
                          Off
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{app.description}</p>
                  </div>
                  {app.openPath && on && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => navigate(app.openPath!)}
                    >
                      Open
                    </Button>
                  )}
                  {app.selectable && app.moduleId && (
                    <Switch
                      aria-label={`Enable ${app.label}`}
                      checked={on}
                      onCheckedChange={() => toggleApp(app)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Connected services</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Status from existing AI, database, vector, and VPS connections. Configure credentials in
            the dedicated Settings tabs.
          </p>
        </div>

        <div className="divide-y divide-border rounded-xl border border-border">
          {integrations.map((app) => {
            const status = integrationStatus.get(app.id)
            return (
              <div key={app.id} className="flex items-start gap-3 px-3 py-3">
                <app.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-medium">{app.label}</p>
                    {status && (
                      <Badge
                        variant={statusBadgeVariant(status.tone)}
                        className="text-[10px]"
                        title={status.detail}
                      >
                        {status.label}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{app.description}</p>
                  {status?.detail && (
                    <p className="mt-1 text-[10px] text-muted-foreground/80">{status.detail}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {getAppSettingsTab(app) !== 'apps' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => navigate(`/settings?tab=${getAppSettingsTab(app)}`)}
                    >
                      <Settings2 className="h-3 w-3" />
                      Configure
                    </Button>
                  )}
                  {app.openPath && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => navigate(app.openPath!)}
                    >
                      Open
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
