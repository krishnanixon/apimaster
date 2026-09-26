import { architectureRepository } from '../repositories/architecture.repository'
import { documentRepository } from '../repositories/document.repository'
import { flowRepository } from '../repositories/flow.repository'
import { knowledgeRepository } from '../repositories/knowledge.repository'
import { projectRepository } from '../repositories/project.repository'

export interface PresentationProjectContext {
  project: { id: string; name: string; description: string } | null
  requirements: Array<Record<string, unknown>>
  documents: Array<Record<string, unknown>>
  apis: Array<Record<string, unknown>>
  database: Array<Record<string, unknown>>
  flows: Array<Record<string, unknown>>
  architecture: Array<Record<string, unknown>>
  tasks: Array<Record<string, unknown>>
}

function summary<T extends object>(value: T, keys: string[]): Record<string, unknown> {
  const record = value as Record<string, unknown>
  return Object.fromEntries(keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]))
}

/** Presentation-facing boundary over Diablo project modules. */
export class PresentationContextService {
  async getProjectContext(projectId: string): Promise<PresentationProjectContext> {
    const [project, bundle, documents, flows, architecture] = await Promise.all([
      projectRepository.getById(projectId),
      knowledgeRepository.loadBundle(projectId),
      documentRepository.listByProject(projectId),
      flowRepository.listByProject(projectId),
      architectureRepository.listByProject(projectId)
    ])
    return {
      project: project ? { id: project.id, name: project.name, description: project.description } : null,
      requirements: bundle.requirements.slice(0, 100).map((item) => summary(item, ['id', 'code', 'title', 'description', 'priority', 'status', 'type'])),
      documents: documents.slice(0, 50).map((item) => summary(item, ['id', 'title', 'type', 'status', 'tags', 'updatedAt'])),
      apis: bundle.apiEndpoints.slice(0, 100).map((item) => summary(item, ['id', 'method', 'path', 'description', 'auth'])),
      database: bundle.entities.slice(0, 100).map((item) => summary(item, ['id', 'name', 'description', 'fields', 'notes'])),
      flows: flows.slice(0, 50).map((item) => summary(item, ['id', 'title', 'description', 'category'])),
      architecture: architecture.slice(0, 50).map((item) => summary(item, ['id', 'title', 'description', 'systemType'])),
      // Diablo currently has no first-class Task persistence model.
      tasks: []
    }
  }

  async prepareForAI(projectId: string): Promise<string> {
    const context = await this.getProjectContext(projectId)
    return `=== STRUCTURED PROJECT CONTEXT ===\n${JSON.stringify(context, null, 2).slice(0, 50000)}`
  }
}

export const presentationContextService = new PresentationContextService()
