import type { KnowledgeContext } from '@shared/types'
import { vectorWorkspaceRepository } from '../repositories/vector-workspace.repository'
import { buildKnowledgeContext } from './knowledge-context.service'
import { logger } from '../infra/logger.service'
import { ragService } from '../rag/rag.service'
import { ragTrainingService } from '../rag/rag-training.service'

export type ProjectKnowledgeMode = 'brief' | 'detailed' | 'rag' | 'auto'

export interface ResolveProjectKnowledgeOptions {
  /** User / task query used for RAG retrieval. Required for meaningful RAG. */
  query?: string
  /**
   * - brief / detailed: always dump KB
   * - rag: try RAG; honor fallback setting
   * - auto: RAG when enabled + query present, else brief
   */
  mode?: ProjectKnowledgeMode
  /** When true (default), merge training corpus + model profile into the prompt. */
  includeTraining?: boolean
}

export interface ResolvedProjectKnowledge {
  formatted: string
  source: 'rag' | 'rag-empty' | 'rag-unavailable' | 'brief' | 'detailed' | 'training-only'
  hitCount: number
  businessSummary: string
  usedRag: boolean
}

async function appendTrainingAndProfile(
  baseFormatted: string,
  projectId: string | null | undefined,
  query: string,
  includeTraining: boolean
): Promise<{ formatted: string; trainingHits: number }> {
  if (!includeTraining || !query.trim()) {
    return { formatted: baseFormatted, trainingHits: 0 }
  }

  const parts: string[] = [baseFormatted]
  let trainingHits = 0

  try {
    const profile = await ragTrainingService.formatModelProfileBlock()
    if (profile) parts.push(profile)
  } catch (e) {
    logger.warn(
      `Model profile skipped: ${e instanceof Error ? e.message : String(e)}`,
      'ProjectKnowledge'
    )
  }

  try {
    const hits = await ragTrainingService.retrieveForQuery(query, projectId)
    trainingHits = hits.length
    const block = ragTrainingService.formatTrainingHits(hits)
    if (block) parts.push(block)
  } catch (e) {
    logger.warn(
      `Training RAG skipped: ${e instanceof Error ? e.message : String(e)}`,
      'ProjectKnowledge'
    )
  }

  return { formatted: parts.filter(Boolean).join('\n\n'), trainingHits }
}

/**
 * Single entry point for project knowledge in AI prompts.
 * Chat, validation, estimation, and other features should prefer this over
 * calling buildKnowledgeContext / ragService directly.
 */
