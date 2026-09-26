import { logger } from '../infra/logger.service'
import { aiRouter } from '../ai'
import type { ExtractKnowledgeInput, ExtractKnowledgeResult, KnowledgeBundle } from '@shared/types'
import { knowledgeRepository } from '../repositories/knowledge.repository'
import { serializeOpenQuestionNotes } from '@shared/lib/project-lifecycle'

const EXTRACTION_PROMPT = `You are a requirements analyst for a generic software project (any industry or platform).

Extract structured project knowledge from the text. Return ONLY valid JSON.

Rules:
- Extract ONLY what is explicitly stated or clearly implied.
- Do NOT invent modules, features, vendors, platforms, SLAs, or requirements that are not in the text.
- If something important is missing or ambiguous, add an openQuestions entry instead of guessing.
- Keep titles short. Cap: 8 modules, 20 features, 25 requirements, 10 roles, 10 questions.

JSON shape (omit empty arrays):
{
  "overview": {
    "projectSummary": "",
    "targetUsers": "",
    "scope": "",
    "outOfScope": "",
    "goals": []
  },
  "roles": [{ "name": "", "description": "" }],
  "modules": [{ "title": "", "description": "", "priority": "high|medium|low" }],
  "features": [{ "title": "", "description": "", "moduleTitle": "", "priority": "high|medium|low" }],
  "requirements": [{
    "title": "",
    "description": "",
    "type": "functional|non_functional",
    "priority": "critical|high|medium|low",
    "nfrCategory": "",
    "acceptanceCriteria": []
  }],
  "businessRules": [{ "title": "", "description": "" }],
  "integrations": [{ "name": "", "description": "", "type": "" }],
  "risks": [{ "title": "", "description": "", "severity": "high|medium|low" }],
  "assumptions": [{ "title": "", "description": "" }],
  "openQuestions": [{
    "question": "",
    "reason": "",
    "affectedArea": "requirements|scope|product|architecture|data|api|ux|security|other",
    "priority": "high|medium|low"
  }]
}`

