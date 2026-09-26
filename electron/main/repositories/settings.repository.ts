import { getPrismaClient, ensureAppSettingsExportColumns } from '../database/client'
import type { AppSettings, DocumentWorkflowMode, SearchResult } from '@shared/types'
import { documentContentToSearchText } from '@shared/lib/document-html'
import { sanitizeGenerationRules } from '@shared/lib/document-generation-rules'
import {
  parseCoverOverlay,
  parseExportClassification,
  parseExportCoverStyle,
  parseExportImageQuality,
  parseExportOrientation,
  parseExportPageSize,
  parseExportWatermarkStyle
} from '@shared/lib/export-cover'
import { v4 as uuidv4 } from 'uuid'
import { knowledgeRepository } from './knowledge.repository'

function parseDocumentWorkflowMode(value: string | undefined): DocumentWorkflowMode {
  return value === 'expert' ? 'expert' : 'simple'
}

function serializeSettings(settings: {
  id: string
  theme: string
  aiModel: string
  temperature: number
  maxTokens: number
  autoSaveMs: number
  recentProjectIds: string
  exportDefaultFormat?: string
  exportIncludeCoverPage?: boolean
  exportIncludeTableOfContents?: boolean
  exportIncludePageNumbers?: boolean
  exportIncludeHeaderFooter?: boolean
  exportCoverStyle?: string
  exportTocStyle?: string
  exportPageNumberStyle?: string
  exportHeaderFooterStyle?: string
  exportIncludeLogo?: boolean
  exportCoverAccent?: string
  exportCoverSubtitle?: string
  exportPreparedBy?: string
  exportIncludeWatermark?: boolean
  exportWatermarkStyle?: string
  exportWatermarkText?: string
  exportClassification?: string
  exportPageSize?: string
  exportOrientation?: string
  exportCoverBackground?: string
  exportCoverOverlay?: number
  exportCoverFont?: string
  exportImageQuality?: string
  exportFolderPath?: string
  documentWorkflowMode?: string
  documentGenerationRules?: string
}): AppSettings {
  return {
    ...settings,
    theme: settings.theme as AppSettings['theme'],
    documentWorkflowMode: parseDocumentWorkflowMode(settings.documentWorkflowMode),
    documentGenerationRules: settings.documentGenerationRules ?? '',
    exportDefaultFormat: settings.exportDefaultFormat === 'docx' ? 'docx' : 'pdf',
    exportIncludeCoverPage: settings.exportIncludeCoverPage ?? true,
    exportIncludeTableOfContents: settings.exportIncludeTableOfContents ?? true,
    exportIncludePageNumbers: settings.exportIncludePageNumbers ?? true,
    exportIncludeHeaderFooter: settings.exportIncludeHeaderFooter ?? true,
    exportCoverStyle: parseExportCoverStyle(settings.exportCoverStyle),
    exportTocStyle:
      settings.exportTocStyle === 'compact' || settings.exportTocStyle === 'numbered'
        ? settings.exportTocStyle
        : 'classic',
    exportPageNumberStyle:
      settings.exportPageNumberStyle === 'page' || settings.exportPageNumberStyle === 'number'
        ? settings.exportPageNumberStyle
        : 'page-total',
    exportHeaderFooterStyle:
      settings.exportHeaderFooterStyle === 'minimal' || settings.exportHeaderFooterStyle === 'branded'
        ? settings.exportHeaderFooterStyle
        : 'standard',
    exportIncludeLogo: settings.exportIncludeLogo ?? true,
    exportCoverAccent: settings.exportCoverAccent ?? '',
    exportCoverSubtitle: settings.exportCoverSubtitle ?? '',
    exportPreparedBy: settings.exportPreparedBy ?? '',
    exportIncludeWatermark: settings.exportIncludeWatermark ?? false,
    exportWatermarkStyle: parseExportWatermarkStyle(settings.exportWatermarkStyle),
    exportWatermarkText: settings.exportWatermarkText ?? '',
    exportClassification: parseExportClassification(settings.exportClassification),
    exportPageSize: parseExportPageSize(settings.exportPageSize),
    exportOrientation: parseExportOrientation(settings.exportOrientation),
    exportCoverBackground: settings.exportCoverBackground ?? '',
    exportCoverOverlay: parseCoverOverlay(settings.exportCoverOverlay),
    exportCoverFont: settings.exportCoverFont ?? '',
    exportImageQuality: parseExportImageQuality(settings.exportImageQuality),
    exportFolderPath: settings.exportFolderPath?.trim() ?? ''
  }
}