export async function resolveProjectKnowledge(
  projectId: string,
  options?: ResolveProjectKnowledgeOptions
): Promise<ResolvedProjectKnowledge> {
  const mode = options?.mode ?? 'auto'
  const query = options?.query?.trim() ?? ''
  const includeTraining = options?.includeTraining !== false

  const detailed = mode === 'detailed'
  const knowledgeCtx = await buildKnowledgeContext(projectId, { detailed })

  const base = {
    businessSummary: knowledgeCtx.businessSummary,
    hitCount: 0,
    usedRag: false
  }

  if (mode === 'brief' || mode === 'detailed') {
    const merged = await appendTrainingAndProfile(
      knowledgeCtx.formatted,
      projectId,
      query,
      includeTraining && Boolean(query)
    )
    return {
      ...base,
      formatted: merged.formatted,
      source: detailed ? 'detailed' : 'brief',
      hitCount: merged.trainingHits,
      usedRag: merged.trainingHits > 0
    }
  }

  const settings = await vectorWorkspaceRepository.getSettings()
  const wantRag = mode === 'rag' || (mode === 'auto' && settings.ragEnabled && Boolean(query))

  if (!wantRag || !query) {
    const merged = await appendTrainingAndProfile(
      knowledgeCtx.formatted,
      projectId,
      query,
      includeTraining && Boolean(query)
    )
    return {
      ...base,
      formatted: merged.formatted,
      source: 'brief',
      hitCount: merged.trainingHits,
      usedRag: merged.trainingHits > 0
    }
  }

  try {
    const rag = await ragService.buildChatContext(projectId, query)
    if (!rag) {
      const merged = await appendTrainingAndProfile(
        knowledgeCtx.formatted,
        projectId,
        query,
        includeTraining
      )
      return {
        ...base,
        formatted: merged.formatted,
        source: 'brief',
        hitCount: merged.trainingHits,
        usedRag: merged.trainingHits > 0
      }
    }

    const overview = knowledgeCtx.businessSummary
      ? `Project overview:\n${knowledgeCtx.businessSummary}\n\n`
      : ''
    const merged = await appendTrainingAndProfile(
      `${overview}${rag.formatted}`,
      projectId,
      query,
      includeTraining
    )
    return {
      formatted: merged.formatted,
      source: rag.source,
      hitCount: rag.hitCount + merged.trainingHits,
      businessSummary: knowledgeCtx.businessSummary,
      usedRag: true
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.warn(`resolveProjectKnowledge RAG failed: ${message}`, 'ProjectKnowledge')

    if (settings.ragFallbackToFullContext) {
      const merged = await appendTrainingAndProfile(
        knowledgeCtx.formatted,
        projectId,
        query,
        includeTraining
      )
      return {
        ...base,
        formatted: merged.formatted,
        source: 'brief',
        hitCount: merged.trainingHits,
        usedRag: merged.trainingHits > 0
      }
    }

    const stub = `=== PROJECT KNOWLEDGE (RAG unavailable) ===\n${message}\nRe-index from Knowledge → Index for RAG, or enable fallback in Settings → Vector DB.\n=== END ===`
    const merged = await appendTrainingAndProfile(stub, projectId, query, includeTraining)
    return {
      formatted: merged.formatted,
      source: 'rag-unavailable',
      hitCount: merged.trainingHits,
      businessSummary: knowledgeCtx.businessSummary,
      usedRag: true
    }
  }
}

/**
 * Context for any assistant surface (global or project-linked).
 * Global chat without a project still gets model profile + global training corpus.
 */
export async function resolveAssistantContext(options: {
  projectId?: string | null
  query?: string
  mode?: ProjectKnowledgeMode
}): Promise<ResolvedProjectKnowledge> {
  const projectId = options.projectId ?? null
  const query = options.query?.trim() ?? ''

  if (projectId) {
    return resolveProjectKnowledge(projectId, {
      query,
      mode: options.mode ?? 'auto',
      includeTraining: true
    })
  }

  if (!query) {
    const profile = await ragTrainingService.formatModelProfileBlock()
    return {
      formatted: profile || 'No project linked. Answer as a general software engineering assistant.',
      source: 'training-only',
      hitCount: 0,
      businessSummary: 'Not defined',
      usedRag: Boolean(profile)
    }
  }

  const parts: string[] = []
  try {
    const profile = await ragTrainingService.formatModelProfileBlock()
    if (profile) parts.push(profile)
  } catch {
    /* ignore */
  }

  let hits = 0
  try {
    const trainingHits = await ragTrainingService.retrieveForQuery(query, null)
    hits = trainingHits.length
    const block = ragTrainingService.formatTrainingHits(trainingHits)
    if (block) parts.push(block)
  } catch {
    /* ignore */
  }

  if (!parts.length) {
    return {
      formatted: '',
      source: 'training-only',
      hitCount: 0,
      businessSummary: 'Not defined',
      usedRag: false
    }
  }

  return {
    formatted: parts.join('\n\n'),
    source: 'training-only',
    hitCount: hits,
    businessSummary: 'Not defined',
    usedRag: hits > 0 || parts.length > 0
  }
}

/** Convenience for callers that only need the formatted string. */
export async function resolveProjectKnowledgeText(
  projectId: string,
  options?: ResolveProjectKnowledgeOptions
): Promise<string> {
  return (await resolveProjectKnowledge(projectId, options)).formatted
}

export type { KnowledgeContext }
