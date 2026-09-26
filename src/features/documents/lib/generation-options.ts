import type { DocumentLength, DocumentType } from '@shared/types'

export interface LengthPreset {
  id: DocumentLength
  label: string
  description: string
  wordTarget: number
  maxTokens: number
}

export const DOCUMENT_LENGTH_PRESETS: LengthPreset[] = [
  {
    id: 'concise',
    label: 'Concise',
    description: '~1,500–2,500 words',
    wordTarget: 2000,
    maxTokens: 4096
  },
  {
    id: 'standard',
    label: 'Standard',
    description: '~3,000–5,000 words',
    wordTarget: 4000,
    maxTokens: 6144
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description: '~6,000–9,000 words',
    wordTarget: 7500,
    maxTokens: 8192
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    description: '~10,000+ words',
    wordTarget: 12000,
    maxTokens: 8192
  }
]

export const DEFAULT_DOCUMENT_LENGTH: DocumentLength = 'detailed'

export interface TypePromptField {
  id: string
  label: string
  placeholder: string
  multiline?: boolean
  hint?: string
}

export const TYPE_SUPPORTING_PROMPTS: Record<DocumentType, TypePromptField[]> = {
  requirements: [
    {
      id: 'compliance',
      label: 'Compliance & Standards',
      placeholder: 'e.g. ISO 29148, IEEE 830, internal QA checklist',
      hint: 'Standards or frameworks this SRS must align with'
    },
    {
      id: 'traceability',
      label: 'Traceability Requirements',
      placeholder: 'e.g. Link REQ IDs to modules, test cases, and releases',
      multiline: true
    },
    {
      id: 'glossary',
      label: 'Domain Terms',
      placeholder: 'Key terms the document must define (one per line)',
      multiline: true
    }
  ],
  functional: [
    {
      id: 'workflows',
      label: 'Critical Workflows',
      placeholder: 'e.g. Checkout flow, onboarding, approval chain',
      multiline: true
    },
    {
      id: 'edgeCases',
      label: 'Edge Cases & Errors',
      placeholder: 'Scenarios that must be documented (timeouts, validation failures…)',
      multiline: true
    },
    {
      id: 'uiNotes',
      label: 'UI / UX Notes',
      placeholder: 'Responsive rules, accessibility level, design system'
    }
  ],
  non_functional: [
    {
      id: 'sla',
      label: 'SLA & Uptime Targets',
      placeholder: 'e.g. 99.9% uptime, p95 < 200ms'
    },
    {
      id: 'security',
      label: 'Security Requirements',
      placeholder: 'OAuth2, encryption at rest, audit logs, GDPR',
      multiline: true
    },
    {
      id: 'scalability',
      label: 'Scale Expectations',
      placeholder: 'Concurrent users, data volume, growth horizon'
    }
  ],
  user_stories: [
    {
      id: 'personas',
      label: 'Personas',
      placeholder: 'e.g. Admin, Customer, Support agent',
      multiline: true
    },
    {
      id: 'sprintScope',
      label: 'Sprint / Release Scope',
      placeholder: 'MVP vs Phase 2 — what to include in this document'
    },
    {
      id: 'storyFormat',
      label: 'Story Format',
      placeholder: 'e.g. As a [role], I want [goal], so that [benefit] + Given/When/Then'
    }
  ],
  database_schema: [
    {
      id: 'dbEngine',
      label: 'Database Engine',
      placeholder: 'e.g. PostgreSQL 16, SQLite, MongoDB'
    },
    {
      id: 'conventions',
      label: 'Naming Conventions',
      placeholder: 'snake_case tables, UUID primary keys, soft deletes'
    },
    {
      id: 'entitiesFocus',
      label: 'Entities to Emphasize',
      placeholder: 'List entities that need the most detail',
      multiline: true
    }
  ],
  api_spec: [
    {
      id: 'baseUrl',
      label: 'Base URL / Version',
      placeholder: 'e.g. https://api.example.com/v1'
    },
    {
      id: 'authMethod',
      label: 'Authentication',
      placeholder: 'JWT Bearer, API keys, OAuth2 scopes'
    },
    {
      id: 'endpointsFocus',
      label: 'Endpoints to Prioritize',
      placeholder: 'List critical endpoints to document first',
      multiline: true
    }
  ],
  timeline: [
    {
      id: 'startDate',
      label: 'Target Start / Launch',
      placeholder: 'e.g. Q3 2026 MVP, Q1 2027 GA'
    },
    {
      id: 'phases',
      label: 'Phases',
      placeholder: 'Discovery, MVP, Beta, Launch — customize phases',
      multiline: true
    },
    {
      id: 'constraints',
      label: 'Schedule Constraints',
      placeholder: 'Fixed deadlines, holidays, resource limits'
    }
  ],
  risks: [
    {
      id: 'riskCategories',
      label: 'Risk Categories',
      placeholder: 'Technical, operational, compliance, vendor, security'
    },
    {
      id: 'mitigationStyle',
      label: 'Mitigation Depth',
      placeholder: 'High-level mitigations vs detailed contingency playbooks'
    }
  ],
  architecture: [
    {
      id: 'pattern',
      label: 'Architecture Pattern',
      placeholder: 'Microservices, monolith, event-driven, serverless'
    },
    {
      id: 'deployment',
      label: 'Deployment Target',
      placeholder: 'AWS, Azure, on-prem, hybrid'
    },
    {
      id: 'adrTopics',
      label: 'Key Decisions (ADRs)',
      placeholder: 'Auth approach, data store, messaging, caching',
      multiline: true
    }
  ],
  system_design: [
    {
      id: 'pattern',
      label: 'Architecture Pattern',
      placeholder: 'Microservices, monolith, event-driven, serverless'
    },
    {
      id: 'primaryFlows',
      label: 'Primary Flows to Diagram',
      placeholder: 'e.g. User signup, checkout, webhook processing',
      multiline: true,
      hint: 'These become flowchart slots in the SDD'
    },
    {
      id: 'adrTopics',
      label: 'Key Decisions (ADRs)',
      placeholder: 'Auth approach, data store, messaging, caching',
      multiline: true
    }
  ],
  testing: [
    {
      id: 'testTypes',
      label: 'Test Types',
      placeholder: 'Unit, integration, E2E, performance, security',
      multiline: true
    },
    {
      id: 'coverage',
      label: 'Coverage Goals',
      placeholder: 'e.g. 80% unit coverage, critical path E2E'
    },
    {
      id: 'tools',
      label: 'Tools & Frameworks',
      placeholder: 'Jest, Playwright, k6, Postman'
    }
  ],
  prd: [
    {
      id: 'productVision',
      label: 'Product Vision',
      placeholder: 'One or two sentences describing the north-star vision',
      multiline: true
    },
    {
      id: 'targetPersonas',
      label: 'Target Personas',
      placeholder: 'e.g. Small business owner, Ops manager, End customer',
      multiline: true
    },
    {
      id: 'roadmapHorizon',
      label: 'Roadmap Horizon',
      placeholder: 'e.g. MVP in Q3, v2 in Q1 next year'
    }
  ],
  proposal: [
    {
      id: 'clientName',
      label: 'Client / Prospect Name',
      placeholder: 'e.g. Acme Retail Pvt Ltd'
    },
    {
      id: 'pricingModel',
      label: 'Pricing Model',
      placeholder: 'Fixed price, T&M, retainer — include indicative numbers'
    },
    {
      id: 'differentiators',
      label: 'Differentiators',
      placeholder: 'Why the client should choose you over alternatives',
      multiline: true
    }
  ],
  estimation_report: [
    {
      id: 'estimationMethod',
      label: 'Estimation Method',
      placeholder: 'e.g. Bottom-up by module, T-shirt sizing, story points to days'
    },
    {
      id: 'rateCard',
      label: 'Rate Card',
      placeholder: 'e.g. Senior dev $60/hr, QA $40/hr, PM $70/hr',
      multiline: true
    },
    {
      id: 'contingencyPercent',
      label: 'Contingency Buffer',
      placeholder: 'e.g. 15% contingency on total effort'
    }
  ],
  contract: [
    {
      id: 'templateVariant',
      label: 'Contract Template',
      placeholder: 'e.g. Master Service Agreement (MSA), Statement of Work (SOW), NDA'
    },
    {
      id: 'parties',
      label: 'Contract Parties',
      placeholder: 'List legal entities and signatory roles',
      multiline: true
    },
    {
      id: 'termsConditions',
      label: 'Terms & Conditions',
      placeholder: 'Confidentiality, IP ownership, warranties, liability cap, governing law',
      multiline: true
    },
    {
      id: 'specialConditions',
      label: 'Special Conditions',
      placeholder: 'Conditional clauses (if/then), milestone dependencies, penalties, renewals',
      multiline: true
    },
    {
      id: 'commercialTerms',
      label: 'Commercial Terms',
      placeholder: 'Pricing model, payment schedule, taxes, invoicing cycle'
    }
  ],
  discovery: [
    {
      id: 'rawRequirement',
      label: 'Raw Requirement',
      placeholder: 'Paste the unstructured request or discovery notes',
      multiline: true
    },
    {
      id: 'knownConstraints',
      label: 'Known Constraints',
      placeholder: 'Budget, timeline, compliance, platforms already decided',
      multiline: true
    }
  ],
  brd: [
    {
      id: 'businessObjectives',
      label: 'Business Objectives',
      placeholder: 'Measurable outcomes the business wants',
      multiline: true
    },
    {
      id: 'successMetrics',
      label: 'Success Metrics',
      placeholder: 'KPIs or acceptance of business value'
    }
  ],
  scope: [
    {
      id: 'phasePlan',
      label: 'Phases',
      placeholder: 'Phase 1 / 2 / 3 — what belongs in each',
      multiline: true
    },
    {
      id: 'exclusions',
      label: 'Explicit Exclusions',
      placeholder: 'What must not be delivered',
      multiline: true
    }
  ],
  product_definition: [
    {
      id: 'platforms',
      label: 'Platforms',
      placeholder: 'Web, Mobile, Desktop, Admin, API, Other — only those in play'
    },
    {
      id: 'permissionNotes',
      label: 'Permission Notes',
      placeholder: 'Role restrictions that must appear in the matrix',
      multiline: true
    }
  ],
  ui_ux: [
    {
      id: 'designLinks',
      label: 'Figma / Reference Links',
      placeholder: 'URLs to mockups if they exist'
    },
    {
      id: 'a11yLevel',
      label: 'Accessibility Target',
      placeholder: 'e.g. WCAG 2.2 AA — only if required'
    }
  ],
  technical_design: [
    {
      id: 'knownStack',
      label: 'Known Technology Choices',
      placeholder: 'Only list stack items that are already decided',
      multiline: true
    },
    {
      id: 'openTechDecisions',
      label: 'Open Technical Decisions',
      placeholder: 'Auth, data store, hosting — mark as questions if undecided',
      multiline: true
    }
  ],
  uat: [
    {
      id: 'uatParticipants',
      label: 'UAT Participants',
      placeholder: 'Client roles who will execute UAT'
    },
    {
      id: 'uatEnvironment',
      label: 'UAT Environment',
      placeholder: 'Staging URL placeholder — no credentials'
    }
  ],
  deployment: [
    {
      id: 'hosting',
      label: 'Hosting / Cloud',
      placeholder: 'Only if already chosen'
    },
    {
      id: 'secretsPolicy',
      label: 'Secrets Handling',
      placeholder: 'e.g. store in vault, never in docs — always include this rule'
    }
  ],
  release_notes: [
    {
      id: 'version',
      label: 'Version',
      placeholder: 'e.g. 1.0.0'
    },
    {
      id: 'releaseHighlights',
      label: 'Highlights',
      placeholder: 'Must-mention changes if already known',
      multiline: true
    }
  ],
  user_guide: [
    {
      id: 'audience',
      label: 'Audience',
      placeholder: 'End users, admins, or both'
    },
    {
      id: 'gettingStartedTasks',
      label: 'First Tasks',
      placeholder: 'The 3–5 tasks a new user should complete',
      multiline: true
    }
  ],
  handover: [
    {
      id: 'repoLayout',
      label: 'Repository Layout',
      placeholder: 'High-level folders if known',
      multiline: true
    },
    {
      id: 'opsContacts',
      label: 'Ops Ownership',
      placeholder: 'Who receives the system after handover (roles, not passwords)'
    }
  ],
  change_request: [
    {
      id: 'changeReason',
      label: 'Reason for Change',
      placeholder: 'Why this change is requested',
      multiline: true
    },
    {
      id: 'knownImpact',
      label: 'Known Impact',
      placeholder: 'Modules, APIs, or data already known to be affected',
      multiline: true
    }
  ]
}

export function getLengthPreset(length: DocumentLength, customWordCount?: number): LengthPreset {
  if (length === 'custom' && customWordCount) {
    const maxTokens = customWordCount <= 2500 ? 4096 : customWordCount <= 5000 ? 6144 : 8192
    return {
      id: 'custom',
      label: 'Custom',
      description: `~${customWordCount.toLocaleString()} words`,
      wordTarget: customWordCount,
      maxTokens
    }
  }
  return DOCUMENT_LENGTH_PRESETS.find((p) => p.id === length) ?? DOCUMENT_LENGTH_PRESETS[2]
}

export function formatTypeSupportingPrompts(
  type: DocumentType,
  prompts: Record<string, string>
): string {
  const fields = TYPE_SUPPORTING_PROMPTS[type] ?? []
  const lines = fields
    .map((f) => {
      const value = prompts[f.id]?.trim()
      return value ? `${f.label}: ${value}` : null
    })
    .filter(Boolean)
  return lines.length ? lines.join('\n') : ''
}
