import { createHash } from 'crypto'
import type { KnowledgeBundle } from '@shared/types'
import type {
  RagIndexMeta,
  RagIndexResult,
  RagRetrieveHit,
  RagStatus,
  VectorWorkspaceSettings
} from '@shared/types/vector-workspace'
import { aiConfigService } from '../ai/config/ai-config.service'
import { getProvider } from '../ai/providers/registry'
import { openAIProvider } from '../ai/providers/openai.provider'
import { knowledgeRepository } from '../repositories/knowledge.repository'
import { vectorWorkspaceRepository } from '../repositories/vector-workspace.repository'
import { vectorWorkspaceService } from '../vector-workspace/vector-workspace.service'
import { logger } from '../infra/logger.service'

export interface RagChunk {
  id: string
  text: string
  metadata: Record<string, unknown>
}

const EMBED_BATCH = 32
const MAX_CHUNK_CHARS = 1200
const DEFAULT_OPENAI_EMBED_MODEL = 'text-embedding-3-small'
const DEFAULT_OLLAMA_EMBED_MODEL = 'all-minilm'

function truncate(text: string, max = MAX_CHUNK_CHARS): string {
  const t = (text ?? '').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function parseJsonArray(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

function asItems(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean)
    }
  } catch {
    /* fall through */
  }
  return trimmed
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Stable per-project LiteChroma collection name. */
export function ragCollectionName(projectId: string): string {
  return `rs-kb-${projectId}`
}

/** Fingerprint of chunk set used for staleness detection. */
export function computeContentHash(chunks: RagChunk[]): string {
  const payload = chunks
    .map((c) => `${c.id}:${c.text.length}:${createHash('sha1').update(c.text).digest('hex').slice(0, 8)}`)
    .sort()
    .join('|')
  return createHash('sha256').update(`${chunks.length}|${payload}`).digest('hex').slice(0, 24)
}

function pushChunk(
  chunks: RagChunk[],
  id: string,
  section: string,
  title: string,
  body: string,
  extra?: Record<string, unknown>
): void {
  const text = truncate(`${title}\n${body}`.trim())
  if (!text || text.length < 8) return
  chunks.push({
    id,
    text,
    metadata: { section, title, projectSource: 'knowledge', ...extra }
  })
}

