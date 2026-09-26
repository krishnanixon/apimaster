import type { Document, DocumentSyncSuggestion, DocumentType } from '@shared/types'
import type { KnowledgeBundle } from '@shared/types/knowledge'
import { documentRepository } from '../repositories/document.repository'
import { knowledgeRepository } from '../repositories/knowledge.repository'

/**
 * Which knowledge entity kinds are considered "source of truth" for each
 * document type. When any relevant item changes after a document's last
 * edit, the document is flagged as potentially stale.
 */
const RELEVANT_KINDS: Record<DocumentType, (keyof KnowledgeBundle)[]> = {
  requirements: ['modules', 'features', 'requirements', 'businessRules'],
  functional: ['modules', 'features', 'requirements', 'businessRules', 'workflows'],
  non_functional: ['requirements', 'risks'],
  user_stories: ['modules', 'features', 'requirements'],
  database_schema: ['entities'],
  api_spec: ['apiEndpoints'],
  timeline: ['modules', 'features'],
  risks: ['risks', 'assumptions'],
  architecture: ['modules', 'entities', 'apiEndpoints', 'integrations', 'decisions'],
  system_design: ['modules', 'entities', 'apiEndpoints', 'integrations', 'decisions', 'workflows'],
  testing: ['features', 'requirements'],
  contract: ['integrations', 'decisions'],
  prd: ['modules', 'features', 'requirements'],
  proposal: ['modules', 'features', 'integrations'],
  estimation_report: ['modules', 'features', 'requirements'],
  discovery: ['overview', 'stakeholders', 'roles', 'assumptions'],
  brd: ['overview', 'stakeholders', 'requirements', 'businessRules', 'assumptions'],
  scope: ['overview', 'modules', 'features', 'assumptions'],
  product_definition: ['roles', 'modules', 'features', 'requirements'],
  ui_ux: ['modules', 'features', 'roles', 'workflows'],
  technical_design: ['modules', 'entities', 'apiEndpoints', 'integrations', 'decisions'],
  uat: ['requirements', 'features'],
  deployment: ['integrations', 'decisions'],
  release_notes: ['modules', 'features'],
  user_guide: ['modules', 'features', 'roles'],
  handover: ['modules', 'entities', 'apiEndpoints', 'integrations', 'decisions'],
  change_request: ['requirements', 'modules', 'features', 'apiEndpoints', 'entities']
}

function itemLabel(kind: keyof KnowledgeBundle, item: { title?: string; name?: string; path?: string }): string {
  const readable = kind.replace(/([A-Z])/g, ' $1').toLowerCase()
  const name = item.title ?? item.name ?? item.path ?? 'item'
  return `${readable}: ${name}`
}

function severityFor(count: number): 'low' | 'medium' | 'high' {
  if (count >= 5) return 'high'
  if (count >= 2) return 'medium'
  return 'low'
}

/**
 * Compares each document's last-updated timestamp against the knowledge
 * items relevant to its type, and returns actionable "this may be outdated"
 * suggestions. Purely derived from existing timestamps — no schema changes
 * or persistence required.
 */
export async function analyzeDocumentSync(projectId: string): Promise<DocumentSyncSuggestion[]> {
  const [documents, bundle] = await Promise.all([
    documentRepository.listByProject(projectId),
    knowledgeRepository.loadBundle(projectId)
  ])

  if (documents.length === 0) return []

  const suggestions: DocumentSyncSuggestion[] = []

  for (const doc of documents) {
    const reviewedAt = doc.lastReviewedAt ? new Date(doc.lastReviewedAt).getTime() : 0
    const docUpdatedAt = Math.max(new Date(doc.updatedAt).getTime(), reviewedAt)
    const kinds = RELEVANT_KINDS[doc.type] ?? []
    const changedItems: string[] = []

    for (const kind of kinds) {
      const items = bundle[kind] as unknown as Array<{
        title?: string
        name?: string
        updatedAt: string
        deletedAt?: string | null
      }>
      if (!Array.isArray(items)) continue

      for (const item of items) {
        if (item.deletedAt) continue
        const itemUpdatedAt = new Date(item.updatedAt).getTime()
        if (itemUpdatedAt > docUpdatedAt) {
          changedItems.push(itemLabel(kind, item))
        }
      }
    }

    if (changedItems.length > 0) {
      suggestions.push({
        documentId: doc.id,
        documentTitle: doc.title,
        documentType: doc.type,
        reason: `${changedItems.length} knowledge item${changedItems.length === 1 ? '' : 's'} changed since this document was last updated.`,
        changedItems: changedItems.slice(0, 8),
        severity: severityFor(changedItems.length)
      })
    }
  }

  return suggestions.sort((a, b) => b.changedItems.length - a.changedItems.length)
}

export function buildSyncInstruction(suggestion: DocumentSyncSuggestion): string {
  return `Update this document to reflect the latest project knowledge. The following knowledge items were added or changed since this document was last edited — incorporate them where relevant, without removing unrelated existing content:\n${suggestion.changedItems
    .map((i) => `- ${i}`)
    .join('\n')}`
}

export type { Document }
