import { getPrismaClient, ensureFlowDiagramTable } from '../database/client'
import type {
  CreateFlowDiagramInput,
  FlowDiagram,
  UpdateFlowDiagramInput
} from '@shared/types'
import { v4 as uuidv4 } from 'uuid'

function serializeFlow(flow: {
  id: string
  projectId: string
  title: string
  description: string
  category: string
  nodes: string
  edges: string
  viewport: string
  layoutState: string
  isPinned: boolean
  createdAt: Date
  updatedAt: Date
}): FlowDiagram {
  return {
    ...flow,
    category: flow.category as FlowDiagram['category'],
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString()
  }
}

async function withFlowSchema<T>(operation: () => Promise<T>): Promise<T> {
  await ensureFlowDiagramTable()
  return operation()
}

export class FlowRepository {
  async listByProject(projectId: string): Promise<FlowDiagram[]> {
    return withFlowSchema(async () => {
      const prisma = getPrismaClient()
      const flows = await prisma.flowDiagram.findMany({
        where: { projectId },
        orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }]
      })
      return flows.map(serializeFlow)
    })
  }

  async getById(id: string): Promise<FlowDiagram | null> {
    return withFlowSchema(async () => {
      const prisma = getPrismaClient()
      const flow = await prisma.flowDiagram.findUnique({ where: { id } })
      return flow ? serializeFlow(flow) : null
    })
  }

  async create(input: CreateFlowDiagramInput): Promise<FlowDiagram> {
    return withFlowSchema(async () => {
      const prisma = getPrismaClient()
      const flow = await prisma.flowDiagram.create({
        data: {
          id: uuidv4(),
          projectId: input.projectId,
          title: input.title ?? 'Untitled Flow',
          description: input.description ?? '',
          category: input.category ?? 'process',
          nodes: input.nodes ?? '[]',
          edges: input.edges ?? '[]'
        }
      })
      return serializeFlow(flow)
    })
  }

  async update(id: string, input: UpdateFlowDiagramInput): Promise<FlowDiagram | null> {
    return withFlowSchema(async () => {
      const prisma = getPrismaClient()
      try {
        const flow = await prisma.flowDiagram.update({
          where: { id },
          data: input
        })
        return serializeFlow(flow)
      } catch {
        return null
      }
    })
  }

  async delete(id: string): Promise<boolean> {
    return withFlowSchema(async () => {
      const prisma = getPrismaClient()
      try {
        await prisma.flowDiagram.delete({ where: { id } })
        return true
      } catch {
        return false
      }
    })
  }

  async duplicate(id: string): Promise<FlowDiagram | null> {
    return withFlowSchema(async () => {
      const prisma = getPrismaClient()
      const original = await prisma.flowDiagram.findUnique({ where: { id } })
      if (!original) return null

      const flow = await prisma.flowDiagram.create({
        data: {
          id: uuidv4(),
          projectId: original.projectId,
          title: `${original.title} (Copy)`,
          description: original.description,
          category: original.category,
          nodes: original.nodes,
          edges: original.edges,
          viewport: original.viewport,
          layoutState: original.layoutState,
          isPinned: false
        }
      })
      return serializeFlow(flow)
    })
  }
}

export const flowRepository = new FlowRepository()
