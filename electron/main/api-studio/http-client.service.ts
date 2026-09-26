/**
 * API Studio HTTP engine. Runs in the main process (Node) so requests to
 * arbitrary origins are never subject to the renderer's CORS / webSecurity
 * restrictions. Uses axios for the transport and `form-data` for multipart
 * bodies.
 */
import axios, { type AxiosRequestConfig } from 'axios'
import FormData from 'form-data'
import type { ApiExecutionResult, RequestBody, ResolvedHttpRequest } from '@shared/types/api-studio'
import { logger } from '../infra/logger.service'
import { applySignedAuth, buildDigestAuthorization } from './request-auth'

const DEFAULT_TIMEOUT_MS = 30_000
const TEXT_CONTENT_TYPE_HINTS = ['text/', 'json', 'xml', 'javascript', 'html', 'csv', 'yaml', 'x-www-form-urlencoded']

function isTextContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase()
  return TEXT_CONTENT_TYPE_HINTS.some((hint) => lower.includes(hint)) || lower === ''
}

function buildBody(body: RequestBody, headers: Record<string, string>): { data: unknown; extraHeaders: Record<string, string> } {
  const extraHeaders: Record<string, string> = {}

  switch (body.type) {
    case 'json': {
      extraHeaders['Content-Type'] = headers['Content-Type'] || headers['content-type'] || 'application/json'
      try {
        return { data: body.content.trim() ? JSON.parse(body.content) : {}, extraHeaders }
      } catch {
        // Fall back to raw string so users can still send invalid-but-intentional payloads.
        return { data: body.content, extraHeaders }
      }
    }
    case 'text': {
      extraHeaders['Content-Type'] = headers['Content-Type'] || headers['content-type'] || 'text/plain'
      return { data: body.content, extraHeaders }
    }
    case 'x-www-form-urlencoded': {
      extraHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
      const params = new URLSearchParams()
      for (const line of body.content.split('\n')) {
        const idx = line.indexOf('=')
        if (idx === -1) continue
        params.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
      }
      return { data: params.toString(), extraHeaders }
    }
    case 'form-data': {
      const form = new FormData()
      for (const field of body.formData ?? []) {
        if (!field.enabled || !field.key) continue
        if (field.type === 'file' && field.fileBase64) {
          form.append(field.key, Buffer.from(field.fileBase64, 'base64'), {
            filename: field.fileName || 'file',
            contentType: field.fileContentType || 'application/octet-stream'
          })
        } else {
          form.append(field.key, field.value ?? '')
        }
      }
      return { data: form, extraHeaders: form.getHeaders() }
    }
    default:
      return { data: undefined, extraHeaders }
  }
}

class HttpClientService {
  private controllers = new Map<string, AbortController>()

  async execute(input: ResolvedHttpRequest): Promise<ApiExecutionResult> {
    const controller = new AbortController()
    this.controllers.set(input.clientRequestId, controller)

    const started = performance.now()
    const { data, extraHeaders } = buildBody(input.body, input.headers)
    const headers: Record<string, string> = { ...input.headers, ...extraHeaders }
    const params: Record<string, string> = { ...input.params }
    applySignedAuth(input, headers, params, data)

    const config: AxiosRequestConfig = {
      method: input.method,
      url: input.url,
      headers,
      params,
      data,
      signal: controller.signal,
      timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      responseType: 'arraybuffer',
      validateStatus: () => true,
      maxRedirects: 10,
      decompress: true
    }

    try {
      let response = await axios.request(config)

      const wwwAuth = response.headers['www-authenticate']
      const challenge = Array.isArray(wwwAuth) ? wwwAuth[0] : wwwAuth
      if (response.status === 401 && input.auth?.type === 'digest' && typeof challenge === 'string') {
        const digest = buildDigestAuthorization(input.auth, input.method, input.url, challenge)
        if (digest) {
          headers['Authorization'] = digest
          response = await axios.request({ ...config, headers: { ...headers } })
        }
      }

      const timeMs = Math.round(performance.now() - started)
      const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data ?? '')
      const contentType = String(response.headers['content-type'] ?? '')
      const responseHeaders: Record<string, string> = {}
      for (const [key, value] of Object.entries(response.headers)) {
        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value)
      }

      const isBinary = !isTextContentType(contentType)

      return {
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
        statusText: response.statusText || '',
        headers: responseHeaders,
        data: isBinary ? '' : buffer.toString('utf-8'),
        dataBase64: isBinary ? buffer.toString('base64') : undefined,
        isBinary,
        contentType,
        timeMs,
        sizeBytes: buffer.byteLength
      }
    } catch (error) {
      const timeMs = Math.round(performance.now() - started)
      const aborted = axios.isCancel(error) || controller.signal.aborted
      const message = error instanceof Error ? error.message : 'Request failed'
      if (!aborted) logger.error(message, 'ApiStudioHttpClient')

      return {
        ok: false,
        status: 0,
        statusText: '',
        headers: {},
        data: '',
        isBinary: false,
        contentType: '',
        timeMs,
        sizeBytes: 0,
        error: aborted ? 'Request cancelled' : message,
        aborted
      }
    } finally {
      this.controllers.delete(input.clientRequestId)
    }
  }

  cancel(clientRequestId: string): boolean {
    const controller = this.controllers.get(clientRequestId)
    if (!controller) return false
    controller.abort()
    return true
  }
}

export const httpClientService = new HttpClientService()