function parseExtraction(raw: string): Record<string, unknown> {
  let text = raw.trim()
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (fenceMatch) text = fenceMatch[1].trim()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>> : []
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function hasTitle(set: Set<string>, title: string): boolean {
  return set.has(title.trim().toLowerCase())
}

function remember(set: Set<string>, title: string): void {
  const key = title.trim().toLowerCase()
  if (key) set.add(key)
}

export async function extractKnowledgeFromText(
  input: ExtractKnowledgeInput
): Promise<ExtractKnowledgeResult> {
  try {
    const result = await aiRouter.chat(
      [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: input.text }
      ],
      {
        temperature: 0.2,
        maxTokens: 8192,
        json: true,
        requestType: 'REQUIREMENT_ANALYSIS',
        meta: { projectId: input.projectId, feature: 'knowledge' }
      }
    )

    const parsed = parseExtraction(result.text || '{}')
    return await saveExtractedKnowledge(input.projectId, parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed'
    logger.error(`Knowledge extraction error: ${message}`, 'KnowledgeExtraction')
    throw new Error(message)
  }
}

async function saveExtractedKnowledge(
  projectId: string,
  data: Record<string, unknown>
): Promise<ExtractKnowledgeResult> {
  const counts: ExtractKnowledgeResult = {
    modules: 0,
    features: 0,
    requirements: 0,
    roles: 0,
    apiEndpoints: 0,
    entities: 0,
    businessRules: 0,
    risks: 0,
    assumptions: 0,
    openQuestions: 0,
    integrations: 0
  }

  const existing = await knowledgeRepository.loadBundle(projectId)
  const moduleTitles = new Set(existing.modules.map((m) => m.title.toLowerCase()))
  const featureTitles = new Set(existing.features.map((f) => f.title.toLowerCase()))
  const requirementTitles = new Set(existing.requirements.map((r) => r.title.toLowerCase()))
  const roleNames = new Set(existing.roles.map((r) => r.name.toLowerCase()))
  const ruleTitles = new Set(existing.businessRules.map((r) => r.title.toLowerCase()))
  const integrationNames = new Set(existing.integrations.map((i) => i.name.toLowerCase()))
  const riskTitles = new Set(existing.risks.map((r) => r.title.toLowerCase()))
  const assumptionTitles = new Set(existing.assumptions.map((a) => a.title.toLowerCase()))

  const overview = data.overview as Record<string, unknown> | undefined
  if (overview) {
    const goals = overview.goals
    const patch: Record<string, string> = {}
    const summary = str(overview.projectSummary)
    const users = str(overview.targetUsers)
    const scope = str(overview.scope)
    const outOfScope = str(overview.outOfScope)
    if (summary) patch.projectSummary = summary
    if (users) patch.targetUsers = users
    if (scope) patch.scope = scope
    if (outOfScope) patch.outOfScope = outOfScope
    if (Array.isArray(goals) && goals.length > 0) patch.goals = JSON.stringify(goals)
    if (Object.keys(patch).length > 0) {
      await knowledgeRepository.updateOverview(projectId, patch)
    }
  }

  const moduleMap = new Map<string, string>(existing.modules.map((m) => [m.title.toLowerCase(), m.id]))

  for (const m of asRecords(data.modules)) {
    const title = str(m.title)
    if (!title || hasTitle(moduleTitles, title)) continue
    const created = await knowledgeRepository.createModule(projectId, {
      title,
      description: str(m.description),
      priority: str(m.priority) || 'medium',
      status: 'planned'
    })
    moduleMap.set(title.toLowerCase(), created.id)
    remember(moduleTitles, title)
    counts.modules++
  }

  for (const f of asRecords(data.features)) {
    const title = str(f.title)
    if (!title || hasTitle(featureTitles, title)) continue
    const moduleTitle = str(f.moduleTitle).toLowerCase()
    await knowledgeRepository.createFeature(projectId, {
      title,
      description: str(f.description),
      moduleId: moduleTitle ? moduleMap.get(moduleTitle) ?? null : null,
      complexity: 'medium',
      priority: str(f.priority) || 'medium'
    })
    remember(featureTitles, title)
    counts.features++
  }

  for (const r of asRecords(data.requirements)) {
    const title = str(r.title)
    if (!title || hasTitle(requirementTitles, title)) continue
    const type = str(r.type) === 'non_functional' ? 'non_functional' : 'functional'
    const criteria = Array.isArray(r.acceptanceCriteria) ? r.acceptanceCriteria : []
    await knowledgeRepository.createRequirement(projectId, {
      title,
      description: str(r.description),
      type,
      priority: str(r.priority) || 'medium',
      nfrCategory: type === 'non_functional' ? str(r.nfrCategory) || 'general' : '',
      acceptanceCriteria: JSON.stringify(criteria)
    })
    remember(requirementTitles, title)
    counts.requirements++
  }

  for (const role of asRecords(data.roles)) {
    const name = str(role.name)
    if (!name || hasTitle(roleNames, name)) continue
    await knowledgeRepository.createRole(projectId, {
      name,
      description: str(role.description)
    })
    remember(roleNames, name)
    counts.roles++
  }

  for (const rule of asRecords(data.businessRules)) {
    const title = str(rule.title)
    if (!title || hasTitle(ruleTitles, title)) continue
    await knowledgeRepository.createBusinessRule(projectId, {
      title,
      description: str(rule.description)
    })
    remember(ruleTitles, title)
    counts.businessRules++
  }

  for (const integration of asRecords(data.integrations)) {
    const name = str(integration.name)
    if (!name || hasTitle(integrationNames, name)) continue
    await knowledgeRepository.createIntegration(projectId, {
      name,
      description: str(integration.description),
      type: str(integration.type)
    })
    remember(integrationNames, name)
    counts.integrations++
  }

  for (const risk of asRecords(data.risks)) {
    const title = str(risk.title)
    if (!title || hasTitle(riskTitles, title)) continue
    await knowledgeRepository.createRisk(projectId, {
      title,
      description: str(risk.description),
      severity: str(risk.severity) || 'medium'
    })
    remember(riskTitles, title)
    counts.risks++
  }

  for (const assumption of asRecords(data.assumptions)) {
    const title = str(assumption.title)
    if (!title || hasTitle(assumptionTitles, title)) continue
    await knowledgeRepository.createAssumption(projectId, {
      title,
      description: str(assumption.description)
    })
    remember(assumptionTitles, title)
    counts.assumptions++
  }

  for (const question of asRecords(data.openQuestions)) {
    const title = str(question.question)
    if (!title || hasTitle(assumptionTitles, title)) continue
    await knowledgeRepository.createAssumption(projectId, {
      title,
      description: str(question.reason),
      notes: serializeOpenQuestionNotes({
        affectedArea: str(question.affectedArea) || 'general',
        priority: str(question.priority) || 'medium',
        status: 'open'
      })
    })
    remember(assumptionTitles, title)
    counts.openQuestions++
  }

  return counts
}

export async function syncKnowledgeToSearch(
  projectId: string,
  indexFn: (entityType: string, entityId: string, projectId: string, title: string, content: string) => Promise<void>
): Promise<void> {
  const bundle = await knowledgeRepository.loadBundle(projectId)

  for (const m of bundle.modules) {
    await indexFn('knowledge_module', m.id, projectId, m.title, m.description)
  }
  for (const f of bundle.features) {
    await indexFn('knowledge_feature', f.id, projectId, f.title, f.description)
  }
  for (const r of bundle.requirements) {
    await indexFn('knowledge_requirement', r.id, projectId, `${r.code} ${r.title}`, r.description)
  }
  for (const a of bundle.apiEndpoints) {
    await indexFn('knowledge_api', a.id, projectId, `${a.method} ${a.path}`, a.description)
  }
  for (const e of bundle.entities) {
    await indexFn('knowledge_entity', e.id, projectId, e.name, e.notes)
  }
  for (const b of bundle.businessRules) {
    await indexFn('knowledge_rule', b.id, projectId, b.title, b.description)
  }
}

export type { KnowledgeBundle }
