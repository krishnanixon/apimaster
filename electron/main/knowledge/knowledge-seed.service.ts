import { knowledgeRepository } from '../repositories/knowledge.repository'
import { searchRepository } from '../repositories/settings.repository'
import { syncKnowledgeToSearch } from './knowledge-extraction.service'
import {
  SAMPLE_API_ENDPOINTS,
  SAMPLE_ASSUMPTIONS,
  SAMPLE_BUSINESS_RULES,
  SAMPLE_DECISIONS,
  SAMPLE_ENTITIES,
  SAMPLE_FEATURES_BY_MODULE,
  SAMPLE_INTEGRATIONS,
  SAMPLE_MODULES,
  SAMPLE_OVERVIEW,
  SAMPLE_REPORTS,
  SAMPLE_REQUIREMENTS,
  SAMPLE_RISKS,
  SAMPLE_ROLES,
  SAMPLE_STAKEHOLDERS,
  SAMPLE_WORKFLOWS
} from '@shared/lib/knowledge-sample-data'
import { logger } from '../infra/logger.service'

export interface SeedResult {
  itemsCreated: number
  skipped: boolean
  message: string
}

export async function seedSampleKnowledge(projectId: string, force = false): Promise<SeedResult> {
  const bundle = await knowledgeRepository.loadBundle(projectId)
  const hasData =
    bundle.modules.length > 0 ||
    bundle.requirements.length > 0 ||
    (bundle.overview?.projectSummary?.length ?? 0) > 50

  if (hasData && !force) {
    return {
      itemsCreated: 0,
      skipped: true,
      message: 'Knowledge base already has data. Use force to replace sample content.'
    }
  }

  let count = 0

  await knowledgeRepository.updateOverview(projectId, SAMPLE_OVERVIEW)
  count++

  const moduleIdByTitle = new Map<string, string>()
  for (const mod of SAMPLE_MODULES) {
    const created = await knowledgeRepository.createModule(projectId, { ...mod })
    moduleIdByTitle.set(mod.title, created.id)
    count++
  }

  for (const [moduleTitle, features] of Object.entries(SAMPLE_FEATURES_BY_MODULE)) {
    const moduleId = moduleIdByTitle.get(moduleTitle)
    for (const feat of features) {
      await knowledgeRepository.createFeature(projectId, {
        ...feat,
        moduleId: moduleId ?? null,
        priority: 'medium',
        status: 'planned'
      })
      count++
    }
  }

  for (const s of SAMPLE_STAKEHOLDERS) {
    await knowledgeRepository.createStakeholder(projectId, s)
    count++
  }
  for (const r of SAMPLE_ROLES) {
    await knowledgeRepository.createRole(projectId, r)
    count++
  }
  for (const r of SAMPLE_REQUIREMENTS) {
    await knowledgeRepository.createRequirement(projectId, {
      ...r,
      type: r.type as 'functional' | 'non_functional'
    })
    count++
  }
  for (const b of SAMPLE_BUSINESS_RULES) {
    await knowledgeRepository.createBusinessRule(projectId, b)
    count++
  }
  for (const a of SAMPLE_API_ENDPOINTS) {
    await knowledgeRepository.createAPIEndpoint(projectId, a)
    count++
  }
  for (const e of SAMPLE_ENTITIES) {
    await knowledgeRepository.createEntity(projectId, e)
    count++
  }
  for (const i of SAMPLE_INTEGRATIONS) {
    await knowledgeRepository.createIntegration(projectId, i)
    count++
  }
  for (const r of SAMPLE_RISKS) {
    await knowledgeRepository.createRisk(projectId, r)
    count++
  }
  for (const a of SAMPLE_ASSUMPTIONS) {
    await knowledgeRepository.createAssumption(projectId, a)
    count++
  }
  for (const d of SAMPLE_DECISIONS) {
    await knowledgeRepository.createDecision(projectId, d)
    count++
  }
  for (const r of SAMPLE_REPORTS) {
    await knowledgeRepository.createReport(projectId, r)
    count++
  }
  for (const w of SAMPLE_WORKFLOWS) {
    await knowledgeRepository.createWorkflow(projectId, w)
    count++
  }

  await syncKnowledgeToSearch(projectId, searchRepository.index.bind(searchRepository))

  logger.info(`Seeded ${count} knowledge items for project ${projectId}`, 'KnowledgeSeed')
  return {
    itemsCreated: count,
    skipped: false,
    message: `Loaded ${count} sample knowledge items`
  }
}
