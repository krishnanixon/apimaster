import { getModuleById, MODULE_REGISTRY } from '@/shared/lib/module-registry'

export interface ResolvedRouteModule {
  moduleId: string
  path: string
  label: string
  projectId?: string
}

const SKIP_PATHS = new Set(['/', '/clipboard-picker', '/note-popup'])

/** Map a URL pathname to a registry module for navigation history. */
export function resolveRouteModule(pathname: string): ResolvedRouteModule | null {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/'
  if (SKIP_PATHS.has(path)) return null

  const globalModule = MODULE_REGISTRY.find(
    (m) => !m.isGroup && m.path.startsWith('/') && m.path === path
  )
  if (globalModule) {
    return { moduleId: globalModule.id, path, label: globalModule.label }
  }

  const projectMatch = path.match(/^\/project\/([^/]+)(?:\/(.+))?$/)
  if (!projectMatch) return null

  const projectId = projectMatch[1]
  const rest = projectMatch[2] ?? 'overview'
  const baseSegment = rest.split('/')[0]

  const projectModule = MODULE_REGISTRY.find(
    (m) => m.category === 'project' && !m.isGroup && m.path === baseSegment
  )
  if (projectModule) {
    return {
      moduleId: projectModule.id,
      path,
      label: projectModule.label,
      projectId
    }
  }

  if (baseSegment === 'editor') {
    const documents = getModuleById('documents')
    return {
      moduleId: 'documents',
      path,
      label: documents?.label ?? 'Documents',
      projectId
    }
  }

  // HYBRID absolute-path modules mounted under /project/:id/<segment>
  const hybridModule = MODULE_REGISTRY.find(
    (m) =>
      m.scope === 'HYBRID' &&
      !m.isGroup &&
      m.path.startsWith('/') &&
      m.path === `/${baseSegment}`
  )
  if (hybridModule) {
    return {
      moduleId: hybridModule.id,
      path,
      label: hybridModule.label,
      projectId
    }
  }

  return null
}
