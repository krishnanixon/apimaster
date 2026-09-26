import { getPrismaClient, ensureDocumentLayoutColumns } from '../database/client'
import type {
  CreateDocumentInput,
  Document,
  DocumentStatus,
  DocumentVersion,
  DocumentWithProject,
  UpdateDocumentInput
} from '@shared/types'
import { getLayoutPreset } from '@shared/lib/document-theme'
import { parsePageSettings, serializePageSettings } from '@shared/lib/document-page'
import { parseComments, serializeComments } from '@shared/lib/document-comments'
import { v4 as uuidv4 } from 'uuid'

const VERSION_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000

type DocumentRow = {
  id: string
  projectId: string
  title: string
  type: string
  style: string
  pageTheme?: string
  layoutPreset?: string
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  pageSettings?: string | null
  commentsJson?: string | null
  content: string
  htmlContent: string
  isPinned: boolean
  status?: string | null
  tags?: string | null
  lastReviewedAt?: Date | null
  exportedFilePath?: string | null
  createdAt: Date
  updatedAt: Date
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
  }
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : []
  } catch {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }
}

function serializeTags(tags?: string[]): string {
  return JSON.stringify(
    (tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 12)
  )
}

function asStatus(value: unknown): DocumentStatus {
  if (value === 'review' || value === 'approved' || value === 'superseded') return value
  return 'draft'
}

function serializeDocument(doc: DocumentRow): Document {
  return {
    id: doc.id,
    projectId: doc.projectId,
    title: doc.title,
    type: doc.type as Document['type'],
    style: doc.style as Document['style'],
    pageTheme: (doc.pageTheme ?? 'professional') as Document['pageTheme'],
    layoutPreset: (doc.layoutPreset ?? 'normal') as Document['layoutPreset'],
    paddingTop: doc.paddingTop ?? 56,
    paddingRight: doc.paddingRight ?? 64,
    paddingBottom: doc.paddingBottom ?? 72,
    paddingLeft: doc.paddingLeft ?? 64,
    pageSettings: parsePageSettings(doc.pageSettings),
    comments: parseComments(doc.commentsJson),
    content: doc.content,
    htmlContent: doc.htmlContent,
    isPinned: doc.isPinned,
    status: asStatus(doc.status),
    tags: parseTags(doc.tags),
    lastReviewedAt: doc.lastReviewedAt ? doc.lastReviewedAt.toISOString() : null,
    exportedFilePath: doc.exportedFilePath?.trim() ? doc.exportedFilePath : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  }
}

function serializeVersion(v: {
  id: string
  documentId: string
  version: number
  content: string
  htmlContent: string
  label: string
  createdAt: Date
}): DocumentVersion {
  return {
    ...v,
    createdAt: v.createdAt.toISOString()
  }
}

export class DocumentRepository {
  private async ensureSchema(): Promise<void> {
    await ensureDocumentLayoutColumns()
  }

