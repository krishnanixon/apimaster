import { v4 as uuidv4 } from 'uuid'
import { confirmationMessage, decideToolPermission } from '@shared/lib/voice-tool-permissions'
import type { VoicePendingConfirmation, VoiceToolResult } from '@shared/types/voice-assistant'
import { logger } from '../../infra/logger.service'
import { voiceSettingsStore } from '../settings.store'
import { toolRegistry } from './ToolRegistry'
import { validateToolInput } from './types'

export interface ToolExecutionOutcome {
  result?: VoiceToolResult
  pending?: VoicePendingConfirmation
}

class ToolExecutor {
  private pending = new Map<
    string,
    { resolve: (ok: boolean) => void; conversationId: string; toolName: string; input: Record<string, unknown> }
  >()

  async execute(
    conversationId: string,
    name: string,
    rawInput: unknown,
    options?: { confirmed?: boolean }
  ): Promise<ToolExecutionOutcome> {
    const tool = toolRegistry.get(name)
    if (!tool) {
      return {
        result: { toolCallId: uuidv4(), name, ok: false, output: `Unknown tool: ${name}` }
      }
    }

    const validated = validateToolInput(tool.inputSchema, rawInput ?? {})
    if (!validated.ok) {
      return {
        result: { toolCallId: uuidv4(), name, ok: false, output: validated.error }
      }
    }

    const settings = voiceSettingsStore.get()
    const permission = decideToolPermission({
      riskLevel: tool.riskLevel,
      trustedWriteTools: settings.trustedWriteTools,
      toolName: tool.name
    })

    if (permission.requireConfirmation && !options?.confirmed) {
      const requestId = uuidv4()
      const pending: VoicePendingConfirmation = {
        requestId,
        conversationId,
        toolName: tool.name,
        description: tool.description,
        riskLevel: tool.riskLevel,
        input: validated.value,
        message: confirmationMessage(tool.name, tool.riskLevel)
      }
      return { pending }
    }

    if (!permission.execute && !options?.confirmed) {
      return {
        result: { toolCallId: uuidv4(), name, ok: false, output: permission.reason }
      }
    }

    try {
      const executed = await tool.execute(validated.value)
      logger.info(`Tool executed: ${tool.name}`, 'Voice')
      return {
        result: {
          toolCallId: uuidv4(),
          name,
          ok: executed.ok,
          output: executed.output
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool failed'
      logger.warn(`Tool failed: ${tool.name}`, 'Voice')
      return {
        result: { toolCallId: uuidv4(), name, ok: false, output: message }
      }
    }
  }

  waitForConfirmation(
    pending: VoicePendingConfirmation
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.pending.set(pending.requestId, {
        resolve,
        conversationId: pending.conversationId,
        toolName: pending.toolName,
        input: pending.input
      })
    })
  }

  resolveConfirmation(requestId: string, approved: boolean): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) return false
    this.pending.delete(requestId)
    entry.resolve(approved)
    return true
  }

  cancelAll(): void {
    for (const [id, entry] of this.pending) {
      entry.resolve(false)
      this.pending.delete(id)
    }
  }
}

export const toolExecutor = new ToolExecutor()
