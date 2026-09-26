import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { app } from 'electron'
import { logger } from '../infra/logger.service'

export interface McpServerConfig {
  id: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface McpConfigFile {
  servers: McpServerConfig[]
}

function configPath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'mcp-servers.json')
}

export function listMcpServers(): McpServerConfig[] {
  const path = configPath()
  if (!existsSync(path)) {
    writeFileSync(path, `${JSON.stringify({ servers: [] } satisfies McpConfigFile, null, 2)}\n`, 'utf-8')
    return []
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<McpConfigFile>
    return Array.isArray(parsed.servers) ? parsed.servers.filter((s) => s?.id && s?.command) : []
  } catch {
    return []
  }
}

async function rpc(server: McpServerConfig, method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(server.command, server.args ?? [], {
      windowsHide: true,
      env: { ...process.env, ...server.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let buffer = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`MCP server "${server.id}" timed out`))
    }, 12_000)

    const send = (id: number, rpcMethod: string, rpcParams: unknown) => {
      const body = JSON.stringify({ jsonrpc: '2.0', id, method: rpcMethod, params: rpcParams })
      child.stdin?.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const match = buffer.match(/Content-Length:\s*(\d+)\r\n\r\n([\s\S]*)/)
      if (!match) return
      const length = Number(match[1])
      const rest = match[2]
      if (Buffer.byteLength(rest, 'utf8') < length) return
      try {
        const message = JSON.parse(rest.slice(0, length)) as { result?: unknown; error?: { message?: string } }
        clearTimeout(timer)
        child.kill()
        if (message.error) reject(new Error(message.error.message || 'MCP error'))
        else resolve(message.result)
      } catch (error) {
        clearTimeout(timer)
        child.kill()
        reject(error instanceof Error ? error : new Error('Invalid MCP response'))
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    send(1, method, params)
  })
}

export async function mcpListTools(serverId: string): Promise<string> {
  const server = listMcpServers().find((item) => item.id === serverId)
  if (!server) return `Unknown MCP server "${serverId}". Configure servers in userData/data/mcp-servers.json.`
  try {
    const result = await rpc(server, 'tools/list', {})
    return JSON.stringify(result, null, 2).slice(0, 8_000)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`MCP listTools ${serverId}: ${message}`, 'Agent')
    return `MCP call failed: ${message}`
  }
}

export async function mcpCallTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const server = listMcpServers().find((item) => item.id === serverId)
  if (!server) return `Unknown MCP server "${serverId}".`
  try {
    const result = await rpc(server, 'tools/call', { name, arguments: args })
    return JSON.stringify(result, null, 2).slice(0, 12_000)
  } catch (error) {
    return `MCP call failed: ${error instanceof Error ? error.message : String(error)}`
  }
}
