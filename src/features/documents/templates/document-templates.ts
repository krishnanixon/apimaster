import type { DocumentStyle, DocumentType } from '@shared/types'
import {
  getSectionBlueprints,
  buildSectionScaffoldHtml,
  buildDocumentCreationPrompt,
  type DocumentPromptContext
} from '@shared/lib/document-prompts'
import { ensureSddFlowSlotsHtml } from '@shared/lib/architecture-to-sdd'

export type { DocumentPromptContext }
export { buildDocumentCreationPrompt, getSectionBlueprints }

export interface DocumentTemplateMeta {
  type: DocumentType
  label: string
  description: string
  category: string
  sections: string[]
  estimatedPages: number
  complexity: 'Low' | 'Medium' | 'High'
}

export const DOCUMENT_TEMPLATES: DocumentTemplateMeta[] = [
  {
    type: 'requirements',
    label: 'Requirements Specification',
    description:
      'Full SRS with introduction, functional & non-functional requirements, constraints, numbered REQ items, and acceptance criteria.',
    category: 'Requirements',
    sections: getSectionBlueprints('requirements').map((s) => s.title),
    estimatedPages: 16,
    complexity: 'High'
  },
  {
    type: 'functional',
    label: 'Functional Requirements',
    description:
      'Feature-level specification with workflows, UI behavior, business rules, data requirements, and integration touchpoints.',
    category: 'Requirements',
    sections: getSectionBlueprints('functional').map((s) => s.title),
    estimatedPages: 14,
    complexity: 'High'
  },
  {
    type: 'non_functional',
    label: 'Non-Functional Requirements',
    description:
      'Measurable quality attributes: performance, security, availability, compliance, and operational requirements.',
    category: 'Requirements',
    sections: getSectionBlueprints('non_functional').map((s) => s.title),
    estimatedPages: 12,
    complexity: 'Medium'
  },
  {
    type: 'user_stories',
    label: 'User Stories',
    description:
      'Agile backlog with personas, epics, prioritized stories, story points, and Given/When/Then acceptance criteria.',
    category: 'Agile',
    sections: getSectionBlueprints('user_stories').map((s) => s.title),
    estimatedPages: 10,
    complexity: 'Medium'
  },
  {
    type: 'api_spec',
    label: 'API Specification',
    description:
      'REST API reference with auth, endpoints, schemas, error codes, rate limits, and request/response examples.',
    category: 'Technical',
    sections: getSectionBlueprints('api_spec').map((s) => s.title),
    estimatedPages: 14,
    complexity: 'High'
  },
  {
    type: 'database_schema',
    label: 'Database Schema',
    description:
      'Data model with entities, table definitions, relationships, constraints, indexes, and data dictionary.',
    category: 'Technical',
    sections: getSectionBlueprints('database_schema').map((s) => s.title),
    estimatedPages: 12,
    complexity: 'High'
  },
  {
    type: 'architecture',
    label: 'System Architecture',
    description:
      'Solution architecture with components, data flows, integrations, deployment topology, and design decisions.',
    category: 'Technical',
    sections: getSectionBlueprints('architecture').map((s) => s.title),
    estimatedPages: 18,
    complexity: 'High'
  },
  {
    type: 'system_design',
    label: 'System Design Document',
    description:
      'Unified SDD with architecture prose plus embedded flowcharts for request and data flows.',
    category: 'Technical',
    sections: getSectionBlueprints('system_design').map((s) => s.title),
    estimatedPages: 22,
    complexity: 'High'
  },
  {
    type: 'timeline',
    label: 'Project Timeline',
    description:
      'Delivery plan with phases, milestones, dependencies, resource allocation, and schedule risk mitigations.',
    category: 'Planning',
    sections: getSectionBlueprints('timeline').map((s) => s.title),
    estimatedPages: 10,
    complexity: 'Medium'
  },
  {
    type: 'risks',
    label: 'Risk Assessment',
    description:
      'Risk register with probability/impact scoring, mitigation plans, owners, and contingency actions.',
    category: 'Governance',
    sections: getSectionBlueprints('risks').map((s) => s.title),
    estimatedPages: 12,
    complexity: 'Medium'
  },
  {
    type: 'testing',
    label: 'Testing Checklist',
    description:
      'Test strategy, detailed test cases, NFR testing, regression checklist, and release sign-off criteria.',
    category: 'QA',
    sections: getSectionBlueprints('testing').map((s) => s.title),
    estimatedPages: 16,
    complexity: 'High'
  },
  {
    type: 'prd',
    label: 'PRD (Product Requirements)',
    description:
      'Product-focused document with vision, personas, prioritized features, and a Now/Next/Later roadmap.',
    category: 'Quick Start',
    sections: getSectionBlueprints('prd').map((s) => s.title),
    estimatedPages: 10,
    complexity: 'Medium'
  },
  {
    type: 'proposal',
    label: 'Client Proposal',
    description:
      'Pre-sales proposal with solution overview, scope, timeline, pricing, and a clear call to action.',
    category: 'Quick Start',
    sections: getSectionBlueprints('proposal').map((s) => s.title),
    estimatedPages: 12,
    complexity: 'Medium'
  },
  {
    type: 'estimation_report',
    label: 'Estimation Report',
    description:
      'Effort and cost estimation with methodology, module breakdown, timeline, and risk contingency.',
    category: 'Quick Start',
    sections: getSectionBlueprints('estimation_report').map((s) => s.title),
    estimatedPages: 10,
    complexity: 'Medium'
  },
  {
    type: 'contract',
    label: 'Contract Agreement',
    description:
      'Contract-ready structure with party details, deliverables, commercial terms, and enforceable terms & conditions.',
    category: 'Legal',
    sections: getSectionBlueprints('contract').map((s) => s.title),
    estimatedPages: 14,
    complexity: 'High'
  },
  {
    type: 'discovery',
    label: 'Discovery Brief',
    description:
      'Problem, users, platforms, and open questions captured from an unstructured requirement — without inventing scope.',
    category: 'Discovery',
    sections: getSectionBlueprints('discovery').map((s) => s.title),
    estimatedPages: 8,
    complexity: 'Medium'
  },
  {
    type: 'brd',
    label: 'Business Requirements (BRD)',
    description:
      'Business objectives, stakeholders, business rules, and scope boundaries numbered separately from system features.',
    category: 'Requirements',
    sections: getSectionBlueprints('brd').map((s) => s.title),
    estimatedPages: 14,
    complexity: 'High'
  },
  {
    type: 'scope',
    label: 'Scope Document',
    description: 'In scope by phase, out of scope, future scope, and a change-request policy for later changes.',
    category: 'Planning',
    sections: getSectionBlueprints('scope').map((s) => s.title),
    estimatedPages: 10,
    complexity: 'Medium'
  },
  {
    type: 'product_definition',
    label: 'Product Definition',
    description: 'Configurable platforms, roles, permissions, modules, and features with requirement traceability.',
    category: 'Product',
    sections: getSectionBlueprints('product_definition').map((s) => s.title),
    estimatedPages: 12,
    complexity: 'High'
  },
  {
    type: 'ui_ux',
    label: 'UI/UX Specification',
    description: 'Screen inventory with states, validation, roles, and API dependencies. Framework-agnostic.',
    category: 'Design',
    sections: getSectionBlueprints('ui_ux').map((s) => s.title),
    estimatedPages: 14,
    complexity: 'High'
  },
  {
    type: 'technical_design',
    label: 'Technical Design',
    description: 'Technology registry and component design kept separate from business requirements. No secrets.',
    category: 'Technical',
    sections: getSectionBlueprints('technical_design').map((s) => s.title),
    estimatedPages: 16,
    complexity: 'High'
  },
  {
    type: 'uat',
    label: 'UAT Document',
    description: 'Acceptance scenarios traced to requirements, execution log, and final client sign-off.',
    category: 'QA',
    sections: getSectionBlueprints('uat').map((s) => s.title),
    estimatedPages: 12,
    complexity: 'Medium'
  },
  {
    type: 'deployment',
    label: 'Deployment Guide',
    description: 'Environments, deploy/rollback process, and operations. Credentials stay in a vault, not this doc.',
    category: 'Delivery',
    sections: getSectionBlueprints('deployment').map((s) => s.title),
    estimatedPages: 12,
    complexity: 'High'
  },
  {
    type: 'release_notes',
    label: 'Release Notes',
    description: 'Versioned features, fixes, breaking changes, and known issues linked to affected requirements.',
    category: 'Delivery',
    sections: getSectionBlueprints('release_notes').map((s) => s.title),
    estimatedPages: 6,
    complexity: 'Low'
  },
  {
    type: 'user_guide',
    label: 'User Guide',
    description: 'Getting started, feature and admin guides, FAQ, and troubleshooting generated from project data.',
    category: 'Documentation',
    sections: getSectionBlueprints('user_guide').map((s) => s.title),
    estimatedPages: 16,
    complexity: 'Medium'
  },
  {
    type: 'handover',
    label: 'Technical Handover',
    description: 'Maintainer pack: architecture, stack, data, APIs, runbook, and maintenance — never secrets.',
    category: 'Documentation',
    sections: getSectionBlueprints('handover').map((s) => s.title),
    estimatedPages: 18,
    complexity: 'High'
  },
  {
    type: 'change_request',
    label: 'Change Request',
    description: 'Impact-assessed scope change covering requirements, modules, APIs, data, UI, tests, and approval.',
    category: 'Governance',
    sections: getSectionBlueprints('change_request').map((s) => s.title),
    estimatedPages: 8,
    complexity: 'Medium'
  }
]

