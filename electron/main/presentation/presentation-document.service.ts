import type { Presentation } from '@shared/types/presentation'
import type { PresentationDocument } from '@shared/types/presentation-document'
import { parseCards } from '@shared/lib/presentation-model'
import { migrateLegacyCards } from '@shared/lib/presentation-migrations'
import {
  parsePresentationDocument,
  serializePresentationDocument
} from '@shared/lib/presentation-schema'

export interface ResolvedPresentationDocument {
  document: PresentationDocument
  migratedFromLegacy: boolean
}

export function resolvePresentationDocument(
  presentation: Presentation
): ResolvedPresentationDocument {
  const persisted = parsePresentationDocument(presentation.documentJson)
  if (persisted) return { document: persisted, migratedFromLegacy: false }

  return {
    document: migrateLegacyCards({
      id: presentation.id,
      projectId: presentation.projectId,
      title: presentation.title,
      description: presentation.description,
      themeId: presentation.themeId,
      cards: parseCards(presentation.cards),
      createdAt: presentation.createdAt,
      updatedAt: presentation.updatedAt
    }),
    migratedFromLegacy: true
  }
}

export function presentationDocumentUpdate(document: PresentationDocument): {
  documentJson: string
  schemaVersion: number
  title: string
  description: string
  themeId: string
  templateId: string
} {
  return {
    documentJson: serializePresentationDocument(document),
    schemaVersion: document.schemaVersion,
    title: document.title,
    description: document.description ?? '',
    themeId: document.themeId,
    templateId: document.templateId ?? ''
  }
}
