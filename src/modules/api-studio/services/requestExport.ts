import { v4 as uuidv4 } from 'uuid'
import { PRODUCT_NAME } from '@shared/constants/product'
import { redactCollection, redactRequest } from '@shared/lib/redact-secrets'
import { stripFileBytes } from '@shared/lib/workspace-document'
import type { ApiCollection, ApiRequest } from '../types/api.types'
import { generateSnippet, SNIPPET_LANGUAGES, type SnippetLanguage } from './codeGenerator'
import { downloadBlob } from './download'
import { applyParentInheritance } from './inheritance'
import { exportToPostmanCollection } from './postman'
import { resolveRequest } from './requestBuilder'

/** Everything one request can be exported as: code to copy, or a file another tool imports. */
export type RequestExportFormat = SnippetLanguage | 'postman' | 'har' | 'native'

export interface RequestExportFormatInfo {
  id: RequestExportFormat
  label: string
  /** File extension used when saving. */
  extension: string
  mime: string
  /** `file` formats are meant to be imported elsewhere (Postman, HAR, Shurikly). */
  kind: 'code' | 'file'
  hint?: string
}

const CODE_META: Record<SnippetLanguage, { extension: string; mime: string }> = {
  curl: { extension: 'sh', mime: 'text/x-shellscript' },
  http: { extension: 'http', mime: 'text/plain' },
  javascript: { extension: 'js', mime: 'text/javascript' },
  nodejs: { extension: 'js', mime: 'text/javascript' },
  python: { extension: 'py', mime: 'text/x-python' },
  powershell: { extension: 'ps1', mime: 'text/plain' },
  go: { extension: 'go', mime: 'text/x-go' },
  php: { extension: 'php', mime: 'text/x-php' }
}

export const REQUEST_EXPORT_FORMATS: RequestExportFormatInfo[] = [
  ...SNIPPET_LANGUAGES.map((lang) => ({ id: lang.id, label: lang.label, kind: 'code' as const, ...CODE_META[lang.id] })),
  { id: 'postman', label: 'Postman v2.1', extension: 'postman_collection.json', mime: 'application/json', kind: 'file', hint: 'Import into Postman, Insomnia or Bruno' },
  { id: 'har', label: 'HAR', extension: 'har', mime: 'application/json', kind: 'file', hint: 'HTTP Archive — browsers, proxies, load tools' },
  { id: 'native', label: `${PRODUCT_NAME} JSON`, extension: 'shurikly.json', mime: 'application/json', kind: 'file', hint: `Re-import into ${PRODUCT_NAME} with scripts and settings` }
]

export function requestExportFormat(id: RequestExportFormat): RequestExportFormatInfo {
  return REQUEST_EXPORT_FORMATS.find((f) => f.id === id) ?? REQUEST_EXPORT_FORMATS[0]
}

/**
 * The request on its own: auth and headers inherited from its folder/collection are
 * baked in, so the export works without the collection around it.
 */
function standalone(request: ApiRequest, collection?: ApiCollection | null): ApiRequest {
  const effective = applyParentInheritance(request, collection)
  return { ...effective, folderId: null }
}

/** A one-request collection, the shape Postman and Shurikly imports expect. */
function wrapAsCollection(request: ApiRequest): ApiCollection {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    name: request.name || 'Request',
    description: '',
    folders: [],
    requests: [request],
    createdAt: now,
    updatedAt: now
  }
}

