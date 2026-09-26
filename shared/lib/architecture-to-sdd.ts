/**
 * Deterministic ArchitectureModel → System Design Document HTML.
 * Pure shared helper — no React / IPC. Flowchart slots are emitted as
 * `<div data-type="flow-block">` placeholders TipTap's flowBlock node parses.
 */

import type { ArchitectureModel } from '@shared/types/architecture'
import {
  getComponentKindMeta,
  getConnectionKindMeta
} from '@shared/lib/architecture-catalog'
import { DOCUMENT_TYPE_LABELS } from '@shared/lib/project-lifecycle'

export interface SddFlowSlot {
  /** Stable key used when creating/updating linked FlowDiagrams. */
  key: string
  title: string
  description?: string
}

export interface ArchitectureToSddOptions {
  projectName?: string
  documentTitle?: string
  /** Pre-created flow ids keyed by slot key. Missing keys still emit empty slots. */
  flowIds?: Partial<Record<string, string>>
  includeFlowSlots?: boolean
}

export const SDD_FLOW_SLOTS: SddFlowSlot[] = [
  {
    key: 'system-context',
    title: 'System Context Flow',
    description: 'Actors and external systems interacting with this architecture.'
  },
  {
    key: 'primary-request',
    title: 'Primary Request Flow',
    description: 'Happy-path request through the major components.'
  },
  {
    key: 'async-data',
    title: 'Async / Data Flow',
    description: 'Background jobs, messaging, and data-store interactions.'
  }
]

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function listOrDash(items: string[]): string {
  const cleaned = items.map((i) => i.trim()).filter(Boolean)
  if (cleaned.length === 0) return '<p><em>None recorded yet.</em></p>'
  return `<ul>${cleaned.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
}

function flowBlockHtml(slot: SddFlowSlot, flowId?: string): string {
  const idAttr = flowId ? ` data-flow-id="${escapeHtml(flowId)}"` : ' data-flow-id=""'
  return `<div data-type="flow-block"${idAttr} data-title="${escapeHtml(slot.title)}" data-height="360" data-slot-key="${escapeHtml(slot.key)}"></div>`
}

/**
 * Ensures SDD HTML contains flowchart slots under Data & Request Flows.
 * Safe to call on AI-generated HTML — skips slots that already exist.
 */
export function ensureSddFlowSlotsHtml(
  html: string,
  flowIds: Partial<Record<string, string>> = {}
): string {
  let next = html
  const missing = SDD_FLOW_SLOTS.filter((slot) => {
    if (flowIds[slot.key] && next.includes(`data-flow-id="${flowIds[slot.key]}"`)) return false
    if (next.includes(`data-slot-key="${slot.key}"`)) return false
    return true
  })
  if (missing.length === 0) return next

  const blocks = missing
    .map((slot) => {
      const desc = slot.description ? `<p>${escapeHtml(slot.description)}</p>` : ''
      return `<h3>${escapeHtml(slot.title)}</h3>${desc}${flowBlockHtml(slot, flowIds[slot.key])}`
    })
    .join('\n')

  const sectionHeading =
    /<h2[^>]*>\s*Data\s*&amp;\s*Request\s*Flows\s*<\/h2>/i.exec(next) ||
    /<h2[^>]*>\s*Data\s+and\s+Request\s+Flows\s*<\/h2>/i.exec(next) ||
    /<h2[^>]*>\s*Data\s*&amp;\s*Request\s*Flow\s*<\/h2>/i.exec(next)

  if (sectionHeading && sectionHeading.index != null) {
    const insertAt = sectionHeading.index + sectionHeading[0].length
    return `${next.slice(0, insertAt)}\n${blocks}\n${next.slice(insertAt)}`
  }

  return `${next}
<h2>Data &amp; Request Flows</h2>
<p>Design primary request and data flows using the embedded flowcharts below.</p>
${blocks}`
}

export function buildSddHtmlFromArchitecture(
  model: ArchitectureModel,
  options: ArchitectureToSddOptions = {}
): string {
  const projectName = options.projectName?.trim() || model.metadata.name || 'Project'
  const title =
    options.documentTitle?.trim() ||
    `${DOCUMENT_TYPE_LABELS.system_design} — ${model.metadata.name || projectName}`
  const includeFlows = options.includeFlowSlots !== false
  const flowIds = options.flowIds ?? {}
  const date = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const components = [...model.components].sort((a, b) => a.name.localeCompare(b.name))
  const connections = model.connections
  const byId = new Map(components.map((c) => [c.id, c]))

  const componentRows = components
    .map((c) => {
      const kindLabel = getComponentKindMeta(c.kind)?.label ?? c.kind
      return `<tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(kindLabel)}</td>
        <td>${escapeHtml(c.technology || '—')}</td>
        <td>${escapeHtml(c.description || c.responsibilities.join('; ') || '—')}</td>
      </tr>`
    })
    .join('')

  const connectionRows = connections
    .map((conn) => {
      const from = byId.get(conn.from)?.name ?? conn.from
      const to = byId.get(conn.to)?.name ?? conn.to
      const kindLabel = getConnectionKindMeta(conn.kind)?.label ?? conn.kind
      return `<tr>
        <td>${escapeHtml(from)}</td>
        <td>${escapeHtml(to)}</td>
        <td>${escapeHtml(kindLabel)}</td>
        <td>${escapeHtml(conn.protocol || conn.label || '—')}</td>
        <td>${escapeHtml(conn.auth || '—')}</td>
      </tr>`
    })
    .join('')

  const apiRows = components
    .flatMap((c) =>
      c.apis.map(
        (api) => `<tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(api.method)}</td>
          <td>${escapeHtml(api.path)}</td>
          <td>${escapeHtml(api.description || '—')}</td>
          <td>${escapeHtml(api.auth || '—')}</td>
        </tr>`
      )
    )
    .join('')

  const envBlocks = model.environments
    .map((env) => {
      const vars = Object.entries(env.variables)
      const varList =
        vars.length === 0
          ? '<p><em>No variables recorded (never store secrets here).</em></p>'
          : `<ul>${vars.map(([k, v]) => `<li><strong>${escapeHtml(k)}</strong>: ${escapeHtml(v)}</li>`).join('')}</ul>`
      return `<h3>${escapeHtml(env.name)}</h3>
        <p>${escapeHtml(env.description || '')}</p>
        ${varList}`
    })
    .join('')

  const decisions = model.decisions
    .map(
      (d) => `<h3>${escapeHtml(d.title)}</h3>
        <p><strong>Context:</strong> ${escapeHtml(d.context || '—')}</p>
        <p><strong>Decision:</strong> ${escapeHtml(d.decision || '—')}</p>
        <p><strong>Consequences:</strong> ${escapeHtml(d.consequences || '—')}</p>`
    )
    .join('')

  const techRows = model.technologies
    .map(
      (t) => `<tr>
        <td>${escapeHtml(t.layer)}</td>
        <td>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.status)}</td>
        <td>${escapeHtml(t.rationale || '—')}</td>
      </tr>`
    )
    .join('')

  const flowSection = includeFlows
    ? `<h2>Data &amp; Request Flows</h2>
      <p>Use the embedded flowcharts below to design and refine runtime behaviour. Open any diagram in Flow Designer for the full palette and AI tools.</p>
      ${SDD_FLOW_SLOTS.map((slot) => {
        const desc = slot.description ? `<p>${escapeHtml(slot.description)}</p>` : ''
        return `<h3>${escapeHtml(slot.title)}</h3>${desc}${flowBlockHtml(slot, flowIds[slot.key])}`
      }).join('\n')}`
    : ''

  return `
    <p><strong>Project:</strong> ${escapeHtml(projectName)} &nbsp;|&nbsp;
       <strong>Type:</strong> ${escapeHtml(DOCUMENT_TYPE_LABELS.system_design)} &nbsp;|&nbsp;
       <strong>Date:</strong> ${escapeHtml(date)} &nbsp;|&nbsp;
       <strong>Status:</strong> Draft</p>
    <hr />
    <h1>${escapeHtml(title)}</h1>
    <p><em>Generated from Architecture Designer model “${escapeHtml(model.metadata.name)}”.</em></p>

    <h2>Overview</h2>
    <h3>Purpose</h3>
    <p>${escapeHtml(model.metadata.description || 'Describe the purpose of this system design.')}</p>
    <h3>Goals &amp; Quality Attributes</h3>
    <p>${escapeHtml(model.metadata.requirements || 'Capture architecture goals and quality attributes from project knowledge.')}</p>
    <h3>Scope</h3>
    <p>System type: <strong>${escapeHtml(model.metadata.systemType || 'web')}</strong>. Components: ${components.length}. Connections: ${connections.length}.</p>

    <h2>System Context &amp; High-Level Design</h2>
    <h3>System Context</h3>
    <p>External integrations and application surfaces that bound this system:</p>
    ${listOrDash(
      components
        .filter((c) => c.category === 'integration' || c.category === 'application')
        .map((c) => `${c.name} (${getComponentKindMeta(c.kind)?.label ?? c.kind})`)
    )}
    <h3>High-Level Architecture</h3>
    <p>Backend and infrastructure building blocks:</p>
    ${listOrDash(
      components
        .filter((c) => c.category === 'backend' || c.category === 'infrastructure' || c.category === 'database')
        .map((c) => `${c.name} — ${c.technology || getComponentKindMeta(c.kind)?.label || c.kind}`)
    )}

    <h2>Components &amp; Responsibilities</h2>
    <table>
      <tr><th>Component</th><th>Kind</th><th>Technology</th><th>Responsibility</th></tr>
      ${componentRows || '<tr><td colspan="4"><em>No components in the model yet.</em></td></tr>'}
    </table>
    ${
      techRows
        ? `<h3>Technology Registry</h3>
           <table>
             <tr><th>Layer</th><th>Technology</th><th>Status</th><th>Rationale</th></tr>
             ${techRows}
           </table>`
        : ''
    }

    ${flowSection}

    <h2>APIs &amp; Integrations</h2>
    <h3>Internal APIs</h3>
    <table>
      <tr><th>Component</th><th>Method</th><th>Path</th><th>Description</th><th>Auth</th></tr>
      ${apiRows || '<tr><td colspan="5"><em>No API endpoints recorded on components.</em></td></tr>'}
    </table>
    <h3>Connections</h3>
    <table>
      <tr><th>From</th><th>To</th><th>Kind</th><th>Protocol</th><th>Auth</th></tr>
      ${connectionRows || '<tr><td colspan="5"><em>No connections in the model yet.</em></td></tr>'}
    </table>

    <h2>Security &amp; Environments</h2>
    <h3>Authentication &amp; Authorization</h3>
    ${listOrDash(
      components
        .filter((c) => c.security.authentication || c.security.authorization)
        .map(
          (c) =>
            `${c.name}: authn=${c.security.authentication || '—'}, authz=${c.security.authorization || '—'}`
        )
    )}
    <h3>Environments</h3>
    ${envBlocks || '<p><em>No environments defined yet.</em></p>'}

    <h2>Deployment &amp; Observability</h2>
    <p>Infrastructure components:</p>
    ${listOrDash(
      components
        .filter((c) => c.category === 'infrastructure')
        .map((c) => `${c.name} (${c.technology || c.kind})`)
    )}
    <p>Document CI/CD, monitoring, and alerting in this section as decisions are finalized. Never include secrets.</p>

    <h2>Design Decisions &amp; Open Questions</h2>
    ${decisions || '<p><em>No ADRs recorded yet. Add decisions in Architecture Designer.</em></p>'}
    <h3>Open Questions</h3>
    <table>
      <tr><th>Question</th><th>Reason</th><th>Affected Area</th><th>Priority</th><th>Status</th></tr>
      <tr><td colspan="5"><em>Add open questions as gaps are discovered.</em></td></tr>
    </table>
  `.trim()
}
