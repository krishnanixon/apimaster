import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getModuleById } from '@/shared/lib/module-registry'
import { resolveRouteModule } from '@/shared/lib/resolve-route-module'
import { useNavHistoryStore } from '@/shared/stores/nav-history.store'
import { useProjectStore } from '@/shared/stores/project.store'

/** Records sidebar / route visits for the dashboard "Recently opened" section. */
export function useTrackNavigation() {
  const { pathname } = useLocation()
  const recordVisit = useNavHistoryStore((s) => s.recordVisit)
  useEffect(() => {
    const resolved = resolveRouteModule(pathname)
    if (!resolved) return

    const mod = getModuleById(resolved.moduleId)
    const { currentProject, recentProjects, projects } = useProjectStore.getState()
    let projectName: string | undefined

    if (resolved.projectId) {
      projectName =
        currentProject?.id === resolved.projectId
          ? currentProject.name
          : recentProjects.find((p) => p.id === resolved.projectId)?.name ??
            projects.find((p) => p.id === resolved.projectId)?.name
    }

    recordVisit({
      moduleId: resolved.moduleId,
      path: resolved.path,
      label: resolved.label,
      description: mod?.description,
      projectId: resolved.projectId,
      projectName
    })
  }, [pathname, recordVisit])
}
