import { useEffect, useMemo, useState } from 'react'
import {
  FileKey,
  AlertCircle,
  Lock,
  Plus,
  Search,
  Server,
  Shield,
  Upload,
  Wifi,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { StatCard } from '@/shared/components/ui/card'
import { cn } from '@/shared/lib/utils'
import { isLikelySshKeyFileName } from '@shared/lib/vps-connection'
import { ServerList } from './ServerList'
import { ServerCardSkeleton } from './PanelLoader'
import { AddServerDialog, type AuthTab, type SeededSshKey } from './AddServerDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { useVPSStore } from '../stores/vps.store'

interface VPSDashboardProps {
  onSelectServer: (serverId: string) => void
}

export function VPSDashboard({ onSelectServer }: VPSDashboardProps) {
  const {
    servers,
    metrics,
    connect,
    disconnect,
    reconnect,
    deleteServer,
    pickKeyFile,
    loadMetrics,
    isInitialLoading,
    pendingServerActions,
    error,
    clearError
  } = useVPSStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [initialAuth, setInitialAuth] = useState<AuthTab>('sshKey')
  const [seedKey, setSeedKey] = useState<SeededSshKey | null>(null)
  const [query, setQuery] = useState('')
  const [osFilter, setOsFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dragOver, setDragOver] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const connectedIds = servers
    .filter((s) => s.status === 'connected')
    .map((s) => s.id)
    .join(',')

  useEffect(() => {
    if (!connectedIds) return
    const ids = connectedIds.split(',')
    const poll = () => ids.forEach((id) => void loadMetrics(id))
    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [connectedIds, loadMetrics])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return servers
      .filter(
        (s) =>
          (osFilter === 'all' || (s.os ?? 'linux') === osFilter) &&
          (statusFilter === 'all' || s.status === statusFilter) &&
          [s.name, s.host, s.username, s.os ?? 'linux'].some((value) =>
            value.toLowerCase().includes(q)
          )
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [servers, query, osFilter, statusFilter])

  const connectedCount = servers.filter((s) => s.status === 'connected').length
  const errorCount = servers.filter((s) => s.status === 'error').length
  const deleteTarget = servers.find((s) => s.id === deleteId)

  const openDialog = (auth: AuthTab = 'sshKey') => {
    setInitialAuth(auth)
    setDialogOpen(true)
  }

  const ingestKeyFile = async (file: File) => {
    if (
      file.name.endsWith('.pub') ||
      (!isLikelySshKeyFileName(file.name) && file.size > 64 * 1024)
    ) {
      toast.error('Drop a PEM, OpenSSH, or PuTTY (.ppk) private key')
      return
    }
    const privateKey = await file.text()
    setSeedKey({ privateKey, fileName: file.name })
    setInitialAuth('sshKey')
    setDialogOpen(true)
  }

  const handleBrowseKey = async () => {
    try {
      const picked = await pickKeyFile()
      if (!picked) return
      setSeedKey({ privateKey: picked.privateKey, fileName: picked.fileName })
      setInitialAuth('sshKey')
      setDialogOpen(true)
    } catch {
      // store already toasted
    }
  }

  const handleConnect = async (id: string) => {
    try {
      await connect(id, true)
      onSelectServer(id)
    } catch {
      // toast handled in store
    }
  }

  const handleCreated = async (id: string) => {
    try {
      await connect(id, true)
      onSelectServer(id)
    } catch {
      // toast handled in store — server is still saved
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await deleteServer(deleteId)
      setDeleteId(null)
    } catch {
      // toast in store
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={clearError} className="rounded p-1 hover:bg-destructive/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isInitialLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <ServerCardSkeleton key={i} />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <EmptyHero
          dragOver={dragOver}
          onDragOver={() => setDragOver(true)}
          onDragLeave={() => setDragOver(false)}
          onDropFile={(file) => void ingestKeyFile(file)}
          onBrowseKey={() => void handleBrowseKey()}
          onAdd={(auth) => openDialog(auth)}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Servers" value={servers.length} icon={Server} />
            <StatCard label="Connected" value={connectedCount} icon={Wifi} />
            <StatCard label="Needs attention" value={errorCount} icon={AlertCircle} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Servers</h2>
              <p className="text-sm text-muted-foreground">
                {connectedCount} of {servers.length} connected
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8"
                  placeholder="Search servers"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                aria-label="Filter by operating system"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={osFilter}
                onChange={(e) => setOsFilter(e.target.value)}
              >
                <option value="all">All systems</option>
                <option value="linux">Linux</option>
                <option value="windows">Windows Server</option>
              </select>
              <select
                aria-label="Filter by status"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="connected">Connected</option>
                <option value="disconnected">Disconnected</option>
                <option value="reconnecting">Reconnecting</option>
                <option value="error">Needs attention</option>
              </select>
              <Button onClick={() => openDialog('sshKey')} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Server
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No servers match your search and filters.
            </p>
          ) : (
            <ServerList
              servers={filtered}
              pendingActions={pendingServerActions}
              metrics={metrics}
              onConnect={handleConnect}
              onDisconnect={disconnect}
              onReconnect={reconnect}
              onSelect={onSelectServer}
              onDelete={setDeleteId}
            />
          )}
        </>
      )}

      <AddServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
        initialAuth={initialAuth}
        seedKey={seedKey}
        onSeedConsumed={() => setSeedKey(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && !deleting && setDeleteId(null)}
        title="Remove server"
        description={
          deleteTarget
            ? `Remove “${deleteTarget.name}”? Encrypted credentials are deleted from this machine.`
            : undefined
        }
        confirmLabel="Remove"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function EmptyHero({
  dragOver,
  onDragOver,
  onDragLeave,
  onDropFile,
  onBrowseKey,
  onAdd
}: {
  dragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDropFile: (file: File) => void
  onBrowseKey: () => void
  onAdd: (auth: AuthTab) => void
}) {
  return (
    <div className="space-y-6">
      <div
        className={cn(
          'rounded-2xl border border-dashed px-6 py-12 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          onDragOver()
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault()
          onDragLeave()
          const file = e.dataTransfer.files[0]
          if (file) onDropFile(file)
        }}
      >
        <div
          className={cn(
            'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border',
            dragOver
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border bg-background text-muted-foreground'
          )}
        >
          {dragOver ? <Upload className="h-6 w-6" /> : <Server className="h-6 w-6" />}
        </div>
        <h2 className="text-lg font-semibold">Connect your first server</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Drop a <span className="font-medium text-foreground">.pem</span> key here, or add a server
          with an SSH key, password, or your local agent. Manage Linux and Windows Server in one
          place.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onBrowseKey}>
            <FileKey className="h-4 w-4" />
            Browse PEM file
          </Button>
          <Button variant="outline" onClick={() => onAdd('sshKey')}>
            <Plus className="h-4 w-4" />
            Add server
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          .pem · .ppk · OpenSSH · password · SSH agent
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MethodCard
          icon={FileKey}
          title="PEM / SSH key"
          description="AWS, Lightsail, DigitalOcean, and OpenSSH private keys."
          onClick={() => onAdd('sshKey')}
        />
        <MethodCard
          icon={Lock}
          title="Password"
          description="Connect with a username and SSH password."
          onClick={() => onAdd('password')}
        />
        <MethodCard
          icon={Shield}
          title="SSH agent"
          description="Use keys already loaded in OpenSSH or Pageant."
          onClick={() => onAdd('agent')}
        />
      </div>
    </div>
  )
}

function MethodCard({
  icon: Icon,
  title,
  description,
  onClick
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-colors hover:border-foreground/15 hover:bg-accent/40"
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </button>
  )
}
