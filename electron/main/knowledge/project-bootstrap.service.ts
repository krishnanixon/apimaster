import { getPrismaClient } from '../database/client'
import { knowledgeRepository } from '../repositories/knowledge.repository'
import { conversationRepository } from '../repositories/conversation.repository'
import {
  buildProjectSystemPrompt,
  buildKnowledgeOverviewFromProject
} from '@shared/lib/project-bootstrap'
import type { Project } from '@shared/types'
import { logger } from '../infra/logger.service'

/** Seed knowledge, settings, and a starter chat for a new project. */
export async function bootstrapNewProject(project: Project): Promise<void> {
  const prisma = getPrismaClient()

  const overview = buildKnowledgeOverviewFromProject(project)
  await knowledgeRepository.updateOverview(project.id, overview)

  await knowledgeRepository.createModule(project.id, {
    title: `${project.name} — Core`,
    description:
      project.description?.trim() ||
      `Primary module capturing core requirements and features for ${project.name}.`,
    priority: 'high',
    status: 'planned'
  })

  const systemPrompt = buildProjectSystemPrompt({
    name: project.name,
    description: project.description,
    companyName: project.companyName || project.name
  })

  await prisma.projectSettings.update({
    where: { projectId: project.id },
    data: { systemPrompt }
  })

  await conversationRepository.create(project.id, `${project.name} — Project Chat`)

  logger.info(`Bootstrapped project workspace: ${project.id}`, 'ProjectBootstrap')
}
