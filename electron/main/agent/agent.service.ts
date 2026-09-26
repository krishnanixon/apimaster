import { randomUUID } from 'crypto'
import type { AIChatMessage, AIGenerateOptions } from '../ai/types'
import { aiRouter } from '../ai'
import { aiConfigService } from '../ai/config/ai-config.service'
import { contextEngine, estimateTokens } from '../context-engine/context-engine.service'
import { settingsRepository } from '../repositories/settings.repository'
import { logger } from '../infra/logger.service'
import { ASSISTANT_NAME, PRODUCT_NAME } from '@shared/constants/product'
import { parseVoiceModelOutput } from '@shared/lib/voice-model-output'
import { MODE_TOOLS, decideAgentPermission } from '@shared/lib/agent-permissions'
import { agentRequestType, agentTemperature } from '@shared/lib/agent-routing'
import { confirmationMessage } from '@shared/lib/voice-tool-permissions'
import type {
  AgentEvent,
  AgentMode,
  AgentPendingConfirmation,
  AgentReviewFinding,
  AgentRunRequest,
  AgentRunSnapshot,
  AgentTaskRecord
} from '@shared/types/agent'
import { agentToolRegistry, validateToolInput } from './registry'
import { registerAgentTools } from './register-tools'
import { agentMemory } from './memory.service'
import {
  beginPatchCheckpoint,
  commitAllPending,
  commitPatch,
  acceptHunk,
  rejectHunk,
  lastPatches,
  pendingPatchCount,
  restorePatchCheckpoint,
  revertLastPatch,
  revertPatchById,
  trackCheckpointPatch
} from './patch-engine'
import { previewStreamingAgentOutput } from '@shared/lib/agent-stream'
import { needsValidationBeforeFinish } from '@shared/lib/agent-activity'

const MAX_STEPS = 10
const MAX_STEPS_MULTI = 20

type EventSink = (event: AgentEvent) => void

class AgentService {
  private controllers = new Map<string, AbortController>()
  private pausedRuns = new Set<string>()
  private resumeResolvers = new Map<string, () => void>()
  private activeProjectId: string | null = null
  private pending = new Map<
    string,
    {
      resolve: (approved: boolean) => void
      runId: string
    }
  >()
  private sink: EventSink = () => undefined

  currentProjectId(): string | null {
    return this.activeProjectId
  }

  setSink(sink: EventSink): void {
    this.sink = sink
  }

  async start(request: AgentRunRequest): Promise<AgentRunSnapshot> {
    registerAgentTools()
    const runId = randomUUID()
    const snapshot: AgentRunSnapshot = {
      runId,
      mode: request.mode,
      goal: request.goal.trim(),
      status: 'planning',
      steps: 0
    }
    if (!snapshot.goal) {
      snapshot.status = 'error'
      snapshot.error = 'Goal is required'
      return snapshot
    }
    const controller = new AbortController()
    this.controllers.set(runId, controller)
    const task: AgentTaskRecord = {
      id: runId,
      goal: snapshot.goal,
      mode: request.mode,
      status: 'planning',
      createdAt: new Date().toISOString()
    }
    agentMemory.saveTask(task)
    agentMemory.setActiveProjectId(request.projectId ?? null)
    this.activeProjectId = request.projectId ?? null
    beginPatchCheckpoint(runId)
    this.emit({ type: 'status', runId, status: 'planning' })
    void this.runLoop(request, snapshot, controller.signal).catch((error) => {
      const message = error instanceof Error ? error.message : 'Agent failed'
      logger.warn(message, 'Agent')
      snapshot.status = 'error'
      snapshot.error = message
      this.emit({ type: 'error', runId, error: message })
      this.finish(snapshot, task)
    })
    return snapshot
  }

  cancel(runId: string): void {
    this.pausedRuns.delete(runId)
    this.resumeResolvers.get(runId)?.()
    this.resumeResolvers.delete(runId)
    this.controllers.get(runId)?.abort()
    for (const [id, pending] of this.pending) {
      if (pending.runId === runId) {
        pending.resolve(false)
        this.pending.delete(id)
      }
    }
  }

  pause(runId: string): boolean {
    if (!this.controllers.has(runId)) return false
    this.pausedRuns.add(runId)
    this.emit({ type: 'status', runId, status: 'paused' })
    return true
  }

  resume(runId: string): boolean {
    if (!this.pausedRuns.has(runId)) return false
    this.pausedRuns.delete(runId)
    this.resumeResolvers.get(runId)?.()
    this.resumeResolvers.delete(runId)
    this.emit({ type: 'status', runId, status: 'running' })
    return true
  }

