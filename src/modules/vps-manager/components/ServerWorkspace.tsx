import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Terminal,
  Box,
  Rocket,
  FolderOpen,
  Settings2,
  LayoutDashboard,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  Copy,
  Trash2,
  PlugZap
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'
import { SmartTerminal } from './SmartTerminal'
import { PM2Panel } from './PM2Panel'
import { DeploymentPipeline } from './DeploymentPipeline'
import { FileManager } from './FileManager'
import { EnvEditor } from './EnvEditor'
import { PanelLoader } from './PanelLoader'
import { ConfirmDialog } from './ConfirmDialog'
import { useVPSStore } from '../stores/vps.store'
import type { VPSServer } from '../types/server.types'

type WorkspaceTab = 'overview' | 'terminal' | 'pm2' | 'deployments' | 'files' | 'env'

interface ServerWorkspaceProps {
  server: VPSServer
  onBack: () => void
}

const tabs: {
  id: WorkspaceTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'pm2', label: 'PM2', icon: Box },
  { id: 'deployments', label: 'Deployments', icon: Rocket },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'env', label: 'Env', icon: Settings2 }
]

const statusBadge = {
  connected: {
    label: 'Connected',
    icon: Wifi,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  },
  disconnected: {
    label: 'Disconnected',
    icon: WifiOff,
    className: 'border-border bg-muted text-muted-foreground'
  },
  reconnecting: {
    label: 'Reconnecting',
    icon: Loader2,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    className: 'border-destructive/30 bg-destructive/10 text-destructive'
  }
}

