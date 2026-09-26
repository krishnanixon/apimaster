import { isMcpToolName } from '@shared/mcp/tools'
import { useApiStudioStore } from '../../stores/apiStudioStore'
import { executeMcpTool, ToolError } from './executeTool'

function whenWorkspaceHydrated(): Promise<void> {
  if (useApiStudioStore.persist.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = useApiStudioStore.persist.onFinishHydration(() => {
      unsub()
      resolve()
    })
    if (useApiStudioStore.persist.hasHydrated()) {
      unsub()
      resolve()
    }
  })
}

/** Listen for MCP tool calls from the main process and run them on the live workspace. */
export function startMcpToolBridge(): () => void {
  const api = window.electronAPI?.mcp
  if (!api) return () => undefined

  let unsubscribe: () => void = () => undefined
  let cancelled = false

  void (async () => {
    await api.ready(false)
    await whenWorkspaceHydrated()
    if (cancelled) return
    unsubscribe = api.onInvoke((message) => {
      void (async () => {
        try {
          if (!isMcpToolName(message.tool)) {
            api.result({ id: message.id, ok: false, error: `Unknown tool: ${message.tool}` })
            return
          }
          const data = await executeMcpTool(message.tool, message.args ?? {}, message.options)
          api.result({ id: message.id, ok: true, data })
        } catch (error) {
          const text = error instanceof ToolError || error instanceof Error ? error.message : 'Tool failed'
          api.result({ id: message.id, ok: false, error: text })
        }
      })()
    })
    if (cancelled) {
      unsubscribe()
      return
    }
    await api.ready(true)
  })()

  return () => {
    cancelled = true
    unsubscribe()
    void api.ready(false)
  }
}