/** Flatten the project knowledge bundle into embeddable chunks. */
export function chunkKnowledgeBundle(projectId: string, bundle: KnowledgeBundle): RagChunk[] {
  const chunks: RagChunk[] = []
  const overview = bundle.overview

  if (overview) {
    const parts = [
      overview.projectSummary && `Summary: ${overview.projectSummary}`,
      overview.industry && `Industry: ${overview.industry}`,
      overview.businessType && `Business type: ${overview.businessType}`,
      overview.targetUsers && `Users: ${overview.targetUsers}`,
      overview.vision && `Vision: ${overview.vision}`,
      overview.scope && `Scope: ${overview.scope}`,
      overview.outOfScope && `Out of scope: ${overview.outOfScope}`,
      parseJsonArray(overview.goals ?? '').length
        ? `Goals: ${parseJsonArray(overview.goals ?? '').join('; ')}`
        : '',
      parseJsonArray(overview.objectives ?? '').length
        ? `Objectives: ${parseJsonArray(overview.objectives ?? '').join('; ')}`
        : ''
    ].filter(Boolean)
    if (parts.length) {
      pushChunk(chunks, `${projectId}:overview`, 'overview', 'Business Overview', parts.join('\n'))
    }
  }

  for (const s of bundle.stakeholders) {
    pushChunk(
      chunks,
      s.id,
      'stakeholders',
      `Stakeholder: ${s.name}`,
      [s.role && `Role: ${s.role}`, s.responsibilities].filter(Boolean).join('\n'),
      { entityType: 'stakeholder' }
    )
  }

  for (const r of bundle.roles) {
    const perms = asItems(r.permissions)
    const restrictions = asItems(r.restrictions)
    pushChunk(
      chunks,
      r.id,
      'roles',
      `Role: ${r.name}`,
      [
        r.description,
        perms.length ? `Permissions: ${perms.join(', ')}` : '',
        restrictions.length ? `Restrictions: ${restrictions.join(', ')}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
      { entityType: 'role' }
    )
  }

  for (const m of bundle.modules) {
    pushChunk(
      chunks,
      m.id,
      'modules',
      `Module: ${m.title}`,
      [m.description, m.priority && `Priority: ${m.priority}`, m.status && `Status: ${m.status}`]
        .filter(Boolean)
        .join('\n'),
      { entityType: 'module' }
    )
  }

  for (const f of bundle.features) {
    const mod = bundle.modules.find((m) => m.id === f.moduleId)
    pushChunk(
      chunks,
      f.id,
      'features',
      `Feature: ${f.title}`,
      [
        mod ? `Module: ${mod.title}` : '',
        f.description,
        f.priority && `Priority: ${f.priority}`,
        f.complexity && `Complexity: ${f.complexity}`
      ]
        .filter(Boolean)
        .join('\n'),
      { entityType: 'feature', moduleId: f.moduleId }
    )
  }

  for (const r of bundle.requirements) {
    const ac = asItems(r.acceptanceCriteria)
    pushChunk(
      chunks,
      r.id,
      'requirements',
      `Requirement: ${r.code ? `${r.code} ` : ''}${r.title}`,
      [
        r.description,
        r.type && `Type: ${r.type}`,
        r.priority && `Priority: ${r.priority}`,
        ac.length ? `Acceptance: ${ac.join('; ')}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
      { entityType: 'requirement', type: r.type }
    )
  }

  for (const b of bundle.businessRules) {
    pushChunk(
      chunks,
      b.id,
      'business-rules',
      `Business rule: ${b.title}`,
      b.description ?? '',
      { entityType: 'businessRule' }
    )
  }

  for (const w of bundle.workflows) {
    pushChunk(
      chunks,
      w.id,
      'workflows',
      `Workflow: ${w.title}`,
      w.description ?? '',
      { entityType: 'workflow' }
    )
  }

  for (const e of bundle.entities) {
    const fields = asItems(e.fields)
    const rels = asItems(e.relationships)
    pushChunk(
      chunks,
      e.id,
      'database',
      `Entity: ${e.name}`,
      [
        fields.length ? `Fields: ${fields.join(', ')}` : '',
        rels.length ? `Relationships: ${rels.join(', ')}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
      { entityType: 'entity' }
    )
  }

  for (const a of bundle.apiEndpoints) {
    pushChunk(
      chunks,
      a.id,
      'apis',
      `API: ${a.method} ${a.path}`,
      [a.description, a.authentication && `Auth: ${a.authentication}`].filter(Boolean).join('\n'),
      { entityType: 'apiEndpoint' }
    )
  }

  for (const i of bundle.integrations) {
    pushChunk(
      chunks,
      i.id,
      'integrations',
      `Integration: ${i.name}`,
      [i.type && `Type: ${i.type}`, i.description].filter(Boolean).join('\n'),
      { entityType: 'integration' }
    )
  }

  for (const report of bundle.reports) {
    pushChunk(
      chunks,
      report.id,
      'reports',
      `Report: ${report.title}`,
      report.description ?? '',
      { entityType: 'report' }
    )
  }

  for (const r of bundle.risks) {
    pushChunk(
      chunks,
      r.id,
      'risks',
      `Risk: ${r.title}`,
      [
        r.description,
        r.severity && `Severity: ${r.severity}`,
        r.likelihood && `Likelihood: ${r.likelihood}`,
        r.mitigation && `Mitigation: ${r.mitigation}`
      ]
        .filter(Boolean)
        .join('\n'),
      { entityType: 'risk' }
    )
  }

  for (const a of bundle.assumptions) {
    pushChunk(
      chunks,
      a.id,
      'assumptions',
      `Assumption: ${a.title}`,
      a.description ?? '',
      { entityType: 'assumption' }
    )
  }

  for (const d of bundle.decisions) {
    pushChunk(
      chunks,
      d.id,
      'decisions',
      `Decision: ${d.title}`,
      [d.category && `Category: ${d.category}`, d.decision, d.reason && `Reason: ${d.reason}`]
        .filter(Boolean)
        .join('\n'),
      { entityType: 'decision' }
    )
  }

  return chunks
}

class RagService {
  private resolveEmbeddingTarget(settings: VectorWorkspaceSettings): {
    providerId: 'openai' | 'ollama'
    model: string
  } {
    const config = aiConfigService.get()
    let providerId: 'openai' | 'ollama'

    if (settings.ragEmbeddingProvider === 'openai') providerId = 'openai'
    else if (settings.ragEmbeddingProvider === 'ollama') providerId = 'ollama'
    else if (config.mode === 'ollama') providerId = 'ollama'
    else providerId = 'openai'

    const model =
      providerId === 'openai'
        ? settings.ragOpenAiEmbeddingModel || DEFAULT_OPENAI_EMBED_MODEL
        : settings.ragOllamaEmbeddingModel || DEFAULT_OLLAMA_EMBED_MODEL

    return { providerId, model }
  }

  private async embedTexts(
    texts: string[],
    settings: VectorWorkspaceSettings,
    options?: { targetDimension?: number }
  ): Promise<{ embeddings: number[][]; providerId: 'openai' | 'ollama'; model: string }> {
    const { providerId, model } = this.resolveEmbeddingTarget(settings)
    const provider = getProvider(providerId)
    if (!provider?.embeddings) {
      throw new Error(
        `Embedding provider "${providerId}" is not available. Configure OpenAI or Ollama in Settings → AI.`
      )
    }
    if (!provider.isConfigured()) {
      throw new Error(
        providerId === 'openai'
          ? 'OpenAI API key not configured. Add it in Settings → AI.'
          : 'Ollama is not reachable. Start Ollama and set the base URL in Settings → AI.'
      )
    }

    const targetDim = options?.targetDimension ?? settings.defaultDimension
    const embeddings: number[][] = []
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH)
      let vectors: number[][]
      if (providerId === 'openai') {
        vectors = await openAIProvider.embeddings(batch, model, targetDim)
      } else {
        vectors = await provider.embeddings(batch, model)
      }
      if (vectors.some((v) => !v?.length)) {
        throw new Error(`Empty embedding returned from ${providerId} (${model})`)
      }
      const dim = vectors[0]?.length ?? 0
      if (dim && dim !== targetDim) {
        throw new Error(
          `${providerId === 'openai' ? 'OpenAI' : 'Ollama'} model "${model}" returns ${dim}-d vectors, ` +
            `but expected ${targetDim}-d. ` +
            `Set Default dimension to ${dim}` +
            (providerId === 'openai'
              ? ' (or use a text-embedding-3-* model that supports Matryoshka dimensions).'
              : ' (or switch embedding model / use OpenAI with matching dimensions).')
        )
      }
      embeddings.push(...vectors)
    }

    return { embeddings, providerId, model }
  }

  /** Embed texts using Vector Studio / RAG embedding settings (for studio search & upsert). */
  async embedTextsPublic(
    texts: string[],
    options?: { targetDimension?: number }
  ): Promise<{ embeddings: number[][]; providerId: 'openai' | 'ollama'; model: string }> {
    const settings = await vectorWorkspaceRepository.getSettings()
    return this.embedTexts(texts, settings, options)
  }

  private async resolveConnectionId(settings: VectorWorkspaceSettings): Promise<string> {
    if (settings.ragConnectionId) {
      const conn = await vectorWorkspaceRepository.getConnection(settings.ragConnectionId)
      if (conn) return conn.id
    }
    const all = await vectorWorkspaceRepository.listConnections()
    if (!all.length) {
      throw new Error(
        'No LiteChroma connection configured. Add one in Settings → Vector DB or Vector Studio.'
      )
    }
    const healthy = all.find((c) => c.health === 'healthy')
    return healthy?.id ?? all[0].id
  }

  /** Public wrapper for training / other corpus indexers. */
  async resolveConnectionIdPublic(): Promise<string> {
    const settings = await vectorWorkspaceRepository.getSettings()
    return this.resolveConnectionId(settings)
  }

  /** Drop and recreate so deleted entities cannot leave orphan vectors. */
  private async recreateCollection(
    connectionId: string,
    collection: string,
    settings: VectorWorkspaceSettings
  ): Promise<void> {
    const existing = await vectorWorkspaceService.listCollections(connectionId)
    if (existing.includes(collection)) {
      await vectorWorkspaceService.deleteCollection(connectionId, collection)
    }
    await vectorWorkspaceService.createCollection(connectionId, {
      name: collection,
      dimension: settings.defaultDimension,
      metric: settings.defaultMetric,
      index: settings.defaultIndex
    })
  }

  async recreateCollectionPublic(connectionId: string, collection: string): Promise<void> {
    const settings = await vectorWorkspaceRepository.getSettings()
    await this.recreateCollection(connectionId, collection, settings)
  }

  /** Index arbitrary chunks into a named collection (recreates collection first). */
  async indexChunks(
    collection: string,
    chunks: RagChunk[]
  ): Promise<{ connectionId: string; chunkCount: number; dimension: number }> {
    const settings = await vectorWorkspaceRepository.getSettings()
    const connectionId = await this.resolveConnectionId(settings)
    await this.recreateCollection(connectionId, collection, settings)
    if (!chunks.length) {
      return { connectionId, chunkCount: 0, dimension: settings.defaultDimension }
    }
    const { embeddings } = await this.embedTexts(
      chunks.map((c) => c.text),
      settings
    )
    await vectorWorkspaceService.upsertVectors(connectionId, {
      collection,
      ids: chunks.map((c) => c.id),
      embeddings,
      documents: chunks.map((c) => c.text),
      metadatas: chunks.map((c) => c.metadata)
    })
    return {
      connectionId,
      chunkCount: chunks.length,
      dimension: settings.defaultDimension
    }
  }

  /** Search a specific collection (used by training corpus + project KB). */
  async retrieveFromCollection(
    collection: string,
    query: string,
    options?: { topK?: number }
  ): Promise<RagRetrieveHit[]> {
    const settings = await vectorWorkspaceRepository.getSettings()
    if (!settings.ragEnabled) return []
    const q = query.trim()
    if (!q) return []

    const connectionId = await this.resolveConnectionId(settings)
    const names = await vectorWorkspaceService.listCollections(connectionId)
    if (!names.includes(collection)) return []

    const { embeddings } = await this.embedTexts([q], settings)
    const topK = options?.topK ?? settings.ragTopK ?? 8
    const scoreThreshold =
      typeof settings.ragScoreThreshold === 'number' ? settings.ragScoreThreshold : null

    const result = await vectorWorkspaceService.search(connectionId, {
      collection,
      query_embeddings: embeddings,
      top_k: topK,
      score_threshold: scoreThreshold,
      include_documents: true,
      include_metadata: true,
      include_distances: true,
      include_embeddings: false
    })

    const ids = result.ids?.[0] ?? []
    const docs = result.documents?.[0] ?? []
    const metas = result.metadatas?.[0] ?? []
    const dists = result.distances?.[0] ?? []

    return ids.map((id, i) => ({
      id,
      document: docs[i] ?? '',
      distance: dists[i] ?? null,
      metadata: metas[i] ?? null
    }))
  }

  async indexProject(projectId: string): Promise<RagIndexResult> {
    const settings = await vectorWorkspaceRepository.getSettings()
    const connectionId = await this.resolveConnectionId(settings)
    const collection = ragCollectionName(projectId)
    const bundle = await knowledgeRepository.loadBundle(projectId)
    const chunks = chunkKnowledgeBundle(projectId, bundle)

    if (!chunks.length) {
      throw new Error('No knowledge content to index. Add modules, requirements, or overview first.')
    }

    const contentHash = computeContentHash(chunks)
    await this.recreateCollection(connectionId, collection, settings)

    const { embeddings, providerId, model } = await this.embedTexts(
      chunks.map((c) => c.text),
      settings
    )

    await vectorWorkspaceService.upsertVectors(connectionId, {
      collection,
      ids: chunks.map((c) => c.id),
      embeddings,
      documents: chunks.map((c) => c.text),
      metadatas: chunks.map((c) => c.metadata)
    })

    const indexedAt = new Date().toISOString()
    const meta: RagIndexMeta = {
      indexedAt,
      contentHash,
      chunkCount: chunks.length,
      connectionId,
      collection,
      dimension: settings.defaultDimension,
      embeddingProvider: providerId,
      embeddingModel: model
    }
    await vectorWorkspaceRepository.saveSettings({
      ragIndexMeta: {
        ...(settings.ragIndexMeta ?? {}),
        [projectId]: meta
      }
    })

    logger.info(
      `RAG indexed project ${projectId}: ${chunks.length} chunks → ${collection} via ${providerId}/${model}`,
      'RAG'
    )

    return {
      projectId,
      collection,
      connectionId,
      chunkCount: chunks.length,
      dimension: settings.defaultDimension,
      embeddingProvider: providerId,
      embeddingModel: model,
      contentHash,
      indexedAt
    }
  }

  async retrieve(
    projectId: string,
    query: string,
    options?: { topK?: number }
  ): Promise<RagRetrieveHit[]> {
    const settings = await vectorWorkspaceRepository.getSettings()
    if (!settings.ragEnabled) return []

    const q = (query ?? '').trim()
    if (!q) return []

    const connectionId = await this.resolveConnectionId(settings)
    const collection = ragCollectionName(projectId)
    const names = await vectorWorkspaceService.listCollections(connectionId)
    if (!names.includes(collection)) return []

    const { embeddings } = await this.embedTexts([q], settings)
    const topK = options?.topK ?? settings.ragTopK ?? 8
    const scoreThreshold =
      typeof settings.ragScoreThreshold === 'number' ? settings.ragScoreThreshold : null

    const result = await vectorWorkspaceService.search(connectionId, {
      collection,
      query_embeddings: embeddings,
      top_k: topK,
      score_threshold: scoreThreshold,
      include_documents: true,
      include_metadata: true,
      include_distances: true,
      include_embeddings: false
    })

    const ids = result.ids?.[0] ?? []
    const docs = result.documents?.[0] ?? []
    const metas = result.metadatas?.[0] ?? []
    const dists = result.distances?.[0] ?? []

    return ids.map((id, i) => ({
      id,
      document: docs[i] ?? '',
      distance: dists[i] ?? null,
      metadata: metas[i] ?? null
    }))
  }

  formatHits(hits: RagRetrieveHit[]): string {
    if (!hits.length) return ''
    const blocks = hits
      .filter((h) => h.document?.trim())
      .map((h, i) => {
        const section =
          h.metadata && typeof h.metadata.section === 'string' ? h.metadata.section : 'knowledge'
        const dist =
          typeof h.distance === 'number' ? ` (distance: ${h.distance.toFixed(3)})` : ''
        return `### [${i + 1}] ${section}${dist}\n${h.document.trim()}`
      })
    if (!blocks.length) return ''
    return [
      '=== RETRIEVED PROJECT KNOWLEDGE (RAG — most relevant chunks) ===',
      'Use these excerpts as authoritative project context. Prefer them over guessing.',
      '',
      ...blocks,
      '',
      '=== END RETRIEVED KNOWLEDGE ==='
    ].join('\n')
  }

  /**
   * Build chat context via vector retrieval.
   * - null → caller may fall back to full brief KB (only when fallback enabled)
   * - throws when RAG fails and fallback is disabled
   */
  async buildChatContext(
    projectId: string,
    query: string
  ): Promise<{ formatted: string; hitCount: number; source: 'rag' | 'rag-empty' } | null> {
    const settings = await vectorWorkspaceRepository.getSettings()
    if (!settings.ragEnabled) return null

    try {
      const hits = await this.retrieve(projectId, query)
      const formatted = this.formatHits(hits)
      if (!formatted) {
        if (settings.ragFallbackToFullContext) return null
        return {
          formatted:
            '=== RETRIEVED PROJECT KNOWLEDGE ===\nNo indexed chunks matched this query. Ask the user for details or suggest re-indexing Knowledge → Index for RAG.\n=== END ===',
          hitCount: 0,
          source: 'rag-empty'
        }
      }
      return { formatted, hitCount: hits.length, source: 'rag' }
    } catch (e) {
      logger.warn(
        `RAG retrieve failed for ${projectId}: ${e instanceof Error ? e.message : String(e)}`,
        'RAG'
      )
      if (settings.ragFallbackToFullContext) return null
      throw e
    }
  }

  async getLiveContentHash(projectId: string): Promise<string> {
    const bundle = await knowledgeRepository.loadBundle(projectId)
    return computeContentHash(chunkKnowledgeBundle(projectId, bundle))
  }

  async getStatus(projectId: string): Promise<RagStatus> {
    const settings = await vectorWorkspaceRepository.getSettings()
    const meta = settings.ragIndexMeta?.[projectId] ?? null
    const base: RagStatus = {
      enabled: settings.ragEnabled,
      connectionId: settings.ragConnectionId,
      connectionName: null,
      collection: ragCollectionName(projectId),
      indexed: false,
      vectorCount: 0,
      dimension: null,
      indexedAt: meta?.indexedAt ?? null,
      contentHash: meta?.contentHash ?? null,
      stale: false
    }

    try {
      const connectionId = await this.resolveConnectionId(settings)
      const conn = await vectorWorkspaceRepository.getConnection(connectionId)
      base.connectionId = connectionId
      base.connectionName = conn?.name ?? null
      const stats = await vectorWorkspaceService.getCollectionStats(
        connectionId,
        ragCollectionName(projectId)
      )
      if (stats) {
        base.indexed = stats.count > 0
        base.vectorCount = stats.count
        base.dimension = stats.dimension
      }

      if (meta?.contentHash) {
        const liveHash = await this.getLiveContentHash(projectId)
        base.stale = liveHash !== meta.contentHash
      } else if (base.indexed) {
        base.stale = true
      }
    } catch (e) {
      base.lastError = e instanceof Error ? e.message : String(e)
    }

    return base
  }
}

export const ragService = new RagService()
