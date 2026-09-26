import { useEffect, useState } from 'react'
import { RefreshCw, Square, RotateCcw, Trash2, ScrollText, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Spinner } from '@/shared/components/ui/spinner'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { cn } from '@/shared/lib/utils'
import { ConfirmDialog } from './ConfirmDialog'
import { PanelLoader } from './PanelLoader'
import * as pm2Service from '../services/pm2.service'
import { useVPSStore } from '../stores/vps.store'
import type { PM2Process } from '@shared/types/vps'

interface PM2PanelProps {
  serverId: string
  disabled?: boolean
}

export function PM2Panel({ serverId, disabled }: PM2PanelProps) {
  const [processes, setProcesses] = useState<PM2Process[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedLogs, setSelectedLogs] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ action: 'delete'; name: string } | null>(null)
  const { terminalLogs } = useVPSStore()

  const load = async () => {
    setLoading(true)
    try {
      setProcesses(await pm2Service.listPM2(serverId))
    } catch (e) {
      setProcesses([])
      toast.error(e instanceof Error ? e.message : 'Failed to load PM2 processes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!disabled) void load()
  }, [serverId, disabled])

  const handleAction = async (action: 'restart' | 'reload' | 'stop' | 'delete', name: string) => {
    if (action === 'delete') {
      setConfirm({ action: 'delete', name })
      return
    }
    setActionLoading(`${action}:${name}`)
    try {
      await pm2Service.pm2Action(serverId, action, name)
      toast.success(`PM2: ${action} ${name}`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const confirmDelete = async () => {
    if (!confirm) return
    setActionLoading(`delete:${confirm.name}`)
    try {
      await pm2Service.pm2Action(serverId, 'delete', confirm.name)
      toast.success(`Process "${confirm.name}" deleted`)
      setConfirm(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleLogs = async (name: string) => {
    setSelectedLogs(name)
    setActionLoading(`logs:${name}`)
    try {
      await pm2Service.streamPM2Logs(serverId, name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load logs')
    } finally {
      setActionLoading(null)
    }
  }

  const statusColor = (status: string) => {
    if (status === 'online') return 'text-emerald-600 dark:text-emerald-400'
    if (status === 'stopped') return 'text-muted-foreground'
    return 'text-amber-600 dark:text-amber-400'
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12">
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title="PM2 unavailable"
          description="Connect to this server to manage processes."
        />
      </div>
    )
  }

  if (loading) return <PanelLoader label="Loading PM2 processes..." />

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">PM2 Processes</h3>
        <Button size="sm" variant="outline" onClick={load} disabled={Boolean(actionLoading)}>
          <RefreshCw className={cn('mr-1 h-3.5 w-3.5', actionLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {processes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            title="No processes found"
            description="PM2 may not be installed or no apps are running on this server."
            action={
              <Button size="sm" variant="outline" onClick={load}>
                Retry
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          {processes.map((proc) => (
              <div
                key={proc.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{proc.name}</span>
                    <Badge variant="outline" className={cn('text-[10px] capitalize', statusColor(proc.status))}>
                      {proc.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    CPU {proc.cpu} · RAM {proc.memory} · Restarts {proc.restarts}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(['restart', 'reload', 'stop'] as const).map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2.5 text-xs capitalize"
                      disabled={Boolean(actionLoading)}
                      onClick={() => handleAction(action, proc.name)}
                    >
                      {actionLoading === `${action}:${proc.name}` ? (
                        <Spinner size="sm" />
                      ) : action === 'restart' ? (
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      ) : action === 'reload' ? (
                        <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Square className="mr-1 h-3.5 w-3.5" />
                      )}
                      {action}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2.5 text-xs"
                    disabled={Boolean(actionLoading)}
                    onClick={() => handleLogs(proc.name)}
                  >
                    {actionLoading === `logs:${proc.name}` ? (
                      <Spinner size="sm" className="mr-1" />
                    ) : (
                      <ScrollText className="mr-1 h-3.5 w-3.5" />
                    )}
                    Logs
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                    disabled={Boolean(actionLoading)}
                    onClick={() => handleAction('delete', proc.name)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}

      {selectedLogs && (
        <div className="animate-fade-in rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium">Logs: {selectedLogs}</span>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelectedLogs(null)}>
              Close
            </Button>
          </div>
          <pre className="max-h-64 overflow-y-auto p-3 font-mono text-xs text-muted-foreground">
            {terminalLogs[serverId]?.slice(-3000) || 'Loading logs...'}
          </pre>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete PM2 process?"
        description={confirm ? `This will permanently remove "${confirm.name}" from PM2.` : undefined}
        confirmLabel="Delete"
        variant="destructive"
        loading={Boolean(actionLoading?.startsWith('delete:'))}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
