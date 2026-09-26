import { getPrismaClient } from '../database/client'
import type { Conversation } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'

function serialize(conversation: {
  id: string
  scope?: string
  projectId: string | null
  title: string
  isPinned: boolean
  createdAt: Date
  updatedAt: Date
}): Conversation {
  return {
    id: conversation.id,
    scope: conversation.scope === 'GLOBAL' ? 'GLOBAL' : 'PROJECT',
    projectId: conversation.projectId,
    title: conversation.title,
    isPinned: conversation.isPinned,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString()
  }
}

export class ConversationRepository {
  async listByProject(projectId: string): Promise<Conversation[]> {
    const prisma = getPrismaClient()
    const conversations = await prisma.conversation.findMany({
      where: { projectId, scope: 'PROJECT' },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }]
    })
    return conversations.map(serialize)
  }

  async listGlobal(): Promise<Conversation[]> {
    const prisma = getPrismaClient()
    const conversations = await prisma.conversation.findMany({
      where: { scope: 'GLOBAL' },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }]
    })
    return conversations.map(serialize)
  }

  async getById(id: string): Promise<Conversation | null> {
    const prisma = getPrismaClient()
    const conversation = await prisma.conversation.findUnique({ where: { id } })
    return conversation ? serialize(conversation) : null
  }

  async create(projectId: string, title = 'New Conversation'): Promise<Conversation> {
    const prisma = getPrismaClient()
    const conversation = await prisma.conversation.create({
      data: { id: uuidv4(), scope: 'PROJECT', projectId, title }
    })
    return serialize(conversation)
  }

  async createGlobal(title = 'New Conversation'): Promise<Conversation> {
    const prisma = getPrismaClient()
    const conversation = await prisma.conversation.create({
      data: { id: uuidv4(), scope: 'GLOBAL', projectId: null, title }
    })
    return serialize(conversation)
  }

  async update(
    id: string,
    data: Partial<Pick<Conversation, 'title' | 'isPinned'>>
  ): Promise<Conversation | null> {
    const prisma = getPrismaClient()
    try {
      const conversation = await prisma.conversation.update({ where: { id }, data })
      return serialize(conversation)
    } catch {
      return null
    }
  }

  async delete(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.conversation.delete({ where: { id } })
      return true
    } catch {
      return false
    }
  }

  async duplicate(id: string): Promise<Conversation | null> {
    const prisma = getPrismaClient()
    const original = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: true }
    })
    if (!original) return null

    const newId = uuidv4()
    const conversation = await prisma.conversation.create({
      data: {
        id: newId,
        scope: original.scope,
        projectId: original.projectId,
        title: `${original.title} (Copy)`,
        messages: {
          create: original.messages.map((m) => ({
            id: uuidv4(),
            role: m.role,
            content: m.content
          }))
        }
      }
    })
    return serialize(conversation)
  }

  async search(projectId: string, query: string): Promise<Conversation[]> {
    const prisma = getPrismaClient()
    const conversations = await prisma.conversation.findMany({
      where: {
        projectId,
        scope: 'PROJECT',
        OR: [
          { title: { contains: query } },
          { messages: { some: { content: { contains: query } } } }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    })
    return conversations.map(serialize)
  }

  async searchGlobal(query: string): Promise<Conversation[]> {
    const prisma = getPrismaClient()
    const conversations = await prisma.conversation.findMany({
      where: {
        scope: 'GLOBAL',
        OR: [
          { title: { contains: query } },
          { messages: { some: { content: { contains: query } } } }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    })
    return conversations.map(serialize)
  }
}

export const conversationRepository = new ConversationRepository()
