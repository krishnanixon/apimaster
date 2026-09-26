import { getPrismaClient, ensureProjectSettingsColumns } from '../database/client'
import type {
  CreateProjectInput,
  Project,
  ProjectSettings,
  UpdateProjectInput,
  UpdateProjectSettingsInput
} from '@shared/types'
import { sanitizeGenerationRules } from '@shared/lib/document-generation-rules'
import { v4 as uuidv4 } from 'uuid'

function serializeProject(project: {
  id: string
  name: string
  description: string
  style: string
  status: string
  companyName: string
  companyLogo: string
  createdAt: Date
  updatedAt: Date
  lastOpenedAt: Date
}): Project {
  return {
    ...project,
    style: project.style as Project['style'],
    status: project.status as Project['status'],
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    lastOpenedAt: project.lastOpenedAt.toISOString()
  }
}

function serializeSettings(settings: {
  id: string
  projectId: string
  aiModel: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  brandingPrimary: string
  brandingAccent: string
  documentGenerationRules?: string
}): ProjectSettings {
  return {
    ...settings,
    documentGenerationRules: settings.documentGenerationRules ?? ''
  }
}

export class ProjectRepository {
  async list(status?: string): Promise<Project[]> {
    const prisma = getPrismaClient()
    const projects = await prisma.project.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ lastOpenedAt: 'desc' }]
    })
    return projects.map(serializeProject)
  }

  async getById(id: string): Promise<(Project & { settings: ProjectSettings | null }) | null> {
    await ensureProjectSettingsColumns()
    const prisma = getPrismaClient()
    const project = await prisma.project.findUnique({
      where: { id },
      include: { settings: true }
    })
    if (!project) return null
    return {
      ...serializeProject(project),
      settings: project.settings ? serializeSettings(project.settings) : null
    }
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const prisma = getPrismaClient()
    const id = uuidv4()
    const project = await prisma.project.create({
      data: {
        id,
        name: input.name,
        description: input.description ?? '',
        style: input.style ?? 'professional',
        companyName: input.companyName ?? input.name,
        settings: {
          create: {}
        }
      }
    })
    return serializeProject(project)
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project | null> {
    const prisma = getPrismaClient()
    try {
      const project = await prisma.project.update({
        where: { id },
        data: input
      })
      return serializeProject(project)
    } catch {
      return null
    }
  }

  async updateSettings(
    projectId: string,
    input: UpdateProjectSettingsInput
  ): Promise<ProjectSettings | null> {
    await ensureProjectSettingsColumns()
    const prisma = getPrismaClient()
    const existing = await prisma.projectSettings.findUnique({ where: { projectId } })
    const rules =
      input.documentGenerationRules !== undefined
        ? sanitizeGenerationRules(input.documentGenerationRules)
        : undefined

    if (!existing) {
      const created = await prisma.projectSettings.create({
        data: {
          projectId,
          ...(rules !== undefined ? { documentGenerationRules: rules } : {})
        }
      })
      return serializeSettings(created)
    }

    const updated = await prisma.projectSettings.update({
      where: { projectId },
      data: rules !== undefined ? { documentGenerationRules: rules } : {}
    })
    return serializeSettings(updated)
  }

  async delete(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.project.delete({ where: { id } })
      return true
    } catch {
      return false
    }
  }

  async duplicate(id: string): Promise<Project | null> {
    const prisma = getPrismaClient()
    const original = await prisma.project.findUnique({
      where: { id },
      include: {
        settings: true,
        conversations: { include: { messages: true } },
        documents: true
      }
    })
    if (!original) return null

    const newId = uuidv4()
    const project = await prisma.project.create({
      data: {
        id: newId,
        name: `${original.name} (Copy)`,
        description: original.description,
        style: original.style,
        companyName: original.companyName,
        companyLogo: original.companyLogo,
        settings: {
          create: original.settings
            ? {
                aiModel: original.settings.aiModel,
                temperature: original.settings.temperature,
                maxTokens: original.settings.maxTokens,
                systemPrompt: original.settings.systemPrompt,
                brandingPrimary: original.settings.brandingPrimary,
                brandingAccent: original.settings.brandingAccent,
                documentGenerationRules: original.settings.documentGenerationRules ?? ''
              }
            : {}
        }
      }
    })

    for (const conv of original.conversations) {
      const newConvId = uuidv4()
      await prisma.conversation.create({
        data: {
          id: newConvId,
          projectId: newId,
          title: conv.title,
          isPinned: conv.isPinned,
          messages: {
            create: conv.messages.map((m) => ({
              id: uuidv4(),
              role: m.role,
              content: m.content
            }))
          }
        }
      })
    }

    for (const doc of original.documents) {
      await prisma.document.create({
        data: {
          id: uuidv4(),
          projectId: newId,
          title: doc.title,
          type: doc.type,
          style: doc.style,
          content: doc.content,
          htmlContent: doc.htmlContent,
          isPinned: doc.isPinned
        }
      })
    }

    return serializeProject(project)
  }

  async open(id: string): Promise<Project | null> {
    const prisma = getPrismaClient()
    try {
      const project = await prisma.project.update({
        where: { id },
        data: { lastOpenedAt: new Date() }
      })
      return serializeProject(project)
    } catch {
      return null
    }
  }
}

export const projectRepository = new ProjectRepository()
