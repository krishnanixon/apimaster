import { dialog } from 'electron'
import type { BrowserWindow, WebContents } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  ClientCertificate,
  CookieDeleteInput,
  NetworkSecretsPatch,
  NetworkSettingsPatch,
  StoredCookie,
  WebSocketConnectInput
} from '@shared/types/network'
import { logger } from '../infra/logger.service'
import { networkSettingsService } from '../network/network-settings.service'
import { cookieJar, resolveProxyFor } from '../network/network-agents'
import { webSocketService } from '../api-studio/websocket.service'
import { ipcSchemas, schema, validatedHandle, type RuntimeSchema } from './runtime-schema'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: unknown, fallback: string): IpcResult<T> {
  const message = error instanceof Error ? error.message : fallback
  logger.error(message, 'NetworkIPC')
  return { success: false, error: message }
}

const shortString = schema.string({ max: 4_096 })
const pathString = schema.string({ max: 32_768 })
const stringMap = schema.record(schema.string({ max: 1_000_000 }), { maxKeys: 1_000 })

const networkOptions = schema.optional(
  schema.object({
    verifySsl: schema.optional(schema.boolean()),
    disableCookies: schema.optional(schema.boolean())
  })
)

const clientCertificate = schema.object({
  id: schema.string({ min: 1, max: 64, pattern: /^[a-z0-9-]+$/i }),
  host: shortString,
  kind: schema.literal('pem', 'pfx'),
  certPath: schema.optional(pathString),
  keyPath: schema.optional(pathString),
  pfxPath: schema.optional(pathString),
  enabled: schema.boolean()
}) as RuntimeSchema<ClientCertificate>

const settingsPatch = schema.object({
  proxy: schema.optional(
    schema.object({
      mode: schema.optional(schema.literal('none', 'system', 'manual')),
      httpProxy: schema.optional(shortString),
      httpsProxy: schema.optional(shortString),
      bypass: schema.optional(schema.string({ max: 65_536 })),
      authEnabled: schema.optional(schema.boolean()),
      username: schema.optional(shortString)
    })
  ),
  tls: schema.optional(
    schema.object({
      verifySsl: schema.optional(schema.boolean()),
      useSystemCa: schema.optional(schema.boolean()),
      caCertPaths: schema.optional(schema.array(pathString, { max: 50 })),
      clientCertificates: schema.optional(schema.array(clientCertificate, { max: 100 }))
    })
  ),
  cookies: schema.optional(schema.object({ enabled: schema.optional(schema.boolean()) }))
}) as RuntimeSchema<NetworkSettingsPatch>

const secretsPatch = schema.object({
  proxyPassword: schema.optional(schema.nullable(shortString)),
  certificatePassphrases: schema.optional(schema.record(schema.nullable(shortString), { maxKeys: 100 }))
}) as RuntimeSchema<NetworkSecretsPatch>

const storedCookie = schema.object({
  name: schema.string({ min: 1, max: 4_096 }),
  value: schema.string({ max: 16_384 }),
  domain: schema.string({ min: 1, max: 1_024 }),
  path: schema.string({ max: 4_096 }),
  expires: schema.nullable(schema.string({ max: 64 })),
  httpOnly: schema.boolean(),
  secure: schema.boolean(),
  sameSite: schema.optional(schema.literal('strict', 'lax', 'none')),
  hostOnly: schema.boolean()
}) as RuntimeSchema<StoredCookie>

const cookieKey = schema.object({
  domain: schema.string({ min: 1, max: 1_024 }),
  path: schema.string({ max: 4_096 }),
  name: schema.string({ min: 1, max: 4_096 })
})

