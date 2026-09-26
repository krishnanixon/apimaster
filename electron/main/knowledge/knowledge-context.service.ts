import type { KnowledgeBundle, KnowledgeContext } from '@shared/types'
import { knowledgeRepository } from '../repositories/knowledge.repository'

function parseJsonArray(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

function truncate(text: string, max = 260): string {
  const t = (text ?? '').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Turn a value that may be JSON (array/object) or a delimited string into a flat list. */
function asItems(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean)
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(
        ([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`
      )
    }
  } catch {
    /* not JSON — fall through to delimiter split */
  }
  return trimmed
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Build a `- item` bulleted block from a list, capping length to keep the prompt bounded. */
function bulletList(items: string[], cap = 40): string {
  if (!items.length) return ''
  const shown = items.slice(0, cap)
  const extra = items.length - shown.length
  const body = shown.map((i) => `- ${i}`).join('\n')
  return extra > 0 ? `${body}\n- …and ${extra} more` : body
}

/** Compose a titled markdown-ish block, or '' when the body is empty. */
function section(title: string, body: string): string {
  const trimmed = (body ?? '').trim()
  if (!trimmed || trimmed === 'None') return ''
  return `## ${title}\n${trimmed}`
}

export async function buildKnowledgeContext(
  projectId: string,
  options?: { detailed?: boolean }
): Promise<KnowledgeContext> {
  const bundle = await knowledgeRepository.loadBundle(projectId)
  return formatKnowledgeContext(bundle, options)
}

export function formatKnowledgeContext(
  bundle: KnowledgeBundle,
  options?: { detailed?: boolean }
): KnowledgeContext {
  const detailed = options?.detailed ?? false
  const overview = bundle.overview

  const businessSummary = [
    overview?.projectSummary && `Summary: ${overview.projectSummary}`,
    overview?.industry && `Industry: ${overview.industry}`,
    overview?.businessType && `Business type: ${overview.businessType}`,
    overview?.targetUsers && `Users: ${overview.targetUsers}`,
    overview?.vision && `Vision: ${overview.vision}`,
    overview?.scope && `Scope: ${overview.scope}`,
    overview?.outOfScope && `Out of scope: ${overview.outOfScope}`,
    parseJsonArray(overview?.goals ?? '').length
      ? `Goals: ${parseJsonArray(overview?.goals ?? '').join('; ')}`
      : '',
    parseJsonArray(overview?.objectives ?? '').length
      ? `Objectives: ${parseJsonArray(overview?.objectives ?? '').join('; ')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n')

  const modules = bundle.modules.length
    ? bundle.modules
        .map((m) => {
          const feats = bundle.features
            .filter((f) => f.moduleId === m.id)
            .map((f) => f.title)
          const featStr = feats.length ? ` — features: ${feats.join(', ')}` : ''
          const meta = [m.priority && `priority: ${m.priority}`, m.status && `status: ${m.status}`]
            .filter(Boolean)
            .join(', ')
          return `- ${m.title}${m.description ? `: ${truncate(m.description)}` : ''}${meta ? ` (${meta})` : ''}${featStr}`
        })
        .join('\n')
    : 'None'

  const features = bundle.features.length
    ? bulletList(
        bundle.features.map((f) => {
          const mod = bundle.modules.find((m) => m.id === f.moduleId)
          const meta = [f.priority && `priority: ${f.priority}`, f.complexity && `complexity: ${f.complexity}`]
            .filter(Boolean)
            .join(', ')
          return `${f.title}${mod ? ` [${mod.title}]` : ''}${f.description ? `: ${truncate(f.description, 160)}` : ''}${meta ? ` (${meta})` : ''}`
        }),
        60
      )
    : ''

  const requirements = bundle.requirements.length
    ? bulletList(
        bundle.requirements.map((r) => {
          const ac = truncate(asItems(r.acceptanceCriteria).join('; '), 200)
          const meta = [r.type && r.type.replace('_', ' '), r.priority && `priority: ${r.priority}`]
            .filter(Boolean)
            .join(', ')
          return `${r.code ? `${r.code} ` : ''}${r.title}${r.description ? `: ${truncate(r.description, 180)}` : ''}${meta ? ` (${meta})` : ''}${ac ? ` | Acceptance: ${ac}` : ''}`
        }),
        60
      )
    : ''

  const roles = bundle.roles.length
    ? bundle.roles
        .map((r) => {
          const perms = asItems(r.permissions)
          const restrictions = asItems(r.restrictions)
          return `- ${r.name}${r.description ? `: ${truncate(r.description, 180)}` : ''}${
            perms.length ? ` | Permissions: ${truncate(perms.join(', '), 200)}` : ''
          }${restrictions.length ? ` | Restrictions: ${truncate(restrictions.join(', '), 160)}` : ''}`
        })
        .join('\n')
    : ''

  const database = bundle.entities.length
    ? bundle.entities
        .map((e) => {
          const fields = asItems(e.fields)
          const rels = asItems(e.relationships)
          return `- ${e.name}${fields.length ? ` — fields: ${truncate(fields.join(', '), 220)}` : ''}${
            rels.length ? ` | relationships: ${truncate(rels.join(', '), 160)}` : ''
          }`
        })
        .join('\n')
    : ''

  const apis = bundle.apiEndpoints.length
    ? bulletList(
        bundle.apiEndpoints.map(
          (a) =>
            `${a.method} ${a.path}${a.description ? ` — ${truncate(a.description, 140)}` : ''}${
              a.authentication ? ` (auth: ${a.authentication})` : ''
            }`
        ),
        50
      )
    : ''

  const integrations = bundle.integrations.length
    ? bundle.integrations
        .map(
          (i) =>
            `- ${i.name}${i.type ? ` [${i.type}]` : ''}${i.description ? `: ${truncate(i.description, 160)}` : ''}`
        )
        .join('\n')
    : ''

  const businessRules = bundle.businessRules.length
    ? bulletList(
        bundle.businessRules.map(
          (b) => `${b.title}${b.description ? `: ${truncate(b.description, 180)}` : ''}`
        ),
        50
      )
    : ''

  const risks = bundle.risks.length
    ? bundle.risks
        .map((r) => {
          const meta = [r.severity && `severity: ${r.severity}`, r.likelihood && `likelihood: ${r.likelihood}`]
            .filter(Boolean)
            .join(', ')
          return `- ${r.title}${r.description ? `: ${truncate(r.description, 160)}` : ''}${meta ? ` (${meta})` : ''}${
            r.mitigation ? ` | Mitigation: ${truncate(r.mitigation, 160)}` : ''
          }`
        })
        .join('\n')
    : ''

  const assumptions = bundle.assumptions.length
    ? bulletList(
        bundle.assumptions.map(
          (a) => `${a.title}${a.description ? `: ${truncate(a.description, 160)}` : ''}`
        ),
        40
      )
    : ''

  const decisions = bundle.decisions.length
    ? bundle.decisions
        .map(
          (d) =>
            `- ${d.title}${d.category ? ` [${d.category}]` : ''}: ${truncate(d.decision, 180)}${
              d.reason ? ` (why: ${truncate(d.reason, 140)})` : ''
            }`
        )
        .join('\n')
    : ''

  const stakeholders = bundle.stakeholders.length
    ? bundle.stakeholders
        .map(
          (s) =>
            `- ${s.name}${s.role ? ` — ${s.role}` : ''}${
              s.responsibilities ? `: ${truncate(s.responsibilities, 160)}` : ''
            }`
        )
        .join('\n')
    : ''

  const workflows = bundle.workflows.length
    ? bulletList(
        bundle.workflows.map(
          (w) => `${w.title}${w.description ? `: ${truncate(w.description, 160)}` : ''}`
        ),
        30
      )
    : ''

  const constraints = overview?.scope ? `Scope: ${overview.scope}` : ''

  // Brief context — used by chat and lightweight consumers to keep tokens low.
  const briefFormatted = [
    '=== PROJECT KNOWLEDGE (brief) ===',
    '',
    businessSummary || 'No basics defined yet.',
    '',
    'Modules:',
    modules,
    '',
    'Requirements:',
    requirements || 'None'
  ].join('\n')

  // Detailed context — grounds document generation in the FULL knowledge base.
  const detailedFormatted = [
    '=== PROJECT KNOWLEDGE BASE (authoritative — ground the document in this) ===',
    section('Business Overview', businessSummary || 'No basics defined yet.'),
    section('Stakeholders', stakeholders),
    section('User Roles & Permissions', roles),
    section('Modules', modules),
    section('Features', features),
    section('Requirements', requirements),
    section('Business Rules', businessRules),
    section('Workflows', workflows),
    section('Data Model / Entities', database),
    section('API Endpoints', apis),
    section('Integrations', integrations),
    section('Risks', risks),
    section('Assumptions', assumptions),
    section('Key Decisions', decisions)
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    businessSummary: businessSummary || 'Not defined',
    modules,
    features,
    requirements: requirements || 'None',
    roles,
    database,
    apis,
    risks,
    businessRules,
    constraints,
    assumptions,
    integrations,
    decisions,
    formatted: detailed ? detailedFormatted : briefFormatted
  }
}
