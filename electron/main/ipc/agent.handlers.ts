import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { AgentRunRequest } from '@shared/types/agent'
import { agentService } from '../agent/agent.service'
import { registerAgentTools } from '../agent/register-tools'
import { broadcastToWorkbench } from '../windows/window-manager'
import { logger } from '../infra/logger.service'
import { ipcSchemas, schema, validatedHandle } from './runtime-schema'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'AgentIPC')
  return { success: false, error }
}

export function registerAgentHandlers(): void {
  registerAgentTools()
  agentService.setSink((event) => broadcastToWorkbench(IPC_CHANNELS.AGENT_EVENT, event))

  validatedHandle(IPC_CHANNELS.AGENT_RUN, [schema.object({
    goal: schema.string({ min: 1, max: 100_000 }),
    mode: schema.literal('ask', 'edit', 'agent', 'debug', 'plan', 'review'),
    projectId: schema.optional(schema.nullable(ipcSchemas.id)),
    model: schema.optional(schema.string({ min: 1, max: 256 })),
    history: schema.optional(schema.array(schema.object({
      role: schema.literal('user', 'assistant'),
      content: schema.string({ max: 200_000 })
    }), { max: 200 })),
    files: schema.optional(schema.array(schema.object({
      path: ipcSchemas.path,
      name: schema.string({ min: 1, max: 1_024 }),
      kind: schema.literal('file', 'folder')
    }), { max: 1_000 }))
  }) as import('./runtime-schema').RuntimeSchema<AgentRunRequest>] as const, async (_e, request) => {
    try {
      return success(await agentService.start(request))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to start agent')
    }
  }, 'AgentIPC')

  validatedHandle(IPC_CHANNELS.AGENT_CANCEL, [ipcSchemas.id] as const, async (_e, runId) => {
    agentService.cancel(runId)
    return success()
  }, 'AgentIPC')

  validatedHandle(IPC_CHANNELS.AGENT_PAUSE, [ipcSchemas.id] as const, async (_e, runId) => {
    const ok = agentService.pause(runId)
    return ok ? success() : failure('No running agent to pause')
  }, 'AgentIPC')

  validatedHandle(IPC_CHANNELS.AGENT_RESUME, [ipcSchemas.id] as const, async (_e, runId) => {
    const ok = agentService.resume(runId)
    return ok ? success() : failure('Agent is not paused')
  }, 'AgentIPC')

  validatedHandle(IPC_CHANNELS.AGENT_CONFIRM, [ipcSchemas.id, schema.boolean()] as const, async (_e, requestId, approved) => {
    const ok = agentService.confirm(requestId, approved)
    return ok ? success() : failure('No pending confirmation')
  }, 'AgentIPC')

  ipcMain.handle(IPC_CHANNELS.AGENT_REVERT, async () => {
    try {
      const record = await agentService.revertLast()
      return success(record)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to revert patch')
    }
  })

  validatedHandle(IPC_CHANNELS.AGENT_REVERT_ID, [ipcSchemas.id] as const, async (_e, id) => {
    try {
      const record = await agentService.revertPatch(id)
      return success(record)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to revert patch')
    }
  }, 'AgentIPC')

  validatedHandle(IPC_CHANNELS.AGENT_ACCEPT_PATCH, [ipcSchemas.id] as const, async (_e, id) => {
    try {
      const record = await agentService.acceptPatch(id)
      return success(record)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to accept patch')
    }
  }, 'AgentIPC')

  validatedHandle(
    IPC_CHANNELS.AGENT_ACCEPT_HUNK,
    [ipcSchemas.id, schema.number({ integer: true, min: 0, max: 10_000 })] as const,
    async (_e, id, hunkIndex) => {
      try {
        return success(await agentService.acceptHunk(id, hunkIndex))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to accept hunk')
      }
    },
    'AgentIPC'
  )

  validatedHandle(
    IPC_CHANNELS.AGENT_REJECT_HUNK,
    [ipcSchemas.id, schema.number({ integer: true, min: 0, max: 10_000 })] as const,
    async (_e, id, hunkIndex) => {
      try {
        return success(await agentService.rejectHunk(id, hunkIndex))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to reject hunk')
      }
    },
    'AgentIPC'
  )

  ipcMain.handle(IPC_CHANNELS.AGENT_ACCEPT_ALL, async () => {
    try {
      return success(await agentService.acceptAllPatches())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to accept patches')
    }
  })

  validatedHandle(IPC_CHANNELS.AGENT_RESTORE_CHECKPOINT, [ipcSchemas.id] as const, async (_e, runId) => {
    try {
      return success(await agentService.restoreCheckpoint(runId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to restore checkpoint')
    }
  }, 'AgentIPC')

  ipcMain.handle(IPC_CHANNELS.AGENT_PATCHES, async () => success(agentService.patches()))

  ipcMain.handle(IPC_CHANNELS.AGENT_TASKS, async () => success(agentService.tasks()))

  validatedHandle(IPC_CHANNELS.AGENT_MEMORY, [ipcSchemas.shortText] as const, async (_e, query) => success(agentService.memory(query)), 'AgentIPC')

  ipcMain.handle(IPC_CHANNELS.AGENT_MCP_STATUS, async () => {
    try {
      const { listMcpServers, mcpListTools } = await import('../agent/mcp-client')
      const servers = listMcpServers()
      const rows = await Promise.all(
        servers.map(async (server) => {
          try {
            const tools = await mcpListTools(server.id)
            return {
              id: server.id,
              command: `${server.command} ${(server.args ?? []).join(' ')}`.trim(),
              ok: true,
              detail: tools.slice(0, 240)
            }
          } catch (error) {
            return {
              id: server.id,
              command: `${server.command} ${(server.args ?? []).join(' ')}`.trim(),
              ok: false,
              detail: error instanceof Error ? error.message : 'Unreachable'
            }
          }
        })
      )
      return success(rows)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to probe MCP servers')
    }
  })
}
