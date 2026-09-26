import type { DocumentStatus, DocumentSyncSuggestion } from '@shared/types'

export const DOCUMENT_STATUSES: DocumentStatus[] = ['draft', 'review', 'approved', 'superseded']

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  review: 'In review',
  approved: 'Approved',
  superseded: 'Superseded'
}

export const DOCUMENT_STATUS_STYLES: Record<DocumentStatus, string> = {
  draft: 'border-border bg-muted/60 text-muted-foreground',
  review: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  superseded: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400'
}

export function buildSyncUpdateInstruction(suggestion: DocumentSyncSuggestion): string {
  return `Update this document to reflect the latest project knowledge. The following knowledge items were added or changed since this document was last edited — incorporate them where relevant, without removing unrelated existing content:\n${suggestion.changedItems
    .map((item) => `- ${item}`)
    .join('\n')}`
}