  async listByProject(projectId: string): Promise<Document[]> {
    await this.ensureSchema()
    const prisma = getPrismaClient()
    const documents = await prisma.document.findMany({
      where: { projectId },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }]
    })
    return documents.map((doc) => serializeDocument(doc as DocumentRow))
  }

  async listAll(): Promise<DocumentWithProject[]> {
    await this.ensureSchema()
    const prisma = getPrismaClient()
    const documents = await prisma.document.findMany({
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      include: { project: { select: { name: true } } }
    })
    return documents.map((doc) => ({
      ...serializeDocument(doc as DocumentRow),
      projectName: doc.project?.name || 'Untitled project'
    }))
  }

  async getById(id: string): Promise<Document | null> {
    await this.ensureSchema()
    const prisma = getPrismaClient()
    const doc = await prisma.document.findUnique({ where: { id } })
    return doc ? serializeDocument(doc as DocumentRow) : null
  }

  async create(input: CreateDocumentInput): Promise<Document> {
    await this.ensureSchema()
    const prisma = getPrismaClient()
    const layout = getLayoutPreset(input.layoutPreset ?? 'compact')
    const doc = await prisma.document.create({
      data: {
        id: uuidv4(),
        projectId: input.projectId,
        title: input.title ?? 'Untitled Document',
        type: input.type ?? 'requirements',
        style: input.style ?? 'professional',
        pageTheme: input.pageTheme ?? 'compact',
        layoutPreset: layout.id === 'custom' ? 'compact' : layout.id,
        paddingTop: layout.padding.top,
        paddingRight: layout.padding.right,
        paddingBottom: layout.padding.bottom,
        paddingLeft: layout.padding.left,
        content: input.content ?? input.htmlContent ?? '',
        htmlContent: input.htmlContent ?? input.content ?? '',
        status: input.status ?? 'draft',
        tags: serializeTags(input.tags)
      }
    })

    await this.createVersion(doc.id, doc.content, doc.htmlContent, 'Initial version')

    return serializeDocument(doc as DocumentRow)
  }

  async update(id: string, input: UpdateDocumentInput): Promise<Document | null> {
    await this.ensureSchema()
    const prisma = getPrismaClient()
    try {
      const existing = await prisma.document.findUnique({ where: { id } })
      if (!existing) return null

      const data: Record<string, unknown> = {}
      if (input.title !== undefined) data.title = input.title
      if (input.type !== undefined) data.type = input.type
      if (input.style !== undefined) data.style = input.style
      if (input.pageTheme !== undefined) data.pageTheme = input.pageTheme
      if (input.layoutPreset !== undefined) data.layoutPreset = input.layoutPreset
      if (input.paddingTop !== undefined) data.paddingTop = input.paddingTop
      if (input.paddingRight !== undefined) data.paddingRight = input.paddingRight
      if (input.paddingBottom !== undefined) data.paddingBottom = input.paddingBottom
      if (input.paddingLeft !== undefined) data.paddingLeft = input.paddingLeft
      if (input.pageSettings !== undefined) data.pageSettings = serializePageSettings(input.pageSettings)
      if (input.comments !== undefined) data.commentsJson = serializeComments(input.comments)
      if (input.content !== undefined) data.content = input.content
      if (input.htmlContent !== undefined) data.htmlContent = input.htmlContent
      if (input.isPinned !== undefined) data.isPinned = input.isPinned
      if (input.status !== undefined) data.status = input.status
      if (input.tags !== undefined) data.tags = serializeTags(input.tags)
      if (input.lastReviewedAt !== undefined) {
        data.lastReviewedAt = input.lastReviewedAt ? new Date(input.lastReviewedAt) : null
      }
      if (input.exportedFilePath !== undefined) {
        data.exportedFilePath = input.exportedFilePath ?? ''
      }

      const doc = await prisma.document.update({
        where: { id },
        data
      })

      const contentChanged = input.content !== undefined && input.content !== existing.content
      const htmlChanged = input.htmlContent !== undefined && input.htmlContent !== existing.htmlContent
      if (contentChanged || htmlChanged) {
        await this.saveVersion(id, doc.content, doc.htmlContent)
      }

      return serializeDocument(doc as DocumentRow)
    } catch {
      return null
    }
  }

  async delete(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.document.delete({ where: { id } })
      return true
    } catch {
      return false
    }
  }

  async duplicate(id: string): Promise<Document | null> {
    await this.ensureSchema()
    const prisma = getPrismaClient()
    const original = (await prisma.document.findUnique({ where: { id } })) as DocumentRow | null
    if (!original) return null

    const doc = await prisma.document.create({
      data: {
        id: uuidv4(),
        projectId: original.projectId,
        title: `${original.title} (Copy)`,
        type: original.type,
        style: original.style,
        pageTheme: original.pageTheme ?? 'professional',
        layoutPreset: original.layoutPreset ?? 'normal',
        paddingTop: original.paddingTop ?? 56,
        paddingRight: original.paddingRight ?? 64,
        paddingBottom: original.paddingBottom ?? 72,
        paddingLeft: original.paddingLeft ?? 64,
        pageSettings: original.pageSettings ?? '{}',
        commentsJson: original.commentsJson ?? '[]',
        content: original.content,
        htmlContent: original.htmlContent,
        isPinned: false,
        status: 'draft',
        tags: original.tags ?? '[]'
      }
    })
    await this.createVersion(doc.id, doc.content, doc.htmlContent, 'Initial version')

    return serializeDocument(doc as DocumentRow)
  }

  async getVersions(documentId: string): Promise<DocumentVersion[]> {
    const prisma = getPrismaClient()
    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { version: 'desc' }
    })
    return versions.map(serializeVersion)
  }

  async restoreVersion(documentId: string, versionId: string): Promise<Document | null> {
    const prisma = getPrismaClient()
    const version = await prisma.documentVersion.findUnique({ where: { id: versionId } })
    if (!version || version.documentId !== documentId) return null

    const doc = await prisma.document.update({
      where: { id: documentId },
      data: {
        content: version.content,
        htmlContent: version.htmlContent
      }
    })

    await this.createVersion(
      documentId,
      version.content,
      version.htmlContent,
      `Restored from v${version.version}`
    )

    return serializeDocument(doc as DocumentRow)
  }

  async saveNamedVersion(documentId: string, label: string): Promise<DocumentVersion | null> {
    await this.ensureSchema()
    const prisma = getPrismaClient()
    const doc = await prisma.document.findUnique({ where: { id: documentId } })
    if (!doc) return null

    const trimmed = label.trim() || `Snapshot ${new Date().toLocaleString()}`
    await this.createVersion(documentId, doc.content, doc.htmlContent, trimmed)
    const versions = await this.getVersions(documentId)
    return versions[0] ?? null
  }

  /** Persist a sync dismiss without bumping document.updatedAt. */
  async markReviewed(id: string): Promise<Document | null> {
    await this.ensureSchema()
    const prisma = getPrismaClient()
    const existing = await prisma.document.findUnique({ where: { id } })
    if (!existing) return null

    await prisma.$executeRaw`
      UPDATE "Document" SET "lastReviewedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}
    `
    return this.getById(id)
  }

  private async saveVersion(
    documentId: string,
    content: string,
    htmlContent: string
  ): Promise<void> {
    const prisma = getPrismaClient()
    const lastVersion = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' }
    })
    const isStableSnapshot =
      !lastVersion ||
      lastVersion.label === 'Initial version' ||
      lastVersion.label.startsWith('Restored from ') ||
      !lastVersion.label.startsWith('Autosaved ')
    const snapshotWindowExpired =
      !!lastVersion &&
      Date.now() - lastVersion.createdAt.getTime() >= VERSION_SNAPSHOT_INTERVAL_MS

    if (isStableSnapshot || snapshotWindowExpired) {
      await this.createVersion(
        documentId,
        content,
        htmlContent,
        `Autosaved ${new Date().toLocaleString()}`
      )
      return
    }

    await prisma.documentVersion.update({
      where: { id: lastVersion.id },
      data: {
        content,
        htmlContent,
        label: `Autosaved ${new Date().toLocaleString()}`
      }
    })
  }

  private async createVersion(
    documentId: string,
    content: string,
    htmlContent: string,
    label: string
  ): Promise<void> {
    const prisma = getPrismaClient()
    const lastVersion = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' }
    })
    const nextVersion = (lastVersion?.version ?? 0) + 1

    await prisma.documentVersion.create({
      data: {
        id: uuidv4(),
        documentId,
        version: nextVersion,
        content,
        htmlContent,
        label
      }
    })
  }
}

export const documentRepository = new DocumentRepository()
