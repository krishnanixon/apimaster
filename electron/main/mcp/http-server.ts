import { createHash, timingSafeEqual } from 'crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { MCP_SERVER_NAME } from '@shared/mcp/types'
import { MCP_SERVER_INSTRUCTIONS, MCP_TOOL_NAMES, MCP_TOOLS, type McpToolName } from '@shared/mcp/tools'
import { navigateMainWindow } from '../windows/window-manager'
import { mcpToolBridge } from './tool-bridge'

const MAX_BODY_BYTES = 24 * 1024 * 1024

export interface McpHttpServer {
  port: number
  close: () => Promise<void>
}

function tokenEquals(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function bearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization
  if (!header) return ''
  const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] : header)
  return match?.[1]?.trim() ?? ''
}

function pathname(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  } catch {
    return '/'
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload)
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0)
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }))
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(Object.assign(new Error('Request body is not JSON'), { statusCode: 400 }))
      }
    })
    req.on('error', reject)
  })
}

function shouldReveal(tool: McpToolName, args: Record<string, unknown>): boolean {
  if (tool === 'open_request') return true
  if (tool === 'create_request' && args.openInApp === true) return true
  if (tool === 'import_curl' && typeof args.collectionId !== 'string') return true
  return false
}

function createSession(version: string, exposeSecrets: () => boolean): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version },
    { instructions: MCP_SERVER_INSTRUCTIONS }
  )
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
      async (args: Record<string, unknown> | undefined) => {
        const record = args ?? {}
        if (shouldReveal(name, record)) navigateMainWindow('/')
        const result = await mcpToolBridge.invoke(name, record, { redactSecrets: !exposeSecrets() })
        if (!result.ok) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: result.error ?? 'Tool failed' }]
          }
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }]
        }
      }
    )
  }
  return server
}

export function startMcpHttpServer(options: {
  port: number
  version: string
  getToken: () => string
  exposeSecrets: () => boolean
  rendererReady: () => boolean
}): Promise<McpHttpServer> {
  const server: Server = createServer((req, res) => {
    void handle(req, res)
  })
  server.requestTimeout = 0
  server.headersTimeout = 60_000

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const path = pathname(req)
      if (req.method === 'GET' && path === '/health') {
        sendJson(res, 200, { ok: true, rendererReady: options.rendererReady() })
        return
      }
      if (path !== '/mcp') {
        sendJson(res, 404, { jsonrpc: '2.0', error: { code: -32004, message: 'Not found' }, id: null })
        return
      }
      if (req.method === 'GET' || req.method === 'DELETE') {
        sendJson(res, 405, {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed.' },
          id: null
        })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed.' },
          id: null
        })
        return
      }
      if (!tokenEquals(bearerToken(req), options.getToken())) {
        sendJson(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
        return
      }

      const parsedBody = await readBody(req)
      const mcp = createSession(options.version, options.exposeSecrets)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        allowedHosts: [`127.0.0.1:${options.port}`, `localhost:${options.port}`],
        enableDnsRebindingProtection: true
      })
      res.on('close', () => {
        void transport.close()
        void mcp.close()
      })
      await mcp.connect(transport)
      await transport.handleRequest(req, res, parsedBody)
    } catch (error) {
      const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
      if (!res.headersSent) {
        sendJson(res, Number.isFinite(status) ? status : 500, {
          jsonrpc: '2.0',
          error: { code: -32603, message: error instanceof Error ? error.message : 'MCP request failed' },
          id: null
        })
      }
    }
  }

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve({
        port: options.port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done())
          })
      })
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(options.port, '127.0.0.1')
  })
}
