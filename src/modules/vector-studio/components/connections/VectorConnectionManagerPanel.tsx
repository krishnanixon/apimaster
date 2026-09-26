import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Copy, Trash2, Plug, PlugZap } from 'lucide-react'
import type { CreateVectorConnectionInput, VectorConnection } from '@shared/types/vector-workspace'
import {
  VECTOR_PROVIDER_LABELS,
  IMPLEMENTED_VECTOR_PROVIDERS,
  emptyVectorConnectionForm,
  normalizeVectorConnectionInput,
  validateVectorConnectionInput,
  buildVectorBaseUrl
} from '@shared/types/vector-workspace'
import type { AppScope } from '@shared/types/scope'
import { useVectorWorkspaceStore } from '../../stores/vectorWorkspace.store'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'

interface VectorConnectionManagerPanelProps {
  scope?: AppScope
  projectId?: string | null
  className?: string
}

function connectionListFilter(scopeTab: 'GLOBAL' | 'PROJECT', projectId: string | null) {
  return scopeTab === 'PROJECT' && projectId
    ? { scope: 'PROJECT' as AppScope, projectId }
    : { scope: 'GLOBAL' as AppScope, projectId: null }
}

export function VectorConnectionManagerPanel({
  scope: scopeProp,
  projectId: projectIdProp,
  className
}: VectorConnectionManagerPanelProps) {
  const storeScope = useVectorWorkspaceStore((s) => s.scope)
  const storeProjectId = useVectorWorkspaceStore((s) => s.projectId)
  const loadConnections = useVectorWorkspaceStore((s) => s.loadConnections)
  const connect = useVectorWorkspaceStore((s) => s.connect)

  const scope = scopeProp ?? storeScope
  const projectId = projectIdProp !== undefined ? projectIdProp : storeProjectId

  const [form, setForm] = useState<CreateVectorConnectionInput>(() =>
    emptyVectorConnectionForm(scope, projectId)
  )
  const [listedConnections, setListedConnections] = useState<VectorConnection[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [connectionScopeTab, setConnectionScopeTab] = useState<'GLOBAL' | 'PROJECT'>(
    scope === 'PROJECT' ? 'PROJECT' : 'GLOBAL'
  )
  const formDirtyRef = useRef(false)

  const refreshListedConnections = useCallback(async () => {
    const res = await window.electronAPI.vectorWorkspace.listConnections(
      connectionListFilter(connectionScopeTab, projectId)
    )
    if (res.success && res.data) {
      setListedConnections(res.data)
    } else if (!res.success) {
      toast.error(res.error ?? 'Failed to load connections')
    }
    void loadConnections()
  }, [connectionScopeTab, projectId, loadConnections])

  useEffect(() => {
    if (formDirtyRef.current) return
    setEditingId(null)
    setForm(emptyVectorConnectionForm(connectionScopeTab, connectionScopeTab === 'PROJECT' ? projectId : null))
  }, [connectionScopeTab, projectId])

  useEffect(() => {
    void refreshListedConnections()
  }, [refreshListedConnections])

  const updateForm = (updater: (prev: CreateVectorConnectionInput) => CreateVectorConnectionInput) => {
    formDirtyRef.current = true
    setForm(updater)
  }

  const resetForm = () => {
    formDirtyRef.current = false
    setEditingId(null)
    setForm(emptyVectorConnectionForm(connectionScopeTab, connectionScopeTab === 'PROJECT' ? projectId : null))
  }

  const buildPayload = () =>
    normalizeVectorConnectionInput(
      form,
      connectionScopeTab,
      connectionScopeTab === 'PROJECT' ? projectId : null
    )

  const handleSave = async () => {
    const payload = buildPayload()
    const validationError = validateVectorConnectionInput(payload)
    if (validationError) {
      toast.error(validationError)
      return
    }

    if (editingId) {
      const res = await window.electronAPI.vectorWorkspace.updateConnection(editingId, {
        name: payload.name,
        config: payload.config,
        notes: payload.notes,
        tags: payload.tags,
        secrets: payload.secrets
      })
      if (res.success) {
        toast.success('Connection updated')
        resetForm()
        void refreshListedConnections()
      } else {
        toast.error(res.error ?? 'Failed to update connection')
      }
      return
    }

    const res = await window.electronAPI.vectorWorkspace.createConnection(payload)
    if (res.success) {
      toast.success('Connection created')
      resetForm()
      void refreshListedConnections()
    } else {
      toast.error(res.error ?? 'Failed to create connection')
    }
  }

  const editConnection = async (c: VectorConnection) => {
    setEditingId(c.id)
    setConnectionScopeTab(c.scope)
    formDirtyRef.current = false
    const secretsRes = await window.electronAPI.vectorWorkspace.getConnectionSecrets(c.id)
    setForm({
      name: c.name,
      provider: c.provider,
      scope: c.scope,
      projectId: c.projectId,
      config: c.config,
      notes: c.notes,
      tags: c.tags,
      secrets: { apiKey: secretsRes.success ? (secretsRes.data?.apiKey ?? '') : '' }
    })
  }

  const handleTest = async () => {
    const payload = buildPayload()
    const validationError = validateVectorConnectionInput(payload)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setTesting(true)
    const res = await window.electronAPI.vectorWorkspace.testConnectionConfig(payload)
    setTesting(false)
    if (res.success && res.data) {
      if (res.data.success) toast.success(res.data.message)
      else toast.error(res.data.message)
    } else {
      toast.error(res.error ?? 'Test failed')
    }
  }

  return (
    <div className={cn('grid gap-6 lg:grid-cols-2', className)}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['GLOBAL', 'PROJECT'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              disabled={tab === 'PROJECT' && !projectId}
              onClick={() => setConnectionScopeTab(tab)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                connectionScopeTab === tab
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'text-muted-foreground hover:bg-muted/40',
                tab === 'PROJECT' && !projectId && 'cursor-not-allowed opacity-40'
              )}
            >
              {tab === 'GLOBAL' ? 'Global' : 'Project'}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
          <Input
            value={form.name}
            onChange={(e) => updateForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Local LiteChroma"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Provider</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            value={form.provider}
            onChange={(e) =>
              updateForm((f) => ({
                ...f,
                provider: e.target.value as CreateVectorConnectionInput['provider']
              }))
            }
          >
            {IMPLEMENTED_VECTOR_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {VECTOR_PROVIDER_LABELS[id]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Host</label>
            <Input
              value={form.config.host}
              onChange={(e) =>
                updateForm((f) => ({ ...f, config: { ...f.config, host: e.target.value } }))
              }
              placeholder="127.0.0.1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Port</label>
            <Input
              type="number"
              value={form.config.port}
              onChange={(e) =>
                updateForm((f) => ({
                  ...f,
                  config: { ...f.config, port: Number(e.target.value) || 8000 }
                }))
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            API key (optional)
          </label>
          <Input
            type="password"
            value={form.secrets?.apiKey ?? ''}
            onChange={(e) =>
              updateForm((f) => ({ ...f, secrets: { ...f.secrets, apiKey: e.target.value } }))
            }
            placeholder="Leave empty if server has no key"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(form.config.ssl)}
            onChange={(e) =>
              updateForm((f) => ({ ...f, config: { ...f.config, ssl: e.target.checked } }))
            }
          />
          Use HTTPS
        </label>

        <p className="text-[11px] text-muted-foreground">
          Base URL: {buildVectorBaseUrl(form.config)}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleSave()}>{editingId ? 'Update' : 'Create'}</Button>
          <Button variant="outline" disabled={testing} onClick={() => void handleTest()}>
            {testing ? 'Testing…' : 'Test'}
          </Button>
          <Button variant="ghost" onClick={resetForm}>
            Clear
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Saved connections</h4>
        {listedConnections.length === 0 ? (
          <p className="text-caption text-muted-foreground">
            No connections yet. Create one pointing at a running LiteChroma server
            (default http://127.0.0.1:8000).
          </p>
        ) : (
          <ul className="space-y-2">
            {listedConnections.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-border/50 bg-muted/10 px-3 py-2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void editConnection(c)}
                >
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {buildVectorBaseUrl(c.config)} · {c.health}
                    {c.latencyMs != null ? ` · ${c.latencyMs}ms` : ''}
                  </p>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Connect"
                    onClick={() => void connect(c.id)}
                  >
                    <PlugZap className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Duplicate"
                    onClick={async () => {
                      const res = await window.electronAPI.vectorWorkspace.duplicateConnection(c.id)
                      if (res.success) {
                        toast.success('Duplicated')
                        void refreshListedConnections()
                      } else toast.error(res.error ?? 'Duplicate failed')
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    title="Delete"
                    onClick={async () => {
                      const res = await window.electronAPI.vectorWorkspace.deleteConnection(c.id)
                      if (res.success) {
                        toast.success('Deleted')
                        void refreshListedConnections()
                      } else toast.error(res.error ?? 'Delete failed')
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
          <Plug className="h-3 w-3" />
          Start LiteChroma with <code className="rounded bg-muted px-1">python server.py</code>
        </p>
      </div>
    </div>
  )
}
