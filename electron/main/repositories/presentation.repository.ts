import { getPrismaClient, ensurePresentationTable } from '../database/client'
import type {
  CreatePresentationInput,
  Presentation,
  UpdatePresentationInput
} from '@shared/types'
import { v4 as uuidv4 } from 'uuid'

function serializePresentation(row: {
  id: string
  projectId: string
  title: string
  description: string
  themeId: string
  cards: string
  viewState: string
  versions: string
  documentJson: string
  schemaVersion: number
  templateId: string
  isFavorite: boolean
  deletedAt: Date | null
  isPinned: boolean
  createdAt: Date
  updatedAt: Date
}): Presentation {
  return {
    ...row,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

async function withSchema<T>(operation: () => Promise<T>): Promise<T> {
  await ensurePresentationTable()
  return operation()
}

export class PresentationRepository {
  async listByProject(projectId: string): Promise<Presentation[]> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      const rows = await prisma.presentation.findMany({
        where: { projectId, deletedAt: null },
        orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }]
      })
      return rows.map(serializePresentation)
    })
  }

  async getById(id: string): Promise<Presentation | null> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      const row = await prisma.presentation.findUnique({ where: { id } })
      return row ? serializePresentation(row) : null
    })
  }

  async create(input: CreatePresentationInput): Promise<Presentation> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      const row = await prisma.presentation.create({
        data: {
          id: uuidv4(),
          projectId: input.projectId,
          title: input.title ?? 'Untitled Presentation',
          description: input.description ?? '',
          themeId: input.themeId ?? 'professional',
          cards: input.cards ?? '[]',
          documentJson: input.documentJson ?? '',
          schemaVersion: input.schemaVersion ?? 0,
          templateId: input.templateId ?? ''
        }
      })
      return serializePresentation(row)
    })
  }

  async update(id: string, input: UpdatePresentationInput): Promise<Presentation | null> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      try {
        const row = await prisma.presentation.update({ where: { id }, data: input })
        return serializePresentation(row)
      } catch {
        return null
      }
    })
  }

  async delete(id: string): Promise<boolean> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      try {
        await prisma.presentation.update({ where: { id }, data: { deletedAt: new Date() } })
        return true
      } catch {
        return false
      }
    })
  }

  async duplicate(id: string): Promise<Presentation | null> {
    return withSchema(async () => {
      const prisma = getPrismaClient()
      const original = await prisma.presentation.findUnique({ where: { id } })
      if (!original) return null

      const row = await prisma.presentation.create({
        data: {
          id: uuidv4(),
          projectId: original.projectId,
          title: `${original.title} (Copy)`,
          description: original.description,
          themeId: original.themeId,
          cards: original.cards,
          viewState: original.viewState,
          versions: original.versions,
          documentJson: original.documentJson,
          schemaVersion: original.schemaVersion,
          templateId: original.templateId,
          isFavorite: false,
          deletedAt: null,
          isPinned: false
        }
      })
      return serializePresentation(row)
    })
  }
}

export const presentationRepository = new PresentationRepository()
