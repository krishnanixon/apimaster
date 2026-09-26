import { describe, expect, it } from 'vitest'
import {
  getModuleWindowProfile,
  hrefForWindowMode,
  isModuleWindowPath,
  isPopoutModulePath,
  isProjectWindowPath,
  moduleWindowKey,
  parseProjectIdFromPath,
  projectWindowKey,
  projectWindowPath,
  stripModuleWindowQuery,
  withModuleWindowQuery,
  withProjectWindowQuery
} from '@shared/lib/module-windows'

describe('module windows', () => {
  it('marks studio tools as pop-out modules', () => {
    expect(isPopoutModulePath('/api-studio')).toBe(true)
    expect(isPopoutModulePath('/terminal')).toBe(true)
    expect(isPopoutModulePath('/project/p1/chat')).toBe(true)
    expect(isPopoutModulePath('/project/p1/database-studio')).toBe(true)
    expect(isPopoutModulePath('/')).toBe(false)
    expect(isPopoutModulePath('/projects')).toBe(false)
    expect(isPopoutModulePath('/project/p1/overview')).toBe(false)
  })

  it('reuses windows by pathname and preserves the module query', () => {
    expect(moduleWindowKey('/api-studio?window=module')).toBe('/api-studio')
    expect(withModuleWindowQuery('/api-studio')).toBe('/api-studio?window=module')
    expect(stripModuleWindowQuery('/api-studio?window=module&tab=body')).toBe('/api-studio?tab=body')
    expect(isModuleWindowPath('/api-studio?window=module')).toBe(true)
  })

  it('sizes module profiles for dedicated windows', () => {
    expect(getModuleWindowProfile('/terminal')?.width).toBe(1100)
    expect(getModuleWindowProfile('/project/p1/api-studio')?.label).toBe('API Studio')
    expect(getModuleWindowProfile('/project/p1/editor/doc-1')?.id).toBe('editor')
  })

  it('keeps one dedicated window per project', () => {
    expect(parseProjectIdFromPath('/project/p1/overview')).toBe('p1')
    expect(parseProjectIdFromPath('/projects')).toBeNull()
    expect(projectWindowKey('/project/p1/chat?window=project')).toBe('/project/p1')
    expect(projectWindowPath('p1', 'documents')).toBe('/project/p1/documents')
    expect(withProjectWindowQuery('/project/p1/overview')).toBe('/project/p1/overview?window=project')
    expect(withProjectWindowQuery('/project/p1/documents?tab=templates')).toBe(
      '/project/p1/documents?tab=templates&window=project'
    )
    expect(isProjectWindowPath('/project/p1/overview?window=project')).toBe(true)
    expect(hrefForWindowMode('/project/p1/chat', 'window=project')).toBe('/project/p1/chat?window=project')
    expect(hrefForWindowMode('/api-studio', 'window=module')).toBe('/api-studio?window=module')
    expect(hrefForWindowMode('/projects', '')).toBe('/projects')
  })
})