function buildHar(request: ApiRequest): string {
  const resolved = resolveRequest(request)
  const query = Object.entries(resolved.params)
  const url = query.length
    ? `${resolved.url}${resolved.url.includes('?') ? '&' : '?'}${query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`
    : resolved.url
  const headers = Object.entries(resolved.headers).map(([name, value]) => ({ name, value }))
  const contentType = Object.entries(resolved.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]

  let postData: Record<string, unknown> | undefined
  const body = resolved.body
  if (body.type === 'json' || body.type === 'text') {
    postData = { mimeType: contentType ?? (body.type === 'json' ? 'application/json' : 'text/plain'), text: body.content }
  } else if (body.type === 'x-www-form-urlencoded') {
    const params = body.content
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const eq = line.indexOf('=')
        return eq === -1 ? { name: line, value: '' } : { name: line.slice(0, eq), value: line.slice(eq + 1) }
      })
    postData = {
      mimeType: 'application/x-www-form-urlencoded',
      params,
      text: params.map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`).join('&')
    }
  } else if (body.type === 'form-data') {
    postData = {
      mimeType: 'multipart/form-data',
      params: (body.formData ?? [])
        .filter((f) => f.enabled && f.key)
        .map((f) => (f.type === 'file' ? { name: f.key, fileName: f.fileName ?? f.value } : { name: f.key, value: f.value }))
    }
  }

  const har = {
    log: {
      version: '1.2',
      creator: { name: PRODUCT_NAME, version: '1.0' },
      entries: [
        {
          startedDateTime: new Date().toISOString(),
          time: 0,
          comment: request.name,
          request: {
            method: resolved.method,
            url,
            httpVersion: 'HTTP/1.1',
            headers,
            queryString: query.map(([name, value]) => ({ name, value })),
            cookies: [],
            headersSize: -1,
            bodySize: typeof postData?.text === 'string' ? (postData.text as string).length : -1,
            ...(postData ? { postData } : {})
          },
          response: {
            status: 0,
            statusText: '',
            httpVersion: 'HTTP/1.1',
            headers: [],
            cookies: [],
            content: { size: 0, mimeType: 'x-unknown' },
            redirectURL: '',
            headersSize: -1,
            bodySize: -1
          },
          cache: {},
          timings: { send: 0, wait: 0, receive: 0 }
        }
      ]
    }
  }
  return JSON.stringify(har, null, 2)
}

export interface RequestExportOptions {
  /** Replace tokens, passwords and secret-marked values with placeholders. */
  redactSecrets?: boolean
}

/** Builds the text for one request in the given format. Throws for WebSocket requests. */
export function exportRequest(
  request: ApiRequest,
  format: RequestExportFormat,
  collection?: ApiCollection | null,
  options: RequestExportOptions = {}
): string {
  if (request.requestType === 'websocket' && format !== 'native') {
    throw new Error('WebSocket requests can only be exported as ' + `${PRODUCT_NAME} JSON`)
  }
  let single = standalone(request, collection)
  if (options.redactSecrets) single = redactRequest(single)

  switch (format) {
    case 'postman':
      return exportToPostmanCollection(wrapAsCollection(single))
    case 'har':
      return buildHar(single)
    case 'native': {
      const wrapped = wrapAsCollection(single)
      return JSON.stringify(options.redactSecrets ? redactCollection(wrapped) : stripFileBytes(wrapped), null, 2)
    }
    default:
      return generateSnippet(single, format)
  }
}

function slugify(name: string): string {
  return name.trim().replace(/\s+/g, '-').replace(/[^\w.-]/g, '').toLowerCase() || 'request'
}

export function requestExportFileName(request: ApiRequest, format: RequestExportFormat): string {
  return `${slugify(request.name)}.${requestExportFormat(format).extension}`
}

/** Opens a save dialog in the desktop app; falls back to a browser download. Returns false if cancelled. */
export async function saveRequestExport(request: ApiRequest, format: RequestExportFormat, content: string): Promise<boolean> {
  const info = requestExportFormat(format)
  const fileName = requestExportFileName(request, format)
  const ext = info.extension.split('.').pop() ?? info.extension
  const save = typeof window !== 'undefined' ? window.electronAPI?.apiStudio?.exportCollection : undefined
  if (save) {
    const res = await save({
      defaultName: fileName,
      content,
      title: `Export request as ${info.label}`,
      filters: [
        { name: info.label, extensions: [ext] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (!res.success) {
      if (res.error && res.error !== 'Export cancelled') throw new Error(res.error)
      return false
    }
    return true
  }
  downloadBlob(content, fileName, info.mime)
  return true
}
