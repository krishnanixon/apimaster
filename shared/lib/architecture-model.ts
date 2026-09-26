/**
 * Architecture Designer — model engine.
 *
 * Pure functions only: no React, no IPC, no side effects. Every mutation goes
 * through `applyActions`, which is what lets the same code path serve manual
 * edits, AI proposals, undo/redo and version diffing.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  ArchApiEndpoint,
  ArchComponent,
  ArchComponentKind,
  ArchConnection,
  ArchDecision,
  ArchEnvironment,
  ArchGroup,
  ArchPosition,
  ArchTechnology,
  ArchViewId,
  ArchitectureAction,
  ArchitectureModel
} from '@shared/types/architecture'
import { ARCH_VIEWS, getComponentKindMeta } from '@shared/lib/architecture-catalog'

export const ARCHITECTURE_MODEL_VERSION = 1

export function createEmptyModel(name = 'Untitled Architecture', systemType = 'web'): ArchitectureModel {
  return {
    version: ARCHITECTURE_MODEL_VERSION,
    metadata: {
      name,
      systemType,
      description: '',
      requirements: '',
      linkedDocumentIds: [],
      updatedAt: new Date().toISOString()
    },
    components: [],
    connections: [],
    groups: [],
    technologies: [],
    environments: [],
    decisions: []
  }
}

export function createComponent(
  input: Partial<ArchComponent> & { name: string; kind: ArchComponentKind }
): ArchComponent {
  const meta = getComponentKindMeta(input.kind)
  return {
    id: input.id ?? uuidv4(),
    name: input.name,
    kind: input.kind,
    category: input.category ?? meta?.category ?? 'backend',
    description: input.description ?? meta?.description ?? '',
    technology: input.technology ?? meta?.defaultTechnology ?? '',
    responsibilities: input.responsibilities ?? [],
    inputs: input.inputs ?? [],
    outputs: input.outputs ?? [],
    dependencies: input.dependencies ?? [],
    apis: input.apis ?? [],
    datastores: input.datastores ?? [],
    security: input.security ?? {},
    environments: input.environments ?? [],
    config: input.config ?? {},
    tags: input.tags ?? [],
    notes: input.notes ?? '',
    groupId: input.groupId,
    views: input.views ?? meta?.views ?? [],
    layout: input.layout ?? {}
  }
}

export function createConnection(
  input: Partial<ArchConnection> & { from: string; to: string }
): ArchConnection {
  return {
    id: input.id ?? uuidv4(),
    from: input.from,
    to: input.to,
    kind: input.kind ?? 'https',
    label: input.label ?? '',
    description: input.description ?? '',
    protocol: input.protocol ?? '',
    async: input.async ?? false,
    bidirectional: input.bidirectional ?? false,
    auth: input.auth ?? '',
    dataShape: input.dataShape ?? '',
    views: input.views ?? []
  }
}

/* --------------------------------------------------------------- the reducer */

/**
 * Applies a batch of actions to a model and returns a new model. The input is
 * never mutated, so callers can keep the previous model for undo or diffing.
 */
export function applyActions(
  model: ArchitectureModel,
  actions: ArchitectureAction[]
): ArchitectureModel {
  let next: ArchitectureModel = {
    ...model,
    metadata: { ...model.metadata },
    components: [...model.components],
    connections: [...model.connections],
    groups: [...model.groups],
    technologies: [...model.technologies],
    environments: [...model.environments],
    decisions: [...model.decisions]
  }

  for (const action of actions) {
    next = applyAction(next, action)
  }

  next.metadata = { ...next.metadata, updatedAt: new Date().toISOString() }
  return next
}

