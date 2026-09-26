import { describe, expect, it } from 'vitest'
import { REDACTED, redactCollection, redactRequest, redactText } from '@shared/lib/redact-secrets'
import { prepareWorkspacePersistState, sanitizePersistBlob, stripFileBytes } from '@shared/lib/workspace-document'
import type { ApiCollection, ApiRequest } from '@shared/types/api-studio'

function request(partial: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'r1',
    name: 'Login',
    method: 'POST',
    url: 'https://api.example.com/login?token=super-secret',
    headers: [
      { id: 'h1', key: 'Authorization', value: 'Bearer abc.def.ghi', enabled: true },
      { id: 'h2', key: 'Accept', value: 'application/json', enabled: true }
    ],
    queryParams: [{ id: 'q1', key: 'api_key', value: 'key-123', enabled: true }],
    body: {
      type: 'json',
      content: JSON.stringify({ email: 'a@b.co', password: 's3cret' }),
      formData: [
        {
          id: 'f1',
          key: 'upload',
          value: 'notes.txt',
          enabled: true,
          type: 'file',
          fileName: 'notes.txt',
          fileBase64: 'QQ=='
        }
      ]
    },
    auth: { type: 'bearer', bearerToken: 'live-token' },
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial
  }
}

describe('redact secrets', () => {
  it('removes bearer tokens from free text', () => {
    expect(redactText('Authorization: Bearer abc.def.ghi')).toBe(`Authorization: ${REDACTED}`)
    expect(redactText('failed token=abc123')).toContain(REDACTED)
    expect(redactText('failed token=abc123')).not.toContain('abc123')
  })

  it('strips auth, sensitive headers, and secret JSON fields from a request', () => {
    const safe = redactRequest(request())
    expect(safe.auth.bearerToken).toBe(REDACTED)
    expect(safe.headers.find((h) => h.key === 'Authorization')?.value).toBe(REDACTED)
    expect(safe.headers.find((h) => h.key === 'Accept')?.value).toBe('application/json')
    expect(safe.queryParams[0]?.value).toBe(REDACTED)
    expect(safe.url).not.toContain('super-secret')
    expect(safe.body.content).not.toContain('s3cret')
    expect(safe.body.content).toContain('a@b.co')
    expect(safe.body.formData?.[0]?.fileBase64).toBeUndefined()
  })

  it('redacts collection and folder auth', () => {
    const collection: ApiCollection = {
      id: 'c1',
      name: 'API',
      description: '',
      folders: [{ id: 'f1', name: 'Auth', auth: { type: 'basic', basicUsername: 'ada', basicPassword: 'pw' } }],
      requests: [request()],
      auth: { type: 'apiKey', apiKeyName: 'X-Key', apiKeyValue: 'secret-key', apiKeyLocation: 'header' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    const safe = redactCollection(collection)
    expect(safe.auth?.apiKeyValue).toBe(REDACTED)
    expect(safe.auth?.apiKeyName).toBe('X-Key')
    expect(safe.folders[0]?.auth?.basicPassword).toBe(REDACTED)
    expect(safe.folders[0]?.auth?.basicUsername).toBe('ada')
  })
})

describe('workspace document', () => {
  it('drops file bytes and history credentials before persist', () => {
    const prepared = prepareWorkspacePersistState({
      collections: [{ requests: [request()] }],
      history: [
        {
          id: 'h1',
          timestamp: '2026-01-01T00:00:00.000Z',
          request: request(),
          response: { ok: true, status: 200, statusText: 'OK', sizeBytes: 2, timeMs: 10 },
          durationMs: 10
        }
      ]
    })

    expect(JSON.stringify(prepared.collections)).not.toContain('QQ==')
    expect(prepared.history[0]?.request.auth.bearerToken).toBe(REDACTED)
    expect(JSON.stringify(prepared.collections)).toContain('live-token')
  })

  it('sanitizes a zustand persist blob', () => {
    const blob = sanitizePersistBlob({
      version: 1,
      state: {
        history: [
          {
            id: 'h1',
            timestamp: '2026-01-01T00:00:00.000Z',
            request: request(),
            response: { ok: false, status: 401, statusText: 'Unauthorized', sizeBytes: 0, timeMs: 4 },
            durationMs: 4
          }
        ]
      }
    }) as { state: { history: { request: ApiRequest }[] } }

    expect(blob.state.history[0]?.request.auth.bearerToken).toBe(REDACTED)
    expect(stripFileBytes({ fileBase64: 'QQ==', fileName: 'a.txt' })).toEqual({ fileName: 'a.txt' })
  })
})
