import { useState, useEffect } from 'react'
import { Save, RefreshCw, Shield, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { ConfirmDialog } from './ConfirmDialog'
import { cn } from '@/shared/lib/utils'
import * as envService from '../services/env.service'
import * as pm2Service from '../services/pm2.service'
import type { VPSProject } from '../types/project.types'
import type { EnvVariable } from '@shared/types/vps'

interface EnvEditorProps {
  serverId: string
  projects: VPSProject[]
  disabled?: boolean
}

export function EnvEditor({ serverId, projects, disabled }: EnvEditorProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')
  const [variables, setVariables] = useState<EnvVariable[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [backupPath, setBackupPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const project = projects.find((p) => p.id === selectedProjectId)

  useEffect(() => {
    if (projects[0]?.id && !selectedProjectId) setSelectedProjectId(projects[0].id)
  }, [projects, selectedProjectId])

  const loadEnv = async () => {
    if (!project) return
    setLoading(true)
    try {
      const vars = await envService.fetchEnv(serverId, `${project.path}/${project.envFilePath}`)
      setVariables(vars.length ? vars : [{ key: '', value: '' }])
      setDirty(false)
      setBackupPath(null)
    } catch (e) {
      setVariables([{ key: '', value: '' }])
      toast.error(e instanceof Error ? e.message : 'Failed to load environment file')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (project && !disabled) void loadEnv()
  }, [selectedProjectId, serverId, disabled])

  const handleSave = async () => {
    if (!project) return
    setSaving(true)
    setConfirmSave(false)
    try {
      const filtered = variables.filter((v) => v.key.trim())
      const result = await envService.updateEnv(
        serverId,
        `${project.path}/${project.envFilePath}`,
        filtered
      )
      setBackupPath(result.backupPath)
      setDirty(false)
      await pm2Service.pm2Action(serverId, 'restart', project.pm2Name)
      toast.success(`Environment updated — ${project.pm2Name} restarted`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save environment')
    } finally {
      setSaving(false)
    }
  }

  const updateVar = (idx: number, field: 'key' | 'value', val: string) => {
    setVariables((vars) => vars.map((v, i) => (i === idx ? { ...v, [field]: val } : v)))
    setDirty(true)
  }

  const addVar = () => setVariables([...variables, { key: '', value: '' }])
  const removeVar = (idx: number) => {
    setVariables(variables.filter((_, i) => i !== idx))
    setDirty(true)
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12">
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title="Env editor unavailable"
          description="Connect to this server to manage environment variables."
        />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border">
        <EmptyState
          title="No projects configured"
          description="Add a project in Deployments to manage its .env file."
        />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">Environment Variables</h3>
          <p className="text-xs text-muted-foreground">A backup is created automatically before every save</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            disabled={loading || saving}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={loadEnv} disabled={loading || saving}>
            <RefreshCw className={cn('mr-1 h-3.5 w-3.5', loading && 'animate-spin')} />
            Reload
          </Button>
          <Button size="sm" onClick={() => setConfirmSave(true)} disabled={!dirty || saving || loading}>
            {saving ? <Spinner size="sm" className="mr-1.5" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            {saving ? 'Saving...' : 'Save & Restart'}
          </Button>
        </div>
      </div>

      {backupPath && (
        <div className="flex animate-fade-in items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          Backup saved: <code className="truncate">{backupPath}</code>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 flex-[2]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {variables.map((v, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                placeholder="KEY"
                value={v.key}
                onChange={(e) => updateVar(idx, 'key', e.target.value)}
                className="font-mono text-xs"
                disabled={saving}
              />
              <Input
                placeholder="value"
                value={v.value}
                onChange={(e) => updateVar(idx, 'value', e.target.value)}
                className="font-mono text-xs"
                disabled={saving}
              />
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-destructive"
                onClick={() => removeVar(idx)}
                disabled={saving}
              >
                ×
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addVar} disabled={saving}>
            Add Variable
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title="Save environment & restart?"
        description={
          project
            ? `This will backup .env, write changes, and restart PM2 process "${project.pm2Name}".`
            : undefined
        }
        confirmLabel="Save & Restart"
        loading={saving}
        onConfirm={handleSave}
      />
    </div>
  )
}
