import { describe, expect, it } from 'vitest'
import { MCP_REDACTED } from '@shared/mcp/tools'
import { createEmptyRequest } from '@/modules/api-studio/services/requestBuilder'
import { applyMcpRequestPatch } from '@/modules/api-studio/services/mcp/requestFields'

describe('MCP request patches', () => {
  it('moves a query string into query params', () => {
    const next = applyMcpRequestPatch(createEmptyRequest(), {
      url: 'https://example.com/items?x=1&y=2'
    })
    expect(next.url).toBe('https://example.com/items')
    expect(next.queryParams.filter((pair) => pair.key).map((pair) => [pair.key, pair.value])).toEqual([
      ['x', '1'],
      ['y', '2']
    ])
  })

  it('keeps a stored secret when the agent sends the redacted placeholder', () => {
    const base = createEmptyRequest()
    base.auth = { type: 'bearer', bearerToken: 'secret-token' }
    base.headers = [{ id: 'h1', key: 'Authorization', value: 'Bearer secret-token', enabled: true }]

    const next = applyMcpRequestPatch(base, {
      auth: { type: 'bearer', bearerToken: MCP_REDACTED },
      headers: [{ key: 'Authorization', value: MCP_REDACTED }]
    })

    expect(next.auth.bearerToken).toBe('secret-token')
    expect(next.headers.find((header) => header.key === 'Authorization')?.value).toBe('Bearer secret-token')
  })

  it('replaces a secret when the agent sends a new value', () => {
    const base = createEmptyRequest()
    base.auth = { type: 'bearer', bearerToken: 'old' }
    const next = applyMcpRequestPatch(base, { auth: { type: 'bearer', bearerToken: 'new' } })
    expect(next.auth.bearerToken).toBe('new')
  })
})
