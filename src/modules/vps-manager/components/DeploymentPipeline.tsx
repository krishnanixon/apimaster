import { useState } from 'react'
import { Play, Plus, CheckCircle2, XCircle, Loader2, Circle, Lock } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { cn } from '@/shared/lib/utils'
import { ConfirmDialog } from './ConfirmDialog'
import { runPipeline } from '../services/deploy.service'
import { useVPSStore } from '../stores/vps.store'
import type { VPSProject, VPSDeployment } from '../types/project.types'

interface DeploymentPipelineProps {
  serverId: string
  projects: VPSProject[]
  disabled?: boolean
}

const stepIcon = {
  pending: Circle,
  running: Loader2,
  success: CheckCircle2,
  failed: XCircle,
  skipped: Circle
}

const stepColor = {
  pending: 'text-muted-foreground',
  running: 'text-amber-500 animate-spin',
  success: 'text-emerald-500',
  failed: 'text-destructive',
  skipped: 'text-muted-foreground'
}

export function DeploymentPipeline({ serverId, projects, disabled }: DeploymentPipelineProps) {
  const { activeDeployment, setActiveDeployment, createProject, deleteProject } = useVPSStore()
  const [deployingId, setDeployingId] = useState<string | null>(null)
  const [savingProject, setSavingProject] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeploy, setConfirmDeploy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    path: '/var/www/app',
    pm2Name: 'app',
    repoUrl: '',
    buildCommand: 'npm run build',
    installCommand: 'npm ci'
  })

  const handleDeploy = async (projectId: string) => {
    setDeployingId(projectId)
    setConfirmDeploy(null)
    try {
      const deployment = await runPipeline(serverId, projectId)
      setActiveDeployment(deployment)
    } finally {
      setDeployingId(null)
    }
  }

  const handleCreateProject = async () => {
    setSavingProject(true)
    try {
      await createProject({
        serverId,
        name: form.name,
        path: form.path,
        pm2Name: form.pm2Name,
        repoUrl: form.repoUrl || undefined,
        buildCommand: form.buildCommand,
        installCommand: form.installCommand
      })
      setShowForm(false)
      setForm({
        name: '',
        path: '/var/www/app',
        pm2Name: 'app',
        repoUrl: '',
        buildCommand: 'npm run build',
        installCommand: 'npm ci'
      })
    } finally {
      setSavingProject(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!confirmDelete) return
    await deleteProject(confirmDelete)
    setConfirmDelete(null)
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12">
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title="Deployments unavailable"
          description="Connect to this server to run deployment pipelines."
        />
      </div>
    )
  }

  const deployProject = projects.find((p) => p.id === confirmDeploy)
  const deleteProjectMeta = projects.find((p) => p.id === confirmDelete)

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Deployment Pipeline</h3>
          <p className="text-xs text-muted-foreground">git pull → install → build → pm2 restart</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(!showForm)}
          disabled={Boolean(deployingId)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Project
        </Button>
      </div>

      {showForm && (
        <div className="animate-fade-in space-y-3 rounded-xl border border-border bg-card p-4">
          <Input
            placeholder="Project name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={savingProject}
          />
          <Input
            placeholder="Remote path"
            value={form.path}
            onChange={(e) => setForm({ ...form, path: e.target.value })}
            disabled={savingProject}
          />
          <Input
            placeholder="PM2 process name"
            value={form.pm2Name}
            onChange={(e) => setForm({ ...form, pm2Name: e.target.value })}
            disabled={savingProject}
          />
          <Input
            placeholder="Repo URL (optional)"
            value={form.repoUrl}
            onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
            disabled={savingProject}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreateProject} disabled={!form.name || savingProject}>
              {savingProject && <Spinner size="sm" className="mr-1.5" />}
              {savingProject ? 'Saving...' : 'Save Project'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(false)}
              disabled={savingProject}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            title="No projects configured"
            description="Add a project with its remote path and PM2 name to start deploying."
            action={
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Project
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => {
            const isDeploying = deployingId === project.id
            return (
              <div
                key={project.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.path} · pm2:{project.pm2Name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setConfirmDeploy(project.id)}
                    disabled={Boolean(deployingId)}
                  >
                    {isDeploying ? (
                      <>
                        <Spinner size="sm" className="mr-1.5" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Play className="mr-1 h-3.5 w-3.5" />
                        Deploy
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={Boolean(deployingId)}
                    onClick={() => setConfirmDelete(project.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeDeployment && activeDeployment.serverId === serverId && (
        <DeploymentProgress deployment={activeDeployment} />
      )}

      <ConfirmDialog
        open={Boolean(confirmDeploy)}
        onOpenChange={(open) => !open && setConfirmDeploy(null)}
        title="Run deployment?"
        description={
          deployProject
            ? `This will pull, build, and restart "${deployProject.name}" on the server.`
            : undefined
        }
        confirmLabel="Deploy"
        loading={Boolean(deployingId)}
        onConfirm={async () => {
          if (confirmDeploy) await handleDeploy(confirmDeploy)
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Remove project?"
        description={
          deleteProjectMeta
            ? `"${deleteProjectMeta.name}" will be removed from this workspace (server files are not deleted).`
            : undefined
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDeleteProject}
      />
    </div>
  )
}

function DeploymentProgress({ deployment }: { deployment: VPSDeployment }) {
  const completed = deployment.steps.filter((s) => s.status === 'success').length
  const total = deployment.steps.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="animate-fade-in overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Deployment Progress</h4>
          <span
            className={cn(
              'text-xs font-medium capitalize',
              deployment.status === 'success' && 'text-emerald-500',
              deployment.status === 'failed' && 'text-destructive',
              deployment.status === 'running' && 'text-amber-500'
            )}
          >
            {deployment.status}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              deployment.status === 'failed' ? 'bg-destructive' : 'bg-primary'
            )}
            style={{
              width: `${deployment.status === 'running' ? Math.max(progress, 8) : progress}%`
            }}
          />
        </div>
      </div>
      <div className="divide-y divide-border">
        {deployment.steps.map((step) => {
          const Icon = stepIcon[step.status]
          return (
            <div key={step.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Icon className={cn('h-4 w-4 shrink-0', stepColor[step.status])} />
                <span className="text-sm font-medium">{step.label}</span>
                <span className="text-xs text-muted-foreground">{step.command}</span>
              </div>
              {step.logs && (
                <pre className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
                  {step.logs.slice(-1500)}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
