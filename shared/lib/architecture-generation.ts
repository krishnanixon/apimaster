/**
 * Architecture Designer — translation layer between raw AI output and the model.
 *
 * Models produce plausible-looking JSON that is rarely exactly on-schema: kinds
 * get invented, connections point at component *names* instead of ids, and
 * whole sections go missing. Everything here is deliberately forgiving — an
 * unusable field is dropped rather than allowed to break generation.
 *
 * Pure functions only, so both the main process and the tests can use them.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  ArchApiEndpoint,
  ArchActionProposal,
  ArchComponent,
  ArchComponentCategory,
  ArchComponentKind,
  ArchConnection,
  ArchConnectionKind,
  ArchitectureAction,
  ArchitectureActionType,
  ArchitectureModel
} from '@shared/types/architecture'
import {
  ARCH_COMPONENT_KINDS,
  ARCH_CONNECTION_KINDS,
  getKindsByCategory
} from '@shared/lib/architecture-catalog'
import { createComponent, createConnection, createEmptyModel } from '@shared/lib/architecture-model'

/* ------------------------------------------------------------------ shapes */

/** The loose JSON contract we ask the model for. Every field is optional. */
export interface ArchitectureDraft {
  name?: string
  systemType?: string
  description?: string
  summary?: string
  components?: ArchitectureDraftComponent[]
  connections?: ArchitectureDraftConnection[]
  technologies?: Array<{ layer?: string; name?: string; rationale?: string; alternatives?: string[] }>
  environments?: Array<{ name?: string; description?: string }>
  decisions?: Array<{ title?: string; context?: string; decision?: string; consequences?: string }>
}

export interface ArchitectureDraftComponent {
  name?: string
  kind?: string
  category?: string
  technology?: string
  description?: string
  responsibilities?: string[]
  inputs?: string[]
  outputs?: string[]
  datastores?: string[]
  tags?: string[]
  apis?: Array<{ method?: string; path?: string; description?: string; auth?: string }>
  security?: { authentication?: string; authorization?: string; encryption?: string; notes?: string }
}

export interface ArchitectureDraftConnection {
  from?: string
  to?: string
  kind?: string
  label?: string
  description?: string
  protocol?: string
  async?: boolean
  bidirectional?: boolean
  auth?: string
  dataShape?: string
}

export interface BuiltArchitecture {
  model: ArchitectureModel
  summary: string
}

/* --------------------------------------------------------------- utilities */

/** Models like wrapping JSON in markdown fences even when told not to. */
export function stripCodeFence(raw: string): string {
  const text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (fenced ? fenced[1] : text).trim()
}

