/**
 * Workspace cookie jar (RFC 6265 via tough-cookie). Every request the main process sends —
 * the request editor, collection runs, MCP tools, AI Engineer runs, WebSockets — reads and
 * writes the same jar, which is saved to `data/cookies/<workspace>.json`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Cookie, CookieJar } from 'tough-cookie'
import type { CookieDeleteInput, StoredCookie } from '@shared/types/network'

const SAVE_DEBOUNCE_MS = 400

function createJar(): CookieJar {
  return new CookieJar(undefined, { looseMode: true, allowSecureOnLocal: true })
}

export function toStoredCookie(cookie: Cookie): StoredCookie {
  const expires = cookie.expiryDate()
  const sameSite = typeof cookie.sameSite === 'string' ? cookie.sameSite.toLowerCase() : undefined
  return {
    name: cookie.key,
    value: cookie.value,
    domain: cookie.domain ?? '',
    path: cookie.path ?? '/',
    expires: expires && Number.isFinite(expires.getTime()) && expires.getTime() < 8.64e15 ? expires.toISOString() : null,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: sameSite === 'strict' || sameSite === 'lax' || sameSite === 'none' ? sameSite : undefined,
    hostOnly: cookie.hostOnly ?? false
  }
}

export class CookieJarService {
  private jar: CookieJar | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  /** `filePath` null keeps the jar in memory only (tests). */
  constructor(private readonly filePath: (() => string) | null) {}

  private get(): CookieJar {
    if (this.jar) return this.jar
    this.jar = createJar()
    const path = this.filePath?.()
    if (path && existsSync(path)) {
      try {
        const loaded = CookieJar.deserializeSync(readFileSync(path, 'utf-8'))
        this.jar = new CookieJar(loaded.store, { looseMode: true, allowSecureOnLocal: true })
      } catch {
        // A corrupt jar is not worth failing requests over; start empty.
      }
    }
    return this.jar
  }

  private scheduleSave(): void {
    if (!this.filePath) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush()
    }, SAVE_DEBOUNCE_MS)
  }

  async flush(): Promise<void> {
    if (!this.filePath || !this.jar) return
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const path = this.filePath()
    const serialized = await this.jar.serialize()
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(serialized), { encoding: 'utf-8', mode: 0o600 })
    renameSync(tmp, path)
  }

  /** `Cookie` header value for a request to `url` (empty when nothing matches). */
  async getCookieHeader(url: string): Promise<string> {
    try {
      return await this.get().getCookieString(url)
    } catch {
      return ''
    }
  }

  /** Stores every `Set-Cookie` of a response (invalid ones are ignored, like a browser). */
  async storeFromResponse(url: string, setCookie: string | string[] | undefined): Promise<void> {
    if (!setCookie) return
    const values = Array.isArray(setCookie) ? setCookie : [setCookie]
    let changed = false
    for (const value of values) {
      try {
        const stored = await this.get().setCookie(value, url, { ignoreError: true })
        if (stored) changed = true
      } catch {
        // ignoreError covers policy rejections; anything else is a malformed header.
      }
    }
    if (changed) this.scheduleSave()
  }

  async list(): Promise<StoredCookie[]> {
    const cookies = await this.get().store.getAllCookies()
    const now = Date.now()
    return cookies
      .filter((cookie) => {
        const expiry = cookie.expiryTime()
        return expiry === undefined || expiry > now
      })
      .map(toStoredCookie)
      .sort((a, b) => a.domain.localeCompare(b.domain) || a.path.localeCompare(b.path) || a.name.localeCompare(b.name))
  }

  /** Adds or replaces a cookie by (domain, path, name). `previous` identifies the one being edited. */
  async upsert(cookie: StoredCookie, previous?: { domain: string; path: string; name: string }): Promise<void> {
    const domain = cookie.domain.trim().replace(/^\./, '').toLowerCase()
    const name = cookie.name.trim()
    if (!domain) throw new Error('Cookie domain is required')
    if (!name) throw new Error('Cookie name is required')
    if (/[;\s=]/.test(name)) throw new Error('Cookie name cannot contain spaces, "=" or ";"')
    if (/[;\r\n]/.test(cookie.value)) throw new Error('Cookie value cannot contain ";" or line breaks')
    const path = cookie.path.trim() || '/'
    let expires: Date | 'Infinity' = 'Infinity'
    if (cookie.expires) {
      const date = new Date(cookie.expires)
      if (Number.isNaN(date.getTime())) throw new Error('Cookie expiry is not a valid date')
      expires = date
    }

    const store = this.get().store
    if (previous) await store.removeCookie(previous.domain, previous.path, previous.name)
    await store.removeCookie(domain, path, name)
    const now = new Date()
    await store.putCookie(
      new Cookie({
        key: name,
        value: cookie.value,
        domain,
        path,
        expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
        hostOnly: cookie.hostOnly,
        creation: now,
        lastAccessed: now,
        pathIsDefault: false
      })
    )
    this.scheduleSave()
  }

  /** Deletes one cookie (`name` + `path`), every cookie on a path, or the whole domain. */
  async remove(input: CookieDeleteInput): Promise<void> {
    const store = this.get().store
    const domain = input.domain.replace(/^\./, '').toLowerCase()
    if (input.name !== undefined) {
      await store.removeCookie(domain, input.path ?? '/', input.name)
    } else {
      const all = await store.getAllCookies()
      for (const cookie of all) {
        if (cookie.domain !== domain) continue
        if (input.path !== undefined && cookie.path !== input.path) continue
        await store.removeCookie(cookie.domain, cookie.path, cookie.key)
      }
    }
    this.scheduleSave()
  }

  async clear(): Promise<void> {
    await this.get().removeAllCookies()
    this.scheduleSave()
  }
}
