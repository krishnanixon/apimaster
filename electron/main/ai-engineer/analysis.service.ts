import { v4 as uuidv4 } from 'uuid'
import type { ApiCollection } from '@shared/types/api-studio'
import type { AnalyzeApiInput, ApiAnalysisRecord } from '@shared/types/ai-engineer'
import { buildApiSpecFromCollection } from '@shared/lib/ai-engineer/collection-spec'
import { parseOpenApiDocument } from '@shared/lib/ai-engineer/openapi-import'
import { sanitizeSpecForAi } from '@shared/lib/ai-engineer/sanitize-for-ai'
import { aiEngineerRepository } from './ai-engineer.repository'
import { aiEngineerProvider } from './ai-engineer-provider'
import { logger } from '../infra/logger.service'

function asCollection(value: unknown): ApiCollection | null {
  if (!value || typeof value !== 'object') return null
  const c = value as ApiCollection
  if (typeof c.name !== 'string' || !Array.isArray(c.requests)) return null
  return c
}

export class AnalysisService {
  async analyze(input: AnalyzeApiInput): Promise<ApiAnalysisRecord> {
    const config = aiEngineerRepository.getConfig()
    let spec =
      input.openApiJson?.trim()
        ? parseOpenApiDocument(input.openApiJson, input.collectionName ?? 'OpenAPI')
        : null

    if (!spec) {
      const collection = asCollection(input.collection)
      if (!collection) throw new Error('Provide a collection or OpenAPI JSON to analyze')
      spec = buildApiSpecFromCollection(collection)
    }

    let aiEnriched = false
    let aiSummary: string | undefined

    if (input.enrichWithAi !== false && config.sendApiDataToAi) {
      try {
        aiSummary = await aiEngineerProvider.enrichAnalysis(sanitizeSpecForAi(spec))
        aiEnriched = Boolean(aiSummary)
      } catch (e) {
        logger.warn(e instanceof Error ? e.message : 'AI enrichment skipped', 'AIEngineer')
      }
    }

    const record: ApiAnalysisRecord = {
      id: uuidv4(),
      spec,
      collectionId: input.collectionId,
      collectionName: input.collectionName ?? spec.name,
      aiEnriched,
      aiSummary,
      createdAt: new Date().toISOString()
    }

    return aiEngineerRepository.saveAnalysis(record)
  }

  getAnalysis(id: string): ApiAnalysisRecord | undefined {
    return aiEngineerRepository.getAnalysis(id)
  }

  listAnalyses(): ApiAnalysisRecord[] {
    return aiEngineerRepository.listAnalyses()
  }
}

export const analysisService = new AnalysisService()
