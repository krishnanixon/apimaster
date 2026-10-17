import type { ApiFolder, KeyValuePair, RequestBody } from '../../types/api-studio'
import { NoteList, collection, folder, isRecord, jsonOrText, kv, request, str, summarize, toMethod, urlEncodedBody, type ImportResult } from './common'

export interface HarImportOptions {
  /** Leave out images, stylesheets, scripts, fonts and media (default true). */
  skipStaticAssets?: boolean
  name?: string
}

export function isHar(value: unknown): boolean {
  return isRecord(value) && isRecord(value.log) && Array.isArray(value.log.entries)
}

const STATIC_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|css|js|mjs|map|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ogg)$/i
const STATIC_MIME = /^(image|font|audio|video)\/|^text\/css|javascript|ecmascript/i
const STATIC_RESOURCE_TYPES = new Set(['image', 'stylesheet', 'script', 'font', 'media', 'manifest', 'texttrack'])

/** Headers the browser or HTTP/2 adds on its own; importing them only adds noise or breaks the request. */
const DROPPED_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'cookie',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'upgrade-insecure-requests',
  'priority'
])

function isStatic(entry: Record<string, unknown>, url: string): boolean {
  if (STATIC_RESOURCE_TYPES.has(str(entry._resourceType))) return true
  const path = url.split(/[?#]/)[0]
  if (STATIC_EXTENSIONS.test(path)) return true
  const response = isRecord(entry.response) ? entry.response : {}
  const content = isRecord(response.content) ? response.content : {}
  return STATIC_MIME.test(str(content.mimeType))
}

function nameValues(list: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(list)) return []
  return list.filter(isRecord).map((p) => ({ name: str(p.name), value: str(p.value) }))
}

function harBody(postData: unknown, warnings: NoteList): RequestBody {
  if (!isRecord(postData)) return { type: 'none', content: '' }
  const mime = str(postData.mimeType).toLowerCase()
  const params = nameValues(postData.params)
  const text = str(postData.text)
  if (mime.includes('x-www-form-urlencoded')) {
    if (params.length) return urlEncodedBody(params.map((p) => ({ key: decode(p.name), value: decode(p.value) })))
    return urlEncodedBody(text.split('&').filter(Boolean).map((part) => {
      const eq = part.indexOf('=')
      return { key: decode(eq === -1 ? part : part.slice(0, eq)), value: decode(eq === -1 ? '' : part.slice(eq + 1)) }
    }))
  }
  if (mime.includes('multipart/form-data')) {
    if (!params.length) {
      warnings.add('Multipart bodies without parsed fields were imported as text')
      return { type: 'text', content: text }
    }
    const raw = (postData.params as unknown[]).filter(isRecord)
    return {
      type: 'form-data',
      content: '',
      formData: raw.map((p) => {
        const fileName = str(p.fileName)
        if (fileName) warnings.add('File fields need their file chosen again')
        return { ...kv(str(p.name), fileName ? '' : str(p.value)), type: fileName ? ('file' as const) : ('text' as const), ...(fileName ? { fileName } : {}) }
      })
    }
  }
  if (!text) return { type: 'none', content: '' }
  return jsonOrText(text, mime.includes('json') ? 'json' : mime ? 'text' : '')
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

/** Short request name from the URL path, e.g. `GET /api/users/42`. */
function requestName(method: string, url: URL): string {
  const path = url.pathname.length > 60 ? `${url.pathname.slice(0, 57)}…` : url.pathname
  return `${method} ${path || '/'}`
}

/** HAR 1.2: one request per entry, one folder per host. Responses are not imported. */
export function importHar(text: string, options: HarImportOptions = {}, now = new Date().toISOString()): ImportResult {
  const doc = JSON.parse(text) as unknown
  if (!isHar(doc)) throw new Error('Not a HAR file (expected log.entries)')
  const log = (doc as { log: Record<string, unknown> }).log
  const skipStatic = options.skipStaticAssets ?? true
  const skipped = new NoteList()
  const warnings = new NoteList()
  const creator = isRecord(log.creator) ? str(log.creator.name) : ''
  const result = collection(options.name || (creator ? `HAR import (${creator})` : 'HAR import'), now)
  const folders = new Map<string, ApiFolder>()
  const seen = new Set<string>()

  for (const entry of (log.entries as unknown[]).filter(isRecord)) {
    const req = isRecord(entry.request) ? entry.request : null
    if (!req) continue
    const rawUrl = str(req.url)
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      skipped.add('Entries with an invalid URL')
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      skipped.add(`Non-HTTP entries (${url.protocol.replace(':', '')})`)
      continue
    }
    const method = toMethod(req.method)
    if (!method) {
      skipped.add(`Requests with method "${str(req.method)}"`)
      continue
    }
    if (skipStatic && isStatic(entry, rawUrl)) {
      skipped.add('Static assets (images, CSS, JS, fonts)')
      continue
    }
    const postData = isRecord(req.postData) ? req.postData : undefined
    const signature = `${method} ${rawUrl} ${str(postData?.text)}`
    if (seen.has(signature)) {
      skipped.add('Duplicate requests (same method, URL and body)')
      continue
    }
    seen.add(signature)

    let hostFolder = folders.get(url.host)
    if (!hostFolder) {
      hostFolder = folder(url.host, null)
      folders.set(url.host, hostFolder)
      result.folders.push(hostFolder)
    }
    const headers: KeyValuePair[] = nameValues(req.headers)
      .filter((h) => h.name && !h.name.startsWith(':') && !DROPPED_HEADERS.has(h.name.toLowerCase()))
      .map((h) => kv(h.name, h.value))
    if (nameValues(req.headers).some((h) => h.name.toLowerCase() === 'cookie') || nameValues(req.cookies).length) {
      skipped.add('Cookies (sent from the cookie jar instead)')
    }
    const query = nameValues(req.queryString).map((q) => kv(decode(q.name), decode(q.value)))
    const fallbackQuery = [...url.searchParams].map(([k, v]) => kv(k, v))
    const response = isRecord(entry.response) ? entry.response : {}
    const status = Number(response.status)
    result.requests.push(
      request(
        {
          name: requestName(method, url),
          method,
          url: `${url.origin}${url.pathname}`,
          headers,
          queryParams: query.length ? query : fallbackQuery,
          body: harBody(postData, warnings),
          auth: { type: 'inherit' },
          description: status ? `Recorded response: ${status} ${str(response.statusText)}`.trim() : '',
          folderId: hostFolder.id
        },
        now
      )
    )
  }

  if (result.requests.length === 0 && (log.entries as unknown[]).length > 0) {
    warnings.add('No requests left after filtering; try again with static assets included')
  }
  return { collections: [result], environments: [], summary: summarize('har', [result], [], skipped, warnings) }
}
