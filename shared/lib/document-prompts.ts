import type { DocumentLength, DocumentStyle, DocumentType } from '../types'
import { formatGenerationRulesForPrompt } from './document-generation-rules'

export interface SectionBlueprint {
  title: string
  subsections: string[]
  guidance: string
}

export interface DocumentPromptContext {
  projectName: string
  projectDescription?: string
  documentTitle: string
  documentDescription?: string
  type: DocumentType
  style: DocumentStyle
  businessGoals?: string
  targetAudience?: string
  modules?: string
  userRoles?: string
  features?: string
  integrations?: string
  techStack?: string
  additionalNotes?: string
  documentLength?: DocumentLength
  wordTarget?: number
  selectedModules?: string
  selectedFeatures?: string
  typeSupportingPrompts?: string
  contractTemplate?: string
  contractTerms?: string
  contractConditions?: string
}

function lengthInstruction(length: DocumentLength | undefined, wordTarget: number | undefined, style: DocumentStyle): string {
  const target = wordTarget ?? 4000
  const base = `Target document length: approximately ${target.toLocaleString()} words. Expand every section proportionally to meet this target with substantive content — not filler.`

  if (style === 'chatgpt') {
    return `${base}
For ChatGPT-style output: use clear section headings, 2–4 sentence paragraphs, bullet lists for requirements and criteria, occasional callout-style bold labels (e.g. **Priority:** High). Include an executive summary at the top, detailed subsections for each module/feature in scope, numbered requirements where appropriate, acceptance criteria blocks, and a brief conclusion. Make it read like a premium ChatGPT deep-dive — thorough, scannable, and professionally conversational.`
  }

  const depthByLength: Record<string, string> = {
    concise: 'Keep sections focused; 2–3 bullets or short paragraphs per subsection.',
    standard: 'Balanced depth: 3–5 bullets or 1–2 paragraphs per subsection.',
    detailed: 'Rich depth: 4–8 bullets or 2–4 paragraphs per subsection; include examples.',
    comprehensive: 'Maximum depth: full paragraphs, tables, numbered items, examples, and edge cases for every subsection.',
    custom: 'Match depth to the custom word target above.'
  }

  return `${base}\n${depthByLength[length ?? 'detailed'] ?? depthByLength.detailed}`
}

const DETAIL_LEVEL: Record<DocumentStyle, string> = {
  basic:
    'Produce a clear, concise document with bullet points. Cover all sections but keep each subsection to 2–4 bullets.',
  professional:
    'Produce a thorough, professional document. Each major section needs 2–4 subsections with numbered requirements (REQ-001 format), acceptance criteria, and priority (Must/Should/Could). Aim for substantive paragraphs, not placeholders.',
  enterprise:
    'Produce an enterprise-grade document with executive summary, traceability IDs, compliance notes, RACI references, and formal tables. Each section must include detailed subsections, numbered requirements, dependencies, risks, and measurable acceptance criteria. Minimum depth: 3–5 paragraphs or equivalent tables per major section.',
  chatgpt:
    'Produce a polished, detailed document in ChatGPT style: conversational but professional, with clear h1/h2/h3 hierarchy, generous whitespace, bullet lists, and numbered requirements where relevant. Each section should feel like a thorough ChatGPT answer — not a skeleton. Use semantic HTML only. Include summaries, examples, acceptance criteria, and practical recommendations. Avoid corporate jargon walls; prioritize clarity and depth.'
}

