import { randomBytes } from 'crypto'
import { join } from 'path'
import { app } from 'electron'
import { MCP_DEFAULT_PORT, type McpServerConfig, type McpServerConfigPatch } from '@shared/mcp/types'
import { dataFilePath, readJsonFile, writeJsonFile } from '../infra/json-store'

const FILE = 'mcp-server.json'

export function assertMcpPort(port: number): number {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Port must be an integer between 1024 and 65535')
  }
  return port
}

function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

/** How the stdio bridge can start the GUI when Claude launches it first. */
export function currentAppLaunch(): { command: string; args: string[] } {
  if (app.isPackaged) return { command: process.execPath, args: [] }
  return { command: process.execPath, args: [app.getAppPath()] }
}

export function mcpConfigPath(): string {
  return dataFilePath(FILE)
}

/** Script Claude Desktop runs with ELECTRON_RUN_AS_NODE so stdio stays clean. */
export function mcpStdioScriptPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'mcp-stdio.js')
  return join(app.getAppPath(), 'out', 'main', 'mcp-stdio.js')
}

function sameLaunch(
  a: { command: string; args: string[] } | undefined,
  b: { command: string; args: string[] }
): boolean {
  if (!a || a.command !== b.command || a.args.length !== b.args.length) return false
  return a.args.every((arg, i) => arg === b.args[i])
}

export function loadMcpConfig(): McpServerConfig {
  const raw = readJsonFile<Partial<McpServerConfig>>(FILE, {})
  const launch = currentAppLaunch()
  const port = typeof raw.port === 'number' && Number.isInteger(raw.port) ? raw.port : MCP_DEFAULT_PORT
  const config: McpServerConfig = {
    enabled: raw.enabled === true,
    port: port >= 1024 && port <= 65535 ? port : MCP_DEFAULT_PORT,
    token: typeof raw.token === 'string' && raw.token.length >= 16 ? raw.token : randomToken(),
    exposeSecrets: raw.exposeSecrets === true,
    exposeSourceCode: raw.exposeSourceCode === true,
    launch
  }
  const tokenChanged = config.token !== raw.token
  const launchChanged = !sameLaunch(raw.launch, launch)
  const portChanged = config.port !== raw.port
  const enabledChanged = config.enabled !== raw.enabled
  const secretsChanged = config.exposeSecrets !== raw.exposeSecrets
  if (tokenChanged || launchChanged || portChanged || enabledChanged || secretsChanged || raw.token == null) {
    writeJsonFile(FILE, config)
  }
  return config
}

export function saveMcpConfig(patch: McpServerConfigPatch): McpServerConfig {
  const current = loadMcpConfig()
  const next: McpServerConfig = {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    port: patch.port !== undefined ? assertMcpPort(patch.port) : current.port,
    exposeSecrets: patch.exposeSecrets ?? current.exposeSecrets,
    exposeSourceCode: patch.exposeSourceCode ?? current.exposeSourceCode,
    launch: currentAppLaunch()
  }
  writeJsonFile(FILE, next)
  return next
}

export function regenerateMcpToken(): McpServerConfig {
  const next: McpServerConfig = {
    ...loadMcpConfig(),
    token: randomToken(),
    launch: currentAppLaunch()
  }
  writeJsonFile(FILE, next)
  return next
}
