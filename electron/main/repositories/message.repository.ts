import { getPrismaClient } from '../database/client'
import type { Message, MessageRole } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'

function serialize(message: {
  id: string
  conversationId: string
  role: string
  content: string
  createdAt: Date
}): Message {
  return {
    ...message,
    role: message.role as MessageRole,
    createdAt: message.createdAt.toISOString()
  }
}

export class MessageRepository {
  async listByConversation(conversationId: string): Promise<Message[]> {
    const prisma = getPrismaClient()
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    })
    return messages.map(serialize)
  }

  async create(conversationId: string, role: MessageRole, content: string): Promise<Message> {
    const prisma = getPrismaClient()
    const message = await prisma.message.create({
      data: { id: uuidv4(), conversationId, role, content }
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    })

    return serialize(message)
  }

  async update(id: string, content: string): Promise<Message | null> {
    const prisma = getPrismaClient()
    try {
      const message = await prisma.message.update({
        where: { id },
        data: { content }
      })
      return serialize(message)
    } catch {
      return null
    }
  }

  async delete(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.message.delete({ where: { id } })
      return true
    } catch {
      return false
    }
  }

  async deleteFrom(conversationId: string, messageId: string, includeMessage = true): Promise<void> {
    const prisma = getPrismaClient()
    const anchor = await prisma.message.findUnique({ where: { id: messageId } })
    if (!anchor || anchor.conversationId !== conversationId) return

    await prisma.message.deleteMany({
      where: {
        conversationId,
        createdAt: includeMessage ? { gte: anchor.createdAt } : { gt: anchor.createdAt }
      }
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    })
  }

  async clearConversation(conversationId: string): Promise<void> {
    const prisma = getPrismaClient()
    await prisma.message.deleteMany({ where: { conversationId } })
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    })
  }
}

export const messageRepository = new MessageRepository()