function applyAction(model: ArchitectureModel, action: ArchitectureAction): ArchitectureModel {
  switch (action.type) {
    case 'ADD_COMPONENT': {
      const component = createComponent(action.component)
      return { ...model, components: [...model.components, component] }
    }

    case 'REMOVE_COMPONENT': {
      return {
        ...model,
        components: model.components
          .filter((c) => c.id !== action.componentId)
          // Drop dangling dependency references so the model stays consistent.
          .map((c) =>
            c.dependencies.includes(action.componentId)
              ? { ...c, dependencies: c.dependencies.filter((d) => d !== action.componentId) }
              : c
          ),
        connections: model.connections.filter(
          (conn) => conn.from !== action.componentId && conn.to !== action.componentId
        )
      }
    }

    case 'UPDATE_COMPONENT': {
      return {
        ...model,
        components: model.components.map((c) =>
          c.id === action.componentId ? { ...c, ...action.patch, id: c.id } : c
        )
      }
    }

    case 'MOVE_COMPONENT': {
      return {
        ...model,
        components: model.components.map((c) =>
          c.id === action.componentId
            ? { ...c, layout: { ...c.layout, [action.view]: action.position } }
            : c
        )
      }
    }

    case 'CONNECT_COMPONENTS': {
      const exists = model.connections.some(
        (c) => c.from === action.connection.from && c.to === action.connection.to
      )
      if (exists) return model
      return { ...model, connections: [...model.connections, createConnection(action.connection)] }
    }

    case 'DISCONNECT_COMPONENTS': {
      return {
        ...model,
        connections: model.connections.filter((c) => c.id !== action.connectionId)
      }
    }

    case 'UPDATE_CONNECTION': {
      return {
        ...model,
        connections: model.connections.map((c) =>
          c.id === action.connectionId ? { ...c, ...action.patch, id: c.id } : c
        )
      }
    }

    case 'ADD_GROUP': {
      const group: ArchGroup = {
        id: action.group.id ?? uuidv4(),
        name: action.group.name,
        description: action.group.description ?? '',
        kind: action.group.kind ?? 'boundary',
        color: action.group.color,
        collapsed: action.group.collapsed ?? false
      }
      return { ...model, groups: [...model.groups, group] }
    }

    case 'REMOVE_GROUP': {
      return {
        ...model,
        groups: model.groups.filter((g) => g.id !== action.groupId),
        components: model.components.map((c) =>
          c.groupId === action.groupId ? { ...c, groupId: undefined } : c
        )
      }
    }

    case 'GROUP_COMPONENTS': {
      const ids = new Set(action.componentIds)
      return {
        ...model,
        components: model.components.map((c) =>
          ids.has(c.id) ? { ...c, groupId: action.groupId } : c
        )
      }
    }

    case 'CHANGE_TECHNOLOGY': {
      return {
        ...model,
        components: model.components.map((c) =>
          c.id === action.componentId ? { ...c, technology: action.technology } : c
        )
      }
    }

    case 'ADD_TECHNOLOGY': {
      const technology: ArchTechnology = {
        id: action.technology.id ?? uuidv4(),
        layer: action.technology.layer,
        name: action.technology.name,
        rationale: action.technology.rationale ?? '',
        status: action.technology.status ?? 'suggested',
        alternatives: action.technology.alternatives ?? []
      }
      return { ...model, technologies: [...model.technologies, technology] }
    }

    case 'UPDATE_TECHNOLOGY': {
      return {
        ...model,
        technologies: model.technologies.map((t) =>
          t.id === action.technologyId ? { ...t, ...action.patch, id: t.id } : t
        )
      }
    }

    case 'ADD_API': {
      const api: ArchApiEndpoint = {
        id: action.api.id ?? uuidv4(),
        method: action.api.method,
        path: action.api.path,
        description: action.api.description ?? '',
        auth: action.api.auth ?? ''
      }
      return {
        ...model,
        components: model.components.map((c) =>
          c.id === action.componentId ? { ...c, apis: [...c.apis, api] } : c
        )
      }
    }

    case 'REMOVE_API': {
      return {
        ...model,
        components: model.components.map((c) =>
          c.id === action.componentId
            ? { ...c, apis: c.apis.filter((a) => a.id !== action.apiId) }
            : c
        )
      }
    }

    case 'ADD_ENVIRONMENT': {
      const environment: ArchEnvironment = {
        id: action.environment.id ?? uuidv4(),
        name: action.environment.name,
        description: action.environment.description ?? '',
        variables: action.environment.variables ?? {}
      }
      return { ...model, environments: [...model.environments, environment] }
    }

    case 'REMOVE_ENVIRONMENT': {
      return {
        ...model,
        environments: model.environments.filter((e) => e.id !== action.environmentId)
      }
    }

    case 'ADD_DECISION': {
      const decision: ArchDecision = {
        id: action.decision.id ?? uuidv4(),
        title: action.decision.title,
        context: action.decision.context ?? '',
        decision: action.decision.decision ?? '',
        consequences: action.decision.consequences ?? '',
        createdAt: action.decision.createdAt ?? new Date().toISOString()
      }
      return { ...model, decisions: [...model.decisions, decision] }
    }

    case 'UPDATE_METADATA': {
      return { ...model, metadata: { ...model.metadata, ...action.patch } }
    }

    default:
      return model
  }
}

/* ------------------------------------------------------------- projections */

/** Components that belong in a given view. */
export function componentsForView(
  model: ArchitectureModel,
  view: ArchViewId
): ArchComponent[] {
  const meta = ARCH_VIEWS.find((v) => v.id === view)
  if (!meta) return model.components

  return model.components.filter((component) => {
    // An explicit per-component view list always wins.
    if (component.views.length > 0) return component.views.includes(view)
    if (meta.categories.length === 0) return true
    return meta.categories.includes(component.category)
  })
}

