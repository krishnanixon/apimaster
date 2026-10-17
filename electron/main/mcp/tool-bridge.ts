import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { McpInvokeMessage, McpInvokeResult } from '@shared/mcp/types'
import type { McpToolName } from '@shared/mcp/tools'

const DEFAULT_TIMEOUT_MS = 30_000
const SEND_TIMEOUT_MS = 10 * 60_000
const RUN_TIMEOUT_MS = 15 * 60_000

function timeoutFor(tool: McpToolName): number {
  if (tool === 'run_collection') return RUN_TIMEOUT_MS
  if (tool === 'send_request') return SEND_TIMEOUT_MS
  return DEFAULT_TIMEOUT_MS
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface Pending {
  resolve: (result: McpInvokeResult) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Forwards an MCP tool call to the renderer, which runs it against the live
 * workspace store so edits show up in the open window.
 */
export class McpToolBridge {
  private getWindow: (() => BrowserWindow | null) | null = null
  private rendererReady = false
  private readonly pending = new Map<string, Pending>()

  attach(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow
  }

  setReady(ready: boolean): void {
    this.rendererReady = ready
  }

  isReady(): boolean {
    const win = this.window()
    return Boolean(win && this.rendererReady)
  }

  complete(result: McpInvokeResult): void {
    const pending = this.pending.get(result.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(result.id)
    pending.resolve(result)
  }

  failAll(message: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve({ id, ok: false, error: message })
    }
    this.pending.clear()
  }

  async invoke(
    tool: McpToolName,
    args: Record<string, unknown>,
    options: McpInvokeMessage['options']
  ): Promise<McpInvokeResult> {
    const id = randomUUID()
    try {
      const win = await this.waitForWindow(20_000)
      return await new Promise<McpInvokeResult>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          resolve({ id, ok: false, error: 'Shurikly took too long to answer. Try again with the window open.' })
        }, timeoutFor(tool))
        this.pending.set(id, { resolve, timer })
        if (win.isDestroyed() || win.webContents.isDestroyed()) {
          clearTimeout(timer)
          this.pending.delete(id)
          resolve({ id, ok: false, error: 'Shurikly window is not open.' })
          return
        }
        win.webContents.send(IPC_CHANNELS.MCP_INVOKE, { id, tool, args, options })
      })
    } catch (error) {
      return { id, ok: false, error: error instanceof Error ? error.message : 'Shurikly is not ready.' }
    }
  }

  private window(): BrowserWindow | null {
    const win = this.getWindow?.() ?? null
    if (!win || win.isDestroyed()) return null
    return win
  }

  private async waitForWindow(timeoutMs: number): Promise<BrowserWindow> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const win = this.window()
      if (win && this.rendererReady && !win.webContents.isDestroyed()) return win
      await delay(100)
    }
    throw new Error('Shurikly is not ready. Open the app window and try again.')
  }
}

export const mcpToolBridge = new McpToolBridge()
