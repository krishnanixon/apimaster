import type { AssistantTool } from '../types'
import { ASSISTANT_NAME } from '@shared/constants/product'
import { workbenchIntegration } from '../../workbench/WorkbenchIntegration'
import { projectRepository } from '../../../repositories/project.repository'

export const listProjectsTool: AssistantTool = {
  name: 'list_projects',
  description: `List studio projects ${ASSISTANT_NAME} can answer questions about.`,
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute() {
    try {
      const projects = await projectRepository.list('active')
      if (projects.length === 0) return { ok: true, output: 'There are no active projects yet.' }
      return {
        ok: true,
        output: projects
          .slice(0, 12)
          .map((p, i) => `${i + 1}. ${p.name} (id: ${p.id})${p.description ? ` — ${p.description.slice(0, 120)}` : ''}`)
          .join('\n')
      }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not list projects.' }
    }
  }
}

export const searchProjectTool: AssistantTool = {
  name: 'search_project',
  description:
    'Search project knowledge, requirements, features, and APIs. Use for project-related questions. Uses RAG when enabled.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look up in the project' },
      projectId: { type: 'string', description: 'Optional project id from list_projects' }
    },
    required: ['query'],
    additionalProperties: false
  },
  async execute(input) {
    const { query, projectId } = input as { query: string; projectId?: string }
    const q = String(query ?? '').trim()
    if (!q) return { ok: false, output: 'Query is required.' }
    try {
      const hits = await workbenchIntegration.searchProject({
        query: q,
        projectId: projectId?.trim() || undefined
      })
      if (hits.length === 0) {
        return {
          ok: true,
          output: 'No matching project knowledge. The project may be empty or RAG may need indexing in Settings → Vector DB.'
        }
      }
      return {
        ok: true,
        output: hits
          .slice(0, 8)
          .map((hit, i) => `${i + 1}. ${hit.title}: ${hit.snippet}`)
          .join('\n')
      }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not search the project.' }
    }
  }
}
