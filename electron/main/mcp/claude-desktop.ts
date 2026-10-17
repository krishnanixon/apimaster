import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { MCP_SERVER_NAME, type McpLaunchSpec } from '@shared/mcp/types'

export function claudeDesktopConfigPath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  }
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return join(base, 'Claude', 'claude_desktop_config.json')
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'Claude', 'claude_desktop_config.json')
}

export function claudeDesktopHasServer(configPath = claudeDesktopConfigPath()): boolean {
  if (!existsSync(configPath)) return false
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as { mcpServers?: Record<string, unknown> }
    return Boolean(parsed?.mcpServers && typeof parsed.mcpServers === 'object' && parsed.mcpServers[MCP_SERVER_NAME])
  } catch {
    return false
  }
}

/** Merge the Shurikly entry into Claude Desktop's config without touching other servers. */
export function installClaudeDesktopServer(entry: McpLaunchSpec, configPath = claudeDesktopConfigPath()): void {
  mkdirSync(dirname(configPath), { recursive: true })
  let existing: Record<string, unknown> = {}
  if (existsSync(configPath)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(configPath, 'utf8'))
    } catch {
      throw new Error('Claude Desktop config is not valid JSON. Fix that file, then try again.')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Claude Desktop config must be a JSON object.')
    }
    existing = parsed as Record<string, unknown>
  }
  const current = existing.mcpServers
  const servers =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {}
  servers[MCP_SERVER_NAME] = {
    command: entry.command,
    args: entry.args,
    env: entry.env
  }
  existing.mcpServers = servers
  writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8')
}