export function ServerWorkspace({ server, onBack }: ServerWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview')
  const [tabLoading, setTabLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const {
    projects,
    auditLog,
    metrics,
    metricErrors,
    loadProjects,
    loadAuditLog,
    loadMetrics,
    connect,
    disconnect,
    deleteServer,
    pendingServerActions
  } = useVPSStore()

  const serverProjects = projects.filter((p) => p.serverId === server.id)
  const badge = statusBadge[server.status]
  const BadgeIcon = badge.icon
  const isConnecting = pendingServerActions[server.id] === 'connect'
  const isDisconnecting = pendingServerActions[server.id] === 'disconnect'
  const metric = metrics[server.id]
  const isConnected = server.status === 'connected'

  useEffect(() => {
    void loadProjects(server.id)
    void loadAuditLog(server.id)
  }, [server.id, loadProjects, loadAuditLog])

  useEffect(() => {
    if (!isConnected) return
    const poll = () => void loadMetrics(server.id)
    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [isConnected, server.id, loadMetrics])

  const openTab = async (tab: WorkspaceTab) => {
    setActiveTab(tab)
    setTabLoading(true)
    try {
      if (tab === 'deployments' || tab === 'env') await loadProjects(server.id)
      if (tab === 'overview') await loadAuditLog(server.id)
    } finally {
      setTabLoading(false)
    }
  }

  const handleConnect = async () => {
    try {
      await connect(server.id)
    } catch {
      // toast in store
    }
  }

  const handleDisconnect = async () => {
    await disconnect(server.id)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${server.username}@${server.host}`)
      toast.success('Address copied')
    } catch {
      toast.error('Could not copy address')
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteServer(server.id)
      onBack()
    } catch {
      // toast in store
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 animate-fade-in flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Servers
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold">{server.name}</h2>
            <Badge variant="outline" className={cn('text-[10px]', badge.className)}>
              <BadgeIcon
                className={cn('mr-1 h-3 w-3', server.status === 'reconnecting' && 'animate-spin')}
              />
              {badge.label}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {server.os === 'windows' ? 'Windows Server · PowerShell' : 'Linux · SSH'} ·{' '}
            {server.username}@{server.host}:{server.port}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            Copy
          </Button>
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={isConnecting}>
              <PlugZap className="mr-1 h-3.5 w-3.5" />
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isConnected && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          Connect to use the terminal, PM2, deployments, and file tools.
        </div>
      )}

      <div className="mt-3 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => openTab(id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              activeTab === id
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-4">
        {tabLoading ? (
          <PanelLoader label="Loading..." />
        ) : (
          <div key={activeTab} className="animate-fade-in">
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {isConnected && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-medium">Live metrics</h3>
                      <span className="text-[10px] text-muted-foreground">
                        {metric
                          ? `updated ${new Date(metric.fetchedAt).toLocaleTimeString()}`
                          : metricErrors[server.id]
                            ? 'Unavailable'
                            : 'sampling…'}
                      </span>
                    </div>
                    {metricErrors[server.id] && (
                      <p role="status" className="mb-3 text-xs text-destructive">
                        {metricErrors[server.id]}
                      </p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricBar
                        label="CPU"
                        valueLabel={metric ? `${metric.cpu}%` : '—'}
                        percent={metric?.cpu}
                      />
                      <MetricBar
                        label="Memory"
                        valueLabel={metric ? formatMem(metric.memUsedMb, metric.memTotalMb) : '—'}
                        percent={
                          metric && metric.memTotalMb
                            ? Math.round((metric.memUsedMb / metric.memTotalMb) * 100)
                            : undefined
                        }
                      />
                      <MetricBar
                        label="Disk"
                        valueLabel={metric ? `${metric.diskUsedPct}%` : '—'}
                        percent={metric?.diskUsedPct}
                      />
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                          Uptime
                        </span>
                        <span className="text-sm font-medium">
                          {metric ? formatUptime(metric.uptimeSec) : '—'}
                        </span>
                        {metric && server.os !== 'windows' && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Load {metric.loadAvg.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">Connection</h3>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Status</dt>
                      <dd className="font-medium capitalize">{server.status}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Authentication</dt>
                      <dd>
                        {server.authType === 'agent'
                          ? server.agentKind === 'pageant'
                            ? 'SSH agent (Pageant)'
                            : 'SSH agent (OpenSSH)'
                          : server.authType === 'sshKey'
                            ? server.keyFileName
                              ? `Key · ${server.keyFileName}`
                              : 'SSH key (encrypted)'
                            : 'Password (encrypted)'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Host</dt>
                      <dd className="font-mono text-xs">
                        {server.host}:{server.port}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">User</dt>
                      <dd className="font-mono text-xs">{server.username}</dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">Projects ({serverProjects.length})</h3>
                  {serverProjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No projects yet. Add one in the Deployments tab.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {serverProjects.map((p) => (
                        <li key={p.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                          <span className="font-medium">{p.name}</span>
                          <code className="ml-2 text-xs text-muted-foreground">{p.path}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">Audit log</h3>
                  {auditLog.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No commands executed yet.</p>
                  ) : (
                    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-muted/30 p-3 font-mono text-xs">
                      {auditLog.slice(0, 20).map((entry) => (
                        <li
                          key={entry.id}
                          className={
                            entry.destructive ? 'text-destructive' : 'text-muted-foreground'
                          }
                        >
                          <span className="text-foreground/50">
                            [{new Date(entry.timestamp).toLocaleTimeString()}]
                          </span>{' '}
                          {entry.command}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'terminal' && (
              <SmartTerminal
                serverId={server.id}
                projects={serverProjects}
                onNavigate={setActiveTab}
                disabled={!isConnected}
              />
            )}
            {activeTab === 'pm2' && <PM2Panel serverId={server.id} disabled={!isConnected} />}
            {activeTab === 'deployments' && (
              <DeploymentPipeline
                serverId={server.id}
                projects={serverProjects}
                disabled={!isConnected}
              />
            )}
            {activeTab === 'files' && (
              <FileManager os={server.os} serverId={server.id} disabled={!isConnected} />
            )}
            {activeTab === 'env' && (
              <EnvEditor serverId={server.id} projects={serverProjects} disabled={!isConnected} />
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => !deleting && setConfirmDelete(open)}
        title="Remove server"
        description={`Remove “${server.name}”? Encrypted credentials are deleted from this machine.`}
        confirmLabel="Remove"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function MetricBar({
  label,
  valueLabel,
  percent
}: {
  label: string
  valueLabel: string
  percent?: number
}) {
  const width = typeof percent === 'number' ? Math.max(0, Math.min(100, percent)) : 0
  const hot = width >= 85
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{valueLabel}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            hot ? 'bg-destructive' : 'bg-primary/70'
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function formatMem(usedMb: number, totalMb: number): string {
  if (!totalMb) return '—'
  const fmt = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`)
  return `${Math.round((usedMb / totalMb) * 100)}% · ${fmt(usedMb)}/${fmt(totalMb)}`
}

function formatUptime(seconds: number): string {
  if (!seconds) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}
