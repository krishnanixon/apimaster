/**
 * WebSocket connections for the request editor, run in the main process with `ws` so they
 * get custom headers, the proxy, TLS options and the cookie jar like HTTP requests do.
 * Events go back to the renderer window that opened the connection.
 */
import WebSocket from 'ws'
import type { WebContents } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { WebSocketConnectInput, WebSocketEvent } from '@shared/types/network'
import { classifyNetworkError } from '@shared/lib/network/errors'
import { agentsFor, cookieJar } from '../network/network-agents'
import { networkSettingsService } from '../network/network-settings.service'
import { mergeCookieHeader } from '../network/cookie-header'
import { logger } from '../infra/logger.service'

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30_000
const MAX_CONNECTIONS = 64

interface Connection {
  socket: WebSocket
  sender: WebContents
}

/** `ws://host/path` + params → final URL; http(s) and bare hosts become ws(s). */
export function buildWebSocketUrl(rawUrl: string, params: Record<string, string>): string {
  let value = rawUrl.trim()
  if (/^https?:\/\//i.test(value)) value = value.replace(/^http/i, 'ws')
  else if (!/^wss?:\/\//i.test(value)) value = `ws://${value}`
  const url = new URL(value)
  for (const [key, val] of Object.entries(params)) url.searchParams.append(key, val)
  return url.toString()
}

class WebSocketService {
  private connections = new Map<string, Connection>()

  private emit(sender: WebContents, event: WebSocketEvent): void {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.API_STUDIO_WS_EVENT, event)
  }

  async connect(input: WebSocketConnectInput, sender: WebContents): Promise<void> {
    this.close(input.connectionId)
    if (this.connections.size >= MAX_CONNECTIONS) throw new Error('Too many open WebSocket connections')

    const url = buildWebSocketUrl(input.url, input.params)
    const cookiesOn = networkSettingsService.get().cookies.enabled
    const { agent, proxy, tls } = await agentsFor(url, input.network, { tunnel: true })

    const headers: Record<string, string> = {}
    let userCookie: string | undefined
    for (const [key, value] of Object.entries(input.headers)) {
      if (key.toLowerCase() === 'cookie') userCookie = value
      else headers[key] = value
    }
    const jarCookie = cookiesOn && !input.network?.disableCookies ? await cookieJar.getCookieHeader(url) : ''
    const cookie = mergeCookieHeader(userCookie, jarCookie)
    if (cookie) headers['Cookie'] = cookie

    const socket = new WebSocket(url, {
      headers,
      handshakeTimeout: input.timeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      // Only pass our agent when tunnelling through a proxy; otherwise ws builds its own
      // connection with the TLS options below.
      agent: proxy.proxyUrl ? agent : undefined,
      rejectUnauthorized: tls.rejectUnauthorized,
      ca: tls.ca,
      cert: tls.cert,
      key: tls.key,
      pfx: tls.pfx,
      passphrase: tls.passphrase,
      followRedirects: true,
      maxRedirects: 5
    })
    const connection: Connection = { socket, sender }
    this.connections.set(input.connectionId, connection)
    const id = input.connectionId
    const isCurrent = () => this.connections.get(id) === connection

    socket.on('upgrade', (response) => {
      if (cookiesOn) void cookieJar.storeFromResponse(url, response.headers['set-cookie'])
    })
    socket.on('open', () => {
      if (isCurrent()) this.emit(sender, { connectionId: id, type: 'open', protocol: socket.protocol || undefined })
    })
    socket.on('message', (data, isBinary) => {
      if (!isCurrent()) return
      const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
      this.emit(sender, {
        connectionId: id,
        type: 'message',
        data: isBinary ? buffer.toString('base64') : buffer.toString('utf-8'),
        binary: isBinary
      })
    })
    socket.on('unexpected-response', (_req, response) => {
      if (!isCurrent()) return
      if (cookiesOn) void cookieJar.storeFromResponse(url, response.headers['set-cookie'])
      const status = response.statusCode ?? 0
      this.emit(sender, {
        connectionId: id,
        type: 'error',
        message: `Server answered the upgrade with HTTP ${status}${response.statusMessage ? ` ${response.statusMessage}` : ''}`,
        status
      })
      response.resume()
      socket.terminate()
    })
    socket.on('error', (error) => {
      if (!isCurrent()) return
      logger.warn(`WebSocket error: ${error.message}`, 'ApiStudioWebSocket')
      this.emit(sender, {
        connectionId: id,
        type: 'error',
        message: error.message,
        networkError: classifyNetworkError(error, { proxy: proxy.displayUrl })
      })
    })
    socket.on('close', (code, reason) => {
      if (this.connections.get(id) === connection) this.connections.delete(id)
      this.emit(sender, { connectionId: id, type: 'close', code, reason: reason.toString('utf-8') })
    })
  }

  send(connectionId: string, data: string): void {
    const connection = this.connections.get(connectionId)
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) throw new Error('WebSocket is not connected')
    connection.socket.send(data)
  }

  close(connectionId: string): void {
    const connection = this.connections.get(connectionId)
    if (!connection) return
    this.connections.delete(connectionId)
    const { socket } = connection
    if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
    else socket.close(1000)
  }

  /** Drops every connection a window opened (reload / close). */
  closeAllFor(sender: WebContents): void {
    for (const [id, connection] of this.connections) {
      if (connection.sender === sender) this.close(id)
    }
  }
}

export const webSocketService = new WebSocketService()