  confirm(requestId: string, approved: boolean): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    this.pending.delete(requestId)
    pending.resolve(approved)
    return true
  }

  async revertLast() {
    return revertLastPatch()
  }

  async revertPatch(id: string) {
    return revertPatchById(id)
  }

  async acceptPatch(id: string) {
    return commitPatch(id)
  }

  async acceptHunk(id: string, hunkIndex: number) {
    return acceptHunk(id, hunkIndex)
  }

  async rejectHunk(id: string, hunkIndex: number) {
    return rejectHunk(id, hunkIndex)
  }

  async acceptAllPatches() {
    return commitAllPending()
  }

  async restoreCheckpoint(runId: string) {
    return { runId, restored: await restorePatchCheckpoint(runId) }
  }

  patches() {
    return lastPatches()
  }

  memory(query: string) {
    return agentMemory.recall(query)
  }

  tasks() {
    return agentMemory.listTasks()
  }

  private emit(event: AgentEvent): void {
    this.sink(event)
  }

  private finish(snapshot: AgentRunSnapshot, task: AgentTaskRecord): void {
    this.controllers.delete(snapshot.runId)
    task.status = snapshot.status
    task.summary = snapshot.summary
    task.finishedAt = new Date().toISOString()
    agentMemory.saveTask(task)
    this.emit({ type: 'done', runId: snapshot.runId, snapshot })
  }

  private async runLoop(
    request: AgentRunRequest,
    snapshot: AgentRunSnapshot,
    signal: AbortSignal
  ): Promise<void> {
    const settings = await settingsRepository.get()
    const config = aiConfigService.get()
    const active = aiRouter.resolveActive(config)
    const model = request.model || active.model || config.openai.model || settings.aiModel
    const allowed = MODE_TOOLS[request.mode]
    const historyTokens = estimateTokens((request.history ?? []).map((turn) => turn.content).join('\n'))
    const pack = await contextEngine.resolve({
      query: request.goal,
      projectId: request.projectId ?? null,
      model,
      files: request.files,
      conversationTokens: estimateTokens(request.goal) + historyTokens,
      systemTokens: 800
    })
    const attachedNote =
      request.files && request.files.length > 0
        ? `Pinned files/folders:\n${request.files.map((file) => `- ${file.kind} ${file.path}`).join('\n')}`
        : ''
    const system = buildSystemPrompt(request.mode, allowed, [pack.formatted, attachedNote].filter(Boolean).join('\n\n'))
    const messages: AIChatMessage[] = [{ role: 'system', content: system }]
    for (const turn of (request.history ?? []).slice(-12)) {
      if (!turn.content.trim()) continue
      messages.push({ role: turn.role, content: turn.content })
    }
    messages.push({ role: 'user', content: request.goal })
    this.emit({ type: 'context', runId: snapshot.runId, summary: pack.summary })
    snapshot.status = 'running'
    this.emit({ type: 'status', runId: snapshot.runId, status: 'running' })

    const task: AgentTaskRecord = {
      id: snapshot.runId,
      goal: snapshot.goal,
      mode: request.mode,
      status: 'running',
      createdAt: new Date().toISOString()
    }
    const toolsUsed: string[] = []

    const stepLimit = Math.min(
      MAX_STEPS_MULTI,
      MAX_STEPS + Math.max(0, (request.files?.length ?? 0) * 2)
    )
    for (let step = 0; step < stepLimit; step++) {
      await this.waitIfPaused(snapshot.runId, signal)
      if (signal.aborted) {
        snapshot.status = 'cancelled'
        snapshot.summary = 'Cancelled'
        this.finish(snapshot, task)
        return
      }
      snapshot.steps = step + 1
      const { raw, streamedText } = await this.streamStep(snapshot.runId, messages, {
        model,
        temperature: agentTemperature(request.mode),
        maxTokens: 4096,
        signal,
        requestType: agentRequestType(request.mode),
        meta: { projectId: request.projectId, feature: `agent:${request.mode}` }
      })
      const parsed = parseVoiceModelOutput(raw)
      if (!parsed.toolName) {
        if (needsValidationBeforeFinish(request.mode, toolsUsed)) {
          messages.push({
            role: 'assistant',
            content: JSON.stringify({ type: 'response', text: parsed.text || raw })
          })
          messages.push({
            role: 'user',
            content: 'You changed files but have not validated them. Run the smallest relevant test, typecheck, linter, diagnostics, or build command before giving the final answer.'
          })
          continue
        }
        snapshot.status = 'done'
        snapshot.summary = parsed.text || raw
        if (!streamedText) {
          this.emit({ type: 'text', runId: snapshot.runId, text: snapshot.summary })
        }
        const findings = normalizeReviewFindings(parsed.findings)
        if (findings.length > 0) {
          this.emit({ type: 'review_findings', runId: snapshot.runId, findings })
        }
        this.finish(snapshot, task)
        return
      }

      this.emit({ type: 'tool', runId: snapshot.runId, name: parsed.toolName, input: parsed.toolInput ?? {} })
      const beforePatchKeys = new Set(lastPatches(100).map((item) => `${item.id}:${item.appliedAt}:${item.status}`))
      const executed = await this.executeTool(snapshot.runId, request.mode, parsed.toolName, parsed.toolInput ?? {}, signal)
      const validationAttempt = ['run_test', 'run_linter', 'get_diagnostics', 'run_terminal'].includes(parsed.toolName)
      if ((executed.ok || validationAttempt) && !toolsUsed.includes(parsed.toolName)) {
        toolsUsed.push(parsed.toolName)
      }
      this.emit({
        type: 'tool_result',
        runId: snapshot.runId,
        name: parsed.toolName,
        ok: executed.ok,
        output: executed.output
      })
      if (executed.ok && isPatchTool(parsed.toolName)) {
        for (const record of lastPatches(40)) {
          const key = `${record.id}:${record.appliedAt}:${record.status}`
          if (beforePatchKeys.has(key)) continue
          trackCheckpointPatch(snapshot.runId, record.id)
          this.emit({ type: 'patch', runId: snapshot.runId, record })
        }
      }
      messages.push({
        role: 'assistant',
        content: JSON.stringify({ type: 'tool_call', name: parsed.toolName, input: parsed.toolInput ?? {} })
      })
      messages.push({
        role: 'user',
        content: `Tool result (${parsed.toolName}, ok=${executed.ok}):\n${executed.output}`
      })
    }

    snapshot.status = 'done'
    snapshot.summary = 'Reached the iteration limit. Review the tool trace and continue if needed.'
    this.emit({ type: 'text', runId: snapshot.runId, text: snapshot.summary })
    this.finish(snapshot, task)
  }

  private async streamStep(
    runId: string,
    messages: AIChatMessage[],
    options: AIGenerateOptions
  ): Promise<{ raw: string; streamedText: boolean }> {
    let raw = ''
    let lastVisible = ''
    let streamedText = false
    for await (const chunk of aiRouter.streamChat(messages, options)) {
      raw += chunk
      const preview = previewStreamingAgentOutput(raw)
      if (preview.mode === 'text' && preview.visible.length > lastVisible.length) {
        const delta = preview.visible.slice(lastVisible.length)
        lastVisible = preview.visible
        streamedText = true
        this.emit({ type: 'text_delta', runId, text: delta })
      }
    }
    return { raw, streamedText }
  }

  private async executeTool(
    runId: string,
    mode: AgentMode,
    name: string,
    rawInput: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<{ ok: boolean; output: string }> {
    const tool = agentToolRegistry.get(name)
    if (!tool) return { ok: false, output: `Unknown tool: ${name}` }
    const validated = validateToolInput(tool.inputSchema, rawInput)
    if (!validated.ok) return { ok: false, output: validated.error }

    const command = typeof validated.value.command === 'string' ? validated.value.command : undefined
    const permission = decideAgentPermission({
      mode,
      toolName: tool.name,
      riskLevel: tool.riskLevel,
      command
    })
    if (!permission.allow) return { ok: false, output: permission.reason }

    if (['run_test', 'run_linter', 'run_terminal', 'git_commit'].includes(tool.name)) {
      const pendingCount = pendingPatchCount()
      if (pendingCount > 0) {
        const requestId = randomUUID()
        const flushConfirm: AgentPendingConfirmation = {
          requestId,
          runId,
          toolName: tool.name,
          description: `Apply ${pendingCount} staged file change${pendingCount === 1 ? '' : 's'} to disk before ${tool.name}`,
          riskLevel: 'write',
          input: validated.value,
          message: `${pendingCount} staged change${pendingCount === 1 ? '' : 's'} must be written to disk so ${tool.name} can see them. Approve to apply those Changes, or reject to cancel this tool.`
        }
        const approved = await this.waitForConfirm(flushConfirm, signal)
        if (!approved) return { ok: false, output: 'User rejected applying staged changes before this tool.' }
        const flushed = await commitAllPending()
        for (const record of flushed) {
          this.emit({ type: 'patch', runId, record })
        }
        this.emit({
          type: 'text',
          runId,
          text: `Applied ${flushed.length} staged change${flushed.length === 1 ? '' : 's'} to disk before ${tool.name}.`
        })
      }
    }

    if (permission.requireConfirmation) {
      const requestId = randomUUID()
      const pending: AgentPendingConfirmation = {
        requestId,
        runId,
        toolName: tool.name,
        description: tool.description,
        riskLevel: tool.riskLevel,
        input: validated.value,
        message: permission.reason || confirmationMessage(tool.name, tool.riskLevel),
        diff: typeof validated.value.diff === 'string' ? validated.value.diff : undefined,
        path: typeof validated.value.path === 'string' ? validated.value.path : undefined
      }
      const approved = await this.waitForConfirm(pending, signal)
      if (!approved) return { ok: false, output: 'User rejected this tool call.' }
    }

    try {
      return await tool.execute(validated.value)
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Tool failed' }
    }
  }

  private async waitIfPaused(runId: string, signal: AbortSignal): Promise<void> {
    while (this.pausedRuns.has(runId) && !signal.aborted) {
      await new Promise<void>((resolve) => {
        this.resumeResolvers.set(runId, resolve)
        const onAbort = () => {
          this.resumeResolvers.delete(runId)
          resolve()
        }
        signal.addEventListener('abort', onAbort, { once: true })
      })
    }
  }

  private waitForConfirm(pending: AgentPendingConfirmation, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const onAbort = () => {
        this.pending.delete(pending.requestId)
        resolve(false)
      }
      if (signal.aborted) {
        resolve(false)
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.pending.set(pending.requestId, {
        runId: pending.runId,
        resolve: (approved) => {
          signal.removeEventListener('abort', onAbort)
          resolve(approved)
        }
      })
      this.emit({ type: 'status', runId: pending.runId, status: 'waiting' })
      this.emit({ type: 'pending', runId: pending.runId, pending })
    })
  }
}

