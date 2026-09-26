import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, FolderKanban, LayoutTemplate } from 'lucide-react'
import { useProjectStore } from '@/shared/stores/project.store'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Button } from '@/shared/components/ui/button'
import { SkeletonCard } from '@/shared/components/ui/skeleton'
import { formatRelativeTime } from '@/shared/lib/utils'
import { openInWorkbench } from '@/shared/lib/windows'

/** Global Templates entry — opens the selected project's template library. */
export function TemplatesGatewayPage() {
  const navigate = useNavigate()
  const { projects, currentProject, isLoading, loadProjects, loadRecentProjects, openProject } =
    useProjectStore()

  useEffect(() => {
    void loadProjects('active')
    void loadRecentProjects()
  }, [loadProjects, loadRecentProjects])

  useEffect(() => {
    if (currentProject?.id) {
      navigate(`/project/${currentProject.id}/templates`, { replace: true })
    }
  }, [currentProject?.id, navigate])

  const openTemplates = async (projectId: string) => {
    const project = await openProject(projectId)
    if (project) navigate(`/project/${project.id}/templates`)
  }

  return (
    <ModulePage>
      <PageHeader
        title="Templates"
        description="Choose a project to open its document templates."
        fluid
        actions={
          <Button variant="outline" size="sm" onClick={() => void openInWorkbench('/projects')}>
            <FolderKanban className="h-3.5 w-3.5" />
            Projects
          </Button>
        }
      />

      <PageContent fluid>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <SkeletonCard key={item} />
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => void openTemplates(project.id)}
                className="rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-colors hover:border-foreground/15 hover:shadow-md"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <LayoutTemplate className="h-4 w-4" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {project.description || 'Open templates for this project'}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Opened {formatRelativeTime(project.lastOpenedAt)}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FolderKanban className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">No projects yet</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Create a project first, then open templates from the project sidebar.
            </p>
            <Button className="mt-4" size="sm" onClick={() => void openInWorkbench('/projects')}>
              Go to projects
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </PageContent>
    </ModulePage>
  )
}
