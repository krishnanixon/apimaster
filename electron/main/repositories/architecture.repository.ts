import { getPrismaClient, ensureArchitectureTable } from '../database/client'
import type {
  ArchitectureDiagram,
  CreateArchitectureDiagramInput,
  UpdateArchitectureDiagramInput
} from '@shared/types'
import { v4 as uuidv4 } from 'uuid'

function serializeDiagram(diagram: {
  id: string
  projectId: string
  title: string
  description: string
  systemType: string
  model: string
  viewState: string
  versions: string
  isPinned: boolean
  createdAt: Date
  updatedAt: Date
}): ArchitectureDiagram {
  return {
    ...diagram,
    createdAt: diagram.createdAt.toISOString(),
    updatedAt: diagram.updatedAt.toISOString()
  }
}

async function withSchema<T>(operation: () => Promise<T>): Promise<T> {
  await ensureArchitectureTable()
  return operation()
}

export class ArchitectureRepository {
  async listByProject(projectId: string): Promise<ArchitectureDiagram[]> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      const diagrams = await prisma.architectureDiagram.findMany({
        where: { projectId },
        orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }]
      })
      return diagrams.map(serializeDiagram)
    })
  }

  async getById(id: string): Promise<ArchitectureDiagram | null> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      const diagram = await prisma.architectureDiagram.findUnique({ where: { id } })
      return diagram ? serializeDiagram(diagram) : null
    })
  }

  async create(input: CreateArchitectureDiagramInput): Promise<ArchitectureDiagram> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      const diagram = await prisma.architectureDiagram.create({
        data: {
          id: uuidv4(),
          projectId: input.projectId,
          title: input.title ?? 'Untitled Architecture',
          description: input.description ?? '',
          systemType: input.systemType ?? 'web',
          model: input.model ?? '{}'
        }
      })
      return serializeDiagram(diagram)
    })
  }

  async update(
    id: string,
    input: UpdateArchitectureDiagramInput
  ): Promise<ArchitectureDiagram | null> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      try {
        const diagram = await prisma.architectureDiagram.update({ where: { id }, data: input })
        return serializeDiagram(diagram)
      } catch {
        return null
      }
    })
  }

  async delete(id: string): Promise<boolean> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      try {
        await prisma.architectureDiagram.delete({ where: { id } })
        return true
      } catch {
        return false
      }
    })
  }

  async duplicate(id: string): Promise<ArchitectureDiagram | null> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      const original = await prisma.architectureDiagram.findUnique({ where: { id } })
      if (!original) return null

      const diagram = await prisma.architectureDiagram.create({
        data: {
          id: uuidv4(),
          projectId: original.projectId,
          title: `${original.title} (Copy)`,
          description: original.description,
          systemType: original.systemType,
          model: original.model,
          viewState: original.viewState,
          versions: original.versions,
          isPinned: false
        }
      })
      return serializeDiagram(diagram)
    })
  }
}

export const architectureRepository = new ArchitectureRepository()
