import { useEffect } from 'react'
import { useVectorWorkspaceStore } from '../../stores/vectorWorkspace.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useState } from 'react'
import { toast } from 'sonner'

interface StatsTabViewProps {
  connectionId: string
}

export function StatsTabView({ connectionId }: StatsTabViewProps) {
  const dbStats = useVectorWorkspaceStore((s) => s.dbStats)
  const loadStats = useVectorWorkspaceStore((s) => s.loadStats)
  const [backupPath, setBackupPath] = useState('')
  const [restorePath, setRestorePath] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadStats(connectionId)
  }, [connectionId, loadStats])

  const handleBackup = async () => {
    if (!backupPath.trim()) {
      toast.error('Destination path is required')
      return
    }
    setBusy(true)
    const res = await window.electronAPI.vectorWorkspace.backup(connectionId, backupPath.trim())
    setBusy(false)
    if (res.success) toast.success(`Backup written to ${res.data?.destination}`)
    else toast.error(res.error ?? 'Backup failed')
  }

  const handleRestore = async () => {
    if (!restorePath.trim()) {
      toast.error('Source path is required')
      return
    }
    if (!window.confirm('Restore will replace the current LiteChroma data. Continue?')) return
    setBusy(true)
    const res = await window.electronAPI.vectorWorkspace.restore(connectionId, restorePath.trim())
    setBusy(false)
    if (res.success) {
      toast.success('Restore completed')
      void loadStats(connectionId)
    } else toast.error(res.error ?? 'Restore failed')
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="text-base font-semibold">Database stats</h3>
      <p className="mt-1 text-caption text-muted-foreground">
        Live stats from the connected LiteChroma server.
      </p>

      {dbStats ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Collections" value={dbStats.collections} />
          <Stat label="Vectors" value={dbStats.vectors} />
          <Stat
            label="Memory"
            value={dbStats.memory_mb != null ? `${dbStats.memory_mb.toFixed(1)} MB` : '—'}
          />
        </div>
      ) : (
        <p className="mt-6 text-caption text-muted-foreground">Loading…</p>
      )}

      {dbStats?.details?.length ? (
        <div className="mt-6 overflow-auto rounded-xl border border-border/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Count</th>
                <th className="px-3 py-2 font-medium">Dim</th>
                <th className="px-3 py-2 font-medium">Metric</th>
                <th className="px-3 py-2 font-medium">Index</th>
              </tr>
            </thead>
            <tbody>
              {dbStats.details.map((d) => (
                <tr key={d.uuid || d.name} className="border-t border-border/40">
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2">{d.count}</td>
                  <td className="px-3 py-2">{d.dimension}</td>
                  <td className="px-3 py-2">{d.metric}</td>
                  <td className="px-3 py-2">{d.index}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border/50 p-4">
          <h4 className="text-sm font-semibold">Backup</h4>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Path is on the machine running the LiteChroma server.
          </p>
          <Input
            className="mt-3"
            placeholder="/path/to/backup"
            value={backupPath}
            onChange={(e) => setBackupPath(e.target.value)}
          />
          <Button className="mt-3" size="sm" disabled={busy} onClick={() => void handleBackup()}>
            Backup
          </Button>
        </div>
        <div className="rounded-xl border border-border/50 p-4">
          <h4 className="text-sm font-semibold">Restore</h4>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Restores from a previous backup directory on the server.
          </p>
          <Input
            className="mt-3"
            placeholder="/path/to/backup"
            value={restorePath}
            onChange={(e) => setRestorePath(e.target.value)}
          />
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleRestore()}
          >
            Restore
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  )
}
