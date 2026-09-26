import { PRODUCT_NAME } from '@shared/constants/product'
import { downloadBlob } from './download'

export type CollectionExportFormat =
  | 'postman'
  | 'openapi'
  | 'native'
  | 'markdown'
  | 'html'
  | 'curl'

const FORMAT_META: Record<
  CollectionExportFormat,
  { extension: string; mime: string; filterName: string; dialogTitle: string }
> = {
  postman: {
    extension: 'postman_collection.json',
    mime: 'application/json',
    filterName: 'Postman Collection',
    dialogTitle: 'Export Postman Collection'
  },
  openapi: {
    extension: 'openapi.json',
    mime: 'application/json',
    filterName: 'OpenAPI Spec',
    dialogTitle: 'Export OpenAPI Spec'
  },
  native: {
    extension: 'apimaster.json',
    mime: 'application/json',
    filterName: `${PRODUCT_NAME} Collection`,
    dialogTitle: `Export ${PRODUCT_NAME} Collection`
  },
  markdown: {
    extension: 'md',
    mime: 'text/markdown',
    filterName: 'Markdown',
    dialogTitle: 'Export API Documentation'
  },
  html: {
    extension: 'html',
    mime: 'text/html',
    filterName: 'HTML',
    dialogTitle: 'Export API Documentation'
  },
  curl: {
    extension: 'sh',
    mime: 'text/x-shellscript',
    filterName: 'Shell Script',
    dialogTitle: 'Export cURL Scripts'
  }
}

function slugify(name: string): string {
  return name.trim().replace(/\s+/g, '-').replace(/[^\w.-]/g, '').toLowerCase() || 'collection'
}

export function collectionExportFileName(name: string, format: CollectionExportFormat = 'postman'): string {
  return `${slugify(name)}.${FORMAT_META[format].extension}`
}

export function collectionExportMime(format: CollectionExportFormat): string {
  return FORMAT_META[format].mime
}

export async function saveCollectionExportFile(
  defaultName: string,
  content: string,
  format: CollectionExportFormat = 'postman'
): Promise<boolean> {
  const meta = FORMAT_META[format]
  const ext = meta.extension.includes('.') ? meta.extension.split('.').pop()! : meta.extension

  if (typeof window !== 'undefined' && window.electronAPI?.apiStudio?.exportCollection) {
    const res = await window.electronAPI.apiStudio.exportCollection({
      defaultName,
      content,
      title: meta.dialogTitle,
      filters: [
        { name: meta.filterName, extensions: [ext] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (!res.success) {
      if (res.error && res.error !== 'Export cancelled') throw new Error(res.error)
      return false
    }
    return true
  }

  downloadBlob(content, defaultName, meta.mime)
  return true
}

/** @deprecated Prefer collectionExportFileName(name, 'postman') */
export function collectionExportFileNameLegacy(name: string): string {
  return collectionExportFileName(name, 'postman')
}

export async function saveCollectionJsonFile(defaultName: string, content: string): Promise<boolean> {
  return saveCollectionExportFile(defaultName, content, 'postman')
}

export const POSTMAN_COLLECTION_FILTER = {
  name: 'Postman Collection',
  extensions: ['json']
} as const
