import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Circle,
  CopyPlus,
  Copy,
  Play,
  Plus,
  RefreshCw,
  Server,
  Square,
  Trash2,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  MockBodyType,
  MockResponse,
  MockResponseMode,
  MockRoute
} from '@shared/types/mock-server'
import { MOCK_STATUS_PRESETS } from '@shared/types/mock-server'
import {
  createDefaultMockRoute,
  createDefaultMockResponse,
  pickActiveResponse
} from '@shared/lib/mock-server/defaults'
import { uniqueMockResponseName } from '@shared/lib/mock-server/from-request'
import { validateMockRoute } from '@shared/lib/mock-server/validation'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Badge } from '@/shared/components/ui/badge'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { writeClipboardText } from '@/shared/lib/clipboard'
import { RequestCodeEditor } from '@/modules/api-studio/components/RequestCodeEditor'
import { ResponseBodyView } from '@/modules/api-studio/components/response/ResponseBodyView'
import type { ApiExecutionResult } from '@shared/types/api-studio'
import { useMockServerStore } from '../stores/mockServerStore'
import { HTTP_METHODS, METHOD_COLORS } from '@/modules/api-studio/types/api.types'
import { cn } from '@/shared/lib/utils'

const BODY_TYPES: MockBodyType[] = ['json', 'text', 'xml', 'html']

const RESPONSE_MODES: { id: MockResponseMode; label: string; hint: string }[] = [
  { id: 'active', label: 'Active response', hint: 'Always serve the response marked active.' },
  {
    id: 'sequential',
    label: 'Sequential',
    hint: 'Rotate through enabled responses on each request.'
  },
  { id: 'random', label: 'Random', hint: 'Serve a random enabled response each time.' }
]

type HeaderRow = { id: string; key: string; value: string }

function toHeaderRows(headers: Record<string, string>): HeaderRow[] {
  return Object.entries(headers).map(([key, value], i) => ({ id: `${i}-${key}`, key, value }))
}