export function registerNetworkHandlers(getMainWindow: () => BrowserWindow | null): void {
  validatedHandle(IPC_CHANNELS.NETWORK_GET_SETTINGS, [] as const, () => {
    try {
      return success(networkSettingsService.view())
    } catch (e) {
      return failure(e, 'Failed to load network settings')
    }
  }, 'NetworkIPC')

  validatedHandle(IPC_CHANNELS.NETWORK_UPDATE_SETTINGS, [settingsPatch] as const, (_e, patch) => {
    try {
      return success(networkSettingsService.update(patch))
    } catch (e) {
      return failure(e, 'Failed to save network settings')
    }
  }, 'NetworkIPC')

  validatedHandle(IPC_CHANNELS.NETWORK_UPDATE_SECRETS, [secretsPatch] as const, (_e, patch) => {
    try {
      return success(networkSettingsService.updateSecrets(patch))
    } catch (e) {
      return failure(e, 'Failed to save the secret')
    }
  }, 'NetworkIPC')

  validatedHandle(
    IPC_CHANNELS.NETWORK_PICK_FILE,
    [schema.object({ title: schema.string({ max: 256 }), kind: schema.literal('pem', 'key', 'pfx', 'any') })] as const,
    async (_e, input) => {
      try {
        const win = getMainWindow()
        if (!win) return failure(null, 'No active window')
        const filters =
          input.kind === 'pfx'
            ? [{ name: 'PKCS#12', extensions: ['pfx', 'p12'] }]
            : input.kind === 'pem' || input.kind === 'key'
              ? [{ name: 'PEM', extensions: ['pem', 'crt', 'cer', 'key'] }]
              : []
        const result = await dialog.showOpenDialog(win, {
          title: input.title,
          properties: ['openFile'],
          filters: [...filters, { name: 'All Files', extensions: ['*'] }]
        })
        return success(result.canceled ? null : (result.filePaths[0] ?? null))
      } catch (e) {
        return failure(e, 'Failed to pick a file')
      }
    },
    'NetworkIPC'
  )

  validatedHandle(IPC_CHANNELS.NETWORK_RESOLVE_PROXY, [schema.string({ min: 1, max: 32_768 })] as const, async (_e, url) => {
    try {
      const selection = await resolveProxyFor(url)
      return success({ proxy: selection.displayUrl, source: selection.source, unsupported: selection.unsupported })
    } catch (e) {
      return failure(e, 'Failed to resolve the proxy')
    }
  }, 'NetworkIPC')

  validatedHandle(IPC_CHANNELS.COOKIES_LIST, [] as const, async () => {
    try {
      return success(await cookieJar.list())
    } catch (e) {
      return failure(e, 'Failed to read cookies')
    }
  }, 'NetworkIPC')

  validatedHandle(
    IPC_CHANNELS.COOKIES_UPSERT,
    [schema.object({ cookie: storedCookie, previous: schema.optional(cookieKey) })] as const,
    async (_e, input) => {
      try {
        await cookieJar.upsert(input.cookie, input.previous)
        return success(await cookieJar.list())
      } catch (e) {
        return failure(e, 'Failed to save the cookie')
      }
    },
    'NetworkIPC'
  )

  validatedHandle(
    IPC_CHANNELS.COOKIES_DELETE,
    [schema.object({
      domain: schema.string({ min: 1, max: 1_024 }),
      path: schema.optional(schema.string({ max: 4_096 })),
      name: schema.optional(schema.string({ max: 4_096 }))
    }) as RuntimeSchema<CookieDeleteInput>] as const,
    async (_e, input) => {
      try {
        await cookieJar.remove(input)
        return success(await cookieJar.list())
      } catch (e) {
        return failure(e, 'Failed to delete cookies')
      }
    },
    'NetworkIPC'
  )

  validatedHandle(IPC_CHANNELS.COOKIES_CLEAR, [] as const, async () => {
    try {
      await cookieJar.clear()
      return success([] as StoredCookie[])
    } catch (e) {
      return failure(e, 'Failed to clear cookies')
    }
  }, 'NetworkIPC')

  const watched = new WeakSet<WebContents>()
  validatedHandle(
    IPC_CHANNELS.API_STUDIO_WS_CONNECT,
    [schema.object({
      connectionId: ipcSchemas.id,
      url: schema.string({ min: 1, max: 32_768 }),
      headers: stringMap,
      params: stringMap,
      timeoutMs: schema.optional(schema.number({ integer: true, min: 100, max: 3_600_000 })),
      network: networkOptions
    }) as RuntimeSchema<WebSocketConnectInput>] as const,
    async (event, input) => {
      try {
        const sender = event.sender
        if (!watched.has(sender)) {
          watched.add(sender)
          sender.on('did-start-navigation', (details) => {
            if (details.isMainFrame && !details.isSameDocument) webSocketService.closeAllFor(sender)
          })
          sender.once('destroyed', () => webSocketService.closeAllFor(sender))
        }
        await webSocketService.connect(input, sender)
        return success()
      } catch (e) {
        return failure(e, 'Failed to connect WebSocket')
      }
    },
    'NetworkIPC'
  )

  validatedHandle(IPC_CHANNELS.API_STUDIO_WS_SEND, [ipcSchemas.id, ipcSchemas.text] as const, (_e, connectionId, data) => {
    try {
      webSocketService.send(connectionId, data)
      return success()
    } catch (e) {
      return failure(e, 'Failed to send the message')
    }
  }, 'NetworkIPC')

  validatedHandle(IPC_CHANNELS.API_STUDIO_WS_CLOSE, [ipcSchemas.id] as const, (_e, connectionId) => {
    webSocketService.close(connectionId)
    return success()
  }, 'NetworkIPC')
}