export const SECTION_BLUEPRINTS: Record<DocumentType, SectionBlueprint[]> = {
  requirements: [
    {
      title: 'Introduction',
      subsections: ['Purpose', 'Scope', 'Definitions & Acronyms', 'References'],
      guidance: 'State why this document exists, what product/module it covers, and key terminology.'
    },
    {
      title: 'Overall Description',
      subsections: ['Product Perspective', 'User Classes', 'Operating Environment', 'Constraints'],
      guidance: 'Describe how the system fits into the larger product, who uses it, and environmental limits.'
    },
    {
      title: 'Functional Requirements',
      subsections: ['Core Features', 'User Workflows', 'Business Rules', 'Data Requirements'],
      guidance: 'List numbered functional requirements with ID, description, priority, and acceptance criteria.'
    },
    {
      title: 'Non-Functional Requirements',
      subsections: ['Performance', 'Security', 'Usability', 'Reliability'],
      guidance: 'Define measurable quality attributes with specific thresholds where possible.'
    },
    {
      title: 'Constraints & Assumptions',
      subsections: ['Technical Constraints', 'Business Constraints', 'Assumptions', 'Dependencies'],
      guidance: 'Document limitations, external dependencies, and assumptions that affect delivery.'
    },
    {
      title: 'Appendix',
      subsections: ['Open Questions', 'Glossary', 'Revision Log'],
      guidance: 'Capture unresolved items and supporting reference material.'
    }
  ],
  functional: [
    {
      title: 'Overview',
      subsections: ['Purpose', 'System Context', 'Stakeholders'],
      guidance: 'Summarize the functional scope and stakeholders affected by this specification.'
    },
    {
      title: 'System Features',
      subsections: ['Feature Catalog', 'Feature Dependencies', 'Out of Scope'],
      guidance: 'Break down each feature with inputs, processing, outputs, and error handling.'
    },
    {
      title: 'User Interfaces',
      subsections: ['Screen Inventory', 'Navigation Flow', 'Validation Rules', 'Accessibility'],
      guidance: 'Describe UI behavior, field validation, states, and responsive considerations.'
    },
    {
      title: 'Data Requirements',
      subsections: ['Data Entities', 'Field Definitions', 'Retention & Privacy'],
      guidance: 'Specify data captured, stored, displayed, and any PII handling rules.'
    },
    {
      title: 'Integration Points',
      subsections: ['Inbound Interfaces', 'Outbound Interfaces', 'Event Triggers'],
      guidance: 'Document APIs, webhooks, batch jobs, and failure handling for integrations.'
    }
  ],
  non_functional: [
    {
      title: 'Introduction',
      subsections: ['Purpose', 'Quality Goals', 'Measurement Approach'],
      guidance: 'Explain how NFRs will be validated and who owns each quality attribute.'
    },
    {
      title: 'Performance',
      subsections: ['Response Time', 'Throughput', 'Scalability Targets'],
      guidance: 'Use measurable targets (e.g., p95 latency, concurrent users, TPS).'
    },
    {
      title: 'Security',
      subsections: ['Authentication', 'Authorization', 'Data Protection', 'Audit Logging'],
      guidance: 'Cover identity, access control, encryption, and compliance requirements.'
    },
    {
      title: 'Availability & Reliability',
      subsections: ['Uptime SLA', 'Disaster Recovery', 'Backup & Restore'],
      guidance: 'Define RTO/RPO, failover strategy, and maintenance windows.'
    },
    {
      title: 'Compliance & Operations',
      subsections: ['Regulatory Requirements', 'Monitoring', 'Supportability'],
      guidance: 'List standards (GDPR, SOC2, etc.) and operational expectations.'
    }
  ],
  user_stories: [
    {
      title: 'Epic Overview',
      subsections: ['Vision', 'Goals', 'Success Metrics'],
      guidance: 'Frame the product outcome and how success will be measured.'
    },
    {
      title: 'Personas & Roles',
      subsections: ['Primary Personas', 'Secondary Personas', 'Permissions Summary'],
      guidance: 'Describe user goals, pain points, and access levels.'
    },
    {
      title: 'User Stories',
      subsections: ['Must Have', 'Should Have', 'Could Have'],
      guidance: 'Use format: As a [role], I want [goal], so that [benefit]. Include story ID and points.'
    },
    {
      title: 'Acceptance Criteria',
      subsections: ['Given/When/Then Scenarios', 'Edge Cases', 'Definition of Done'],
      guidance: 'Provide testable criteria for each priority story group.'
    },
    {
      title: 'Priority Matrix',
      subsections: ['MoSCoW Summary', 'Release Mapping', 'Dependencies'],
      guidance: 'Map stories to releases/sprints and note cross-team dependencies.'
    }
  ],
  api_spec: [
    {
      title: 'Overview',
      subsections: ['API Purpose', 'Base URL & Versioning', 'Conventions'],
      guidance: 'Explain REST/GraphQL conventions, versioning, and content types.'
    },
    {
      title: 'Authentication',
      subsections: ['Auth Methods', 'Token Lifecycle', 'Scopes & Permissions'],
      guidance: 'Document how clients authenticate and refresh credentials.'
    },
    {
      title: 'Endpoints',
      subsections: ['Resource Catalog', 'Request/Response Schemas', 'Pagination & Filtering'],
      guidance: 'For each endpoint: method, path, params, body schema, response codes, examples.'
    },
    {
      title: 'Error Handling',
      subsections: ['Error Code Catalog', 'Retry Policy', 'Rate Limiting'],
      guidance: 'Standardize error payloads and client retry guidance.'
    },
    {
      title: 'Examples & SDK Notes',
      subsections: ['Sample Requests', 'Webhook Events', 'Changelog'],
      guidance: 'Include realistic curl/examples and webhook payload samples.'
    }
  ],
  database_schema: [
    {
      title: 'Overview',
      subsections: ['Data Model Goals', 'Storage Technology', 'Naming Conventions'],
      guidance: 'Describe database engine, schema strategy, and naming standards.'
    },
    {
      title: 'Entity Diagram',
      subsections: ['Core Entities', 'Relationships', 'Cardinality Notes'],
      guidance: 'Explain ER relationships in prose or table form.'
    },
    {
      title: 'Tables',
      subsections: ['Table Definitions', 'Columns & Types', 'Constraints'],
      guidance: 'For each table: columns, PK/FK, nullability, defaults, indexes.'
    },
    {
      title: 'Relationships & Integrity',
      subsections: ['Foreign Keys', 'Cascading Rules', 'Referential Integrity'],
      guidance: 'Document ON DELETE/UPDATE behavior and orphan prevention.'
    },
    {
      title: 'Indexes & Performance',
      subsections: ['Index Strategy', 'Partitioning', 'Migration Notes'],
      guidance: 'Explain query patterns and indexing rationale.'
    }
  ],
  architecture: [
    {
      title: 'Overview',
      subsections: ['Architecture Goals', 'Quality Attributes', 'Key Decisions'],
      guidance: 'Summarize architectural drivers and major design choices.'
    },
    {
      title: 'System Components',
      subsections: ['Component Map', 'Responsibilities', 'Technology Choices'],
      guidance: 'Describe each component, its role, and interfaces.'
    },
    {
      title: 'Data Flow',
      subsections: ['Request Flow', 'Async Processing', 'Data Stores'],
      guidance: 'Walk through primary user journeys and background pipelines.'
    },
    {
      title: 'Integrations',
      subsections: ['External Systems', 'APIs & Messaging', 'Failure Modes'],
      guidance: 'Document third-party dependencies and resilience patterns.'
    },
    {
      title: 'Deployment',
      subsections: ['Environments', 'Infrastructure Topology', 'CI/CD & Observability'],
      guidance: 'Cover hosting, scaling, monitoring, and release strategy.'
    }
  ],
  system_design: [
    {
      title: 'Overview',
      subsections: ['Purpose', 'Goals & Quality Attributes', 'Scope'],
      guidance: 'State why this SDD exists, quality drivers, and what is in/out of scope.'
    },
    {
      title: 'System Context & High-Level Design',
      subsections: ['System Context', 'High-Level Architecture', 'Key Boundaries'],
      guidance: 'Describe external actors, major subsystems, and trust boundaries.'
    },
    {
      title: 'Components & Responsibilities',
      subsections: ['Component Catalog', 'Responsibilities', 'Technology Choices'],
      guidance: 'List each component with role, tech stack, and interfaces.'
    },
    {
      title: 'Data & Request Flows',
      subsections: ['Primary Request Flows', 'Async / Background Flows', 'Data Stores'],
      guidance:
        'Explain primary journeys in prose. Leave room for embedded flowcharts under each major flow.'
    },
    {
      title: 'APIs & Integrations',
      subsections: ['Internal APIs', 'External Systems', 'Failure Modes'],
      guidance: 'Document API surfaces, third-party dependencies, and resilience patterns.'
    },
    {
      title: 'Security & Environments',
      subsections: ['Authentication & Authorization', 'Data Protection', 'Environments'],
      guidance: 'Cover authn/authz, encryption, and environment topology without secrets.'
    },
    {
      title: 'Deployment & Observability',
      subsections: ['Deployment Topology', 'CI/CD', 'Monitoring & Alerting'],
      guidance: 'Describe hosting, release strategy, and operational visibility.'
    },
    {
      title: 'Design Decisions & Open Questions',
      subsections: ['ADRs', 'Rejected Alternatives', 'Open Questions'],
      guidance: 'Record decisions that affect implementation and unresolved items.'
    }
  ],
  timeline: [
    {
      title: 'Overview',
      subsections: ['Project Objectives', 'Timeline Summary', 'Assumptions'],
      guidance: 'State delivery goals and planning assumptions.'
    },
    {
      title: 'Phases',
      subsections: ['Phase Breakdown', 'Entry/Exit Criteria', 'Resources'],
      guidance: 'Define phases with dates, owners, and completion criteria.'
    },
    {
      title: 'Milestones',
      subsections: ['Key Milestones', 'Deliverables', 'Review Gates'],
      guidance: 'List milestone dates, outputs, and approval checkpoints.'
    },
    {
      title: 'Dependencies',
      subsections: ['Internal Dependencies', 'External Dependencies', 'Critical Path'],
      guidance: 'Identify blockers and cross-team coordination needs.'
    },
    {
      title: 'Risks to Schedule',
      subsections: ['Schedule Risks', 'Mitigations', 'Contingency Buffers'],
      guidance: 'Note risks that could delay delivery and mitigation plans.'
    }
  ],
  risks: [
    {
      title: 'Overview',
      subsections: ['Risk Management Approach', 'Risk Appetite', 'Roles'],
      guidance: 'Explain how risks are identified, scored, and reviewed.'
    },
    {
      title: 'Risk Register',
      subsections: ['Technical Risks', 'Business Risks', 'Operational Risks'],
      guidance: 'For each risk: ID, description, probability, impact, owner, status.'
    },
    {
      title: 'Impact Matrix',
      subsections: ['Scoring Criteria', 'Heat Map Summary', 'Escalation Thresholds'],
      guidance: 'Define how probability × impact maps to priority tiers.'
    },
    {
      title: 'Mitigation Plans',
      subsections: ['Preventive Actions', 'Corrective Actions', 'Monitoring'],
      guidance: 'Detail actionable mitigation and trigger conditions.'
    },
    {
      title: 'Contingencies',
      subsections: ['Fallback Plans', 'Communication Plan', 'Review Cadence'],
      guidance: 'Document what happens if mitigations fail.'
    }
  ],
  testing: [
    {
      title: 'Test Strategy',
      subsections: ['Objectives', 'Scope', 'Test Levels', 'Entry/Exit Criteria'],
      guidance: 'Define unit, integration, system, UAT approach and environments.'
    },
    {
      title: 'Test Cases',
      subsections: ['Functional Tests', 'Integration Tests', 'Negative Tests'],
      guidance: 'Provide structured test cases with ID, steps, expected results.'
    },
    {
      title: 'Non-Functional Testing',
      subsections: ['Performance Tests', 'Security Tests', 'Accessibility Tests'],
      guidance: 'Cover load, penetration, and a11y validation plans.'
    },
    {
      title: 'Regression Checklist',
      subsections: ['Smoke Suite', 'Release Checklist', 'Automation Coverage'],
      guidance: 'List must-pass checks before each release.'
    },
    {
      title: 'Sign-off',
      subsections: ['Defect Criteria', 'Approval Roles', 'Traceability'],
      guidance: 'Define go/no-go rules and required signatories.'
    }
  ],
  prd: [
    {
      title: 'Product Overview',
      subsections: ['Vision', 'Problem Statement', 'Target Market'],
      guidance: 'Frame the product vision, the problem being solved, and who it serves.'
    },
    {
      title: 'Goals & Success Metrics',
      subsections: ['Business Goals', 'User Goals', 'Key Metrics (KPIs)'],
      guidance: 'Define measurable outcomes that indicate product success.'
    },
    {
      title: 'Personas & Use Cases',
      subsections: ['Primary Personas', 'Key Use Cases', 'User Journeys'],
      guidance: 'Describe who uses the product and how they accomplish their goals.'
    },
    {
      title: 'Feature Requirements',
      subsections: ['Must-Have Features', 'Nice-to-Have Features', 'Out of Scope'],
      guidance: 'Prioritize features using MoSCoW and clearly mark exclusions.'
    },
    {
      title: 'Roadmap & Prioritization',
      subsections: ['Now / Next / Later', 'Release Plan', 'Dependencies'],
      guidance: 'Sequence delivery and flag cross-team or technical dependencies.'
    },
    {
      title: 'Success Criteria & Risks',
      subsections: ['Launch Criteria', 'Assumptions', 'Risks'],
      guidance: 'Define what "done" looks like and what could derail the plan.'
    }
  ],
  proposal: [
    {
      title: 'Executive Summary',
      subsections: ['Purpose', 'Client Background', 'Value Proposition'],
      guidance: 'Open with a compelling summary of the opportunity and why this proposal matters.'
    },
    {
      title: 'Understanding of Requirements',
      subsections: ['Business Problem', 'Objectives', 'Current State'],
      guidance: 'Demonstrate a clear understanding of the client\'s needs and context.'
    },
    {
      title: 'Proposed Solution',
      subsections: ['Solution Overview', 'Key Features', 'Technology Approach'],
      guidance: 'Describe the proposed approach and why it fits the client\'s needs.'
    },
    {
      title: 'Scope & Deliverables',
      subsections: ['In Scope', 'Out of Scope', 'Deliverables List'],
      guidance: 'Set clear expectations on what will and will not be delivered.'
    },
    {
      title: 'Timeline & Milestones',
      subsections: ['Project Phases', 'Key Milestones', 'Delivery Schedule'],
      guidance: 'Provide a realistic, phased delivery schedule with milestone dates.'
    },
    {
      title: 'Investment & Commercials',
      subsections: ['Pricing Summary', 'Payment Terms', 'Assumptions'],
      guidance: 'Present pricing clearly along with payment structure and assumptions.'
    },
    {
      title: 'Why Choose Us',
      subsections: ['Relevant Experience', 'Team', 'Differentiators'],
      guidance: 'Build confidence with relevant experience, team credentials, and differentiators.'
    },
    {
      title: 'Next Steps',
      subsections: ['Approval Process', 'Contact', 'Terms Summary'],
      guidance: 'Make it easy for the client to say yes — outline the path to signing.'
    }
  ],
  estimation_report: [
    {
      title: 'Estimation Overview',
      subsections: ['Purpose', 'Methodology', 'Assumptions'],
      guidance: 'Explain the estimation approach (bottom-up, analogy, parametric) and key assumptions.'
    },
    {
      title: 'Scope Breakdown',
      subsections: ['Modules in Scope', 'Feature List', 'Exclusions'],
      guidance: 'Enumerate exactly what is being estimated and what is excluded.'
    },
    {
      title: 'Effort Estimation',
      subsections: ['Effort by Module', 'Effort by Role', 'Complexity Factors'],
      guidance: 'Break down person-days/hours by module and role with complexity justification.'
    },
    {
      title: 'Cost Summary',
      subsections: ['Rate Card', 'Cost by Phase', 'Total Investment'],
      guidance: 'Translate effort into cost using clear rates and phase breakdown.'
    },
    {
      title: 'Timeline & Resourcing',
      subsections: ['Team Composition', 'Schedule', 'Resource Allocation'],
      guidance: 'Show the team shape and schedule needed to deliver the estimate.'
    },
    {
      title: 'Risk & Contingency',
      subsections: ['Estimation Risks', 'Contingency Buffer', 'Assumptions Impacting Estimate'],
      guidance: 'Quantify uncertainty with a contingency buffer and call out estimate-affecting risks.'
    }
  ],
  contract: [
    {
      title: 'Contract Overview',
      subsections: ['Agreement Purpose', 'Parties', 'Effective Date', 'Contract Type'],
      guidance: 'Establish the legal context, named parties, and baseline scope of the agreement.'
    },
    {
      title: 'Scope of Work',
      subsections: ['Deliverables', 'Service Levels', 'Responsibilities Matrix', 'Out of Scope'],
      guidance: 'Detail obligations of each party, delivery commitments, and explicit exclusions.'
    },
    {
      title: 'Commercial Terms',
      subsections: ['Pricing Model', 'Payment Terms', 'Taxes & Invoicing', 'Late Payment Handling'],
      guidance: 'Define commercial structure, due dates, billing cycles, and financial protections.'
    },
    {
      title: 'Terms & Conditions',
      subsections: ['Confidentiality', 'Intellectual Property', 'Warranties', 'Limitations of Liability'],
      guidance: 'Capture core legal clauses and clearly explain how each clause applies to this engagement.'
    },
    {
      title: 'Governance, Risk & Compliance',
      subsections: ['Regulatory Obligations', 'Audit Rights', 'Dispute Resolution', 'Force Majeure'],
      guidance: 'Define compliance obligations, escalation path, and risk-handling clauses.'
    },
    {
      title: 'Termination & Signatures',
      subsections: ['Termination Triggers', 'Notice Periods', 'Transition Support', 'Signature Blocks'],
      guidance: 'Specify exit terms, post-termination obligations, and final execution details.'
    }
  ],
  discovery: [
    {
      title: 'Problem & Opportunity',
      subsections: ['Problem Statement', 'Business Context', 'Success Vision'],
      guidance: 'State the problem in the requester\'s language. Do not invent a product that was not described.'
    },
    {
      title: 'Users & Stakeholders',
      subsections: ['Identified Users', 'Roles', 'Stakeholders', 'Unknowns'],
      guidance: 'List only users and roles present in the source. Flag missing personas as open questions.'
    },
    {
      title: 'Platforms & Constraints',
      subsections: ['Platforms Mentioned', 'Technical Constraints', 'Business Constraints'],
      guidance: 'Record platforms only if stated (web, mobile, desktop, API, other). Do not assume a stack.'
    },
    {
      title: 'Early Scope Signals',
      subsections: ['Likely In Scope', 'Likely Out of Scope', 'Future Scope'],
      guidance: 'Treat this as a hypothesis. Mark anything inferred vs explicitly stated.'
    },
    {
      title: 'Open Questions',
      subsections: ['Ambiguities', 'Missing Information', 'Assumptions to Validate'],
      guidance: 'Every gap becomes an open question with affected area and priority. Never silently fill gaps.'
    }
  ],
  brd: [
    {
      title: 'Business Overview',
      subsections: ['Purpose', 'Business Objectives', 'Success Metrics'],
      guidance: 'Focus on why the software exists and how the business will measure success.'
    },
    {
      title: 'Stakeholders & Users',
      subsections: ['Stakeholder Map', 'User Classes', 'Responsibilities'],
      guidance: 'Describe who cares about the outcome and who will use the system.'
    },
    {
      title: 'Business Requirements',
      subsections: ['Business Capabilities', 'Business Rules', 'Compliance Needs'],
      guidance: 'Number business requirements (BR-###). Separate them from system features.'
    },
    {
      title: 'Scope Boundaries',
      subsections: ['In Scope', 'Out of Scope', 'Phasing'],
      guidance: 'Tie each in-scope item to a business requirement. Leave future work explicit.'
    },
    {
      title: 'Dependencies & Risks',
      subsections: ['External Dependencies', 'Assumptions', 'Business Risks'],
      guidance: 'Call out vendor, data, and organizational dependencies without inventing them.'
    }
  ],
  scope: [
    {
      title: 'Scope Statement',
      subsections: ['Project Purpose', 'Scope Summary', 'Change Policy'],
      guidance: 'State that scope changes go through change requests. Do not mix wish-list items into committed scope.'
    },
    {
      title: 'In Scope',
      subsections: ['Phase 1', 'Phase 2', 'Phase 3'],
      guidance: 'Assign every module/feature to a phase. If phase is unknown, list it as an open question.'
    },
    {
      title: 'Out of Scope',
      subsections: ['Explicit Exclusions', 'Deferred Capabilities', 'Non-goals'],
      guidance: 'Be specific. Vague exclusions are not useful.'
    },
    {
      title: 'Future Scope',
      subsections: ['Candidate Features', 'Triggers to Revisit', 'Dependencies'],
      guidance: 'Park items that are valuable but not committed.'
    },
    {
      title: 'Acceptance of Scope',
      subsections: ['Entry Criteria', 'Sign-off Roles', 'Open Questions'],
      guidance: 'Define who approves scope and what remains unanswered.'
    }
  ],
  product_definition: [
    {
      title: 'Product Overview',
      subsections: ['Product Name', 'Platforms', 'Positioning'],
      guidance: 'Platforms are configurable (web, mobile, desktop, admin, API, other) — do not hard-code one industry.'
    },
    {
      title: 'User Roles & Permissions',
      subsections: ['Role Catalog', 'Permission Matrix', 'Restrictions'],
      guidance: 'Each role: purpose, modules they access, and what they cannot do.'
    },
    {
      title: 'Modules',
      subsections: ['Module Catalog', 'Purpose', 'Dependencies'],
      guidance: 'Each module needs ID, purpose, owner, platform, and status.'
    },
    {
      title: 'Features',
      subsections: ['Feature Catalog', 'Module Mapping', 'Acceptance Criteria'],
      guidance: 'Every feature belongs to a module and a scope phase.'
    },
    {
      title: 'Traceability',
      subsections: ['Requirement Links', 'Open Gaps', 'Out of Product'],
      guidance: 'Show which requirements are not yet mapped to a feature.'
    }
  ],
  ui_ux: [
    {
      title: 'UX Principles',
      subsections: ['Audience', 'Accessibility', 'Platform Notes'],
      guidance: 'Do not force a UI framework. Describe behavior and states, not CSS.'
    },
    {
      title: 'Screen Inventory',
      subsections: ['Screen Catalog', 'Routes', 'Role Access'],
      guidance: 'Each screen: ID, name, platform, role, purpose, module, feature.'
    },
    {
      title: 'Screen Behavior',
      subsections: ['Actions', 'Validation', 'Loading / Empty / Error / Success'],
      guidance: 'Document states and validation rules per screen.'
    },
    {
      title: 'Components & Patterns',
      subsections: ['Shared Components', 'Navigation', 'Feedback Patterns'],
      guidance: 'Reuse patterns across screens rather than restating them.'
    },
    {
      title: 'Design References',
      subsections: ['Figma / Mock Links', 'API Dependencies', 'Open Questions'],
      guidance: 'Link to mockups if provided. Never invent visual design systems.'
    }
  ],
  technical_design: [
    {
      title: 'Technology Registry',
      subsections: ['Frontend', 'Backend', 'Mobile', 'Data & Cache', 'Other'],
      guidance: 'Document technology choices separately from business requirements. Mark unknowns as open questions.'
    },
    {
      title: 'Service Design',
      subsections: ['Services', 'Responsibilities', 'Interfaces'],
      guidance: 'Each component: ID, type, technology, responsibility, dependencies, environment.'
    },
    {
      title: 'Cross-Cutting Concerns',
      subsections: ['Authentication', 'Messaging', 'Observability', 'CI/CD'],
      guidance: 'Describe approach only when known. Do not invent vendors.'
    },
    {
      title: 'Data & Integration Design',
      subsections: ['Persistence', 'External Systems', 'Failure Handling'],
      guidance: 'Never include secrets, keys, or passwords.'
    },
    {
      title: 'Design Decisions',
      subsections: ['ADRs', 'Rejected Alternatives', 'Open Questions'],
      guidance: 'Record decisions that affect implementation and why.'
    }
  ],
  uat: [
    {
      title: 'UAT Plan',
      subsections: ['Objectives', 'Participants', 'Environments'],
      guidance: 'UAT is client/user validation of acceptance criteria, not QA regression.'
    },
    {
      title: 'Scenarios',
      subsections: ['Scenario Catalog', 'Expected Results', 'Traceability'],
      guidance: 'Derive scenarios from acceptance criteria. Link each to requirement and feature IDs.'
    },
    {
      title: 'Execution Log',
      subsections: ['Actual Results', 'Defects Found', 'Comments'],
      guidance: 'Leave actual results blank for unexecuted scenarios rather than inventing outcomes.'
    },
    {
      title: 'Sign-off',
      subsections: ['Approval Status', 'Outstanding Issues', 'Go / No-Go'],
      guidance: 'Final UAT sign-off is a controlled approval, not a percentage.'
    }
  ],
  deployment: [
    {
      title: 'Environments',
      subsections: ['Local', 'Development', 'Testing', 'Staging', 'Production'],
      guidance: 'Describe purpose and typical topology. Never expose secrets, keys, or credentials.'
    },
    {
      title: 'Release Mechanics',
      subsections: ['Build', 'Migrate', 'Deploy', 'Verify', 'Rollback'],
      guidance: 'Document the process, not passwords. Refer to a secrets manager by name only.'
    },
    {
      title: 'Configuration',
      subsections: ['Application Config', 'Infrastructure', 'Domains'],
      guidance: 'List configuration keys and meaning. Use placeholders for values.'
    },
    {
      title: 'Operations',
      subsections: ['Monitoring', 'Backup', 'Incident Response'],
      guidance: 'Cover how operators know the system is healthy after deploy.'
    }
  ],
  release_notes: [
    {
      title: 'Release Summary',
      subsections: ['Version', 'Date', 'Environment', 'Highlights'],
      guidance: 'Identify the release. Calculate affected requirements and features from project data.'
    },
    {
      title: 'Changes',
      subsections: ['Features', 'Bug Fixes', 'Improvements', 'Breaking Changes'],
      guidance: 'Group changes. Link to requirement/feature IDs when known.'
    },
    {
      title: 'Technical Impact',
      subsections: ['Database Changes', 'API Changes', 'Config Changes'],
      guidance: 'Call out anything operators or integrators must do.'
    },
    {
      title: 'Known Issues & Status',
      subsections: ['Known Issues', 'Deployment Status', 'Rollback Notes'],
      guidance: 'Be honest about incomplete items. Do not claim untested work is released.'
    }
  ],
  user_guide: [
    {
      title: 'Getting Started',
      subsections: ['Who This Is For', 'Access', 'First Tasks'],
      guidance: 'Generate from approved roles, modules, and features — do not rewrite the product from scratch.'
    },
    {
      title: 'Feature Guides',
      subsections: ['Core Workflows', 'Role-specific Tasks', 'Tips'],
      guidance: 'One subsection per major feature in scope. Use user language, not internal IDs only.'
    },
    {
      title: 'Admin Guide',
      subsections: ['Administration Tasks', 'Permissions', 'Configuration'],
      guidance: 'Only include admin capabilities that exist in the knowledge base.'
    },
    {
      title: 'FAQ & Troubleshooting',
      subsections: ['FAQ', 'Common Errors', 'How to Get Help'],
      guidance: 'Base FAQs on known constraints and error states, not invented support policies.'
    }
  ],
  handover: [
    {
      title: 'System Overview',
      subsections: ['Purpose', 'Architecture Summary', 'Technology Stack'],
      guidance: 'Handover is for maintainers. Never include passwords, private keys, or API secrets.'
    },
    {
      title: 'Code & Data',
      subsections: ['Repository Structure', 'Database', 'APIs'],
      guidance: 'Describe layout and key entities/endpoints from project data.'
    },
    {
      title: 'Integrations & Environments',
      subsections: ['External Systems', 'Environment Setup', 'Deployment'],
      guidance: 'Name providers and purposes. Refer to vault/secrets manager — do not paste credentials.'
    },
    {
      title: 'Runbook',
      subsections: ['Monitoring', 'Backup', 'Rollback', 'Troubleshooting'],
      guidance: 'Practical operator steps with placeholders for environment-specific values.'
    },
    {
      title: 'Maintenance',
      subsections: ['Cadence', 'Known Risks', 'Open Questions'],
      guidance: 'What the receiving team must watch after go-live.'
    }
  ],
  change_request: [
    {
      title: 'Change Request',
      subsections: ['Title', 'Reason', 'Requester', 'Priority'],
      guidance: 'Describe the requested change. Do not silently expand scope.'
    },
    {
      title: 'Impact Assessment',
      subsections: [
        'Affected Requirements',
        'Affected Modules & Features',
        'Affected APIs / Data / UI / Tests'
      ],
      guidance: 'List impact from traceability. If unknown, create open questions rather than guessing.'
    },
    {
      title: 'Delivery Plan',
      subsections: ['Estimate', 'Development', 'Testing', 'UAT', 'Release'],
      guidance: 'Follow requested → analysis → impact → estimate → approval → build → test → UAT → release → closed.'
    },
    {
      title: 'Approval',
      subsections: ['Business Impact', 'Technical Impact', 'Decision'],
      guidance: 'Approval is required before scope changes. Record status honestly.'
    }
  ]
}

