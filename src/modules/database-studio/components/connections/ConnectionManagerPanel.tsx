import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Switch } from '@/shared/components/ui/switch'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import {
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  XCircle
} from 'lucide-react'
import type {
  CreateDbConnectionInput,
  DbConnection,
  DbConnectionConfig,
  DbConnectionTestResult,
  DbProviderId,
  DbProviderKind
} from '@shared/types/database-workspace'
import {
  DB_PROVIDER_KIND_LABELS,
  DB_PROVIDER_META,
  applyProviderDefaults,
  emptyConnectionForm,
  getProviderMeta,
  normalizeConnectionInput,
  validateConnectionInput
} from '@shared/types/database-workspace'
import type { AppScope } from '@shared/types/scope'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'
import { PROVIDER_BADGE, describeConnectionTarget } from '../../lib/providers'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'

interface ConnectionManagerPanelProps {
  /** Override scope; defaults to store scope */
  scope?: AppScope
  projectId?: string | null
  className?: string
}

type FormSection = 'connection' | 'security' | 'advanced'

const KIND_ORDER: DbProviderKind[] = ['relational', 'document', 'embedded']

function connectionListFilter(scopeTab: 'GLOBAL' | 'PROJECT', projectId: string | null) {
  return scopeTab === 'PROJECT' && projectId
    ? { scope: 'PROJECT' as AppScope, projectId }
    : { scope: 'GLOBAL' as AppScope, projectId: null }
}

export function ProviderBadge({ provider, className }: { provider: DbProviderId; className?: string }) {
  const badge = PROVIDER_BADGE[provider]
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-tight',
        badge.className,
        className
      )}
    >
      {badge.mono}
    </span>
  )
}