function today(): string {
  return new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export function buildDocumentHtml(
  type: DocumentType,
  title: string,
  projectName: string,
  style: DocumentStyle = 'professional',
  description = ''
): string {
  const meta = DOCUMENT_TEMPLATES.find((t) => t.type === type) ?? DOCUMENT_TEMPLATES[0]
  const date = today()
  const blueprints = getSectionBlueprints(type)

  const headerBlock =
    style === 'enterprise'
      ? `<p><strong>Classification:</strong> Internal Use</p><p><strong>Document ID:</strong> DOC-${Date.now().toString().slice(-6)}</p>`
      : ''

  const scopeBlock = description
    ? `<h2>Executive Summary</h2>
    <p>${escapeHtml(description)}</p>
    <p>This document provides a detailed specification for <strong>${escapeHtml(title)}</strong> as part of the <strong>${escapeHtml(projectName)}</strong> initiative. Complete each section below with project-specific requirements, acceptance criteria, and traceability information.</p>
    <hr />`
    : `<h2>Executive Summary</h2>
    <p>This document defines the detailed requirements and specifications for <strong>${escapeHtml(title)}</strong> within the <strong>${escapeHtml(projectName)}</strong> project. Replace scaffold content with finalized project details.</p>
    <hr />`

  const sectionsHtml = blueprints
    .map((blueprint, i) =>
      buildSectionScaffoldHtml(blueprint, i, {
        title,
        projectName,
        description
      })
    )
    .join('')

  let body = `
    <div class="doc-header-block">
      <p class="doc-meta"><strong>Project:</strong> ${escapeHtml(projectName)}</p>
      <p class="doc-meta"><strong>Document Type:</strong> ${escapeHtml(meta.label)}</p>
      <p class="doc-meta"><strong>Style:</strong> ${escapeHtml(style)}</p>
      <p class="doc-meta"><strong>Version:</strong> 1.0 &nbsp;|&nbsp; <strong>Date:</strong> ${date}</p>
      <p class="doc-meta"><strong>Status:</strong> Draft</p>
      ${headerBlock}
    </div>
    <hr />
    <h1>${escapeHtml(title)}</h1>
    <p><em>${escapeHtml(meta.description)}</em></p>
    <h2>Document Control</h2>
    <table>
      <tr><th>Field</th><th>Value</th></tr>
      <tr><td>Author</td><td>[Your Name]</td></tr>
      <tr><td>Reviewer</td><td>[Reviewer Name]</td></tr>
      <tr><td>Approver</td><td>[Approver Name]</td></tr>
      <tr><td>Last Updated</td><td>${date}</td></tr>
    </table>
    <h2>Revision History</h2>
    <table>
      <tr><th>Version</th><th>Date</th><th>Author</th><th>Changes</th></tr>
      <tr><td>1.0</td><td>${date}</td><td>[Author]</td><td>Initial detailed draft from template</td></tr>
    </table>
    <hr />
    <h2>Table of Contents</h2>
    <ol>
      <li>Executive Summary</li>
      ${blueprints.map((s) => `<li>${escapeHtml(s.title)}</li>`).join('')}
      <li>Approval</li>
    </ol>
    <hr />
    ${scopeBlock}
    ${sectionsHtml}
    <h2>Approval</h2>
    <table>
      <tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr>
      <tr><td>Business Owner</td><td></td><td></td><td></td></tr>
      <tr><td>Technical Lead</td><td></td><td></td><td></td></tr>
      <tr><td>QA Lead</td><td></td><td></td><td></td></tr>
    </table>
  `.trim()

  if (type === 'system_design') {
    body = ensureSddFlowSlotsHtml(body)
  }

  return body
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function getTemplateMeta(type: DocumentType): DocumentTemplateMeta {
  return DOCUMENT_TEMPLATES.find((t) => t.type === type) ?? DOCUMENT_TEMPLATES[0]
}

export function stripHtmlPreview(html: string, maxLength = 280): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
