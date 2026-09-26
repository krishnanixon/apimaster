import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { MCP_SERVER_NAME } from '@shared/mcp/types'
import { MCP_SERVER_INSTRUCTIONS, MCP_TOOL_NAMES, MCP_TOOLS } from '@shared/mcp/tools'
import { extractRpcMessages } from '../electron/main/mcp/stdio-bridge'

describe('MCP tool catalog', () => {
  it('gives every tool an object schema', () => {
    expect(MCP_TOOL_NAMES.length).toBeGreaterThan(20)
    for (const name of MCP_TOOL_NAMES) {
      const schema = z.toJSONSchema(z.object(MCP_TOOLS[name].input))
      expect(schema.type).toBe('object')
      expect(MCP_TOOLS[name].description.length).toBeGreaterThan(10)
    }
  })
})

describe('MCP SDK registration', () => {
  it('lists every APIMaster tool to a client', async () => {
    const server = new McpServer({ name: MCP_SERVER_NAME, version: '0.0.0' }, { instructions: MCP_SERVER_INSTRUCTIONS })
    for (const name of MCP_TOOL_NAMES) {
      const spec = MCP_TOOLS[name]
      server.registerTool(
        name,
        {
          title: spec.title,
          description: spec.description,
          inputSchema: spec.input,
          annotations: spec.annotations
        },
        async () => ({ content: [{ type: 'text', text: 'ok' }] })
      )
    }
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(clientTransport)
    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES].sort())
    const result = await client.callTool({ name: 'list_collections', arguments: {} })
    expect(result.isError).toBeUndefined()
    await client.close()
    await server.close()
  })
})

describe('MCP stdio framing', () => {
  it('reads a JSON response', () => {
    expect(extractRpcMessages('application/json', '{"jsonrpc":"2.0","id":1,"result":{}}')).toEqual([
      { jsonrpc: '2.0', id: 1, result: {} }
    ])
  })

  it('reads SSE data frames', () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n'
    expect(extractRpcMessages('text/event-stream', body)).toEqual([
      { jsonrpc: '2.0', id: 2, result: { ok: true } }
    ])
  })
})
