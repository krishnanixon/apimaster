/**
 * Stdio MCP bridge for Claude Desktop.
 *
 * Claude Desktop launches this file with ELECTRON_RUN_AS_NODE=1 (the Electron
 * binary acting as Node). It speaks newline-delimited JSON-RPC on stdio and
 * forwards each message to the APIMaster window's HTTP MCP server. If the app
 * is not running, it starts it from the launch command stored in mcp-server.json.
 *
 * stdout is reserved for protocol frames. Diagnostics go to stderr.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { USER_DATA_DIR } from '@shared/constants/product'

interface BridgeConfig {
  enabled: boolean
  port: number
  token: string
  launch?: { command: string; args: string[] }
}

export function extractRpcMessages(contentType: string, body: string): unknown[] {
  const trimmed = body.trim()
  if (!trimmed) return []
  if (contentType.includes('text/event-stream')) {
    const messages: unknown[] = []
    let data = ''
    const flush = () => {
      const payload = data.trim()
      data = ''
      if (!payload) return
      messages.push(JSON.parse(payload) as unknown)
    }
    for (const line of body.split(/\r?\n/)) {
      if (line.startsWith('data:')) data += line.slice(5).replace(/^\s/, '')
      else if (line === '' && data) flush()
    }
    if (data) flush()
    return messages
  }
  const parsed = JSON.parse(trimmed) as unknown
  return Array.isArray(parsed) ? parsed : [parsed]
}

function defaultConfigPath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', USER_DATA_DIR, 'data', 'mcp-server.json')
  }
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return join(base, USER_DATA_DIR, 'data', 'mcp-server.json')
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, USER_DATA_DIR, 'data', 'mcp-server.json')
}

function log(message: string): void {
  process.stderr.write(`[apimaster-mcp] ${message}\n`)
}

function readConfig(): BridgeConfig {
  const path = process.env.APIMASTER_MCP_CONFIG || defaultConfigPath()
  if (!existsSync(path)) {
    throw new Error(`MCP config not found at ${path}. Open APIMaster and enable MCP in Settings.`)
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BridgeConfig>
  if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string') {
    throw new Error('MCP config is missing a port or token.')
  }
  return {
    enabled: parsed.enabled === true,
    port: parsed.port,
    token: parsed.token,
    launch: parsed.launch
  }
}

async function isUp(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntilUp(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isUp(port)) return true
    await sleep(250)
  }
  return false
}

let starting: Promise<void> | null = null

async function ensureServer(config: BridgeConfig): Promise<void> {
  if (await isUp(config.port)) return
  if (!config.enabled) {
    throw new Error('APIMaster MCP is turned off. Open the app and enable it in Settings → MCP.')
  }
  if (!starting) {
    starting = (async () => {
      const launch = config.launch
      if (launch?.command) {
        const env = { ...process.env }
        delete env.ELECTRON_RUN_AS_NODE
        const child = spawn(launch.command, launch.args ?? [], {
          detached: true,
          stdio: 'ignore',
          env
        })
        child.unref()
        log('Starting APIMaster')
      }
      const up = await waitUntilUp(config.port, 25_000)
      if (!up) {
        throw new Error('APIMaster MCP server did not start. Open the app and enable MCP in Settings.')
      }
    })().finally(() => {
      starting = null
    })
  }
  await starting
}

async function forward(config: BridgeConfig, message: unknown): Promise<unknown[]> {
  await ensureServer(config)
  const res = await fetch(`http://127.0.0.1:${config.port}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${config.token}`
    },
    body: JSON.stringify(message)
  })
  if (res.status === 202 || res.status === 204) return []
  const text = await res.text()
  if (!text.trim()) return []
  return extractRpcMessages(res.headers.get('content-type') ?? '', text)
}

function writeMessage(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function rpcError(id: unknown, message: string): void {
  writeMessage({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message } })
}

async function handleLine(line: string): Promise<void> {
  let message: { id?: unknown; method?: string }
  try {
    message = JSON.parse(line) as { id?: unknown; method?: string }
  } catch {
    rpcError(null, 'Invalid JSON-RPC message')
    return
  }
  try {
    const config = readConfig()
    const responses = await forward(config, message)
    for (const response of responses) writeMessage(response)
  } catch (error) {
    if (message.id !== undefined) {
      rpcError(message.id, error instanceof Error ? error.message : 'MCP bridge failed')
    } else {
      log(error instanceof Error ? error.message : 'MCP bridge failed')
    }
  }
}

function isBridgeEntry(): boolean {
  const entry = (process.argv[1] ?? '').replace(/\\/g, '/')
  return entry.endsWith('mcp-stdio.js') || entry.endsWith('stdio-bridge.ts')
}

async function main(): Promise<void> {
  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      if (line.trim()) void handleLine(line)
      newline = buffer.indexOf('\n')
    }
  })
  process.stdin.on('end', () => process.exit(0))
}

if (isBridgeEntry()) {
  void main()
}