export class SettingsRepository {
  async get(): Promise<AppSettings> {
    await ensureAppSettingsExportColumns()
    const prisma = getPrismaClient()
    let settings = await prisma.appSettings.findUnique({ where: { id: 'app' } })
    if (!settings) {
      settings = await prisma.appSettings.create({ data: { id: 'app' } })
    }
    return serializeSettings(settings)
  }

  async update(data: Partial<AppSettings>): Promise<AppSettings> {
    await ensureAppSettingsExportColumns()
    const prisma = getPrismaClient()
    const payload =
      data.documentGenerationRules !== undefined
        ? { ...data, documentGenerationRules: sanitizeGenerationRules(data.documentGenerationRules) }
        : data
    const settings = await prisma.appSettings.upsert({
      where: { id: 'app' },
      update: payload,
      create: { id: 'app', ...payload }
    })
    return serializeSettings(settings)
  }

  async addRecentProject(projectId: string): Promise<void> {
    const settings = await this.get()
    let recentIds: string[] = []
    try {
      recentIds = JSON.parse(settings.recentProjectIds) as string[]
    } catch {
      recentIds = []
    }

    recentIds = [projectId, ...recentIds.filter((id) => id !== projectId)].slice(0, 10)
    await this.update({ recentProjectIds: JSON.stringify(recentIds) })
  }

  async getRecentProjectIds(): Promise<string[]> {
    const settings = await this.get()
    try {
      return JSON.parse(settings.recentProjectIds) as string[]
    } catch {
      return []
    }
  }
}

export class SearchRepository {
  private normalizedDocumentProjects = new Set<string>()

  async index(
    entityType: string,
    entityId: string,
    projectId: string,
    title: string,
    content: string
  ): Promise<void> {
    const prisma = getPrismaClient()
    const indexedContent =
      entityType === 'document' ? documentContentToSearchText(content) : content
    const existing = await prisma.searchIndex.findFirst({
      where: { entityType, entityId }
    })

    if (existing) {
      await prisma.searchIndex.update({
        where: { id: existing.id },
        data: { projectId, title, content: indexedContent, updatedAt: new Date() }
      })
    } else {
      await prisma.searchIndex.create({
        data: {
          id: uuidv4(),
          entityType,
          entityId,
          projectId,
          title,
          content: indexedContent
        }
      })
    }
  }

  async remove(entityType: string, entityId: string): Promise<void> {
    const prisma = getPrismaClient()
    await prisma.searchIndex.deleteMany({ where: { entityType, entityId } })
  }

  async search(projectId: string, query: string): Promise<SearchResult[]> {
    await this.ensurePlainTextDocumentIndex(projectId)
    const prisma = getPrismaClient()
    const results = await prisma.searchIndex.findMany({
      where: {
        projectId,
        OR: [{ title: { contains: query } }, { content: { contains: query } }]
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    })

    return results.map((r) => ({
      ...r,
      updatedAt: r.updatedAt.toISOString()
    }))
  }

  async reindexProject(projectId: string): Promise<void> {
    const prisma = getPrismaClient()

    await prisma.searchIndex.deleteMany({ where: { projectId } })

    const documents = await prisma.document.findMany({ where: { projectId } })
    for (const doc of documents) {
      await this.index('document', doc.id, projectId, doc.title, doc.htmlContent || doc.content)
    }
    this.normalizedDocumentProjects.add(projectId)

    const conversations = await prisma.conversation.findMany({
      where: { projectId },
      include: { messages: true }
    })
    for (const conv of conversations) {
      await this.index('conversation', conv.id, projectId, conv.title, '')
      for (const msg of conv.messages) {
        await this.index('message', msg.id, projectId, conv.title, msg.content)
      }
    }

    const bundle = await knowledgeRepository.loadBundle(projectId)
    for (const m of bundle.modules) {
      await this.index('knowledge_module', m.id, projectId, m.title, m.description)
    }
    for (const r of bundle.requirements) {
      await this.index('knowledge_requirement', r.id, projectId, `${r.code} ${r.title}`, r.description)
    }
    for (const a of bundle.apiEndpoints) {
      await this.index('knowledge_api', a.id, projectId, `${a.method} ${a.path}`, a.description)
    }
  }

  private async ensurePlainTextDocumentIndex(projectId: string): Promise<void> {
    if (this.normalizedDocumentProjects.has(projectId)) return
    const prisma = getPrismaClient()
    const documents = await prisma.document.findMany({ where: { projectId } })
    for (const doc of documents) {
      await this.index('document', doc.id, projectId, doc.title, doc.htmlContent || doc.content)
    }
    this.normalizedDocumentProjects.add(projectId)
  }
}

export const settingsRepository = new SettingsRepository()
export const searchRepository = new SearchRepository()