function isPatchTool(name: string): boolean {
  return (
    name === 'apply_patch' ||
    name === 'write_file' ||
    name === 'create_file' ||
    name === 'delete_file' ||
    name === 'rename_symbol'
  )
}

function normalizeReviewFindings(raw: Array<Record<string, unknown>> | undefined): AgentReviewFinding[] {
  if (!raw?.length) return []
  const severities = new Set(['critical', 'warning', 'info'])
  return raw
    .slice(0, 50)
    .map((item, index) => {
      const severityRaw = typeof item.severity === 'string' ? item.severity.toLowerCase() : 'info'
      const severity = (severities.has(severityRaw) ? severityRaw : 'info') as AgentReviewFinding['severity']
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const message = typeof item.message === 'string' ? item.message.trim() : title
      if (!title && !message) return null
      return {
        id: `finding-${index + 1}`,
        severity,
        category: typeof item.category === 'string' ? item.category : 'general',
        title: title || message.slice(0, 80),
        message: message || title,
        path: typeof item.path === 'string' ? item.path : undefined,
        line: typeof item.line === 'number' ? item.line : undefined,
        suggestion: typeof item.suggestion === 'string' ? item.suggestion : undefined
      } satisfies AgentReviewFinding
    })
    .filter((item): item is AgentReviewFinding => Boolean(item))
}

