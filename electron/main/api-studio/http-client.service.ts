/**
 * API Studio HTTP engine. Runs in the main process (Node) so requests to
 * arbitrary origins are never subject to the renderer's CORS / webSecurity
 * restrictions. Uses axios for the transport and `form-data` for multipart
 * bodies. Redirects are followed here (not by axios) so every hop gets its own
 * proxy / TLS agent and reads and writes the workspace cookie jar.
 */
import axios, { type AxiosRequestConfig, type AxiosResponse, type Method } from 'axios'
import FormData from 'form-data'
import type { ApiExecutionResult, RequestBody, ResolvedHttpRequest } from '@shared/types/api-studio'
import type { NetworkErrorInfo } from '@shared/types/network'
import { classifyNetworkError } from '@shared/lib/network/errors'
import { logger } from '../infra/logger.service'
import { agentsFor, cookieJar } from '../network/network-agents'
import { mergeCookieHeader } from '../network/cookie-header'
import { networkSettingsService } from '../network/network-settings.service'
import { applySignedAuth, buildDigestAuthorization } from './request-auth'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 10
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
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

function headerKey(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  return Object.keys(headers).find((key) => key.toLowerCase() === lower)
}

function removeHeader(headers: Record<string, string>, name: string): void {
  const key = headerKey(headers, name)
  if (key) delete headers[key]
}

class TlsSetupError extends Error {}

class HttpClientService {
  private controllers = new Map<string, AbortController>()

  /** One hop: agents for the URL, jar cookies, and Set-Cookie captured from the response. */
  private async sendHop(
    hop: { method: string; url: string; headers: Record<string, string>; params?: Record<string, string>; data: unknown },
    input: ResolvedHttpRequest,
    signal: AbortSignal,
    userCookie: string | undefined,
    onProxy: (display: string | null) => void
  ): Promise<AxiosResponse<ArrayBuffer>> {
    const cookiesOn = networkSettingsService.get().cookies.enabled
    const fullUrl = axios.getUri({ url: hop.url, params: hop.params })

    let agents: Awaited<ReturnType<typeof agentsFor>>
    try {
      agents = await agentsFor(fullUrl, input.network)
    } catch (error) {
      throw new TlsSetupError(error instanceof Error ? error.message : String(error))
    }
    onProxy(agents.proxy.displayUrl)

    const headers = { ...hop.headers }
    removeHeader(headers, 'cookie')
    const jarCookie = cookiesOn && !input.network?.disableCookies ? await cookieJar.getCookieHeader(fullUrl) : ''
    const cookie = mergeCookieHeader(userCookie, jarCookie)
    if (cookie) headers['Cookie'] = cookie

    const config: AxiosRequestConfig = {
      method: hop.method as Method,
      url: hop.url,
      headers,
      params: hop.params,
      data: hop.data,
      signal,
      timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      responseType: 'arraybuffer',
      validateStatus: () => true,
      maxRedirects: 0,
      proxy: false,
      httpAgent: agents.agent,
      httpsAgent: agents.agent,
      decompress: true
    }
    const response = await axios.request<ArrayBuffer>(config)
    if (cookiesOn) await cookieJar.storeFromResponse(fullUrl, response.headers['set-cookie'])
    return response
  }

  /** Sends the request and follows redirects (browser rules for method/body/credentials). */
  private async sendFollowingRedirects(
    input: ResolvedHttpRequest,
    first: { headers: Record<string, string>; params: Record<string, string>; data: unknown },
    signal: AbortSignal,
    onProxy: (display: string | null) => void
  ): Promise<{ response: AxiosResponse<ArrayBuffer>; url: string }> {
    let method: string = input.method
    let url = axios.getUri({ url: input.url, params: first.params })
    const origin = new URL(url)
    const headers = { ...first.headers }
    const userCookieKey = headerKey(headers, 'cookie')
    let userCookie = userCookieKey ? headers[userCookieKey] : undefined
    let data = first.data
    let params: Record<string, string> | undefined = first.params
    let hopUrl = input.url

    for (let hop = 0; ; hop++) {
      const response = await this.sendHop({ method, url: hopUrl, headers, params, data }, input, signal, userCookie, onProxy)
      const location = response.headers['location']
      if (!REDIRECT_STATUSES.has(response.status) || typeof location !== 'string' || !location || hop >= MAX_REDIRECTS) {
        return { response, url }
      }

      const next = new URL(location, url)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return { response, url }
      const changesMethod =
        (response.status === 303 && method !== 'HEAD') || ((response.status === 301 || response.status === 302) && method === 'POST')
      if (changesMethod) {
        method = 'GET'
        data = undefined
        removeHeader(headers, 'content-type')
        removeHeader(headers, 'content-length')
      } else if (data instanceof FormData) {
        // A multipart stream can only be read once; rebuild it for the next hop.
        const rebuilt = buildBody(input.body, input.headers)
        data = rebuilt.data
        Object.assign(headers, rebuilt.extraHeaders)
      }
      if (next.host !== origin.host || next.protocol !== origin.protocol) {
        // Same as browsers / follow-redirects: credentials don't leak to another origin.
        removeHeader(headers, 'authorization')
        removeHeader(headers, 'proxy-authorization')
        userCookie = undefined
      }
      url = next.toString()
      hopUrl = url
      params = undefined
    }
  }

  async execute(input: ResolvedHttpRequest): Promise<ApiExecutionResult> {
    const controller = new AbortController()
    this.controllers.set(input.clientRequestId, controller)

    const started = performance.now()
    const { data, extraHeaders } = buildBody(input.body, input.headers)
    const headers: Record<string, string> = { ...input.headers, ...extraHeaders }
    const params: Record<string, string> = { ...input.params }
    applySignedAuth(input, headers, params, data)
    let proxyDisplay: string | null = null
    const onProxy = (display: string | null) => {
      proxyDisplay = display
    }

    try {
      let { response } = await this.sendFollowingRedirects(input, { headers, params, data }, controller.signal, onProxy)

      const wwwAuth = response.headers['www-authenticate']
      const challenge = Array.isArray(wwwAuth) ? wwwAuth[0] : wwwAuth
      if (response.status === 401 && input.auth?.type === 'digest' && typeof challenge === 'string') {
        const digest = buildDigestAuthorization(input.auth, input.method, input.url, challenge)
        if (digest) {
          headers['Authorization'] = digest
          const retryBody = data instanceof FormData ? buildBody(input.body, input.headers) : { data, extraHeaders: {} }
          ;({ response } = await this.sendFollowingRedirects(
            input,
            { headers: { ...headers, ...retryBody.extraHeaders }, params, data: retryBody.data },
            controller.signal,
            onProxy
          ))
        }
      }

      const timeMs = Math.round(performance.now() - started)
      const raw = response.data as unknown
      const buffer = Buffer.isBuffer(raw)
        ? raw
        : raw instanceof ArrayBuffer
          ? Buffer.from(raw)
          : Buffer.from(typeof raw === 'string' ? raw : '')
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
      const networkError: NetworkErrorInfo | undefined = aborted
        ? undefined
        : error instanceof TlsSetupError
          ? { kind: 'tls', title: 'Could not load a certificate', hint: message }
          : classifyNetworkError(error, { proxy: proxyDisplay })

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
        networkError,
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
