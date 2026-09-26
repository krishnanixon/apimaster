import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Circle,
  Copy,
  Play,
  Plus,
  RefreshCw,
  Server,
  Square,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MockBodyType, MockResponse, MockRoute } from '@shared/types/mock-server'
import { MOCK_STATUS_PRESETS } from '@shared/types/mock-server'
import { createDefaultMockRoute, createDefaultMockResponse, pickActiveResponse } from '@shared/lib/mock-server/defaults'
import { validateJsonBody, validateMockResponse } from '@shared/lib/mock-server/validation'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Badge } from '@/shared/components/ui/badge'
import { writeClipboardText } from '@/shared/lib/clipboard'
import { RequestCodeEditor } from '@/modules/api-studio/components/RequestCodeEditor'
import { ResponseBodyView } from '@/modules/api-studio/components/response/ResponseBodyView'
import type { ApiExecutionResult } from '@shared/types/api-studio'
import { useMockServerStore } from '../stores/mockServerStore'
import { HTTP_METHODS, METHOD_COLORS } from '@/modules/api-studio/types/api.types'
import { cn } from '@/shared/lib/utils'

const BODY_TYPES: MockBodyType[] = ['json', 'text', 'xml', 'html']

export function MockServersPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    servers,
    statuses,
    selectedServerId,
    selectedRouteId,
    logs,
    loading,
    refresh,
    refreshStatuses,
    refreshLogs,
    selectServer,
    selectRoute,
    createServer,
    saveServer,
    deleteServer,
    upsertRoute,
    deleteRoute,
    startServer,
    stopServer,
    restartServer,
    clearLogs
  } = useMockServerStore()

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null
  const selectedRoute = selectedServer?.routes.find((r) => r.id === selectedRouteId) ?? null
  const status = selectedServerId ? statuses[selectedServerId] : undefined

  const [serverDraft, setServerDraft] = useState<{ name: string; host: string; port: number } | null>(null)
  const [draftRoute, setDraftRoute] = useState<MockRoute | null>(null)
  const [testResult, setTestResult] = useState<ApiExecutionResult | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const state = location.state as { selectServerId?: string } | null
    if (state?.selectServerId) {
      selectServer(state.selectServerId)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate, selectServer])

  useEffect(() => {
    if (selectedServer) {
      setServerDraft({
        name: selectedServer.name,
        host: selectedServer.host,
        port: selectedServer.port
      })
    } else setServerDraft(null)
  }, [selectedServer])

  useEffect(() => {
    if (selectedRoute) setDraftRoute(structuredClone(selectedRoute))
    else setDraftRoute(null)
    setTestResult(null)
  }, [selectedRoute])

  useEffect(() => {
    if (status?.status !== 'running' || !selectedServerId) return
    const timer = window.setInterval(() => {
      void refreshLogs(selectedServerId)
      void refreshStatuses()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [status?.status, selectedServerId, refreshLogs, refreshStatuses])

  const running = status?.status === 'running'

  async function handleCreateServer() {
    const server = await createServer()
    if (server) toast.success('Mock server created')
    else toast.error('Could not create mock server')
  }

  async function handleSaveServerMeta(partial: { name?: string; description?: string; host?: string; port?: number }) {
    if (!selectedServer) return
    if (running && (partial.host !== undefined || partial.port !== undefined)) {
      toast.error('Stop the server before changing host or port')
      return
    }
    const ok = await saveServer({ ...selectedServer, ...partial, updatedAt: new Date().toISOString() })
    if (ok) toast.success('Saved')
    else toast.error('Save failed')
  }

  async function handleSaveRoute() {
    if (!selectedServer || !draftRoute) return
    const err = validateMockResponse(pickActiveResponse(draftRoute) ?? draftRoute.responses[0]!)
    if (err) {
      toast.error(err)
      return
    }
    for (const resp of draftRoute.responses) {
      if (resp.bodyType === 'json') {
        const json = validateJsonBody(resp.body)
        if (!json.ok) {
          toast.error(`Invalid JSON: ${json.message}`)
          return
        }
      }
    }
    const ok = await upsertRoute(selectedServer.id, draftRoute)
    if (ok) toast.success('Route saved')
    else toast.error('Could not save route')
  }

  async function handleToggleServer(action: 'start' | 'stop' | 'restart') {
    if (!selectedServerId) return
    let ok = false
    if (action === 'start') ok = await startServer(selectedServerId)
    else if (action === 'stop') ok = await stopServer(selectedServerId)
    else ok = await restartServer(selectedServerId)
    if (!ok) {
      const st = statuses[selectedServerId]
      toast.error(st?.error ?? `Failed to ${action} mock server`)
      return
    }
    await refreshLogs(selectedServerId)
    toast.success(action === 'start' ? 'Mock server running' : action === 'stop' ? 'Mock server stopped' : 'Mock server restarted')
  }

  async function handleTestRoute() {
    if (!selectedServerId || !draftRoute) return
    setTesting(true)
    const res = await window.electronAPI.mockServer.testRoute({
      serverId: selectedServerId,
      routeId: draftRoute.id
    })
    setTesting(false)
    if (!res.success || !res.data) {
      toast.error(res.error ?? 'Test failed')
      return
    }
    setTestResult(res.data)
  }

  const copyBaseUrl = useCallback(async () => {
    if (!status?.baseUrl) return
    await writeClipboardText(status.baseUrl)
    toast.success('Base URL copied')
  }, [status?.baseUrl])

  const copyCurl = useCallback(async () => {
    if (!status?.baseUrl || !draftRoute) return
    const path = draftRoute.path.replace(/:([a-zA-Z0-9_]+)/g, '1')
    const url = `${status.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    await writeClipboardText(`curl -X ${draftRoute.method} "${url}"`)
    toast.success('cURL copied')
  }, [status?.baseUrl, draftRoute])

  const activeResponse = useMemo(() => {
    if (!draftRoute) return null
    return pickActiveResponse(draftRoute) ?? draftRoute.responses[0] ?? null
  }, [draftRoute])

  function patchActiveResponse(patch: Partial<MockResponse>) {
    if (!draftRoute || !activeResponse) return
    setDraftRoute({
      ...draftRoute,
      responses: draftRoute.responses.map((r) => (r.id === activeResponse.id ? { ...r, ...patch } : r))
    })
  }

  function setActiveResponseId(id: string) {
    if (!draftRoute) return
    setDraftRoute({ ...draftRoute, activeResponseId: id })
  }

  function addResponse() {
    if (!draftRoute) return
    const resp = createDefaultMockResponse('Alternate')
    setDraftRoute({
      ...draftRoute,
      responses: [...draftRoute.responses, resp],
      activeResponseId: draftRoute.activeResponseId ?? resp.id
    })
  }

  async function addRoute() {
    if (!selectedServer) return
    const route = createDefaultMockRoute('GET', '/example')
    const ok = await upsertRoute(selectedServer.id, route)
    if (ok) selectRoute(route.id)
  }

  return (
    <ModulePage>
      <PageHeader
        title="Mock Servers"
        description="Run local HTTP mock APIs from your collections. Default bind: 127.0.0.1 (local only)."
        actions={
          <Button size="sm" onClick={() => void handleCreateServer()}>
            <Plus className="h-3.5 w-3.5" /> New server
          </Button>
        }
      />
      <PageContent className="flex min-h-0 flex-1 flex-row gap-0 p-0">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar/40">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Servers</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refresh()} title="Refresh">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {servers.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No mock servers yet. Create one or import from a collection.</p>
            ) : (
              servers.map((server) => {
                const st = statuses[server.id]
                const isRunning = st?.status === 'running'
                return (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => selectServer(server.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 border-b border-border/40 px-3 py-2 text-left text-xs hover:bg-accent/50',
                      selectedServerId === server.id && 'bg-accent'
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{server.name}</span>
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {server.host}:{server.port}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Circle className={cn('h-2 w-2 fill-current', isRunning ? 'text-emerald-500' : 'text-muted-foreground/50')} />
                      {st?.status ?? 'stopped'}
                    </span>
                  </button>
                )
              })
            )}
          </ScrollArea>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col border-r border-border">
          {!selectedServer ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Select or create a mock server
            </div>
          ) : (
            <>
              <div className="space-y-3 border-b border-border/60 p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <Input
                    className="max-w-xs"
                    value={serverDraft?.name ?? selectedServer.name}
                    onChange={(e) => setServerDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                    onBlur={() => serverDraft && void handleSaveServerMeta(serverDraft)}
                    aria-label="Mock server name"
                  />
                  <Input
                    className="w-28 font-mono text-xs"
                    value={serverDraft?.host ?? selectedServer.host}
                    onChange={(e) => setServerDraft((d) => (d ? { ...d, host: e.target.value } : d))}
                    onBlur={() => serverDraft && void handleSaveServerMeta(serverDraft)}
                    aria-label="Host"
                  />
                  <Input
                    className="w-20 font-mono text-xs"
                    type="number"
                    value={serverDraft?.port ?? selectedServer.port}
                    onChange={(e) =>
                      setServerDraft((d) => (d ? { ...d, port: Number(e.target.value) } : d))
                    }
                    onBlur={() => serverDraft && void handleSaveServerMeta(serverDraft)}
                    aria-label="Port"
                  />
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {!running ? (
                      <Button size="sm" onClick={() => void handleToggleServer('start')}>
                        <Play className="h-3.5 w-3.5" /> Start
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => void handleToggleServer('restart')}>
                          <RefreshCw className="h-3.5 w-3.5" /> Restart
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void handleToggleServer('stop')}>
                          <Square className="h-3.5 w-3.5" /> Stop
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={() => void copyBaseUrl()} disabled={!status?.baseUrl}>
                      <Copy className="h-3.5 w-3.5" /> URL
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => void deleteServer(selectedServer.id).then((ok) => ok && toast.success('Deleted'))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{status?.baseUrl ?? `http://${selectedServer.host}:${selectedServer.port}`}</p>
                <div className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={selectedServer.cors.enabled}
                    onCheckedChange={(enabled) =>
                      void saveServer({
                        ...selectedServer,
                        cors: { ...selectedServer.cors, enabled },
                        updatedAt: new Date().toISOString()
                      })
                    }
                  />
                  <span>Enable CORS</span>
                </div>
              </div>

              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-medium">Routes</span>
                <Button size="sm" variant="outline" onClick={() => void addRoute()}>
                  <Plus className="h-3 w-3" /> Add route
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                {selectedServer.routes.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No routes. Add one or import from a collection.</p>
                ) : (
                  selectedServer.routes.map((route) => (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => selectRoute(route.id)}
                      className={cn(
                        'flex w-full items-center gap-2 border-b border-border/30 px-3 py-1.5 text-left text-xs hover:bg-accent/40',
                        selectedRouteId === route.id && 'bg-accent/60'
                      )}
                    >
                      <span className={cn('w-12 shrink-0 font-mono font-semibold', METHOD_COLORS[route.method])}>{route.method}</span>
                      <span className="min-w-0 flex-1 truncate font-mono">{route.path}</span>
                      {!route.enabled && <Badge variant="secondary">off</Badge>}
                    </button>
                  ))
                )}
              </ScrollArea>
            </>
          )}
        </section>

        <section className="flex w-[min(420px,40%)] min-w-[280px] flex-col">
          {!draftRoute || !selectedServer ? (
            <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">Select a route to edit responses</div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={draftRoute.method}
                    onChange={(e) => setDraftRoute({ ...draftRoute, method: e.target.value as MockRoute['method'] })}
                    aria-label="HTTP method"
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="min-w-[140px] flex-1 font-mono text-xs"
                    value={draftRoute.path}
                    onChange={(e) => setDraftRoute({ ...draftRoute, path: e.target.value })}
                    aria-label="Route path"
                    placeholder="/users/:id"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" onClick={() => void handleSaveRoute()}>
                    Save route
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleTestRoute()} disabled={testing || !running}>
                    {testing ? 'Testing…' : 'Test'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void copyCurl()}>
                    Copy cURL
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void deleteRoute(selectedServer.id, draftRoute.id)}
                  >
                    Delete
                  </Button>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">Active response</label>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={draftRoute.activeResponseId ?? draftRoute.responses[0]?.id}
                    onChange={(e) => setActiveResponseId(e.target.value)}
                  >
                    {draftRoute.responses.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.status})
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="link" className="mt-1 h-auto px-0 text-xs" onClick={addResponse}>
                    Add response
                  </Button>
                </div>

                {activeResponse && (
                  <>
                    <Input
                      value={activeResponse.name}
                      onChange={(e) => patchActiveResponse({ name: e.target.value })}
                      aria-label="Response name"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        className="w-24"
                        value={activeResponse.status}
                        onChange={(e) => patchActiveResponse({ status: Number(e.target.value) })}
                        aria-label="Status code"
                      />
                      <select
                        className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                        onChange={(e) => patchActiveResponse({ status: Number(e.target.value) })}
                        aria-label="Status preset"
                      >
                        <option value="">Presets…</option>
                        {MOCK_STATUS_PRESETS.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.code} {p.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        className="w-24"
                        value={activeResponse.delay}
                        onChange={(e) => patchActiveResponse({ delay: Number(e.target.value) })}
                        aria-label="Delay ms"
                      />
                    </div>
                    <select
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      value={activeResponse.bodyType}
                      onChange={(e) => patchActiveResponse({ bodyType: e.target.value as MockBodyType })}
                    >
                      {BODY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <div className="h-48 min-h-[120px] overflow-hidden rounded-lg border border-border">
                      <RequestCodeEditor
                        value={activeResponse.body}
                        onChange={(body) => patchActiveResponse({ body })}
                        languageFile={activeResponse.bodyType === 'json' ? 'body.json' : 'body.txt'}
                        minHeight="180px"
                        label="Response body"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Templates: {'{{params.id}}'}, {'{{query.page}}'}, {'{{headers.authorization}}'}, {'{{body.name}}'}, {'{{method}}'}, {'{{path}}'}
                    </p>
                  </>
                )}

                {testResult && (
                  <div className="rounded-lg border border-border p-2">
                    <div className="mb-2 flex items-center gap-2 text-xs">
                      <Badge variant={testResult.ok ? 'success' : 'destructive'}>{testResult.status}</Badge>
                      <span>{testResult.timeMs} ms</span>
                    </div>
                    <div className="max-h-40 overflow-auto">
                      <ResponseBodyView response={testResult} />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {selectedServer && (
            <div className="border-t border-border">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-medium">Request log</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void clearLogs(selectedServer.id)}>
                  Clear
                </Button>
              </div>
              <ScrollArea className="h-36">
                {logs.length === 0 ? (
                  <p className="px-3 pb-2 text-[10px] text-muted-foreground">No requests yet</p>
                ) : (
                  logs.map((entry) => (
                    <div key={entry.id} className="flex gap-2 border-b border-border/30 px-3 py-1 font-mono text-[10px]">
                      <span className="text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      <span className="w-10">{entry.method}</span>
                      <span className="min-w-0 flex-1 truncate">{entry.path}</span>
                      <span>{entry.status}</span>
                      <span className="text-muted-foreground">{entry.durationMs}ms</span>
                    </div>
                  ))
                )}
              </ScrollArea>
            </div>
          )}
        </section>
      </PageContent>
    </ModulePage>
  )
}
