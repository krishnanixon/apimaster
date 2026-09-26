import { existsSync } from 'fs'
import { app } from 'electron'
import { MCP_SERVER_NAME, type McpLaunchSpec, type McpServerConfigPatch, type McpServerStatus } from '@shared/mcp/types'
import { logger } from '../infra/logger.service'
import { claudeDesktopConfigPath, claudeDesktopHasServer, installClaudeDesktopServer } from './claude-desktop'
import { loadMcpConfig, mcpConfigPath, mcpStdioScriptPath, regenerateMcpToken, saveMcpConfig } from './config'
import type { McpHttpServer } from './http-server'
import { startMcpHttpServer } from './http-server'
import { mcpToolBridge } from './tool-bridge'

class McpManager {
  private http: McpHttpServer | null = null
  private error: string | null = null
  private starting: Promise<void> | null = null

  async apply(): Promise<void> {
    if (this.starting) {
      await this.starting
      return this.apply()
    }
    const run = this.sync().finally(() => {
      if (this.starting === run) this.starting = null
    })
    this.starting = run
    await run
  }

  async stop(): Promise<void> {
    const http = this.http
    this.http = null
    mcpToolBridge.failAll('MCP server stopped')
    if (http) await http.close()
  }

  status(): McpServerStatus {
    const config = loadMcpConfig()
    const url = `http://127.0.0.1:${config.port}/mcp`
    return {
      enabled: config.enabled,
      running: this.http !== null && this.http.port === config.port,
      port: config.port,
      url,
      token: config.token,
      exposeSecrets: config.exposeSecrets,
      error: this.error,
      rendererReady: mcpToolBridge.isReady(),
      claudeDesktop: {
        configPath: claudeDesktopConfigPath(),
        installed: claudeDesktopHasServer(),
        entry: this.launchSpec()
      },
      claudeCode: {
        command: `claude mcp add --transport http --header "Authorization: Bearer ${config.token}" ${MCP_SERVER_NAME} ${url}`
      }
    }
  }

  update(patch: McpServerConfigPatch): McpServerStatus {
    saveMcpConfig(patch)
    return this.status()
  }

  regenerateToken(): McpServerStatus {
    regenerateMcpToken()
    return this.status()
  }

  installClaudeDesktop(): { configPath: string } {
    const script = mcpStdioScriptPath()
    if (!existsSync(script)) {
      throw new Error('The MCP bridge is not built yet. Restart APIMaster, then try again.')
    }
    const entry = this.launchSpec()
    const configPath = claudeDesktopConfigPath()
    installClaudeDesktopServer(entry, configPath)
    logger.info('Installed APIMaster in Claude Desktop MCP config', 'MCP')
    return { configPath }
  }

  private launchSpec(): McpLaunchSpec {
    return {
      command: process.execPath,
      args: [mcpStdioScriptPath()],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        APIMASTER_MCP_CONFIG: mcpConfigPath()
      }
    }
  }

  private async sync(): Promise<void> {
    const config = loadMcpConfig()
    if (!config.enabled) {
      this.error = null
      await this.stop()
      return
    }
    if (this.http && this.http.port === config.port) return
    await this.stop()
    try {
      this.http = await startMcpHttpServer({
        port: config.port,
        version: app.getVersion(),
        getToken: () => loadMcpConfig().token,
        exposeSecrets: () => loadMcpConfig().exposeSecrets,
        rendererReady: () => mcpToolBridge.isReady()
      })
      this.error = null
      logger.info(`MCP server listening on 127.0.0.1:${config.port}`, 'MCP')
    } catch (error) {
      this.http = null
      this.error = error instanceof Error ? error.message : 'Could not start the MCP server'
      logger.error(`MCP server failed: ${this.error}`, 'MCP')
    }
  }
}

export const mcpManager = new McpManager()
