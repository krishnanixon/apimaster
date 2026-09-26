import { describe, expect, it } from 'vitest'
import { applySignedAuth, buildDigestAuthorization } from '../electron/main/api-studio/request-auth'
import type { ResolvedHttpRequest } from '../src/modules/api-studio/types/api.types'

function baseRequest(partial: Partial<ResolvedHttpRequest> = {}): ResolvedHttpRequest {
  return {
    clientRequestId: 'c1',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: {},
    params: {},
    body: { type: 'none', content: '' },
    ...partial
  }
}

describe('signed API auth', () => {
  it('signs a JWT Bearer token into Authorization', () => {
    const headers: Record<string, string> = {}
    const params: Record<string, string> = {}
    applySignedAuth(
      baseRequest({
        auth: {
          type: 'jwt',
          jwtAlgorithm: 'HS256',
          jwtSecret: 'test-secret',
          jwtPayload: JSON.stringify({ sub: 'user-1', iat: 1_700_000_000 })
        }
      }),
      headers,
      params,
      undefined
    )
    expect(headers.Authorization).toMatch(/^Bearer eyJ/)
    const token = headers.Authorization.replace('Bearer ', '')
    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub: string }
    expect(payload.sub).toBe('user-1')
  })

  it('builds a Digest Authorization from a 401 challenge', () => {
    const header = buildDigestAuthorization(
      { type: 'digest', digestUsername: 'user', digestPassword: 'pass' },
      'GET',
      'https://api.example.com/secure',
      'Digest realm="api", nonce="abc123", qop="auth", algorithm=MD5'
    )
    expect(header).toMatch(/^Digest /)
    expect(header).toContain('username="user"')
    expect(header).toContain('nonce="abc123"')
    expect(header).toContain('response="')
  })

  it('adds an OAuth 1.0 Authorization header', () => {
    const headers: Record<string, string> = {}
    applySignedAuth(
      baseRequest({
        auth: {
          type: 'oauth1',
          oauth1ConsumerKey: 'key',
          oauth1ConsumerSecret: 'secret',
          oauth1SignatureMethod: 'HMAC-SHA1'
        }
      }),
      headers,
      {},
      undefined
    )
    expect(headers.Authorization).toMatch(/^OAuth /)
    expect(headers.Authorization).toContain('oauth_consumer_key="key"')
    expect(headers.Authorization).toContain('oauth_signature=')
  })
})
