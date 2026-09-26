import { describe, expect, it } from 'vitest'
import { getModuleById, resolveModulePath } from '@/shared/lib/module-registry'
import { resolveRouteModule } from '@/shared/lib/resolve-route-module'
import { isStandaloneModuleRoute } from '@/shared/lib/app-chrome'

describe('route module resolution', () => {
  it('resolves the code editor from the module registry', () => {
    expect(resolveRouteModule('/code-editor')).toEqual({
      moduleId: 'code-editor',
      path: '/code-editor',
      label: 'Code Editor'
    })
    expect(getModuleById('code-editor')?.defaultEnabled).toBe(true)
  })

  it('resolves project templates and builds its project path', () => {
    expect(resolveRouteModule('/project/project-1/templates')).toEqual({
      moduleId: 'templates',
      path: '/project/project-1/templates',
      label: 'Templates',
      projectId: 'project-1'
    })

    const templates = getModuleById('templates')
    expect(templates).toBeDefined()
    expect(resolveModulePath(templates!, 'project-1')).toBe('/project/project-1/templates')
    expect(resolveModulePath(templates!)).toBe('/templates')
  })

  it('resolves hybrid project documents and the global document library', () => {
    expect(resolveRouteModule('/project/project-1/documents')).toEqual({
      moduleId: 'documents',
      path: '/project/project-1/documents',
      label: 'Documents',
      projectId: 'project-1'
    })

    const documents = getModuleById('documents')
    expect(documents).toBeDefined()
    expect(resolveModulePath(documents!, 'project-1')).toBe('/project/project-1/documents')
    expect(resolveModulePath(documents!)).toBe('/documents')
    expect(resolveRouteModule('/document-library')?.moduleId).toBe('document-library')
  })

  it('resolves hybrid database workbench under a project and builds its path', () => {
    expect(resolveRouteModule('/project/project-1/database-studio')).toEqual({
      moduleId: 'database-studio',
      path: '/project/project-1/database-studio',
      label: 'Database Workbench',
      projectId: 'project-1'
    })

    const databaseStudio = getModuleById('database-studio')
    expect(databaseStudio).toBeDefined()
    expect(resolveModulePath(databaseStudio!, 'project-1')).toBe('/project/project-1/database-studio')
    expect(resolveModulePath(databaseStudio!)).toBe('/database-studio')
    expect(isStandaloneModuleRoute('/project/project-1/database-studio')).toBe(true)
  })

  it('keeps global-only hybrid tools on absolute paths when project-scoped routes are absent', () => {
    const notes = getModuleById('notes')
    expect(notes).toBeDefined()
    expect(resolveModulePath(notes!, 'project-1')).toBe('/notepad')
  })
})