function fromHeaderRows(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) if (row.key.trim()) out[row.key.trim()] = row.value
  return out
}

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

  const [serverDraft, setServerDraft] = useState<{
    name: string
    host: string
    port: number
  } | null>(null)
  const [draftRoute, setDraftRoute] = useState<MockRoute | null>(null)
  const [testResult, setTestResult] = useState<ApiExecutionResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null)
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([])

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

  // Keep the edited response valid when the route changes (deleted response, new route, …).
  useEffect(() => {
    if (!draftRoute) {
      setEditingResponseId(null)
      return
    }
    if (!draftRoute.responses.some((r) => r.id === editingResponseId)) {
      setEditingResponseId(
        pickActiveResponse(draftRoute)?.id ?? draftRoute.responses[0]?.id ?? null
      )
    }
  }, [draftRoute, editingResponseId])

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

  async function handleSaveServerMeta(partial: {
    name?: string
    description?: string
    host?: string
    port?: number
  }) {
    if (!selectedServer) return
    if (running && (partial.host !== undefined || partial.port !== undefined)) {
      toast.error('Stop the server before changing host or port')
      return
    }
    const ok = await saveServer({
      ...selectedServer,
      ...partial,
      updatedAt: new Date().toISOString()
    })
    if (ok) toast.success('Saved')
    else toast.error('Save failed')
  }

  async function handleSaveRoute() {
    if (!selectedServer || !draftRoute) return
    const err = validateMockRoute(
      draftRoute,
      selectedServer.routes.filter((r) => r.id !== draftRoute.id)
    )
    if (err) {
      toast.error(err)
      return
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
    toast.success(
      action === 'start'
        ? 'Mock server running'
        : action === 'stop'
          ? 'Mock server stopped'
          : 'Mock server restarted'
    )
  }

  async function handleTestRoute() {
    if (!selectedServerId || !draftRoute) return
    setTesting(true)
    if (JSON.stringify(draftRoute) !== JSON.stringify(selectedRoute)) {
      toast.info('Testing the saved route — save to test your latest edits')
    }
    const res = await window.electronAPI.mockServer.testRoute({
      serverId: selectedServerId,
      routeId: draftRoute.id,
      // Test the response being edited, not whatever the route mode would pick.
      headers: editingResponse ? { 'X-Mock-Response': editingResponse.id } : undefined
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

  const editingResponse = useMemo(() => {
    if (!draftRoute) return null
    return draftRoute.responses.find((r) => r.id === editingResponseId) ?? null
  }, [draftRoute, editingResponseId])
  const activeResponseId = draftRoute ? pickActiveResponse(draftRoute)?.id : undefined

  // Header rows are edited locally so blank/duplicate keys survive while typing.
  useEffect(() => {
    setHeaderRows(toHeaderRows(editingResponse?.headers ?? {}))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingResponse?.id])

  function patchResponse(id: string, patch: Partial<MockResponse>) {
    if (!draftRoute) return
    setDraftRoute({
      ...draftRoute,
      responses: draftRoute.responses.map((r) => (r.id === id ? { ...r, ...patch } : r))
    })
  }

  function patchEditingResponse(patch: Partial<MockResponse>) {
    if (editingResponse) patchResponse(editingResponse.id, patch)
  }

  function updateHeaderRows(rows: HeaderRow[]) {
    setHeaderRows(rows)
    patchEditingResponse({ headers: fromHeaderRows(rows) })
  }

  function setActiveResponseId(id: string) {
    if (!draftRoute) return
    setDraftRoute({ ...draftRoute, activeResponseId: id })
  }

  function addResponse(template?: MockResponse) {
    if (!draftRoute) return
    const base = template
      ? { ...structuredClone(template), id: crypto.randomUUID() }
      : createDefaultMockResponse()
    const resp: MockResponse = {
      ...base,
      name: uniqueMockResponseName(draftRoute, template ? `${template.name} copy` : 'Alternate')
    }
    setDraftRoute({
      ...draftRoute,
      responses: [...draftRoute.responses, resp],
      activeResponseId: draftRoute.activeResponseId ?? resp.id
    })
    setEditingResponseId(resp.id)
  }

  function removeResponse(id: string) {
    if (!draftRoute) return
    if (draftRoute.responses.length <= 1) {
      toast.error('A route needs at least one response')
      return
    }
    const responses = draftRoute.responses.filter((r) => r.id !== id)
    setDraftRoute({
      ...draftRoute,
      responses,
      activeResponseId:
        draftRoute.activeResponseId === id ? responses[0]?.id : draftRoute.activeResponseId
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
      <PageContent fullBleed className="min-h-0 flex-1 flex-row gap-0 overflow-hidden p-0">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar/40">
          <div className="flex h-10 items-center justify-between border-b border-border/60 pl-3 pr-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Servers
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void refresh()}
              title="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {servers.length === 0 ? (
              <p className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
                No servers yet.
              </p>
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
                      <Circle
                        className={cn(
                          'h-2 w-2 fill-current',
                          isRunning ? 'text-emerald-500' : 'text-muted-foreground/50'
                        )}
                      />
                      {st?.status ?? 'stopped'}
                    </span>
                  </button>
                )
              })
            )}
          </ScrollArea>
        </aside>

        <section
          className={cn('flex min-w-0 flex-1 flex-col', selectedServer && 'border-r border-border')}
        >
          {!selectedServer ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<Server className="h-5 w-5" />}
                title={
                  servers.length === 0 ? 'Create your first mock server' : 'Select a mock server'
                }
                description={
                  servers.length === 0
                    ? 'Serve fake HTTP responses on localhost so you can build and test against an API before it exists. You can also import routes from a saved collection.'
                    : 'Pick a server from the list to edit its routes and responses.'
                }
                action={
                  servers.length === 0 ? (
                    <Button onClick={() => void handleCreateServer()}>
                      <Plus className="h-4 w-4" /> New server
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="space-y-3 border-b border-border/60 p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <Input
                    className="max-w-xs"
                    value={serverDraft?.name ?? selectedServer.name}
                    onChange={(e) =>
                      setServerDraft((d) => (d ? { ...d, name: e.target.value } : d))
                    }
                    onBlur={() => serverDraft && void handleSaveServerMeta(serverDraft)}
                    aria-label="Mock server name"
                  />
                  <Input
                    className="w-28 font-mono text-xs"
                    value={serverDraft?.host ?? selectedServer.host}
                    onChange={(e) =>
                      setServerDraft((d) => (d ? { ...d, host: e.target.value } : d))
                    }
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleToggleServer('restart')}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Restart
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleToggleServer('stop')}
                        >
                          <Square className="h-3.5 w-3.5" /> Stop
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copyBaseUrl()}
                      disabled={!status?.baseUrl}
                    >
                      <Copy className="h-3.5 w-3.5" /> URL
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        void deleteServer(selectedServer.id).then(
                          (ok) => ok && toast.success('Deleted')
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {status?.baseUrl ?? `http://${selectedServer.host}:${selectedServer.port}`}
                </p>
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
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    No routes. Add one or import from a collection.
                  </p>
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
                      <span
                        className={cn(
                          'w-12 shrink-0 font-mono font-semibold',
                          METHOD_COLORS[route.method]
                        )}
                      >
                        {route.method}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono">{route.path}</span>
                      {!route.enabled && <Badge variant="secondary">off</Badge>}
                    </button>
                  ))
                )}
              </ScrollArea>
            </>
          )}
        </section>

        {selectedServer && (
          <section className="flex w-[min(420px,40%)] min-w-[280px] flex-col">
            {!draftRoute ? (
              <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
                Select a route to edit responses
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={draftRoute.method}
                      onChange={(e) =>
                        setDraftRoute({
                          ...draftRoute,
                          method: e.target.value as MockRoute['method']
                        })
                      }
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleTestRoute()}
                      disabled={testing || !running}
                    >
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

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium" htmlFor="mock-response-mode">
                        Responses
                      </label>
                      <select
                        id="mock-response-mode"
                        className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
                        value={draftRoute.responseMode ?? 'active'}
                        onChange={(e) =>
                          setDraftRoute({
                            ...draftRoute,
                            responseMode: e.target.value as MockResponseMode
                          })
                        }
                        title={
                          RESPONSE_MODES.find((m) => m.id === (draftRoute.responseMode ?? 'active'))
                            ?.hint
                        }
                        aria-label="Response selection mode"
                      >
                        {RESPONSE_MODES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="divide-y divide-border/40 rounded-md border border-border">
                      {draftRoute.responses.map((r) => (
                        <div
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setEditingResponseId(r.id)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingResponseId(r.id)}
                          className={cn(
                            'group flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent/40',
                            editingResponseId === r.id && 'bg-accent/60',
                            !r.enabled && 'opacity-60'
                          )}
                        >
                          {(draftRoute.responseMode ?? 'active') === 'active' && (
                            <input
                              type="radio"
                              name="active-response"
                              className="h-3 w-3 accent-primary"
                              checked={activeResponseId === r.id}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => setActiveResponseId(r.id)}
                              title="Serve this response"
                              aria-label={`Make ${r.name} the active response`}
                            />
                          )}
                          <Badge
                            variant={
                              r.status < 300
                                ? 'success'
                                : r.status < 400
                                  ? 'warning'
                                  : 'destructive'
                            }
                            className="h-4 px-1 font-mono text-[10px]"
                          >
                            {r.status}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          {r.delay > 0 && (
                            <span className="text-[10px] text-muted-foreground">{r.delay}ms</span>
                          )}
                          <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                            <Switch
                              checked={r.enabled}
                              onCheckedChange={(enabled) => patchResponse(r.id, { enabled })}
                              aria-label={`Enable ${r.name}`}
                            />
                          </span>
                          <button
                            type="button"
                            className="hidden rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:block"
                            onClick={(e) => {
                              e.stopPropagation()
                              addResponse(r)
                            }}
                            title="Duplicate"
                            aria-label={`Duplicate ${r.name}`}
                          >
                            <CopyPlus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeResponse(r.id)
                            }}
                            title="Delete"
                            aria-label={`Delete ${r.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="link"
                      className="h-auto px-0 text-xs"
                      onClick={() => addResponse()}
                    >
                      <Plus className="h-3 w-3" /> Add response
                    </Button>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      Pick one per request with the{' '}
                      <code className="font-mono">X-Mock-Response</code> header or{' '}
                      <code className="font-mono">?__response=</code> — by name, id, or status code
                      (e.g. <code className="font-mono">X-Mock-Response: 404</code>).
                    </p>
                  </div>

                  {editingResponse && (
                    <div className="space-y-2 rounded-lg border border-border/70 p-2.5">
                      <Input
                        value={editingResponse.name}
                        onChange={(e) => patchEditingResponse({ name: e.target.value })}
                        aria-label="Response name"
                        className="h-8 text-xs"
                      />
                      <div className="grid grid-cols-[5rem_1fr_5.5rem] gap-2">
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={editingResponse.status}
                          onChange={(e) => patchEditingResponse({ status: Number(e.target.value) })}
                          aria-label="Status code"
                        />
                        <select
                          className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs"
                          value=""
                          onChange={(e) =>
                            e.target.value &&
                            patchEditingResponse({ status: Number(e.target.value) })
                          }
                          aria-label="Status preset"
                        >
                          <option value="">Presets…</option>
                          {MOCK_STATUS_PRESETS.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.code} {p.label}
                            </option>
                          ))}
                        </select>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 pr-7 text-xs"
                            value={editingResponse.delay}
                            onChange={(e) =>
                              patchEditingResponse({ delay: Math.max(0, Number(e.target.value)) })
                            }
                            aria-label="Delay in milliseconds"
                            title="Delay before responding"
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                            ms
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium">Headers</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() =>
                              updateHeaderRows([
                                ...headerRows,
                                { id: crypto.randomUUID(), key: '', value: '' }
                              ])
                            }
                          >
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>
                        {headerRows.length === 0 && (
                          <p className="text-[10px] text-muted-foreground">No custom headers.</p>
                        )}
                        {headerRows.map((row, i) => (
                          <div key={row.id} className="flex gap-1">
                            <Input
                              className="h-7 flex-1 font-mono text-[11px]"
                              value={row.key}
                              placeholder="Header"
                              aria-label={`Header name ${i + 1}`}
                              onChange={(e) =>
                                updateHeaderRows(
                                  headerRows.map((r) =>
                                    r.id === row.id ? { ...r, key: e.target.value } : r
                                  )
                                )
                              }
                            />
                            <Input
                              className="h-7 flex-[1.4] font-mono text-[11px]"
                              value={row.value}
                              placeholder="Value"
                              aria-label={`Header value ${i + 1}`}
                              onChange={(e) =>
                                updateHeaderRows(
                                  headerRows.map((r) =>
                                    r.id === row.id ? { ...r, value: e.target.value } : r
                                  )
                                )
                              }
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              onClick={() =>
                                updateHeaderRows(headerRows.filter((r) => r.id !== row.id))
                              }
                              aria-label={`Remove header ${row.key || i + 1}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <select
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={editingResponse.bodyType}
                        onChange={(e) =>
                          patchEditingResponse({ bodyType: e.target.value as MockBodyType })
                        }
                        aria-label="Body type"
                      >
                        {(editingResponse.bodyType === 'binary'
                          ? [...BODY_TYPES, 'binary' as const]
                          : BODY_TYPES
                        ).map((t) => (
                          <option key={t} value={t}>
                            {t === 'binary' ? 'binary (base64)' : t}
                          </option>
                        ))}
                      </select>
                      <div className="flex h-60 min-h-[160px] flex-col">
                        <RequestCodeEditor
                          key={editingResponse.id}
                          value={editingResponse.body}
                          onChange={(body) => patchEditingResponse({ body })}
                          languageFile={
                            editingResponse.bodyType === 'json' ? 'body.json' : 'body.txt'
                          }
                          minHeight="180px"
                          label="Response body"
                          showFormat={editingResponse.bodyType === 'json'}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Templates: {'{{params.id}}'}, {'{{query.page}}'},{' '}
                        {'{{headers.authorization}}'}, {'{{body.name}}'}, {'{{method}}'},{' '}
                        {'{{path}}'}
                      </p>
                    </div>
                  )}

                  {testResult && (
                    <div className="rounded-lg border border-border p-2">
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <Badge variant={testResult.ok ? 'success' : 'destructive'}>
                          {testResult.status}
                        </Badge>
                        <span>{testResult.timeMs} ms</span>
                      </div>
                      <div className="flex h-64 flex-col overflow-hidden">
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => void clearLogs(selectedServer.id)}
                  >
                    Clear
                  </Button>
                </div>
                <ScrollArea className="h-36">
                  {logs.length === 0 ? (
                    <p className="px-3 pb-2 text-[10px] text-muted-foreground">No requests yet</p>
                  ) : (
                    logs.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex gap-2 border-b border-border/30 px-3 py-1 font-mono text-[10px]"
                      >
                        <span className="text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="w-10">{entry.method}</span>
                        <span className="min-w-0 flex-1 truncate">{entry.path}</span>
                        {entry.responseName && (
                          <span
                            className="max-w-[90px] truncate text-muted-foreground"
                            title={entry.responseName}
                          >
                            {entry.responseName}
                          </span>
                        )}
                        <span>{entry.status}</span>
                        <span className="text-muted-foreground">{entry.durationMs}ms</span>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </div>
            )}
          </section>
        )}
      </PageContent>
    </ModulePage>
  )
}
