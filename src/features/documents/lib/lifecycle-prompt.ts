import type { DocumentLength, DocumentStyle, DocumentType, KnowledgeBundle } from '@shared/types'
import { DOCUMENT_TYPE_LABELS } from '@shared/lib/project-lifecycle'
import { buildDocumentCreationPrompt } from '@shared/lib/document-prompts'

const MAX_DESC = 180
const MAX_MODULES = 36
const MAX_FEATURES = 60
const MAX_ROLES = 24
const MAX_INTEGRATIONS = 20

function clip(text: string, max = MAX_DESC): string {
  const t = (text ?? '').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function cappedList(lines: string[], cap: number): string {
  if (lines.length === 0) return ''
  const shown = lines.slice(0, cap)
  const extra = lines.length - shown.length
  const body = shown.join('\n')
  return extra > 0 ? `${body}\n- …and ${extra} more in Knowledge` : body
}

export function knowledgeToPromptFields(bundle: KnowledgeBundle | null | undefined): {
  projectDescription: string
  businessGoals: string
  targetAudience: string
  modules: string
  features: string
  userRoles: string
  integrations: string
} {
  if (!bundle) {
    return {
      projectDescription: '',
      businessGoals: '',
      targetAudience: '',
      modules: '',
      features: '',
      userRoles: '',
      integrations: ''
    }
  }

  const goals = (() => {
    try {
      const parsed = JSON.parse(bundle.overview?.goals || '[]')
      return Array.isArray(parsed) ? parsed.filter(Boolean).join('; ') : bundle.overview?.goals || ''
    } catch {
      return bundle.overview?.goals || ''
    }
  })()

  const moduleTitle = new Map(bundle.modules.map((m) => [m.id, m.title]))

  return {
    projectDescription: [
      clip(bundle.overview?.projectSummary ?? '', 400),
      clip(bundle.overview?.scope ?? '', 280),
      bundle.overview?.outOfScope && `Out of scope: ${clip(bundle.overview.outOfScope, 200)}`
    ]
      .filter(Boolean)
      .join('\n'),
    businessGoals: clip(goals, 400),
    targetAudience: clip(bundle.overview?.targetUsers || '', 240),
    modules: cappedList(
      bundle.modules.map((m) => `- ${m.title}: ${clip(m.description || 'No description')}`),
      MAX_MODULES
    ),
    features: cappedList(
      bundle.features.map((f) => {
        const mod = moduleTitle.get(f.moduleId)
        return `- ${f.title}${mod ? ` [${mod}]` : ''}: ${clip(f.description || '')}`
      }),
      MAX_FEATURES
    ),
    userRoles: cappedList(
      bundle.roles.map((r) => `- ${r.name}: ${clip(r.description || '')}`),
      MAX_ROLES
    ),
    integrations: cappedList(
      bundle.integrations.map((i) => `- ${i.name}: ${clip(i.description || '')}`),
      MAX_INTEGRATIONS
    )
  }
}

export function buildLifecycleDocumentPrompt(input: {
  projectName: string
  type: DocumentType
  style: DocumentStyle
  bundle: KnowledgeBundle | null | undefined
  additionalNotes?: string
  documentLength?: DocumentLength
  wordTarget?: number
}): string {
  const fields = knowledgeToPromptFields(input.bundle)
  return buildDocumentCreationPrompt({
    projectName: input.projectName,
    projectDescription: fields.projectDescription,
    documentTitle: `${DOCUMENT_TYPE_LABELS[input.type]} — ${input.projectName}`,
    documentDescription: fields.projectDescription,
    type: input.type,
    style: input.style,
    businessGoals: fields.businessGoals,
    targetAudience: fields.targetAudience,
    modules: fields.modules,
    features: fields.features,
    userRoles: fields.userRoles,
    integrations: fields.integrations,
    additionalNotes: input.bundle
      ? 'Use the Knowledge fields above as the source of truth. Do not invent vendors, platforms, or requirements that are not in Knowledge; record gaps as open questions.'
      : input.additionalNotes,
    documentLength: input.documentLength,
    wordTarget: input.wordTarget
  })
}
