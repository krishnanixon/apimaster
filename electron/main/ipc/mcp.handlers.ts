import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { McpInvokeResult, McpServerConfigPatch } from '@shared/mcp/types'
import { logger } from '../infra/logger.service'
import { assertMcpPort } from '../mcp/config'
import { mcpManager } from '../mcp/mcp-manager'
import { mcpToolBridge } from '../mcp/tool-bridge'

function success<T>(data?: T): { success: true; data?: T } {
  return { success: true, data }
}

function failure(error: string): { success: false; error: string } {
  logger.error(error, 'MCP')
  return { success: false, error }
}

export function registerMcpHandlers(getMainWindow: () => BrowserWindow | null): void {
  mcpToolBridge.attach(getMainWindow)

  ipcMain.handle(IPC_CHANNELS.MCP_GET_STATUS, () => success(mcpManager.status()))

  ipcMain.handle(IPC_CHANNELS.MCP_UPDATE_CONFIG, async (_e, patch: McpServerConfigPatch) => {
    try {
      if (!patch || typeof patch !== 'object') return failure('Invalid MCP settings')
      if (patch.port !== undefined) assertMcpPort(patch.port)
      if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') return failure('Invalid MCP settings')
      if (patch.exposeSecrets !== undefined && typeof patch.exposeSecrets !== 'boolean') {
        return failure('Invalid MCP settings')
      }
      mcpManager.update(patch)
      await mcpManager.apply()
      return success(mcpManager.status())
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Could not update MCP settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MCP_REGENERATE_TOKEN, async () => {
    try {
      mcpManager.regenerateToken()
      return success(mcpManager.status())
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Could not regenerate the MCP token')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MCP_INSTALL_CLAUDE, () => {
    try {
      return success(mcpManager.installClaudeDesktop())
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Could not update Claude Desktop')
    }
  })

  ipcMain.handle(IPC_CHANNELS.MCP_READY, (_e, ready?: boolean) => {
    mcpToolBridge.setReady(ready !== false)
    return success()
  })

  ipcMain.on(IPC_CHANNELS.MCP_RESULT, (_e, result: McpInvokeResult) => {
    if (!result || typeof result.id !== 'string') return
    mcpToolBridge.complete(result)
  })
}
