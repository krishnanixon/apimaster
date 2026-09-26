import { describe, expect, it } from 'vitest'
import {
  applyActions,
  componentsForView,
  connectionsForView,
  createEmptyModel,
  ensureLayout
} from '@shared/lib/architecture-model'

describe('architecture-model', () => {
  it('adds a module and keeps it selectable by id', () => {
    const model = applyActions(createEmptyModel(), [
      { type: 'ADD_COMPONENT', component: { name: 'API Gateway', kind: 'api-gateway' } }
    ])

    expect(model.components).toHaveLength(1)
    expect(model.components[0].name).toBe('API Gateway')
    expect(model.components[0].kind).toBe('api-gateway')
    expect(model.components[0].category).toBe('backend')
    expect(model.components[0].id).toBeTruthy()
  })

  it('connects two modules and projects them onto the canvas view', () => {
    const withModules = applyActions(createEmptyModel(), [
      { type: 'ADD_COMPONENT', component: { name: 'Web App', kind: 'web-app' } },
      { type: 'ADD_COMPONENT', component: { name: 'API', kind: 'backend-service' } }
    ])
    const [web, api] = withModules.components
    const model = applyActions(withModules, [
      {
        type: 'CONNECT_COMPONENTS',
        connection: { from: web.id, to: api.id, kind: 'https', label: 'REST' }
      }
    ])

    expect(model.connections).toHaveLength(1)
    expect(componentsForView(model, 'system-context')).toHaveLength(2)
    expect(connectionsForView(model, 'system-context')).toHaveLength(1)

    const positions = ensureLayout(model.components, 'system-context')
    expect(positions.get(web.id)).toEqual({ x: 80, y: 80 })
    expect(positions.get(api.id)?.y).toBeGreaterThan(positions.get(web.id)!.y)
  })

  it('moves a module on the active view without dropping it from other views', () => {
    const created = applyActions(createEmptyModel(), [
      { type: 'ADD_COMPONENT', component: { name: 'Postgres', kind: 'postgresql' } }
    ])
    const id = created.components[0].id
    const moved = applyActions(created, [
      { type: 'MOVE_COMPONENT', componentId: id, view: 'container', position: { x: 320, y: 160 } }
    ])

    expect(moved.components[0].layout.container).toEqual({ x: 320, y: 160 })
    expect(componentsForView(moved, 'system-context').map((c) => c.id)).toContain(id)
  })
})
