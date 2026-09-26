import type { SearchProjectInput, WorkbenchIntegration } from '@shared/types/voice-assistant'
import { knowledgeRepository } from '../../repositories/knowledge.repository'
import { projectRepository } from '../../repositories/project.repository'
import { ragService } from '../../rag/rag.service'
import { voiceSettingsStore } from '../settings.store'
import { logger } from '../../infra/logger.service'

/**
 * Studio boundary: voice tools may search projects/knowledge without importing renderer modules.
 */
export class StudioWorkbenchIntegration implements WorkbenchIntegration {
  async createProject(_input: { name: string; description?: string }): Promise<never> {
    throw new Error('Creating projects from voice is not enabled.')
  }

  async createRequirement(_input: {
    projectId: string
    title: string
    description: string
  }): Promise<never> {
    throw new Error('Creating requirements from voice is not enabled.')
  }

  async generateDocument(_input: { projectId: string; type: string }): Promise<never> {
    throw new Error('Generating documents from voice is not enabled.')
  }

  async searchProject(input: SearchProjectInput) {
    const query = input.query.trim()
    if (!query) return []

    const projectId = input.projectId || (await resolveDefaultProjectId())
    if (!projectId) return []

    const ragOn = voiceSettingsStore.get().rag?.enabled !== false
    if (ragOn) {
      try {
        const hits = await ragService.retrieve(projectId, query)
        if (hits.length > 0) {
          return hits.slice(0, 8).map((hit) => ({
            id: hit.id,
            title:
              (hit.metadata && typeof hit.metadata.section === 'string' && hit.metadata.section) ||
              'Project knowledge',
            snippet: (hit.document || '').trim().slice(0, 400)
          }))
        }
      } catch (error) {
        logger.warn(
          `Voice RAG search fell back to knowledge: ${error instanceof Error ? error.message : String(error)}`,
          'Voice'
        )
      }
    }

    const rows = await knowledgeRepository.search(projectId, query)
    return rows.slice(0, 8).map((row) => ({
      id: row.id,
      title: row.title,
      snippet: row.snippet
    }))
  }
}

async function resolveDefaultProjectId(): Promise<string | null> {
  const projects = await projectRepository.list('active')
  return projects[0]?.id ?? null
}

export const workbenchIntegration = new StudioWorkbenchIntegration()
