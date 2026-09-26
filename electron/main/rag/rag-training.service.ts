import { createHash } from 'crypto'
import type {
  CreateRagTrainingDocumentInput,
  RagTrainingDocument,
  RagTrainingIndexResult,
  RagTrainingIndexStatus,
  RagTrainingSettings,
  UpdateRagTrainingDocumentInput
} from '@shared/types/rag-training'
import type { AppScope } from '@shared/types/scope'
import type { RagRetrieveHit } from '@shared/types/vector-workspace'
import { computeContentHash, ragService } from './rag.service'
import type { RagChunk } from './rag.service'
import { ragTrainingRepository } from '../repositories/rag-training.repository'
import { vectorWorkspaceRepository } from '../repositories/vector-workspace.repository'
import { vectorWorkspaceService } from '../vector-workspace/vector-workspace.service'
import { logger } from '../infra/logger.service'

const MAX_CHUNK = 1200

export function trainingCollectionName(scope: AppScope, projectId?: string | null): string {
  if (scope === 'PROJECT' && projectId) return `rs-train-${projectId}`
  return 'rs-train-global'
}

export function trainingScopeKey(scope: AppScope, projectId?: string | null): string {
  if (scope === 'PROJECT' && projectId) return projectId
  return 'global'
}

function chunkDocument(doc: RagTrainingDocument): RagChunk[] {
  const header = [
    `Training: ${doc.title}`,
    doc.purpose && `Purpose: ${doc.purpose}`,
    doc.category && `Category: ${doc.category}`,
    doc.source && `Source: ${doc.source}`,
    doc.tags.length ? `Tags: ${doc.tags.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  const body = (doc.content || '').trim()
  if (!body) {
    const text = header.trim()
    if (text.length < 8) return []
    return [
      {
        id: `${doc.id}:0`,
        text: text.slice(0, MAX_CHUNK),
        metadata: {
          section: 'training',
          title: doc.title,
          category: doc.category,
          source: doc.source,
          purpose: doc.purpose,
          scope: doc.scope,
          projectSource: 'training',
          documentId: doc.id
        }
      }
    ]
  }

  const chunks: RagChunk[] = []
  const parts: string[] = []
  let current = ''
  for (const para of body.split(/\n{2,}/)) {
    const p = para.trim()
    if (!p) continue
    if ((current + '\n\n' + p).length > MAX_CHUNK - header.length - 20) {
      if (current) parts.push(current)
      current = p
    } else {
      current = current ? `${current}\n\n${p}` : p
    }
  }
  if (current) parts.push(current)
  if (!parts.length) parts.push(body.slice(0, MAX_CHUNK))

  parts.forEach((part, i) => {
    const text = `${header}\n\n${part}`.trim().slice(0, MAX_CHUNK)
    chunks.push({
      id: `${doc.id}:${i}`,
      text,
      metadata: {
        section: 'training',
        title: doc.title,
        category: doc.category,
        source: doc.source,
        purpose: doc.purpose,
        scope: doc.scope,
        projectSource: 'training',
        documentId: doc.id,
        chunkIndex: i
      }
    })
  })
  return chunks
}

class RagTrainingService {
  list(filter?: {
    scope?: AppScope
    projectId?: string | null
    enabledOnly?: boolean
  }): Promise<RagTrainingDocument[]> {
    return ragTrainingRepository.list(filter)
  }

  get(id: string): Promise<RagTrainingDocument | null> {
    return ragTrainingRepository.get(id)
  }

  create(input: CreateRagTrainingDocumentInput): Promise<RagTrainingDocument> {
    return ragTrainingRepository.create(input)
  }

  update(id: string, input: UpdateRagTrainingDocumentInput): Promise<RagTrainingDocument | null> {
    return ragTrainingRepository.update(id, input)
  }

  delete(id: string): Promise<void> {
    return ragTrainingRepository.delete(id)
  }

  getSettings(): Promise<RagTrainingSettings> {
    return ragTrainingRepository.getSettings()
  }

  saveSettings(patch: Partial<RagTrainingSettings>): Promise<RagTrainingSettings> {
    return ragTrainingRepository.saveSettings(patch)
  }

  async indexScope(
    scope: AppScope,
    projectId?: string | null
  ): Promise<RagTrainingIndexResult> {
    const docs = await ragTrainingRepository.list({
      scope,
      projectId: scope === 'PROJECT' ? projectId : null,
      enabledOnly: true
    })
    const chunks = docs.flatMap(chunkDocument)
    const collection = trainingCollectionName(scope, projectId)
    const scopeKey = trainingScopeKey(scope, projectId)

    if (!chunks.length) {
      // Still recreate empty collection so orphans are cleared
      const connectionId = await ragService.resolveConnectionIdPublic()
      await ragService.recreateCollectionPublic(connectionId, collection)
      const indexedAt = new Date().toISOString()
      const settings = await ragTrainingRepository.getSettings()
      await ragTrainingRepository.saveSettings({
        indexMeta: {
          ...settings.indexMeta,
          [scopeKey]: {
            indexedAt,
            contentHash: 'empty',
            chunkCount: 0,
            collection,
            connectionId
          }
        }
      })
      return {
        scopeKey,
        collection,
        connectionId,
        chunkCount: 0,
        documentCount: 0,
        contentHash: 'empty',
        indexedAt
      }
    }

    const result = await ragService.indexChunks(collection, chunks)
    const contentHash = computeContentHash(chunks)
    const indexedAt = new Date().toISOString()
    const settings = await ragTrainingRepository.getSettings()
    await ragTrainingRepository.saveSettings({
      indexMeta: {
        ...settings.indexMeta,
        [scopeKey]: {
          indexedAt,
          contentHash,
          chunkCount: chunks.length,
          collection,
          connectionId: result.connectionId
        }
      }
    })

    logger.info(
      `RAG training indexed ${scopeKey}: ${docs.length} docs / ${chunks.length} chunks → ${collection}`,
      'RagTraining'
    )

    return {
      scopeKey,
      collection,
      connectionId: result.connectionId,
      chunkCount: chunks.length,
      documentCount: docs.length,
      contentHash,
      indexedAt
    }
  }

  async getIndexStatus(
    scope: AppScope,
    projectId?: string | null
  ): Promise<RagTrainingIndexStatus> {
    const scopeKey = trainingScopeKey(scope, projectId)
    const collection = trainingCollectionName(scope, projectId)
    const settings = await ragTrainingRepository.getSettings()
    const meta = settings.indexMeta[scopeKey]
    const docs = await ragTrainingRepository.list({
      scope,
      projectId: scope === 'PROJECT' ? projectId : null,
      enabledOnly: true
    })
    const status: RagTrainingIndexStatus = {
      scopeKey,
      collection,
      indexed: false,
      vectorCount: 0,
      documentCount: docs.length,
      stale: false,
      indexedAt: meta?.indexedAt ?? null
    }

    try {
      const connectionId = await ragService.resolveConnectionIdPublic()
      const stats = await vectorWorkspaceService.getCollectionStats(connectionId, collection)
      if (stats) {
        status.indexed = stats.count > 0
        status.vectorCount = stats.count
      }
      const liveChunks = docs.flatMap(chunkDocument)
      const liveHash = liveChunks.length ? computeContentHash(liveChunks) : 'empty'
      if (meta?.contentHash) {
        status.stale = liveHash !== meta.contentHash
      } else if (docs.length > 0) {
        status.stale = true
      }
    } catch (e) {
      status.lastError = e instanceof Error ? e.message : String(e)
    }

    return status
  }

  async retrieveForQuery(
    query: string,
    projectId?: string | null
  ): Promise<RagRetrieveHit[]> {
    const settings = await ragTrainingRepository.getSettings()
    if (!settings.includeInRag) return []

    const vectorSettings = await vectorWorkspaceRepository.getSettings()
    if (!vectorSettings.ragEnabled) return []

    const q = query.trim()
    if (!q) return []

    const topK = settings.trainingTopK || 4
    const collections = ['rs-train-global']
    if (projectId) collections.push(trainingCollectionName('PROJECT', projectId))

    const allHits: RagRetrieveHit[] = []
    for (const collection of collections) {
      try {
        const hits = await ragService.retrieveFromCollection(collection, q, { topK })
        allHits.push(...hits)
      } catch {
        /* collection may not exist yet */
      }
    }

    // Prefer closer distances, then dedupe by document id
    allHits.sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99))
    const seen = new Set<string>()
    const deduped: RagRetrieveHit[] = []
    for (const hit of allHits) {
      const docId =
        hit.metadata && typeof hit.metadata.documentId === 'string'
          ? hit.metadata.documentId
          : hit.id
      if (seen.has(docId)) continue
      seen.add(docId)
      deduped.push(hit)
      if (deduped.length >= topK) break
    }
    return deduped
  }

  formatTrainingHits(hits: RagRetrieveHit[]): string {
    if (!hits.length) return ''
    const blocks = hits
      .filter((h) => h.document?.trim())
      .map((h, i) => {
        const title =
          h.metadata && typeof h.metadata.title === 'string' ? h.metadata.title : 'Training'
        return `### [T${i + 1}] ${title}\n${h.document.trim()}`
      })
    if (!blocks.length) return ''
    return [
      '=== TRAINING / MODEL CORPUS (RAG) ===',
      'Use these as authoritative style, domain, and instruction examples for this assistant.',
      '',
      ...blocks,
      '',
      '=== END TRAINING CORPUS ==='
    ].join('\n')
  }

  async formatModelProfileBlock(): Promise<string> {
    const settings = await ragTrainingRepository.getSettings()
    const p = settings.modelProfile
    const lines = [
      p.displayName && `Model / persona: ${p.displayName}`,
      p.domain && `Domain: ${p.domain}`,
      p.tone && `Tone: ${p.tone}`,
      p.preferredTopics?.length ? `Preferred topics: ${p.preferredTopics.join(', ')}` : '',
      p.systemInstructions && `Instructions:\n${p.systemInstructions}`
    ].filter(Boolean)
    if (!lines.length) return ''
    return `=== MODEL PROFILE ===\n${lines.join('\n')}\n=== END MODEL PROFILE ===`
  }

  /** Live fingerprint helper for UI. */
  docsContentFingerprint(docs: RagTrainingDocument[]): string {
    const payload = docs
      .map((d) => `${d.id}:${d.contentHash}:${d.enabled ? 1 : 0}`)
      .sort()
      .join('|')
    return createHash('sha256').update(payload).digest('hex').slice(0, 24)
  }
}

export const ragTrainingService = new RagTrainingService()
