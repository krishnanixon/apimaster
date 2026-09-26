/**
 * OAuth2 authorization code flow for API Studio — opens a local callback window.
 */
import { BrowserWindow } from 'electron'
import axios from 'axios'
import { randomUUID } from 'node:crypto'
import type { OAuth2AuthorizeInput, OAuth2TokenInput, OAuth2TokenResult } from '@shared/types/api-studio'
import { logger } from '../infra/logger.service'

export class OAuth2Service {
  async authorize(
    input: OAuth2AuthorizeInput,
    getMainWindow: () => BrowserWindow | null
  ): Promise<{ code: string; state?: string }> {
    const redirectUri = input.redirectUri
    const redirectBase = redirectUri.split('?')[0]

    const authUrl = new URL(input.authUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', input.clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    if (input.scope) authUrl.searchParams.set('scope', input.scope)
    const state = input.state ?? randomUUID()
    authUrl.searchParams.set('state', state)

    return new Promise((resolve, reject) => {
      const parent = getMainWindow()
      const authWindow = new BrowserWindow({
        width: 520,
        height: 720,
        parent: parent ?? undefined,
        modal: Boolean(parent),
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        if (!authWindow.isDestroyed()) authWindow.close()
        fn()
      }

      const timeout = setTimeout(() => {
        finish(() => reject(new Error('OAuth authorization timed out')))
      }, 120_000)

      authWindow.on('closed', () => {
        clearTimeout(timeout)
        if (!settled) reject(new Error('Authorization window closed'))
      })

      const handleUrl = (rawUrl: string) => {
        try {
          if (!rawUrl.startsWith(redirectBase)) return
          const parsed = new URL(rawUrl)

          const error = parsed.searchParams.get('error')
          if (error) {
            finish(() => reject(new Error(parsed.searchParams.get('error_description') ?? error)))
            return
          }

          const code = parsed.searchParams.get('code')
          const returnedState = parsed.searchParams.get('state') ?? undefined
          if (!code) return

          if (returnedState && returnedState !== state) {
            finish(() => reject(new Error('OAuth state mismatch')))
            return
          }

          clearTimeout(timeout)
          finish(() => resolve({ code, state: returnedState }))
        } catch (e) {
          logger.error(String(e), 'OAuth2Service')
        }
      }

      authWindow.webContents.on('will-redirect', (_e, url) => handleUrl(url))
      authWindow.webContents.on('will-navigate', (_e, url) => handleUrl(url))
      authWindow.webContents.setWindowOpenHandler(({ url }) => {
        handleUrl(url)
        return { action: 'deny' }
      })

      authWindow.once('ready-to-show', () => authWindow.show())
      void authWindow.loadURL(authUrl.toString())
    })
  }

  async exchangeToken(input: OAuth2TokenInput): Promise<OAuth2TokenResult> {
    const grantType = input.grantType ?? 'authorization_code'
    const params = new URLSearchParams({
      grant_type: grantType,
      client_id: input.clientId
    })
    if (input.clientSecret) params.set('client_secret', input.clientSecret)
    if (input.scope) params.set('scope', input.scope)

    if (grantType === 'authorization_code') {
      if (!input.code) throw new Error('Authorization code is required')
      params.set('code', input.code)
      if (input.redirectUri) params.set('redirect_uri', input.redirectUri)
    } else if (grantType === 'password') {
      if (!input.username) throw new Error('Username is required')
      params.set('username', input.username)
      params.set('password', input.password ?? '')
    }

    const response = await axios.post(input.tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
      validateStatus: () => true
    })

    if (response.status < 200 || response.status >= 300) {
      const detail =
        typeof response.data === 'object' && response.data && 'error_description' in response.data
          ? String((response.data as { error_description?: string }).error_description)
          : `Token exchange failed (${response.status})`
      throw new Error(detail)
    }

    const data = response.data as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      token_type?: string
    }

    if (!data.access_token) throw new Error('No access_token in token response')

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type
    }
  }
}

export const oauth2Service = new OAuth2Service()
