import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { sanitizeWordFileName, wordFileNameForDocument } from '@shared/lib/word-file-path'
import { exportDefaultsFromSettings } from '@shared/lib/export-defaults'
import type { Document, ExportOptions } from '@shared/types'
import { documentRepository } from '../repositories/document.repository'
import { projectRepository } from '../repositories/project.repository'
import { settingsRepository } from '../repositories/settings.repository'
import { exportService } from '../export/export.service'

export function resolveWordOutputPath(
  folderPath: string,
  title: string,
  documentId: string,
  previousPath?: string | null
): string {
  const folder = folderPath.trim()
  if (previousPath?.toLowerCase().endsWith('.docx')) {
    const prevFolder = dirname(previousPath)
    if (prevFolder.replace(/\\/g, '/').toLowerCase() === folder.replace(/\\/g, '/').toLowerCase()) {
      return previousPath
    }
  }
  const preferred = join(folder, `${sanitizeWordFileName(title)}.docx`)
  if (!existsSync(preferred)) return preferred
  return join(folder, wordFileNameForDocument(title, documentId))
}

export async function saveDocumentWordCopy(
  document: Document,
  folderPath?: string
): Promise<string | null> {
  const settings = await settingsRepository.get()
  const folder = (folderPath ?? settings.exportFolderPath ?? '').trim()
  if (!folder) return null

  const project = await projectRepository.getById(document.projectId)
  if (!project) throw new Error('Project not found')
  const html = (document.htmlContent || document.content || '').trim()
  if (!html) return null

  mkdirSync(folder, { recursive: true })
  const outputPath = resolveWordOutputPath(folder, document.title, document.id, document.exportedFilePath)
  const defaults = exportDefaultsFromSettings(settings)
  const options: ExportOptions = {
    documentId: document.id,
    format: 'docx',
    includeCoverPage: defaults.includeCoverPage,
    includeTableOfContents: defaults.includeTableOfContents,
    includePageNumbers: defaults.includePageNumbers,
    includeHeaderFooter: defaults.includeHeaderFooter,
    coverStyle: defaults.coverStyle,
    tocStyle: defaults.tocStyle,
    pageNumberStyle: defaults.pageNumberStyle,
    headerFooterStyle: defaults.headerFooterStyle,
    includeLogo: defaults.includeLogo,
    coverAccent: defaults.coverAccent,
    coverSubtitle: defaults.coverSubtitle,
    preparedBy: defaults.preparedBy,
    includeWatermark: defaults.includeWatermark,
    watermarkStyle: defaults.watermarkStyle,
    watermarkText: defaults.watermarkText,
    classification: defaults.classification,
    pageSize: defaults.pageSize,
    orientation: defaults.orientation,
    coverBackground: defaults.coverBackground,
    coverOverlay: defaults.coverOverlay,
    coverFont: defaults.coverFont,
    imageQuality: defaults.imageQuality,
    filePath: outputPath
  }

  await exportService.export({ document, project, options }, outputPath)
  await documentRepository.update(document.id, { exportedFilePath: outputPath })
  return outputPath
}

export async function saveDocumentWordById(documentId: string, folderPath?: string): Promise<string> {
  const document = await documentRepository.getById(documentId)
  if (!document) throw new Error('Document not found')
  const path = await saveDocumentWordCopy(document, folderPath)
  if (!path) throw new Error('Choose a Word save folder first')
  return path
}
