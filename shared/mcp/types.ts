import type { McpToolName } from './tools'

export const MCP_DEFAULT_PORT = 47823
export const MCP_SERVER_NAME = 'api-studio'

/** Persisted in userData/data/mcp-server.json (also read by the stdio bridge). */
export interface McpServerConfig {
  enabled: boolean
  port: number
  token: string
  /** When false, secrets are replaced with a placeholder before reaching Claude. */
  exposeSecrets: boolean
  /** How the stdio bridge can start APIMaster when it is not running. */
  launch?: { command: string; args: string[] }
}

export interface McpServerConfigPatch {
  enabled?: boolean
  port?: number
  exposeSecrets?: boolean
}

export interface McpLaunchSpec {
  command: string
  args: string[]
  env: Record<string, string>
}

export interface McpServerStatus {
  enabled: boolean
  running: boolean
  port: number
  url: string
  token: string
  exposeSecrets: boolean
  error: string | null
  /** True once the APIMaster window has registered the tool bridge. */
  rendererReady: boolean
  claudeDesktop: {
    configPath: string
    installed: boolean
    /** Entry written under `mcpServers` in claude_desktop_config.json. */
    entry: McpLaunchSpec
  }
  claudeCode: {
    command: string
  }
}

/** main → renderer: run one tool against the live store. */
export interface McpInvokeMessage {
  id: string
  tool: McpToolName
  args: Record<string, unknown>
  options: { redactSecrets: boolean }
}

/** renderer → main: tool result. */
export interface McpInvokeResult {
  id: string
  ok: boolean
  data?: unknown
  error?: string
}
