import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CookieJarService } from '../electron/main/network/cookie-jar.service'
import { mergeCookieHeader } from '../electron/main/network/cookie-header'

describe('cookie jar matching', () => {
  it('sends host-only cookies to the exact host only', async () => {
    const jar = new CookieJarService(null)
    await jar.storeFromResponse('https://api.example.com/login', 'sid=abc; Path=/')
    expect(await jar.getCookieHeader('https://api.example.com/users')).toBe('sid=abc')
    expect(await jar.getCookieHeader('https://www.example.com/')).toBe('')
    expect(await jar.getCookieHeader('https://sub.api.example.com/')).toBe('')
  })

  it('sends Domain cookies to subdomains', async () => {
    const jar = new CookieJarService(null)
    await jar.storeFromResponse('https://login.example.com/', 'shared=1; Domain=example.com; Path=/')
    expect(await jar.getCookieHeader('https://api.example.com/')).toBe('shared=1')
    expect(await jar.getCookieHeader('https://example.com/')).toBe('shared=1')
    expect(await jar.getCookieHeader('https://example.org/')).toBe('')
  })

  it('scopes cookies by path', async () => {
    const jar = new CookieJarService(null)
    await jar.storeFromResponse('https://a.test/app/login', ['app=1; Path=/app', 'root=1; Path=/'])
    expect(await jar.getCookieHeader('https://a.test/app/page')).toBe('app=1; root=1')
    expect(await jar.getCookieHeader('https://a.test/other')).toBe('root=1')
  })

  it('keeps Secure cookies off plain http (except localhost)', async () => {
    const jar = new CookieJarService(null)
    await jar.storeFromResponse('https://a.test/', 'token=s; Secure; Path=/')
    expect(await jar.getCookieHeader('http://a.test/')).toBe('')
    expect(await jar.getCookieHeader('https://a.test/')).toBe('token=s')

    await jar.storeFromResponse('http://localhost:3000/', 'dev=1; Secure; Path=/')
    expect(await jar.getCookieHeader('http://localhost:3000/')).toBe('dev=1')
  })

  it('drops expired cookies and ignores cookies for a public suffix', async () => {
    const jar = new CookieJarService(null)
    await jar.storeFromResponse('https://a.test/', ['live=1; Max-Age=3600', 'gone=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])
    await jar.storeFromResponse('https://evil.co.uk/', 'wide=1; Domain=co.uk')
    expect(await jar.getCookieHeader('https://a.test/')).toBe('live=1')
    expect((await jar.list()).map((c) => c.name)).toEqual(['live'])
  })

  it('edits and deletes cookies by domain from the manager', async () => {
    const jar = new CookieJarService(null)
    await jar.storeFromResponse('https://a.test/', ['one=1', 'two=2'])
    await jar.storeFromResponse('https://b.test/', 'three=3')

    const [one] = await jar.list()
    await jar.upsert({ ...one, value: 'edited' }, { domain: one.domain, path: one.path, name: one.name })
    expect(await jar.getCookieHeader('https://a.test/')).toContain('one=edited')

    await jar.remove({ domain: 'a.test', path: '/', name: 'two' })
    expect(await jar.getCookieHeader('https://a.test/')).toBe('one=edited')

    await jar.remove({ domain: 'a.test' })
    expect(await jar.getCookieHeader('https://a.test/')).toBe('')
    expect(await jar.getCookieHeader('https://b.test/')).toBe('three=3')

    await jar.upsert({
      name: 'manual',
      value: 'v',
      domain: 'c.test',
      path: '/',
      expires: null,
      httpOnly: false,
      secure: false,
      hostOnly: false
    })
    expect(await jar.getCookieHeader('https://api.c.test/')).toBe('manual=v')
    await expect(
      jar.upsert({ name: 'bad name', value: '', domain: 'c.test', path: '/', expires: null, httpOnly: false, secure: false, hostOnly: true })
    ).rejects.toThrow()
  })

  it('persists the jar to disk and loads it back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shurikly-cookies-'))
    const file = join(dir, 'cookies', 'default.json')
    const jar = new CookieJarService(() => file)
    await jar.storeFromResponse('https://a.test/', 'sid=persisted; Max-Age=3600')
    await jar.flush()
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf-8')).toContain('persisted')

    const reloaded = new CookieJarService(() => file)
    expect(await reloaded.getCookieHeader('https://a.test/')).toBe('sid=persisted')
  })
})

describe('mergeCookieHeader', () => {
  it('lets a user-written Cookie header win on name clashes', () => {
    expect(mergeCookieHeader('sid=mine; theme=dark', 'sid=jar; other=1')).toBe('sid=mine; theme=dark; other=1')
    expect(mergeCookieHeader(undefined, 'a=1')).toBe('a=1')
    expect(mergeCookieHeader('a=1', '')).toBe('a=1')
  })
})
