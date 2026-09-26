import { describe, expect, it } from 'vitest'
import {
  APP_CATALOG,
  filterAppCatalog,
  isBuiltinAppEnabled,
  mapAiIntegrationStatus,
  mapProfileIntegrationStatus,
  mapVpsIntegrationStatus
} from '@/shared/lib/app-catalog'
import { getModuleById, buildSidebarNav } from '@/shared/lib/module-registry'
import { getCommandPaletteByCategory } from '@/shared/lib/navigation'
import { resolveRouteModule } from '@/shared/lib/resolve-route-module'
import type { ModulePreferences } from '@shared/types/modules'

const defaults: ModulePreferences = { enabled: {}, sidebarTreeDepth: 1 }

describe('app catalog', () => {
  it('includes built-in tools and existing integrations', () => {
    const kinds = new Set(APP_CATALOG.map((a) => a.kind))
    expect(kinds.has('builtin')).toBe(true)
    expect(kinds.has('integration')).toBe(true)
    expect(APP_CATALOG.some((a) => a.integrationId === 'ai')).toBe(true)
    expect(APP_CATALOG.some((a) => a.moduleId === 'api-studio')).toBe(true)
  })

  it('filters by query and enabled state', () => {
    const prefs: ModulePreferences = {
      enabled: { 'api-studio': true, terminal: false },
      sidebarTreeDepth: 0
    }
    const search = filterAppCatalog({ query: 'api', kind: 'builtin' })
    expect(search.every((a) => a.label.toLowerCase().includes('api') || a.description.toLowerCase().includes('api'))).toBe(
      true
    )

    const enabledOnly = filterAppCatalog({
      kind: 'builtin',
      enabledOnly: true,
      preferences: prefs
    })
    expect(enabledOnly.some((a) => a.moduleId === 'api-studio')).toBe(true)
    expect(enabledOnly.some((a) => a.moduleId === 'terminal')).toBe(false)
  })

  it('respects module preferences for builtin apps', () => {
    const app = APP_CATALOG.find((a) => a.moduleId === 'vault')!
    expect(isBuiltinAppEnabled(app, defaults)).toBe(true)
    expect(
      isBuiltinAppEnabled(app, { enabled: { vault: false }, sidebarTreeDepth: 1 })
    ).toBe(false)
  })
})

describe('integration status mapping', () => {
  it('maps AI providers without claiming a live connection', () => {
    expect(mapAiIntegrationStatus({ providers: [], hasApiKey: false }).id).toBe('not-configured')
    expect(
      mapAiIntegrationStatus({
        providers: [{ implemented: true, configured: true, online: false }],
        hasApiKey: true
      }).id
    ).toBe('configured')
    expect(
      mapAiIntegrationStatus({
        providers: [{ implemented: true, configured: true, online: true }]
      }).id
    ).toBe('available')
  })

  it('maps profile-based integrations with selected vs healthy semantics', () => {
    expect(mapProfileIntegrationStatus({ profileCount: 0 }).id).toBe('not-configured')
    expect(
      mapProfileIntegrationStatus({
        profileCount: 2,
        activeConnectionId: 'c1'
      }).id
    ).toBe('selected')
    expect(
      mapProfileIntegrationStatus({
        profileCount: 2,
        healthyCount: 1
      }).id
    ).toBe('last-check-healthy')
  })

  it('maps VPS reported connection state', () => {
    expect(mapVpsIntegrationStatus({ serverCount: 0 }).id).toBe('not-configured')
    expect(
      mapVpsIntegrationStatus({ serverCount: 2, connectedCount: 1 }).id
    ).toBe('connected-reported')
    expect(mapVpsIntegrationStatus({ serverCount: 1, connectingCount: 1 }).id).toBe('connecting')
  })
})

describe('apps navigation registry', () => {
  it('registers the Apps workspace module', () => {
    expect(getModuleById('apps')).toMatchObject({
      id: 'apps',
      path: '/apps',
      required: true
    })
    expect(resolveRouteModule('/apps')).toEqual({
      moduleId: 'apps',
      path: '/apps',
      label: 'Apps'
    })
  })

  it('registers the Document Library workspace module', () => {
    expect(getModuleById('document-library')).toMatchObject({
      id: 'document-library',
      path: '/document-library',
      scope: 'GLOBAL'
    })
    expect(resolveRouteModule('/document-library')).toEqual({
      moduleId: 'document-library',
      path: '/document-library',
      label: 'Document Library'
    })
    const nav = buildSidebarNav(defaults, {})
    expect(nav.some((section) => section.nodes.some((n) => n.module.id === 'document-library'))).toBe(true)
    expect(nav[0]?.nodes[0]?.module.id).toBe('assistant')
  })

  it('removes Documentation from navigation and the command palette', () => {
    expect(getModuleById('docs')).toMatchObject({
      id: 'docs',
      path: '/docs',
      showInSidebar: false,
      showInCommandPalette: false
    })

    const nav = buildSidebarNav(defaults, {})
    expect(nav.some((section) => section.nodes.some((node) => node.module.id === 'docs'))).toBe(false)
    const palette = getCommandPaletteByCategory(defaults, {})
    expect(palette.some((section) => section.items.some((item) => item.id === 'docs'))).toBe(false)
  })

  it('builds a flat Tools section without legacy groups', () => {
    const nav = buildSidebarNav(defaults, {})
    const tools = nav.find((s) => s.category.id === 'developer-tools')
    expect(tools).toBeDefined()
    expect(tools!.nodes.every((n) => !n.module.isGroup)).toBe(true)
    expect(tools!.nodes.some((n) => n.module.id === 'api-studio')).toBe(true)
  })

  it('hides disabled tools from the sidebar tree', () => {
    const prefs: ModulePreferences = {
      enabled: { terminal: false, 'api-studio': true },
      sidebarTreeDepth: 0
    }
    const tools = buildSidebarNav(prefs, {}).find((s) => s.category.id === 'developer-tools')
    expect(tools!.nodes.some((n) => n.module.id === 'terminal')).toBe(false)
    expect(tools!.nodes.some((n) => n.module.id === 'api-studio')).toBe(true)
  })
})
