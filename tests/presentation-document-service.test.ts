import { describe, expect, it } from 'vitest'
import { createStarterCards, serializeCards } from '@shared/lib/presentation-model'
import { createBlankPresentationDocument } from '@shared/lib/presentation-migrations'
import { serializePresentationDocument } from '@shared/lib/presentation-schema'
import {
  presentationDocumentUpdate,
  resolvePresentationDocument
} from '../electron/main/presentation/presentation-document.service'
import type { Presentation } from '@shared/types/presentation'

function record(documentJson = ''): Presentation {
  return {
    id: 'deck',
    projectId: 'project',
    title: 'Deck',
    description: '',
    themeId: 'professional',
    cards: serializeCards(createStarterCards()),
    viewState: '{}',
    versions: '[]',
    documentJson,
    schemaVersion: documentJson ? 1 : 0,
    templateId: '',
    isFavorite: false,
    deletedAt: null,
    isPinned: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  }
}

describe('presentation document persistence bridge', () => {
  it('migrates a legacy record when documentJson is absent', () => {
    const result = resolvePresentationDocument(record())
    expect(result.migratedFromLegacy).toBe(true)
    expect(result.document.slides.length).toBeGreaterThan(0)
  })

  it('prefers a valid persisted versioned document', () => {
    const document = createBlankPresentationDocument({ id: 'deck', projectId: 'project' })
    const result = resolvePresentationDocument(record(serializePresentationDocument(document)))
    expect(result.migratedFromLegacy).toBe(false)
    expect(result.document).toEqual(document)
    expect(presentationDocumentUpdate(document).schemaVersion).toBe(1)
  })
})
