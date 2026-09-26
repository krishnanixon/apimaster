import { describe, expect, it } from 'vitest'
import type { Document, KnowledgeBundle } from '../shared/types'
import {
  ANALYSIS_STARTER_PACK,
  DOCUMENT_TYPE_LABELS,
  LIFECYCLE_STAGES,
  computeLifecycleProgress,
  computeProjectHealth,
  inferCurrentStage,
  listOpenQuestions,
  parseOpenQuestionFromAssumption,
  serializeOpenQuestionNotes
} from '../shared/lib/project-lifecycle'
import { SECTION_BLUEPRINTS, TYPE_GENERATION_BRIEF } from '../shared/lib/document-prompts'

function emptyBundle(): KnowledgeBundle {
  return {
    overview: null,
    stakeholders: [],
    roles: [],
    modules: [],
    features: [],
    requirements: [],
    businessRules: [],
    workflows: [],
    entities: [],
    apiEndpoints: [],
    integrations: [],
    reports: [],
    risks: [],
    assumptions: [],
    decisions: []
  }
}

describe('project lifecycle', () => {
  it('labels every document type', () => {
    const types = Object.keys(SECTION_BLUEPRINTS)
    expect(types.length).toBeGreaterThan(20)
    for (const type of types) {
      expect(DOCUMENT_TYPE_LABELS[type as keyof typeof DOCUMENT_TYPE_LABELS]).toBeTruthy()
      expect(TYPE_GENERATION_BRIEF[type as keyof typeof TYPE_GENERATION_BRIEF]).toBeTruthy()
    }
  })

  it('starter pack is discovery through SRS', () => {
    expect(ANALYSIS_STARTER_PACK).toEqual(['discovery', 'brd', 'scope', 'prd', 'requirements'])
  })

  it('computes missing documents per stage', () => {
    const docs = [
      { id: '1', title: 'BRD', type: 'brd', status: 'draft' }
    ] as Pick<Document, 'id' | 'title' | 'type' | 'status'>[]
    const progress = computeLifecycleProgress(docs)
    const requirements = progress.find((p) => p.stage.id === 'requirements')
    expect(requirements?.existing.map((d) => d.type)).toContain('brd')
    expect(requirements?.missing).toContain('requirements')
    expect(inferCurrentStage([])).toBe('discovery')
    expect(LIFECYCLE_STAGES[0].id).toBe('discovery')
  })

  it('parses open questions from assumptions', () => {
    const notes = serializeOpenQuestionNotes({
      affectedArea: 'scope',
      priority: 'high',
      status: 'open'
    })
    const parsed = parseOpenQuestionFromAssumption({
      id: 'q1',
      title: 'Which platforms?',
      description: 'Source did not specify mobile vs web',
      notes
    })
    expect(parsed).toMatchObject({
      question: 'Which platforms?',
      affectedArea: 'scope',
      priority: 'high',
      status: 'open'
    })
  })

  it('does not call a project healthy without knowledge or docs', () => {
    const health = computeProjectHealth([], emptyBundle())
    expect(health.status).toBe('critical')
    expect(health.factors.some((f) => f.id === 'knowledge' && f.score === 0)).toBe(true)
    expect(health.reasons.length).toBeGreaterThan(0)
  })

  it('lists only unanswered open questions', () => {
    const bundle = emptyBundle()
    bundle.assumptions = [
      {
        id: '1',
        projectId: 'p',
        title: 'Open',
        description: 'Need answer',
        sortOrder: 0,
        notes: serializeOpenQuestionNotes({ affectedArea: 'ux', priority: 'medium', status: 'open' }),
        deletedAt: null,
        createdAt: '',
        updatedAt: ''
      },
      {
        id: '2',
        projectId: 'p',
        title: 'Answered',
        description: 'Done',
        sortOrder: 1,
        notes: serializeOpenQuestionNotes({ affectedArea: 'ux', priority: 'medium', status: 'answered' }),
        deletedAt: null,
        createdAt: '',
        updatedAt: ''
      }
    ]
    expect(listOpenQuestions(bundle).map((q) => q.id)).toEqual(['1'])
  })
})