function buildSystemPrompt(mode: AgentMode, allowed: readonly string[], contextPack: string): string {
  const tools = agentToolRegistry.descriptions(allowed)
  const modeRules: Record<AgentMode, string> = {
    ask: 'Read-only. Do not modify files or run shell commands.',
    plan: 'Read-only architecture analysis. Produce a plan, not edits.',
    review: `Review the git diff and workspace context. Do not edit.
When finished, respond with JSON:
{"type":"response","text":"summary","findings":[{"severity":"critical|warning|info","category":"bug|security|style|perf|api","title":"...","message":"...","path":"optional","line":1,"suggestion":"..."}]}
Include concrete file/line findings whenever possible.`,
    edit: 'Edit the attached and current files with apply_patch. You may change multiple files — one patch per file. Use rename_symbol for renames.',
    debug: 'Read diagnostics, search, patch multiple files if needed, then retest until green or you cannot fix it.',
    agent: 'Full workspace agent. Search, edit multiple files, test, and git as needed. Prefer the pinned files as scope. Never send the whole repository. delete_file stages deletion for Changes review.'
  }
  return [
    `You are ${ASSISTANT_NAME}, the ${PRODUCT_NAME} coding agent.`,
    `Mode: ${mode}. ${modeRules[mode]}`,
    'You can use any listed coding tool: files, search, patches, terminal, tests, git, memory, browser fetch, and MCP.',
    'You may edit multiple files. Call apply_patch once per file. Do not dump the repository.',
    'Edits (including deletes) are staged for the user in the Changes panel. They are not written until accepted, unless you run tests or a terminal command.',
    'Pick the smallest tool that answers the request. Prefer apply_patch over rewriting whole files.',
    'In Agent or Debug mode, after changing files you must run the smallest relevant validation before finishing.',
    'Respond with a single JSON object only:',
    '{"type":"tool_call","name":"tool_name","input":{...}}',
    'or {"type":"response","text":"final answer"}',
    'Available tools:',
    tools,
    contextPack ? `Workspace context:\n${contextPack}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const agentService = new AgentService()