export const TYPE_GENERATION_BRIEF: Record<DocumentType, string> = {
  requirements:
    'Create a comprehensive Software Requirements Specification (SRS) aligned with IEEE-style structure. Include numbered requirements (REQ-###), priorities, acceptance criteria, and traceability from business goals to requirements.',
  functional:
    'Create a detailed Functional Requirements Specification covering features, workflows, UI behavior, validations, business rules, and error handling with requirement IDs and acceptance criteria.',
  non_functional:
    'Create a detailed Non-Functional Requirements document with measurable targets for performance, security, scalability, availability, compliance, and operational quality attributes.',
  user_stories:
    'Create an agile backlog document with epics, personas, prioritized user stories (MoSCoW), story points estimates, and Given/When/Then acceptance criteria for each story group.',
  api_spec:
    'Create a complete REST API specification with authentication, endpoint catalog, request/response JSON schemas, status codes, pagination, rate limits, error format, and realistic examples.',
  database_schema:
    'Create a database design document with entity descriptions, table definitions (columns, types, constraints), relationships, indexes, and data dictionary entries.',
  architecture:
    'Create a system architecture document with component diagram description, responsibilities, data flows, integration patterns, deployment topology, and key architectural decisions (ADRs in prose).',
  system_design:
    'Create a System Design Document (SDD) that combines architecture prose with explicit placeholders for embedded flowcharts. Cover overview, system context, components, data/request flows, APIs & integrations, security & environments, deployment & observability, and ADRs. Under Data & Request Flows, write short intro paragraphs and note where diagrams belong; do not invent ASCII art diagrams.',
  timeline:
    'Create a project timeline with phases, milestones, deliverables, dependencies, resource needs, and schedule risk mitigations with realistic date placeholders.',
  risks:
    'Create a risk assessment with risk register table, probability/impact scoring, mitigation plans, owners, and contingency actions.',
  testing:
    'Create a test plan with strategy, detailed test cases (ID, preconditions, steps, expected results), regression checklist, NFR test approach, and sign-off criteria.',
  contract:
    'Create a contract agreement with clear party obligations, deliverables, payment terms, terms and conditions, risk/compliance clauses, and enforceable acceptance/termination conditions.',
  prd:
    'Create a Product Requirements Document (PRD) with product vision, target personas, success metrics, prioritized feature requirements (MoSCoW), and a Now/Next/Later roadmap. Focus on the "why" and "what" more than deep technical detail.',
  proposal:
    'Create a persuasive, pre-sales Client Proposal (not a signed legal contract) with executive summary, understanding of requirements, proposed solution, scope, timeline, pricing/investment, why-choose-us, and clear next steps.',
  estimation_report:
    'Create an Estimation Report with methodology and assumptions, scope breakdown, effort estimation by module/role, cost summary, timeline and resourcing, and a risk contingency buffer. Use realistic numeric placeholders (person-days, cost figures).',
  discovery:
    'Create a Discovery Brief from the stated requirement only. Identify users, roles, platforms, modules, and constraints that are explicit. Put every gap in an Open Questions table (Question, Reason, Affected Area, Priority, Status). Never invent critical requirements, vendors, or platforms.',
  brd:
    'Create a Business Requirements Document focused on business objectives, stakeholders, business rules, and scope boundaries. Number business requirements (BR-###) separately from system features. Flag missing information as open questions.',
  scope:
    'Create a Scope Document with In Scope (phased), Out of Scope, and Future Scope. Every feature mentioned must sit in a phase or in future/out-of-scope. State that scope changes require a change request.',
  product_definition:
    'Create a Product Definition covering configurable platforms, user roles, permissions, modules, and features. Each feature must belong to a module. Include a simple traceability view of requirements not yet mapped to features.',
  ui_ux:
    'Create a UI/UX specification as a screen inventory with purpose, role, route, states (loading/empty/error/success), actions, validation, and API dependencies. Do not mandate a UI framework. Link to Figma only if provided.',
  technical_design:
    'Create a Technical Design with a technology registry (frontend, backend, mobile, database, cache, auth, messaging, AI, payments, cloud, monitoring, CI/CD, other). Keep technology choices separate from business requirements. Never include secrets.',
  uat:
    'Create a UAT document with scenarios derived from acceptance criteria, expected results, testers, and a final sign-off section. Leave actual results blank unless provided. Trace each scenario to a requirement and feature.',
  deployment:
    'Create a Deployment Guide covering Local, Development, Testing, Staging, and Production. Include process, configuration keys, monitoring, backup, and rollback. Never include passwords, private keys, or API secrets — use placeholders.',
  release_notes:
    'Create Release Notes with version, features, bug fixes, improvements, breaking changes, database/API changes, known issues, and deployment status. Link affected requirements and features when they exist in project data.',
  user_guide:
    'Create user documentation (getting started, feature guide, admin guide, FAQ, troubleshooting) generated from approved modules, features, and roles. Write for end users, not engineers.',
  handover:
    'Create a Technical Handover covering system overview, architecture, stack, repo structure, database, APIs, integrations, environment setup, deployment, monitoring, backup, rollback, troubleshooting, and maintenance. Never include credentials or secrets.',
  change_request:
    'Create a Change Request with reason, impact on requirements/modules/features/APIs/database/UI/tests, estimate, and approval workflow. Do not treat the change as approved unless the source says so.'
}

