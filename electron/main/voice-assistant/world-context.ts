import type { VoiceAssistantSettings } from '@shared/types/voice-assistant'
import { looksLikeProjectQuestion } from '@shared/lib/voice-project-intent'
import { projectRepository } from '../repositories/project.repository'
import { resolveProjectKnowledge } from '../knowledge/project-knowledge.service'
import { voiceMemoryRepository } from './voice-db'
import { logger } from '../infra/logger.service'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(null)
      })
  })
}

/** Extra system context: remembered facts + optional project RAG. */
export async function buildVoiceWorldContext(
  query: string,
  settings: VoiceAssistantSettings
): Promise<string[]> {
  const blocks: string[] = []

  if (settings.memory?.enabled !== false) {
    try {
      const facts = await voiceMemoryRepository.list(18)
      if (facts.length > 0) {
        blocks.push(
          `Remembered facts (treat as true unless the user corrects them):\n${facts
            .map((f) => `- ${f.topic ? `${f.topic}: ` : ''}${f.content}`)
            .join('\n')}`
        )
      }
    } catch (error) {
      logger.warn(
        `Voice memory skipped: ${error instanceof Error ? error.message : String(error)}`,
        'Voice'
      )
    }
  }

  if (settings.rag?.enabled !== false && looksLikeProjectQuestion(query)) {
    try {
      const projects = await projectRepository.list('active')
      const project = projects[0]
      if (project) {
        const knowledge = await withTimeout(
          resolveProjectKnowledge(project.id, {
            query,
            mode: 'auto',
            includeTraining: true
          }),
          2500
        )
        if (knowledge?.formatted.trim()) {
          blocks.push(
            `Current project: ${project.name}. Answer from this knowledge when the question is about the project.\n${knowledge.formatted.slice(0, 5500)}`
          )
        }
      }
    } catch (error) {
      logger.warn(
        `Voice RAG context skipped: ${error instanceof Error ? error.message : String(error)}`,
        'Voice'
      )
    }
  }

  return blocks
}
