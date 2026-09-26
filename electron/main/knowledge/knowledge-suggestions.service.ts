import type { KnowledgeBundle, KnowledgeSuggestion } from '@shared/types'
import { knowledgeRepository } from '../repositories/knowledge.repository'
import { listOpenQuestions } from '@shared/lib/project-lifecycle'

export async function analyzeKnowledgeSuggestions(projectId: string): Promise<KnowledgeSuggestion[]> {
  const bundle = await knowledgeRepository.loadBundle(projectId)
  return generateSuggestions(bundle)
}

export function generateSuggestions(bundle: KnowledgeBundle): KnowledgeSuggestion[] {
  const suggestions: KnowledgeSuggestion[] = []
  let id = 0
  const add = (
    type: KnowledgeSuggestion['type'],
    title: string,
    description: string,
    section?: KnowledgeSuggestion['section']
  ) => {
    suggestions.push({ id: String(++id), type, title, description, section })
  }

  if (!bundle.overview?.projectSummary?.trim()) {
    add('info', 'Add a summary', 'A short project summary helps AI give better answers.', 'overview')
  }

  if (bundle.modules.length === 0) {
    add('tip', 'Add modules', 'List the main areas of your system (e.g. Billing, Scheduling).', 'modules')
  } else {
    for (const mod of bundle.modules) {
      const modFeatures = bundle.features.filter((f) => f.moduleId === mod.id)
      if (modFeatures.length === 0) {
        add('info', `${mod.title}`, 'Add at least one feature under this module.', 'modules')
        break
      }
    }
  }

  if (bundle.requirements.length === 0 && bundle.modules.length > 0) {
    add('tip', 'Add requirements', 'Capture a few key things the system must do.', 'requirements')
  }

  const openQuestions = listOpenQuestions(bundle)
  if (openQuestions.length > 0) {
    add(
      'warning',
      `${openQuestions.length} open question${openQuestions.length === 1 ? '' : 's'}`,
      'Answer these in Knowledge before generating later-stage documents. Do not invent missing requirements.',
      'overview'
    )
  }

  return suggestions.slice(0, 4)
}