export function parseJsonObject<T>(raw: string): T {
  const text = stripCodeFence(raw)
  try {
    return JSON.parse(text) as T
  } catch {
    // Salvage the outermost object when the model prepends prose.
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T
    }
    throw new Error('The AI response was not valid JSON.')
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

const KIND_BY_KEY = new Map<string, ArchComponentKind>(
  ARCH_COMPONENT_KINDS.flatMap((meta) => [
    [normalizeKey(meta.kind), meta.kind] as const,
    [normalizeKey(meta.label), meta.kind] as const
  ])
)

const CONNECTION_KIND_BY_KEY = new Map<string, ArchConnectionKind>(
  ARCH_CONNECTION_KINDS.flatMap((meta) => [
    [normalizeKey(meta.kind), meta.kind] as const,
    [normalizeKey(meta.label), meta.kind] as const
  ])
)

const CATEGORIES: ArchComponentCategory[] = [
  'application',
  'backend',
  'database',
  'infrastructure',
  'integration',
  'ai'
]

/**
 * Resolves whatever the model called a component kind. Falls back to the first
 * kind of a named category, then to a generic backend service, so a creative
 * label never costs us the component.
 */
export function resolveComponentKind(kind?: string, category?: string): ArchComponentKind {
  if (kind) {
    const direct = KIND_BY_KEY.get(normalizeKey(kind))
    if (direct) return direct
  }

  const categoryKey = category ? normalizeKey(category) : ''
  const matchedCategory = CATEGORIES.find((item) => normalizeKey(item) === categoryKey)
  if (matchedCategory) {
    const [first] = getKindsByCategory(matchedCategory)
    if (first) return first.kind
  }

  return 'backend-service'
}

export function resolveConnectionKind(kind?: string): ArchConnectionKind {
  if (!kind) return 'https'
  return CONNECTION_KIND_BY_KEY.get(normalizeKey(kind)) ?? 'https'
}

/* ------------------------------------------------------------ construction */

function buildComponents(draft: ArchitectureDraft): ArchComponent[] {
  const seen = new Set<string>()

  return (draft.components ?? []).reduce<ArchComponent[]>((components, raw) => {
    const name = raw?.name?.trim()
    if (!name) return components

    const key = normalizeKey(name)
    if (seen.has(key)) return components
    seen.add(key)

    const apis: ArchApiEndpoint[] = (raw.apis ?? [])
      .filter((api) => api?.path)
      .map((api) => ({
        id: uuidv4(),
        method: (api.method ?? 'GET').toUpperCase(),
        path: api.path!,
        description: api.description ?? '',
        auth: api.auth ?? ''
      }))

    components.push(
      createComponent({
        name,
        kind: resolveComponentKind(raw.kind, raw.category),
        technology: raw.technology?.trim() || undefined,
        description: raw.description?.trim() ?? '',
        responsibilities: asStringArray(raw.responsibilities),
        inputs: asStringArray(raw.inputs),
        outputs: asStringArray(raw.outputs),
        datastores: asStringArray(raw.datastores),
        tags: asStringArray(raw.tags),
        apis,
        security: {
          authentication: raw.security?.authentication ?? '',
          authorization: raw.security?.authorization ?? '',
          encryption: raw.security?.encryption ?? '',
          notes: raw.security?.notes ?? ''
        }
      })
    )
    return components
  }, [])
}

function buildConnections(
  draft: ArchitectureDraft,
  components: ArchComponent[]
): ArchConnection[] {
  const byName = new Map(components.map((component) => [normalizeKey(component.name), component.id]))
  const byId = new Set(components.map((component) => component.id))
  const pairs = new Set<string>()

  const resolve = (ref?: string): string | undefined => {
    if (!ref) return undefined
    if (byId.has(ref)) return ref
    return byName.get(normalizeKey(ref))
  }

  return (draft.connections ?? []).reduce<ArchConnection[]>((connections, raw) => {
    const from = resolve(raw?.from)
    const to = resolve(raw?.to)
    // Dangling or self-referencing edges would render as broken arrows.
    if (!from || !to || from === to) return connections

    const pair = `${from}->${to}`
    if (pairs.has(pair)) return connections
    pairs.add(pair)

    connections.push(
      createConnection({
        from,
        to,
        kind: resolveConnectionKind(raw.kind),
        label: raw.label?.trim() ?? '',
        description: raw.description?.trim() ?? '',
        protocol: raw.protocol?.trim() ?? '',
        async: Boolean(raw.async),
        bidirectional: Boolean(raw.bidirectional),
        auth: raw.auth?.trim() ?? '',
        dataShape: raw.dataShape?.trim() ?? ''
      })
    )
    return connections
  }, [])
}

/** Turns a validated draft into a complete model, preserving nothing invalid. */
export function buildModelFromDraft(
  draft: ArchitectureDraft,
  fallback: { name: string; systemType: string; requirements?: string; linkedDocumentIds?: string[] }
): BuiltArchitecture {
  const model = createEmptyModel(draft.name?.trim() || fallback.name, draft.systemType?.trim() || fallback.systemType)
  const components = buildComponents(draft)

  model.components = components
  model.connections = buildConnections(draft, components)

  model.technologies = (draft.technologies ?? [])
    .filter((tech) => tech?.name)
    .map((tech) => ({
      id: uuidv4(),
      layer: tech.layer?.trim() || 'general',
      name: tech.name!.trim(),
      rationale: tech.rationale?.trim() ?? '',
      status: 'suggested' as const,
      alternatives: asStringArray(tech.alternatives)
    }))

  model.environments = (draft.environments ?? [])
    .filter((env) => env?.name)
    .map((env) => ({
      id: uuidv4(),
      name: env.name!.trim(),
      description: env.description?.trim() ?? '',
      variables: {}
    }))

  const now = new Date().toISOString()
  model.decisions = (draft.decisions ?? [])
    .filter((decision) => decision?.title)
    .map((decision) => ({
      id: uuidv4(),
      title: decision.title!.trim(),
      context: decision.context?.trim() ?? '',
      decision: decision.decision?.trim() ?? '',
      consequences: decision.consequences?.trim() ?? '',
      createdAt: now
    }))

  model.metadata = {
    ...model.metadata,
    description: draft.description?.trim() ?? '',
    requirements: fallback.requirements ?? '',
    linkedDocumentIds: fallback.linkedDocumentIds ?? [],
    updatedAt: now
  }

  return {
    model,
    summary: draft.summary?.trim() || `Generated ${components.length} components and ${model.connections.length} connections.`
  }
}

/* -------------------------------------------------------- assistant actions */

const ACTION_TYPES = new Set<ArchitectureActionType>([
  'ADD_COMPONENT',
  'REMOVE_COMPONENT',
  'UPDATE_COMPONENT',
  'MOVE_COMPONENT',
  'CONNECT_COMPONENTS',
  'DISCONNECT_COMPONENTS',
  'UPDATE_CONNECTION',
  'ADD_GROUP',
  'REMOVE_GROUP',
  'GROUP_COMPONENTS',
  'CHANGE_TECHNOLOGY',
  'ADD_TECHNOLOGY',
  'UPDATE_TECHNOLOGY',
  'ADD_API',
  'REMOVE_API',
  'ADD_ENVIRONMENT',
  'REMOVE_ENVIRONMENT',
  'ADD_DECISION',
  'UPDATE_METADATA'
])

/**
 * Filters proposed actions down to ones that are safe to apply: known action
 * type, and every component/connection reference resolves against the current
 * model. Component references may be names, which are rewritten to ids.
 */
export function sanitizeActions(
  rawActions: unknown,
  model: ArchitectureModel
): ArchitectureAction[] {
  if (!Array.isArray(rawActions)) return []

  const byId = new Set(model.components.map((component) => component.id))
  const byName = new Map(
    model.components.map((component) => [normalizeKey(component.name), component.id])
  )
  const connectionIds = new Set(model.connections.map((connection) => connection.id))

  const resolveComponent = (ref: unknown): string | undefined => {
    if (typeof ref !== 'string') return undefined
    if (byId.has(ref)) return ref
    return byName.get(normalizeKey(ref))
  }

  const actions: ArchitectureAction[] = []

  for (const entry of rawActions) {
    if (!entry || typeof entry !== 'object') continue
    const action = entry as Record<string, unknown>
    const type = action['type']
    if (typeof type !== 'string' || !ACTION_TYPES.has(type as ArchitectureActionType)) continue

    switch (type) {
      case 'ADD_COMPONENT': {
        const component = action['component'] as ArchitectureDraftComponent | undefined
        const name = component?.name?.trim()
        if (!name) continue
        actions.push({
          type: 'ADD_COMPONENT',
          component: {
            name,
            kind: resolveComponentKind(component?.kind, component?.category),
            technology: component?.technology?.trim() ?? '',
            description: component?.description?.trim() ?? '',
            responsibilities: asStringArray(component?.responsibilities)
          }
        })
        break
      }

      case 'REMOVE_COMPONENT': {
        const componentId = resolveComponent(action['componentId'])
        if (componentId) actions.push({ type: 'REMOVE_COMPONENT', componentId })
        break
      }

      case 'UPDATE_COMPONENT': {
        const componentId = resolveComponent(action['componentId'])
        const patch = action['patch']
        if (componentId && patch && typeof patch === 'object') {
          actions.push({
            type: 'UPDATE_COMPONENT',
            componentId,
            patch: patch as Partial<ArchComponent>
          })
        }
        break
      }

      case 'CONNECT_COMPONENTS': {
        const connection = action['connection'] as ArchitectureDraftConnection | undefined
        const from = resolveComponent(connection?.from)
        const to = resolveComponent(connection?.to)
        if (!from || !to || from === to) continue
        actions.push({
          type: 'CONNECT_COMPONENTS',
          connection: {
            from,
            to,
            kind: resolveConnectionKind(connection?.kind),
            label: connection?.label?.trim() ?? '',
            description: connection?.description?.trim() ?? '',
            async: Boolean(connection?.async)
          }
        })
        break
      }

      case 'DISCONNECT_COMPONENTS': {
        const connectionId = action['connectionId']
        if (typeof connectionId === 'string' && connectionIds.has(connectionId)) {
          actions.push({ type: 'DISCONNECT_COMPONENTS', connectionId })
        }
        break
      }

      case 'CHANGE_TECHNOLOGY': {
        const componentId = resolveComponent(action['componentId'])
        const technology = action['technology']
        if (componentId && typeof technology === 'string' && technology.trim()) {
          actions.push({ type: 'CHANGE_TECHNOLOGY', componentId, technology: technology.trim() })
        }
        break
      }

      case 'ADD_API': {
        const componentId = resolveComponent(action['componentId'])
        const api = action['api'] as { method?: string; path?: string; description?: string } | undefined
        if (componentId && api?.path) {
          actions.push({
            type: 'ADD_API',
            componentId,
            api: {
              method: (api.method ?? 'GET').toUpperCase(),
              path: api.path,
              description: api.description ?? ''
            }
          })
        }
        break
      }

      case 'ADD_ENVIRONMENT': {
        const environment = action['environment'] as { name?: string; description?: string } | undefined
        if (environment?.name) {
          actions.push({
            type: 'ADD_ENVIRONMENT',
            environment: { name: environment.name, description: environment.description ?? '' }
          })
        }
        break
      }

      case 'ADD_DECISION': {
        const decision = action['decision'] as
          | { title?: string; context?: string; decision?: string; consequences?: string }
          | undefined
        if (decision?.title) {
          actions.push({
            type: 'ADD_DECISION',
            decision: {
              title: decision.title,
              context: decision.context ?? '',
              decision: decision.decision ?? '',
              consequences: decision.consequences ?? ''
            }
          })
        }
        break
      }

      case 'UPDATE_METADATA': {
        const patch = action['patch']
        if (patch && typeof patch === 'object') {
          const { description, requirements, systemType, name } = patch as Record<string, unknown>
          actions.push({
            type: 'UPDATE_METADATA',
            patch: {
              ...(typeof name === 'string' ? { name } : {}),
              ...(typeof description === 'string' ? { description } : {}),
              ...(typeof requirements === 'string' ? { requirements } : {}),
              ...(typeof systemType === 'string' ? { systemType } : {})
            }
          })
        }
        break
      }

      default:
        // Remaining action types need editor-local context (layout, groups),
        // so they are not accepted from the model.
        break
    }
  }

  return actions
}

/** Human-readable one-liner for a proposed action, used by the review list. */
export function describeAction(action: ArchitectureAction, model: ArchitectureModel): string {
  const nameOf = (id: string): string =>
    model.components.find((component) => component.id === id)?.name ?? 'component'

  switch (action.type) {
    case 'ADD_COMPONENT':
      return `Add ${action.component.name}`
    case 'REMOVE_COMPONENT':
      return `Remove ${nameOf(action.componentId)}`
    case 'UPDATE_COMPONENT':
      return `Update ${nameOf(action.componentId)}`
    case 'CONNECT_COMPONENTS':
      return `Connect ${nameOf(action.connection.from)} to ${nameOf(action.connection.to)}`
    case 'DISCONNECT_COMPONENTS':
      return 'Remove a connection'
    case 'CHANGE_TECHNOLOGY':
      return `Set ${nameOf(action.componentId)} technology to ${action.technology}`
    case 'ADD_API':
      return `Add ${action.api.method} ${action.api.path} to ${nameOf(action.componentId)}`
    case 'ADD_ENVIRONMENT':
      return `Add environment ${action.environment.name}`
    case 'ADD_DECISION':
      return `Record decision "${action.decision.title}"`
    case 'UPDATE_METADATA':
      return 'Update architecture details'
    default:
      return action.type
  }
}

export function buildProposal(
  raw: { summary?: string; rationale?: string; actions?: unknown },
  model: ArchitectureModel
): ArchActionProposal {
  return {
    id: `proposal-${Date.now()}`,
    summary: raw.summary?.trim() || 'Proposed architecture changes',
    rationale: raw.rationale?.trim() || '',
    actions: sanitizeActions(raw.actions, model)
  }
}