function Field({
  label,
  hint,
  children,
  className
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2',
        disabled ? 'opacity-50' : 'cursor-pointer hover:bg-muted/30'
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {description && <span className="block text-[11px] text-muted-foreground">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
    </label>
  )
}

function SecretInput({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className="pr-9"
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted"
        onClick={() => setVisible((v) => !v)}
        title={visible ? 'Hide' : 'Show'}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          )}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const msToSeconds = (ms?: number) => (ms != null ? String(Math.round(ms / 1000)) : '')
const secondsToMs = (raw: string) => (raw === '' ? undefined : Math.max(0, Number(raw)) * 1000)

export function ConnectionManagerPanel({ scope: scopeProp, projectId: projectIdProp, className }: ConnectionManagerPanelProps) {
  const storeScope = useDbWorkspaceStore((s) => s.scope)
  const storeProjectId = useDbWorkspaceStore((s) => s.projectId)
  const settings = useDbWorkspaceStore((s) => s.settings)
  const loadConnections = useDbWorkspaceStore((s) => s.loadConnections)
  const connect = useDbWorkspaceStore((s) => s.connect)
  const activeConnectionId = useDbWorkspaceStore((s) => s.activeConnectionId)
  const setConnectionManagerOpen = useDbWorkspaceStore((s) => s.setConnectionManagerOpen)

  const scope = scopeProp ?? storeScope
  const projectId = projectIdProp !== undefined ? projectIdProp : storeProjectId

  const [form, setForm] = useState<CreateDbConnectionInput>(() => emptyConnectionForm(scope, projectId, settings))
  const [listedConnections, setListedConnections] = useState<DbConnection[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<DbConnectionTestResult | null>(null)
  const [section, setSection] = useState<FormSection>('connection')
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<DbConnection | null>(null)
  const [connectionScopeTab, setConnectionScopeTab] = useState<'GLOBAL' | 'PROJECT'>(scope === 'PROJECT' ? 'PROJECT' : 'GLOBAL')
  const formDirtyRef = useRef(false)

  const meta = getProviderMeta(form.provider)
  const config = form.config
  const isEmbedded = meta.kind === 'embedded'
  const isDocument = meta.kind === 'document'
  const usingUri = Boolean(config.useConnectionString && meta.supportsConnectionString)

  const refreshListedConnections = useCallback(async () => {
    const res = await window.electronAPI.dbWorkspace.listConnections(connectionListFilter(connectionScopeTab, projectId))
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
    setForm(emptyConnectionForm(connectionScopeTab, connectionScopeTab === 'PROJECT' ? projectId : null, settings))
  }, [connectionScopeTab, projectId, settings])

  useEffect(() => {
    void refreshListedConnections()
  }, [refreshListedConnections])

  const updateForm = (updater: (prev: CreateDbConnectionInput) => CreateDbConnectionInput) => {
    formDirtyRef.current = true
    setTestResult(null)
    setForm(updater)
  }

  const setConfig = (patch: Partial<DbConnectionConfig>) =>
    updateForm((f) => ({ ...f, config: { ...f.config, ...patch } }))

  const setSecret = (key: keyof NonNullable<CreateDbConnectionInput['secrets']>, value: string) =>
    updateForm((f) => ({ ...f, secrets: { ...f.secrets, [key]: value } }))

  const changeProvider = (provider: DbProviderId) => {
    if (provider === form.provider) return
    updateForm((f) => ({
      ...f,
      provider,
      config: applyProviderDefaults(provider, f.config, f.provider)
    }))
    setSection('connection')
  }

  const resetForm = () => {
    formDirtyRef.current = false
    setEditingId(null)
    setTestResult(null)
    setSection('connection')
    setForm(emptyConnectionForm(connectionScopeTab, connectionScopeTab === 'PROJECT' ? projectId : null, settings))
  }

  const buildPayload = () =>
    normalizeConnectionInput(form, connectionScopeTab, connectionScopeTab === 'PROJECT' ? projectId : null)

  const saveConnection = async (): Promise<DbConnection | null> => {
    const payload = buildPayload()
    const validationError = validateConnectionInput(payload)
    if (validationError) {
      toast.error(validationError)
      return null
    }
    setSaving(true)
    try {
      if (editingId) {
        const res = await window.electronAPI.dbWorkspace.updateConnection(editingId, {
          name: payload.name,
          config: payload.config,
          notes: payload.notes,
          tags: payload.tags,
          secrets: payload.secrets
        })
        if (!res.success) {
          toast.error(res.error ?? 'Failed to update connection')
          return null
        }
        toast.success('Connection updated')
        return res.data ?? null
      }
      const res = await window.electronAPI.dbWorkspace.createConnection(payload)
      if (!res.success) {
        toast.error(res.error ?? 'Failed to create connection')
        return null
      }
      toast.success('Connection created')
      return res.data ?? null
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (andConnect: boolean) => {
    const saved = await saveConnection()
    if (!saved) return
    resetForm()
    await refreshListedConnections()
    if (andConnect) {
      await connect(saved.id)
      setConnectionManagerOpen(false)
    }
  }

  const editConnection = async (c: DbConnection) => {
    setEditingId(c.id)
    setConnectionScopeTab(c.scope)
    setTestResult(null)
    setSection('connection')
    formDirtyRef.current = true
    const secretsRes = await window.electronAPI.dbWorkspace.getConnectionSecrets(c.id)
    setForm({
      name: c.name,
      provider: c.provider,
      scope: c.scope,
      projectId: c.projectId,
      folderId: c.folderId,
      config: c.config,
      notes: c.notes,
      tags: c.tags,
      vaultItemId: c.vaultItemId,
      secrets: secretsRes.success ? (secretsRes.data ?? {}) : {}
    })
  }

  const handleTest = async () => {
    const payload = buildPayload()
    const validationError = validateConnectionInput({ ...payload, name: payload.name || 'test' })
    if (validationError) {
      toast.error(validationError)
      return
    }
    setTesting(true)
    setTestResult(null)
    const res = await window.electronAPI.dbWorkspace.testConnectionConfig({ ...payload, id: editingId ?? undefined })
    setTesting(false)
    if (res.success && res.data) {
      setTestResult(res.data)
    } else if (!res.success) {
      setTestResult({ success: false, latencyMs: 0, driverVersion: null, serverVersion: null, message: res.error ?? 'Connection test failed' })
    }
  }

  const pickSqliteFile = async () => {
    const res = await window.electronAPI.dbWorkspace.pickSqliteFile()
    if (res.success && res.data) {
      setConfig({ filePath: res.data })
      if (!form.name.trim()) {
        updateForm((f) => ({ ...f, name: res.data!.split(/[\\/]/).pop()?.replace(/\.(db|sqlite3?)$/i, '') ?? '' }))
      }
    } else if (!res.success) {
      toast.error(res.error ?? 'Failed to pick database file')
    }
  }

  const toggleFavorite = async (c: DbConnection) => {
    const res = await window.electronAPI.dbWorkspace.updateConnection(c.id, { isFavorite: !c.isFavorite })
    if (res.success) void refreshListedConnections()
    else toast.error(res.error ?? 'Failed to update connection')
  }

  const confirmDelete = async () => {
    const c = pendingDelete
    setPendingDelete(null)
    if (!c) return
    const res = await window.electronAPI.dbWorkspace.deleteConnection(c.id)
    if (res.success) {
      if (editingId === c.id) resetForm()
      if (activeConnectionId === c.id) useDbWorkspaceStore.getState().setActiveConnection(null)
      toast.success(`Deleted "${c.name}"`)
      void refreshListedConnections()
    } else {
      toast.error(res.error ?? 'Failed to delete connection')
    }
  }

  const handleExportConnections = async () => {
    if (listedConnections.length === 0) {
      toast.error('No connections to export')
      return
    }
    const includeSecrets = window.confirm('Include encrypted credentials in the export file?')
    const ids = listedConnections.map((c) => c.id)
    const res = await window.electronAPI.dbWorkspace.exportConnections(ids, includeSecrets)
    if (!res.success || !res.data) {
      toast.error(res.error ?? 'Failed to export connections')
      return
    }
    const blob = new Blob([res.data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `db-connections-${connectionScopeTab.toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${ids.length} connection${ids.length === 1 ? '' : 's'}`)
  }

  const handleImportConnections = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const payload = await file.text()
        const res = await window.electronAPI.dbWorkspace.importConnections(
          payload,
          connectionScopeTab,
          connectionScopeTab === 'PROJECT' ? projectId : null
        )
        if (!res.success) {
          toast.error(res.error ?? 'Failed to import connections')
          return
        }
        toast.success(`Imported ${res.data?.length ?? 0} connection${(res.data?.length ?? 0) === 1 ? '' : 's'}`)
        void refreshListedConnections()
      } catch {
        toast.error('Could not read import file')
      }
    }
    input.click()
  }

  const filteredConnections = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? listedConnections.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.provider.includes(q) ||
            describeConnectionTarget(c).toLowerCase().includes(q) ||
            c.tags.some((t) => t.toLowerCase().includes(q))
        )
      : listedConnections
    return [...list].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name))
  }, [listedConnections, search])

  const showScopeTabs = scopeProp === undefined
  const sshEnabled = Boolean(config.sshTunnel?.enabled)
  const sshAuth = config.sshTunnel?.authMethod ?? 'password'

  return (
    <div className={cn('grid min-h-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]', className)}>
      {/* ── Saved connections ── */}
      <aside className="flex min-h-0 flex-col gap-2">
        {showScopeTabs && (
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {(['GLOBAL', 'PROJECT'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                disabled={tab === 'PROJECT' && !projectId}
                className={cn(
                  'flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  connectionScopeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  tab === 'PROJECT' && !projectId && 'cursor-not-allowed opacity-50'
                )}
                onClick={() => setConnectionScopeTab(tab)}
                title={tab === 'PROJECT' && !projectId ? 'Open a project to use project connections' : undefined}
              >
                {tab === 'GLOBAL' ? 'Global' : 'Project'}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search connections"
            className="h-8 pl-7 text-xs"
          />
        </div>

        <div className="flex gap-1">
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={resetForm}>
            <Plus className="mr-1 h-3 w-3" /> New
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void handleImportConnections()} title="Import">
            <Upload className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={listedConnections.length === 0}
            onClick={() => void handleExportConnections()}
            title="Export"
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>

        <div className="min-h-[160px] flex-1 space-y-1 overflow-y-auto rounded-xl border border-border/50 p-1.5 lg:max-h-[560px]">
          {filteredConnections.map((c) => {
            const isEditing = editingId === c.id
            const isActive = activeConnectionId === c.id
            return (
              <div
                key={c.id}
                className={cn(
                  'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                  isEditing ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'
                )}
              >
                <ProviderBadge provider={c.provider} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void editConnection(c)}>
                  <span className="flex items-center gap-1 truncate text-[13px] font-medium">
                    {c.name}
                    {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Active" />}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{describeConnectionTarget(c)}</span>
                </button>
                <div className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted"
                    onClick={() => void toggleFavorite(c)}
                    title={c.isFavorite ? 'Unfavorite' : 'Favorite'}
                  >
                    <Star className={cn('h-3.5 w-3.5', c.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted"
                    onClick={async () => {
                      await connect(c.id)
                      setConnectionManagerOpen(false)
                    }}
                    title="Connect"
                  >
                    <Plug className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
          {filteredConnections.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              {listedConnections.length === 0 ? 'No saved connections yet' : 'No matches'}
            </p>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Credentials, keys and connection strings are encrypted on this device.
        </p>
      </aside>

      {/* ── Connection form ── */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ProviderBadge provider={form.provider} className="h-8 w-8 text-xs" />
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold">
                {editingId ? `Edit ${form.name || 'connection'}` : 'New connection'}
              </h4>
              <p className="truncate text-[11px] text-muted-foreground">
                {meta.label} · {DB_PROVIDER_KIND_LABELS[meta.kind]}
              </p>
            </div>
          </div>
          {editingId && (
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Duplicate"
                onClick={async () => {
                  const res = await window.electronAPI.dbWorkspace.duplicateConnection(editingId)
                  if (res.success) {
                    toast.success('Connection duplicated')
                    void refreshListedConnections()
                  } else toast.error(res.error ?? 'Failed to duplicate connection')
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                title="Delete"
                onClick={() => setPendingDelete(listedConnections.find((c) => c.id === editingId) ?? null)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Provider picker */}
        <div className="space-y-2">
          {KIND_ORDER.map((kind) => {
            const providers = Object.values(DB_PROVIDER_META).filter((p) => p.kind === kind)
            return (
              <div key={kind}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {DB_PROVIDER_KIND_LABELS[kind]}
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                  {providers.map((p) => {
                    const selected = form.provider === p.id
                    const locked = Boolean(editingId) && !selected
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!p.implemented || locked}
                        onClick={() => changeProvider(p.id)}
                        title={!p.implemented ? `${p.label} support is coming soon` : locked ? 'Provider cannot be changed after creation' : p.description}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                          selected ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-muted/40',
                          (!p.implemented || locked) && 'cursor-not-allowed opacity-45 hover:bg-transparent'
                        )}
                      >
                        <ProviderBadge provider={p.id} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">{p.label}</span>
                          {!p.implemented && <span className="block text-[10px] text-muted-foreground">Soon</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <Field label="Connection name">
          <Input
            value={form.name}
            onChange={(e) => updateForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={`My ${meta.label} database`}
          />
        </Field>

        {/* Section tabs */}
        <div className="flex gap-4 border-b border-border">
          {(
            [
              { id: 'connection', label: 'Connection' },
              ...(isEmbedded ? [] : [{ id: 'security', label: 'SSL & SSH' }]),
              { id: 'advanced', label: 'Advanced' }
            ] as Array<{ id: FormSection; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                '-mb-px border-b-2 px-0.5 pb-1.5 text-xs font-medium transition-colors',
                section === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setSection(t.id)}
            >
              {t.label}
              {t.id === 'security' && (config.ssl?.enabled || sshEnabled) && (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
              )}
            </button>
          ))}
        </div>

        {section === 'connection' && (
          <div className="space-y-3">
            {isEmbedded ? (
              <Field label="Database file" hint="The file is created if it does not exist.">
                <div className="flex gap-2">
                  <Input
                    value={config.filePath ?? ''}
                    onChange={(e) => setConfig({ filePath: e.target.value })}
                    placeholder="/path/to/database.db"
                  />
                  <Button type="button" variant="outline" onClick={() => void pickSqliteFile()}>
                    <FolderOpen className="mr-1 h-4 w-4" /> Browse
                  </Button>
                </div>
              </Field>
            ) : (
              <>
                {meta.supportsConnectionString && (
                  <Segmented
                    value={usingUri ? 'uri' : 'fields'}
                    options={[
                      { value: 'fields', label: 'Host & port' },
                      { value: 'uri', label: 'Connection string' }
                    ]}
                    onChange={(v) => setConfig({ useConnectionString: v === 'uri' })}
                  />
                )}

                {usingUri ? (
                  <>
                    <Field
                      label="Connection string"
                      hint={
                        isDocument
                          ? 'Supports mongodb:// and mongodb+srv:// (Atlas). Credentials in the URI are stored encrypted.'
                          : 'Credentials in the URI are stored encrypted.'
                      }
                    >
                      <Textarea
                        rows={2}
                        value={form.secrets?.connectionString ?? ''}
                        onChange={(e) => setSecret('connectionString', e.target.value)}
                        placeholder={meta.connectionStringPlaceholder}
                        className="font-mono text-xs"
                        spellCheck={false}
                      />
                    </Field>
                    <Field label={isDocument ? 'Default database' : 'Database'} hint="Optional — overrides the database in the URI for browsing.">
                      <Input value={config.database ?? ''} onChange={(e) => setConfig({ database: e.target.value })} />
                    </Field>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                      <Field label="Host">
                        <Input value={config.host ?? ''} onChange={(e) => setConfig({ host: e.target.value })} placeholder="localhost" />
                      </Field>
                      <Field label="Port">
                        <Input
                          type="number"
                          value={config.port ?? ''}
                          placeholder={meta.defaultPort ? String(meta.defaultPort) : undefined}
                          onChange={(e) => setConfig({ port: e.target.value === '' ? undefined : Number(e.target.value) })}
                        />
                      </Field>
                    </div>
                    <div className={cn('grid gap-2', meta.supportsSchemas ? 'grid-cols-2' : 'grid-cols-1')}>
                      <Field label={isDocument ? 'Default database' : 'Database'}>
                        <Input
                          value={config.database ?? ''}
                          onChange={(e) => setConfig({ database: e.target.value })}
                          placeholder={meta.defaultDatabase ?? 'Leave empty to browse all'}
                        />
                      </Field>
                      {meta.supportsSchemas && (
                        <Field label="Schema">
                          <Input
                            value={config.schema ?? config.defaultSchema ?? ''}
                            onChange={(e) => setConfig({ schema: e.target.value, defaultSchema: e.target.value })}
                            placeholder={meta.defaultSchema}
                          />
                        </Field>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Username">
                        <Input
                          value={config.username ?? ''}
                          onChange={(e) => setConfig({ username: e.target.value })}
                          placeholder={isDocument ? 'Optional' : meta.defaultUsername}
                        />
                      </Field>
                      <Field label="Password">
                        <SecretInput
                          value={form.secrets?.password ?? ''}
                          onChange={(v) => setSecret('password', v)}
                          placeholder="••••••••"
                        />
                      </Field>
                    </div>
                    {isDocument && (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Auth database" hint="authSource — usually admin">
                          <Input value={config.authSource ?? ''} onChange={(e) => setConfig({ authSource: e.target.value })} placeholder="admin" />
                        </Field>
                        <Field label="Replica set">
                          <Input value={config.replicaSet ?? ''} onChange={(e) => setConfig({ replicaSet: e.target.value })} placeholder="Optional" />
                        </Field>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {section === 'security' && !isEmbedded && (
          <div className="space-y-3">
            <ToggleRow
              label="Use SSL / TLS"
              description="Encrypt traffic between the workbench and the server"
              checked={config.ssl?.enabled ?? false}
              onChange={(enabled) => setConfig({ ssl: { ...config.ssl, enabled } })}
            />
            {config.ssl?.enabled && (
              <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
                <ToggleRow
                  label="Verify server certificate"
                  description="Turn off only for self-signed certificates in trusted networks"
                  checked={config.ssl?.rejectUnauthorized ?? !['mysql', 'mariadb', 'mssql'].includes(form.provider)}
                  onChange={(rejectUnauthorized) => setConfig({ ssl: { enabled: true, ...config.ssl, rejectUnauthorized } })}
                />
                <Field label="CA certificate (PEM)" hint="Optional — paste the certificate authority used by the server">
                  <Textarea
                    rows={3}
                    value={config.ssl?.ca ?? ''}
                    onChange={(e) => setConfig({ ssl: { enabled: true, ...config.ssl, ca: e.target.value || undefined } })}
                    placeholder="-----BEGIN CERTIFICATE-----"
                    className="font-mono text-[11px]"
                    spellCheck={false}
                  />
                </Field>
              </div>
            )}

            {meta.supportsSsh && (
              <>
                <ToggleRow
                  label="Connect through SSH tunnel"
                  description={
                    usingUri
                      ? 'Not available with connection strings — switch to Host & port'
                      : 'Reach databases on private networks via a bastion host'
                  }
                  checked={sshEnabled && !usingUri}
                  disabled={usingUri}
                  onChange={(enabled) =>
                    setConfig({ sshTunnel: { port: 22, authMethod: 'password', ...config.sshTunnel, enabled } })
                  }
                />
                {sshEnabled && !usingUri && (
                  <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
                      <Field label="SSH host">
                        <Input
                          value={config.sshTunnel?.host ?? ''}
                          onChange={(e) => setConfig({ sshTunnel: { enabled: true, ...config.sshTunnel, host: e.target.value } })}
                          placeholder="bastion.example.com"
                        />
                      </Field>
                      <Field label="Port">
                        <Input
                          type="number"
                          value={config.sshTunnel?.port ?? 22}
                          onChange={(e) =>
                            setConfig({ sshTunnel: { enabled: true, ...config.sshTunnel, port: Number(e.target.value) || 22 } })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="SSH username">
                      <Input
                        value={config.sshTunnel?.username ?? ''}
                        onChange={(e) => setConfig({ sshTunnel: { enabled: true, ...config.sshTunnel, username: e.target.value } })}
                      />
                    </Field>
                    <Segmented
                      value={sshAuth}
                      options={[
                        { value: 'password', label: 'Password' },
                        { value: 'privateKey', label: 'Private key' }
                      ]}
                      onChange={(authMethod) => setConfig({ sshTunnel: { enabled: true, ...config.sshTunnel, authMethod } })}
                    />
                    {sshAuth === 'password' ? (
                      <Field label="SSH password">
                        <SecretInput value={form.secrets?.sshPassword ?? ''} onChange={(v) => setSecret('sshPassword', v)} />
                      </Field>
                    ) : (
                      <>
                        <Field label="Private key (OpenSSH / PEM)">
                          <Textarea
                            rows={4}
                            value={form.secrets?.sshPrivateKey ?? ''}
                            onChange={(e) => setSecret('sshPrivateKey', e.target.value)}
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                            className="font-mono text-[11px]"
                            spellCheck={false}
                          />
                        </Field>
                        <Field label="Key passphrase">
                          <SecretInput value={form.secrets?.sshPassphrase ?? ''} onChange={(v) => setSecret('sshPassphrase', v)} placeholder="Optional" />
                        </Field>
                      </>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      The database host and port are resolved from the SSH server (e.g. use <code>localhost</code> for a database on the bastion).
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {section === 'advanced' && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow
                label="Read-only"
                description={isDocument ? 'Block inserts, updates and deletes' : 'Block INSERT / UPDATE / DDL'}
                checked={config.readonly ?? false}
                onChange={(readonly) => setConfig({ readonly })}
              />
              <ToggleRow
                label="Auto reconnect"
                description="Reconnect automatically when the session drops"
                checked={config.autoReconnect ?? true}
                onChange={(autoReconnect) => setConfig({ autoReconnect })}
              />
            </div>
            {!isEmbedded && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Connect timeout (s)">
                  <Input
                    type="number"
                    min={1}
                    value={msToSeconds(config.connectionTimeoutMs)}
                    placeholder="10"
                    onChange={(e) => setConfig({ connectionTimeoutMs: secondsToMs(e.target.value) })}
                  />
                </Field>
                <Field label="Query timeout (s)">
                  <Input
                    type="number"
                    min={1}
                    value={msToSeconds(config.queryTimeoutMs)}
                    placeholder={String(Math.round(settings.queryTimeoutMs / 1000))}
                    onChange={(e) => setConfig({ queryTimeoutMs: secondsToMs(e.target.value) })}
                  />
                </Field>
                <Field label="Pool size">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={config.pool?.max ?? ''}
                    placeholder="5"
                    onChange={(e) =>
                      setConfig({ pool: { ...config.pool, max: e.target.value === '' ? undefined : Number(e.target.value) } })
                    }
                  />
                </Field>
                <Field label="Idle timeout (s)">
                  <Input
                    type="number"
                    min={1}
                    value={msToSeconds(config.pool?.idleTimeoutMs)}
                    placeholder="30"
                    onChange={(e) => setConfig({ pool: { ...config.pool, idleTimeoutMs: secondsToMs(e.target.value) } })}
                  />
                </Field>
              </div>
            )}
            {!isEmbedded && (
              <div className={cn('grid gap-2', isDocument ? 'grid-cols-2' : 'grid-cols-1')}>
                <Field label="Application name" hint="Shown in server activity / monitoring views">
                  <Input
                    value={config.applicationName ?? ''}
                    onChange={(e) => setConfig({ applicationName: e.target.value })}
                    placeholder="Tessarok Database Workbench"
                  />
                </Field>
                {isDocument && (
                  <Field label="Schema sample size" hint="Documents sampled to infer fields">
                    <Input
                      type="number"
                      min={10}
                      value={config.schemaSampleSize ?? ''}
                      placeholder="100"
                      onChange={(e) => setConfig({ schemaSampleSize: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                  </Field>
                )}
              </div>
            )}
            {isDocument && !usingUri && (
              <ToggleRow
                label="Direct connection"
                description="Connect to this host only, skipping replica-set discovery"
                checked={config.directConnection ?? !config.replicaSet}
                onChange={(directConnection) => setConfig({ directConnection })}
              />
            )}
            <Field label="Tags" hint="Comma separated, e.g. production, analytics">
              <Input
                value={(form.tags ?? []).join(', ')}
                onChange={(e) =>
                  updateForm((f) => ({
                    ...f,
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                  }))
                }
              />
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => updateForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
          </div>
        )}

        {testResult && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
              testResult.success
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                : 'border-destructive/30 bg-destructive/5 text-destructive'
            )}
          >
            {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0">
              <p className="font-medium">
                {testResult.message}
                {testResult.success && ` · ${testResult.latencyMs}ms`}
              </p>
              {testResult.serverVersion && (
                <p className="mt-0.5 truncate text-[11px] opacity-80" title={testResult.serverVersion}>
                  {testResult.serverVersion}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button variant="outline" disabled={testing} onClick={() => void handleTest()}>
            {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1 h-4 w-4" />}
            Test
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" type="button" onClick={resetForm}>
              {editingId ? 'Cancel' : 'Clear'}
            </Button>
            <Button variant="secondary" disabled={saving} onClick={() => void handleSave(false)}>
              {editingId ? <Pencil className="mr-1 h-3.5 w-3.5" /> : null}
              {editingId ? 'Save' : 'Create'}
            </Button>
            <Button disabled={saving} onClick={() => void handleSave(true)}>
              <Plug className="mr-1 h-3.5 w-3.5" />
              {editingId ? 'Save & connect' : 'Create & connect'}
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        description="The saved connection and its encrypted credentials will be removed. Your database is not affected."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
