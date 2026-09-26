import { describe, expect, it } from 'vitest'
import { applyActions, createEmptyModel } from '@shared/lib/architecture-model'
import {
  buildModelFromDraft,
  buildProposal,
  parseJsonObject,
  resolveComponentKind,
  resolveConnectionKind,
  sanitizeActions,
  stripCodeFence,
  type ArchitectureDraft
} from '@shared/lib/architecture-generation'

const FALLBACK = { name: 'Test System', systemType: 'web' }

describe('architecture-generation: parsing raw AI output', () => {
  it('unwraps a fenced JSON block', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('salvages an object when the model prepends prose', () => {
    expect(parseJsonObject<{ a: number }>('Sure! Here you go:\n{"a":1}')).toEqual({ a: 1 })
  })

  it('throws a readable error for output with no object at all', () => {
    expect(() => parseJsonObject('I cannot help with that.')).toThrow(/not valid JSON/)
  })
})

describe('architecture-generation: kind resolution', () => {
  it('accepts exact kinds and human labels alike', () => {
    expect(resolveComponentKind('api-gateway')).toBe('api-gateway')
    expect(resolveComponentKind('API Gateway')).toBe('api-gateway')
    expect(resolveConnectionKind('Message Queue')).toBe('message-queue')
  })

  it('falls back to the category when the kind is invented', () => {
    expect(resolveComponentKind('nosql-thing', 'database')).toBe('postgresql')
    expect(resolveComponentKind('some-ui', 'application')).toBe('web-app')
  })

  it('falls back to a backend service when nothing resolves', () => {
    expect(resolveComponentKind('quantum-flux-capacitor')).toBe('backend-service')
    expect(resolveConnectionKind('carrier-pigeon')).toBe('https')
  })
})

describe('architecture-generation: building a model from a draft', () => {
  const draft: ArchitectureDraft = {
    name: 'Care Platform',
    systemType: 'saas',
    description: 'Patient and clinician platform',
    summary: 'Designed a three-tier platform.',
    components: [
      { name: 'Patient App', kind: 'mobile-app', technology: 'React Native' },
      {
        name: 'Backend API',
        kind: 'backend-service',
        technology: 'Node.js',
        apis: [{ method: 'get', path: '/patients' }]
      },
      { name: 'Primary Database', kind: 'postgresql' }
    ],
    connections: [
      { from: 'Patient App', to: 'Backend API', kind: 'https' },
      { from: 'Backend API', to: 'Primary Database', kind: 'database' }
    ],
    environments: [{ name: 'Production' }],
    decisions: [{ title: 'Use PostgreSQL' }]
  }

  it('creates components and resolves connections that reference names', () => {
    const { model } = buildModelFromDraft(draft, FALLBACK)

    expect(model.components.map((component) => component.name)).toEqual([
      'Patient App',
      'Backend API',
      'Primary Database'
    ])
    expect(model.connections).toHaveLength(2)

    const [appToApi] = model.connections
    expect(appToApi.from).toBe(model.components[0].id)
    expect(appToApi.to).toBe(model.components[1].id)
  })

  it('gives every generated API endpoint an id and an uppercase method', () => {
    const { model } = buildModelFromDraft(draft, FALLBACK)
    const [api] = model.components[1].apis

    expect(api.method).toBe('GET')
    expect(api.id).toBeTruthy()
  })

  it('carries the linked documents and requirements onto the model', () => {
    const { model } = buildModelFromDraft(draft, {
      ...FALLBACK,
      requirements: 'Must be HIPAA compliant',
      linkedDocumentIds: ['doc-1', 'doc-2']
    })

    expect(model.metadata.requirements).toBe('Must be HIPAA compliant')
    expect(model.metadata.linkedDocumentIds).toEqual(['doc-1', 'doc-2'])
    expect(model.metadata.systemType).toBe('saas')
  })

  it('drops dangling, self-referencing and duplicate connections', () => {
    const { model } = buildModelFromDraft(
      {
        components: [{ name: 'API' }, { name: 'Cache', kind: 'redis' }],
        connections: [
          { from: 'API', to: 'Cache' },
          { from: 'API', to: 'Cache' },
          { from: 'API', to: 'API' },
          { from: 'API', to: 'Ghost Service' }
        ]
      },
      FALLBACK
    )

    expect(model.connections).toHaveLength(1)
  })

  it('skips nameless and duplicate components', () => {
    const { model } = buildModelFromDraft(
      { components: [{ name: 'API' }, { name: 'api' }, { name: '  ' }, {}] },
      FALLBACK
    )

    expect(model.components).toHaveLength(1)
  })

  it('falls back to a generated summary when the model omits one', () => {
    const { summary } = buildModelFromDraft({ components: [{ name: 'API' }] }, FALLBACK)
    expect(summary).toContain('1 components')
  })

  it('returns an empty but valid model for an empty draft', () => {
    const { model } = buildModelFromDraft({}, FALLBACK)

    expect(model.components).toEqual([])
    expect(model.metadata.name).toBe('Test System')
    expect(model.metadata.linkedDocumentIds).toEqual([])
  })
})

describe('architecture-generation: sanitizing assistant actions', () => {
  const model = applyActions(createEmptyModel(), [
    { type: 'ADD_COMPONENT', component: { name: 'Backend API', kind: 'backend-service' } },
    { type: 'ADD_COMPONENT', component: { name: 'Primary Database', kind: 'postgresql' } }
  ])
  const [api, db] = model.components

  it('rewrites component names into ids', () => {
    const actions = sanitizeActions(
      [{ type: 'CHANGE_TECHNOLOGY', componentId: 'Backend API', technology: 'Go' }],
      model
    )

    expect(actions).toEqual([{ type: 'CHANGE_TECHNOLOGY', componentId: api.id, technology: 'Go' }])
  })

  it('keeps ids that already resolve', () => {
    const actions = sanitizeActions([{ type: 'REMOVE_COMPONENT', componentId: db.id }], model)
    expect(actions).toEqual([{ type: 'REMOVE_COMPONENT', componentId: db.id }])
  })

  it('drops actions that reference components which do not exist', () => {
    const actions = sanitizeActions(
      [
        { type: 'REMOVE_COMPONENT', componentId: 'Nonexistent Service' },
        { type: 'CONNECT_COMPONENTS', connection: { from: 'Backend API', to: 'Ghost' } },
        { type: 'DISCONNECT_COMPONENTS', connectionId: 'not-a-real-id' }
      ],
      model
    )

    expect(actions).toEqual([])
  })

  it('drops unknown and malformed action types', () => {
    const actions = sanitizeActions(
      [{ type: 'DROP_DATABASE', componentId: api.id }, { type: 'ADD_COMPONENT' }, null, 'nope', 42],
      model
    )

    expect(actions).toEqual([])
  })

  it('normalizes an added component with an invented kind', () => {
    const actions = sanitizeActions(
      [{ type: 'ADD_COMPONENT', component: { name: 'Cache Layer', kind: 'super-cache' } }],
      model
    )

    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      type: 'ADD_COMPONENT',
      component: { name: 'Cache Layer', kind: 'backend-service' }
    })
  })

  it('produces actions the model reducer can actually apply', () => {
    const actions = sanitizeActions(
      [
        { type: 'CONNECT_COMPONENTS', connection: { from: 'Backend API', to: 'Primary Database', kind: 'database' } },
        { type: 'ADD_API', componentId: 'Backend API', api: { method: 'post', path: '/patients' } }
      ],
      model
    )
    const next = applyActions(model, actions)

    expect(next.connections).toHaveLength(1)
    expect(next.connections[0].from).toBe(api.id)
    expect(next.components.find((c) => c.id === api.id)?.apis[0].method).toBe('POST')
  })

  it('returns an empty list when actions is not an array', () => {
    expect(sanitizeActions(undefined, model)).toEqual([])
    expect(sanitizeActions({ type: 'ADD_COMPONENT' }, model)).toEqual([])
  })
})

describe('architecture-generation: proposals', () => {
  const model = applyActions(createEmptyModel(), [
    { type: 'ADD_COMPONENT', component: { name: 'Backend API', kind: 'backend-service' } }
  ])

  it('fills in a default summary and keeps only valid actions', () => {
    const proposal = buildProposal(
      {
        actions: [
          { type: 'CHANGE_TECHNOLOGY', componentId: 'Backend API', technology: 'Go' },
          { type: 'REMOVE_COMPONENT', componentId: 'Ghost' }
        ]
      },
      model
    )

    expect(proposal.summary).toBe('Proposed architecture changes')
    expect(proposal.actions).toHaveLength(1)
    expect(proposal.id).toBeTruthy()
  })
})