export function getSectionBlueprints(type: DocumentType): SectionBlueprint[] {
  return SECTION_BLUEPRINTS[type] ?? SECTION_BLUEPRINTS.requirements
}

export function buildDocumentCreationPrompt(ctx: DocumentPromptContext): string {
  const blueprints = getSectionBlueprints(ctx.type)
  const sectionOutline = blueprints
    .map(
      (s, i) =>
        `${i + 1}. ${s.title}\n   Subsections: ${s.subsections.join(', ')}\n   Guidance: ${s.guidance}`
    )
    .join('\n')

  const contextBlocks = [
    `## Document Request`,
    `Document Title: ${ctx.documentTitle}`,
    `Document Type: ${ctx.type.replace(/_/g, ' ')}`,
    `Writing Style: ${ctx.style}`,
    ctx.documentDescription && `Document Scope & Description:\n${ctx.documentDescription}`,
    ``,
    `## Project Context`,
    `Project Name: ${ctx.projectName}`,
    ctx.projectDescription && `Project Description: ${ctx.projectDescription}`,
    ctx.businessGoals && `Business Goals: ${ctx.businessGoals}`,
    ctx.targetAudience && `Target Audience: ${ctx.targetAudience}`,
    ctx.modules && `Modules/Components in scope:\n${ctx.modules}`,
    ctx.features && `Features in scope:\n${ctx.features}`,
    ctx.selectedModules && `Selected modules for this document:\n${ctx.selectedModules}`,
    ctx.selectedFeatures && `Selected features for this document:\n${ctx.selectedFeatures}`,
    ctx.userRoles && `User Roles: ${ctx.userRoles}`,
    ctx.integrations && `Integrations: ${ctx.integrations}`,
    ctx.techStack && `Technology Stack: ${ctx.techStack}`,
    ctx.typeSupportingPrompts && `## Document-Type Specific Instructions\n${ctx.typeSupportingPrompts}`,
    ctx.contractTemplate && `Preferred contract template: ${ctx.contractTemplate}`,
    ctx.contractTerms && `Key terms to include:\n${ctx.contractTerms}`,
    ctx.contractConditions && `Special conditions / conditional clauses:\n${ctx.contractConditions}`,
    ctx.additionalNotes && `Additional Notes: ${ctx.additionalNotes}`,
    ``,
    `## Required Document Structure`,
    sectionOutline,
    ``,
    `## Length & Depth`,
    lengthInstruction(ctx.documentLength, ctx.wordTarget, ctx.style),
    ``,
    `## Output Instructions`,
    DETAIL_LEVEL[ctx.style],
    ctx.style === 'chatgpt'
      ? `- Use HTML only: h1, h2, h3, p, ul, ol, li, strong, em. Skip formal cover pages and heavy tables unless the document type requires them.`
      : `- Include a document control table, revision history, and table of contents.`,
    `- Use HTML only: h1, h2, h3, p, ul, ol, li, table, tr, th, td, hr, strong, em.`,
    `- Replace bracket placeholders with project-specific content from the context above.`,
    `- Do not use Lorem ipsum. If critical information is missing, add an Open Question (question, reason, affected area, priority) instead of inventing requirements, vendors, platforms, or credentials.`,
    `- Never include passwords, private keys, API secrets, or other credentials.`,
    `- Each major section must contain substantive content matching the subsection list.`,
    TYPE_GENERATION_BRIEF[ctx.type]
  ]

  return contextBlocks.filter((line) => line !== undefined && line !== '').join('\n')
}