/** Connections whose endpoints both survive the view filter. */
export function connectionsForView(
  model: ArchitectureModel,
  view: ArchViewId
): ArchConnection[] {
  const visible = new Set(componentsForView(model, view).map((c) => c.id))
  return model.connections.filter(
    (conn) =>
      visible.has(conn.from) &&
      visible.has(conn.to) &&
      (conn.views.length === 0 || conn.views.includes(view))
  )
}

/**
 * Positions components that have never been placed in this view. Uses a simple
 * category-banded grid so a freshly generated architecture is readable before
 * the user runs auto-layout.
 */
export function ensureLayout(
  components: ArchComponent[],
  view: ArchViewId
): Map<string, ArchPosition> {
  const bands = ['application', 'backend', 'ai', 'integration', 'database', 'infrastructure']
  const perBand = new Map<string, number>()
  const positions = new Map<string, ArchPosition>()

  for (const component of components) {
    const existing = component.layout[view]
    if (existing) {
      positions.set(component.id, existing)
      continue
    }
    const bandIndex = Math.max(0, bands.indexOf(component.category))
    const slot = perBand.get(component.category) ?? 0
    perBand.set(component.category, slot + 1)
    positions.set(component.id, { x: 80 + slot * 260, y: 80 + bandIndex * 180 })
  }

  return positions
}

/* --------------------------------------------------------------- utilities */

export interface ArchModelStats {
  components: number
  connections: number
  services: number
  databases: number
  integrations: number
  apis: number
  environments: number
}

export function getModelStats(model: ArchitectureModel): ArchModelStats {
  return {
    components: model.components.length,
    connections: model.connections.length,
    services: model.components.filter((c) => c.category === 'backend').length,
    databases: model.components.filter((c) => c.category === 'database').length,
    integrations: model.components.filter((c) => c.category === 'integration').length,
    apis: model.components.reduce((total, c) => total + c.apis.length, 0),
    environments: model.environments.length
  }
}

/** Free-text search across the model, used by the workspace search box. */
export interface ArchSearchHit {
  id: string
  label: string
  detail: string
  kind: 'component' | 'api' | 'connection' | 'technology' | 'environment'
  componentId?: string
}

export function searchModel(model: ArchitectureModel, query: string): ArchSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: ArchSearchHit[] = []

  for (const component of model.components) {
    const haystack = [component.name, component.description, component.technology, ...component.tags]
      .join(' ')
      .toLowerCase()
    if (haystack.includes(q)) {
      hits.push({
        id: component.id,
        label: component.name,
        detail: component.technology || component.description,
        kind: 'component',
        componentId: component.id
      })
    }

    for (const api of component.apis) {
      if (`${api.method} ${api.path}`.toLowerCase().includes(q)) {
        hits.push({
          id: api.id,
          label: `${api.method} ${api.path}`,
          detail: component.name,
          kind: 'api',
          componentId: component.id
        })
      }
    }
  }

  for (const tech of model.technologies) {
    if (`${tech.layer} ${tech.name}`.toLowerCase().includes(q)) {
      hits.push({ id: tech.id, label: tech.name, detail: tech.layer, kind: 'technology' })
    }
  }

  for (const env of model.environments) {
    if (env.name.toLowerCase().includes(q)) {
      hits.push({ id: env.id, label: env.name, detail: 'Environment', kind: 'environment' })
    }
  }

  return hits
}

/* -------------------------------------------------------- (de)serialization */

/**
 * Parses a persisted model defensively. Anything malformed falls back to an
 * empty model rather than crashing the editor.
 */
export function parseModel(raw: string | null | undefined): ArchitectureModel {
  if (!raw) return createEmptyModel()
  try {
    const parsed = JSON.parse(raw) as Partial<ArchitectureModel>
    return normalizeModel(parsed)
  } catch {
    return createEmptyModel()
  }
}

export function normalizeModel(input: Partial<ArchitectureModel>): ArchitectureModel {
  const base = createEmptyModel(input.metadata?.name, input.metadata?.systemType)
  return {
    version: input.version ?? ARCHITECTURE_MODEL_VERSION,
    metadata: {
      ...base.metadata,
      ...input.metadata,
      linkedDocumentIds: input.metadata?.linkedDocumentIds ?? []
    },
    components: (input.components ?? []).map((c) =>
      createComponent({ ...c, name: c.name ?? 'Component', kind: c.kind ?? 'backend-service' })
    ),
    connections: (input.connections ?? [])
      .filter((c) => c.from && c.to)
      .map((c) => createConnection({ ...c, from: c.from, to: c.to })),
    groups: input.groups ?? [],
    technologies: input.technologies ?? [],
    environments: input.environments ?? [],
    decisions: input.decisions ?? []
  }
}

export function serializeModel(model: ArchitectureModel): string {
  return JSON.stringify(model)
}
