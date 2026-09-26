import { describe, expect, it } from 'vitest'
import { ipcSchemas, schema } from '../electron/main/ipc/runtime-schema'

describe('runtime IPC schemas', () => {
  it('parses a valid object without retaining unknown fields', () => {
    const input = schema.object({ id: ipcSchemas.id, enabled: schema.boolean() })
    expect(input.parse({ id: 'abc', enabled: true, secret: 'ignored' })).toEqual({ id: 'abc', enabled: true })
  })

  it('reports a precise nested path', () => {
    const input = schema.object({ items: schema.array(schema.object({ name: ipcSchemas.id })) })
    expect(() => input.parse({ items: [{ name: '' }] }, 'request')).toThrow('request.items[0].name')
  })

  it('supports optional values and numeric bounds', () => {
    const input = schema.object({ rows: schema.optional(schema.number({ integer: true, min: 1, max: 500 })) })
    expect(input.parse({})).toEqual({ rows: undefined })
    expect(() => input.parse({ rows: 501 })).toThrow('at most 500')
  })

  it('can preserve additional fields for versioned domain payloads', () => {
    const input = schema.object({ id: ipcSchemas.id }, { passthrough: true })
    expect(input.parse({ id: 'abc', futureField: 42 })).toEqual({ id: 'abc', futureField: 42 })
  })
})