export function getTypeSystemPrompt(
  type: DocumentType,
  style: DocumentStyle,
  projectContext?: string,
  generationRules?: string
): string {
  const rulesBlock = formatGenerationRulesForPrompt(generationRules ?? '')
  return `You are a senior business analyst and technical writer specializing in software requirements and solution design documentation.

Task: ${TYPE_GENERATION_BRIEF[type]}

Style: ${DETAIL_LEVEL[style]}

Formatting rules:
- Return ONLY valid HTML suitable for a rich text editor (no markdown, no code fences, no commentary).
- Use hierarchical headings (h1 once for title, h2 for major sections, h3 for subsections).
- Use tables for registers (requirements, risks, test cases, API endpoints) where appropriate.
- Number requirements and test cases consistently.
- Write complete, production-ready content — not outlines or placeholders.
- If information is missing, add an Open Question table instead of inventing critical requirements, vendors, or platforms.
- Never include passwords, private keys, API secrets, or credentials.

${projectContext ? `Additional project context:\n${projectContext}` : ''}${rulesBlock ? `\n\n${rulesBlock}` : ''}`
}

export function buildSectionScaffoldHtml(
  blueprint: SectionBlueprint,
  sectionIndex: number,
  vars: { title: string; projectName: string; description: string }
): string {
  const num = sectionIndex + 1
  const descSnippet = vars.description
    ? `<p><strong>Scope note:</strong> ${escapeHtml(vars.description)}</p>`
    : ''

  const subsectionsHtml = blueprint.subsections
    .map(
      (sub, i) => `
    <h3>${num}.${i + 1} ${escapeHtml(sub)}</h3>
    <p>${escapeHtml(blueprint.guidance)} Expand this subsection with specific details for <em>${escapeHtml(vars.title)}</em> in the context of <em>${escapeHtml(vars.projectName)}</em>.</p>
    <ul>
      <li><strong>REQ-${String(num).padStart(2, '0')}${String(i + 1).padStart(2, '0')}:</strong> Describe the expected behavior, inputs, outputs, and business rule.</li>
      <li><strong>Acceptance criteria:</strong> Define measurable conditions that confirm this requirement is met.</li>
      <li><strong>Priority:</strong> Must / Should / Could — justify the priority based on business impact.</li>
    </ul>
  `
    )
    .join('')

  return `
    <h2>${num}. ${escapeHtml(blueprint.title)}</h2>
    <p><strong>Section purpose:</strong> ${escapeHtml(blueprint.guidance)}</p>
    ${descSnippet}
    ${subsectionsHtml}
  `
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
