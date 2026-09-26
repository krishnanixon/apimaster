import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useProjectStore } from '@/shared/stores/project.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { ViewToggle, type ViewMode } from '@/shared/components/ui/view-toggle'
import {
  AppleCanvas,
  AppleChip,
  AppleHero,
  AppleSection,
  AppleSkeletonTile,
  AppleTile
} from '../components/project-chrome'
import { CreateProjectDialog } from '../components/CreateProjectDialog'
import { useCreateProjectDialog } from '../hooks/useCreateProjectDialog'
import { ProjectListRow, ProjectTile } from '../components/ProjectTile'
import { openProjectWindow } from '@/shared/lib/windows'

type StatusFilter = 'all' | 'active' | 'archived'

export function ProjectsPage() {
  const { projects, isLoading, loadProjects, openProject, deleteProject, duplicateProject, archiveProject } =
    useProjectStore()
  const create = useCreateProjectDialog()

  const [view, setView] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const filtered = useMemo(
    () =>
      projects.filter((project) => {
        const matchesSearch =
          project.name.toLowerCase().includes(search.toLowerCase()) ||
          project.description.toLowerCase().includes(search.toLowerCase())
        const matchesStatus = status === 'all' || project.status === status
        return matchesSearch && matchesStatus
      }),
    [projects, search, status]
  )

  const open = async (id: string) => {
    await openProject(id)
    await openProjectWindow(id, 'overview')
  }

  return (
    <AppleCanvas muted>
      <AppleHero
        compact
        title="Projects"
        subtitle="Create and manage requirement workspaces."
        actions={
          <Button size="sm" onClick={() => create.setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Project
          </Button>
        }
      />

      <AppleSection>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(['all', 'active', 'archived'] as const).map((value) => (
                <AppleChip key={value} active={status === value} onClick={() => setStatus(value)}>
                  {value === 'all' ? 'All' : value === 'active' ? 'Active' : 'Archived'}
                </AppleChip>
              ))}
            </div>
            <ViewToggle value={view} onChange={setView} />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <AppleSkeletonTile key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <AppleTile className="flex flex-col items-center py-12 text-center">
            <h3 className="text-sm font-semibold">
              {search || status !== 'all' ? 'No matches' : 'No projects yet'}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {search || status !== 'all'
                ? 'Try a different name, or clear the filters.'
                : 'Create a project to organize documents, knowledge, and conversations.'}
            </p>
            {!search && status === 'all' && (
              <Button className="mt-4" size="sm" onClick={() => create.setOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Project
              </Button>
            )}
          </AppleTile>
        ) : view === 'grid' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <ProjectTile
                key={project.id}
                project={project}
                onOpen={() => open(project.id)}
                onOpenInNewWindow={() => void openProjectWindow(project.id, 'overview')}
                onDuplicate={() => {
                  duplicateProject(project.id)
                  toast.success('Duplicated')
                }}
                onArchive={() => {
                  archiveProject(project.id)
                  toast.success('Archived')
                }}
                onDelete={() => {
                  deleteProject(project.id)
                  toast.success('Deleted')
                }}
              />
            ))}
          </div>
        ) : (
          <AppleTile padded={false}>
            {filtered.map((project) => (
              <ProjectListRow
                key={project.id}
                project={project}
                onOpen={() => open(project.id)}
                onDelete={() => deleteProject(project.id)}
              />
            ))}
          </AppleTile>
        )}
      </AppleSection>

      <CreateProjectDialog
        open={create.open}
        onOpenChange={create.setOpen}
        name={create.name}
        description={create.description}
        onNameChange={create.setName}
        onDescriptionChange={create.setDescription}
        onCreate={create.handleCreate}
        creating={create.creating}
      />
    </AppleCanvas>
  )
}
