import {
  AlertCircle,
  Copy,
  Loader2,
  MoreHorizontal,
  Server,
  Trash2,
  Wifi,
  WifiOff
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Spinner } from '@/shared/components/ui/spinner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import type { VPSServer } from '../types/server.types'
import type { VPSServerMetrics } from '../types/session.types'
import type { ServerAction } from '../stores/vps.store'
import { sshKeyFormatLabel } from '@shared/lib/vps-connection'

interface ServerListProps {
  servers: VPSServer[]
  pendingActions: Record<string, ServerAction>
  metrics: Record<string, VPSServerMetrics>
  onConnect: (id: string) => Promise<void>
  onDisconnect: (id: string) => Promise<void>
  onReconnect: (id: string) => Promise<void>
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

const statusConfig = {
  connected: { label: 'Connected', badge: 'success' as const, icon: Wifi },
  disconnected: { label: 'Disconnected', badge: 'outline' as const, icon: WifiOff },
  reconnecting: { label: 'Reconnecting', badge: 'warning' as const, icon: Loader2 },
  error: { label: 'Error', badge: 'destructive' as const, icon: AlertCircle }
}

function formatMemory(usedMb: number, totalMb: number): string {
  if (!totalMb) return '—'
  const pct = Math.round((usedMb / totalMb) * 100)
  const fmt = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`)
  return `${pct}% · ${fmt(usedMb)}/${fmt(totalMb)}`
}

function authMethodLabel(server: VPSServer): string {
  if (server.authType === 'agent') {
    return server.agentKind === 'pageant' ? 'Pageant agent' : 'SSH agent'
  }
  if (server.authType === 'sshKey') {
    const format = server.keyFormat ? sshKeyFormatLabel(server.keyFormat) : 'SSH key'
    return server.keyFileName ? `${format} · ${server.keyFileName}` : format
  }
  return 'Password'
}

async function copyAddress(server: VPSServer) {
  const value = `${server.username}@${server.host}`
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Address copied')
  } catch {
    toast.error('Could not copy address')
  }
}

export function ServerList({
  servers,
  pendingActions,
  metrics,
  onConnect,
  onDisconnect,
  onReconnect,
  onSelect,
  onDelete
}: ServerListProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {servers.map((server) => {
        const cfg = statusConfig[server.status]
        const StatusIcon = cfg.icon
        const pending = pendingActions[server.id]
        const isBusy = Boolean(pending)
        const metric = metrics[server.id]
        const live = server.status === 'connected' && metric

        return (
          <div
            key={server.id}
            className={cn(
              'group flex flex-col rounded-xl border border-border bg-card p-4 shadow-soft transition-all duration-200',
              'hover:border-foreground/15 hover:shadow-md',
              server.status === 'connected' && 'ring-1 ring-emerald-500/15'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => onSelect(server.id)}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted',
                    server.status === 'connected' &&
                      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  )}
                >
                  <Server className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{server.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {server.username}@{server.host}:{server.port}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                    {server.os === 'windows' ? 'Windows Server' : 'Linux'} ·{' '}
                    {authMethodLabel(server)}
                  </p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant={cfg.badge} className="text-[10px]">
                  <StatusIcon
                    className={cn(
                      'h-3 w-3',
                      (server.status === 'reconnecting' || pending === 'reconnect') &&
                        'animate-spin'
                    )}
                  />
                  {pending ? `${pending}…` : cfg.label}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isBusy}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {server.status === 'connected' && (
                      <DropdownMenuItem onClick={() => onSelect(server.id)}>
                        Open workspace
                      </DropdownMenuItem>
                    )}
                    {server.status === 'connected' ? (
                      <DropdownMenuItem
                        onClick={() => void onDisconnect(server.id).catch(() => {})}
                      >
                        Disconnect
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => void onConnect(server.id)}>
                        Connect
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => void copyAddress(server)}>
                      <Copy className="h-3.5 w-3.5" />
                      Copy address
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(server.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <MetricChip label="CPU" value={live ? `${metric.cpu}%` : '—'} />
              <MetricChip
                label="RAM"
                value={live ? formatMemory(metric.memUsedMb, metric.memTotalMb) : '—'}
              />
              <MetricChip label="Disk" value={live ? `${metric.diskUsedPct}%` : '—'} />
            </div>

            <div className="mt-4 flex gap-2">
              {server.status === 'connected' ? (
                <>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => onSelect(server.id)}
                    disabled={isBusy}
                  >
                    Open workspace
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDisconnect(server.id).catch(() => {})}
                    disabled={isBusy}
                  >
                    {pending === 'disconnect' ? <Spinner size="sm" /> : 'Disconnect'}
                  </Button>
                </>
              ) : server.status === 'error' ? (
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => onReconnect(server.id).catch(() => {})}
                  disabled={isBusy}
                >
                  {pending === 'reconnect' ? (
                    <>
                      <Spinner size="sm" className="mr-1.5" />
                      Reconnecting...
                    </>
                  ) : (
                    'Reconnect'
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => onConnect(server.id)}
                  disabled={isBusy}
                >
                  {pending === 'connect' ? (
                    <>
                      <Spinner size="sm" className="mr-1.5" />
                      Connecting...
                    </>
                  ) : (
                    'Connect'
                  )}
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <span className="block text-[10px] uppercase tracking-wide">{label}</span>
      <span className="truncate text-foreground/70">{value}</span>
    </div>
  )
}
