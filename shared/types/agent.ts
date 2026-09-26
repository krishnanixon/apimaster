import type { ContextPackSummary } from './context-engine'

export type AgentMode = 'ask' | 'edit' | 'agent' | 'debug' | 'plan' | 'review'

export type AgentToolRisk = 'read' | 'write' | 'destructive'

export type AgentRunStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'done'
  | 'error'
  | 'cancelled'

export interface AgentPendingConfirmation {
  requestId: string
  runId: string
  toolName: string
  description: string
  riskLevel: AgentToolRisk
  input: Record<string, unknown>
  message: string
  diff?: string
  path?: string
}

export interface AgentPatchRecord {
  id: string
  path: string
  previous: string
  next: string
  diff: string
  appliedAt: string
  status: 'pending' | 'applied' | 'rejected'
  /** True when the file did not exist before this agent change. */
  created?: boolean
  /** True when this patch stages a file deletion. */
  deleted?: boolean
}

export interface AgentReviewFinding {
  id: string
  severity: 'critical' | 'warning' | 'info'
  category: string
  title: string
  message: string
  path?: string
  line?: number
  suggestion?: string
}

export interface AgentCheckpointRestoreResult {
  runId: string
  restored: AgentPatchRecord[]
}

export interface AgentMemoryFact {
  id: string
  projectId?: string | null
  content: string
  topic?: string
  createdAt: string
}

export interface AgentTaskRecord {
  id: string
  goal: string
  mode: AgentMode
  status: AgentRunStatus
  summary?: string
  createdAt: string
  finishedAt?: string
}

export interface AgentHistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentFileRef {
  path: string
  name: string
  kind: 'file' | 'folder'
}

export type PersistedAgentThreadItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'context'; text: string; summary?: ContextPackSummary }
  | {
      id: string
      kind: 'tool'
      name: string
      input: Record<string, unknown>
      label: string
      status: 'running' | 'ok' | 'failed'
      output?: string
    }

export interface PersistedAgentConversation {
  id: string
  title: string
  mode: AgentMode
  draft?: string
  thread: PersistedAgentThreadItem[]
  attached: AgentFileRef[]
  createdAt: string
  updatedAt: string
}

export interface AgentConversationState {
  workspaceRoot: string
  activeConversationId?: string
  conversations?: PersistedAgentConversation[]
  updatedAt: string
  /** Staged file edits that survive app restart until accept/reject. */
  pendingPatches?: AgentPatchRecord[]
  /** Run checkpoints that survive restart until restored or cleared. */
  checkpointPatches?: Record<string, string[]>
  /** Legacy single-chat fields retained so existing workspace history migrates. */
  mode?: AgentMode
  thread?: PersistedAgentThreadItem[]
  attached?: AgentFileRef[]
}

export interface AgentRunRequest {
  goal: string
  mode: AgentMode
  projectId?: string | null
  model?: string
  /** Prior user/assistant turns so follow-ups work like a chat, not a one-shot. */
  history?: AgentHistoryTurn[]
  /** Files and folders the user pinned or dropped for analysis / multi-file edits. */
  files?: AgentFileRef[]
}

export interface AgentRunSnapshot {
  runId: string
  mode: AgentMode
  goal: string
  status: AgentRunStatus
  steps: number
  summary?: string
  error?: string
}

export type AgentEvent =
  | { type: 'status'; runId: string; status: AgentRunStatus }
  | { type: 'context'; runId: string; summary: ContextPackSummary }
  | { type: 'text'; runId: string; text: string }
  | { type: 'text_delta'; runId: string; text: string }
  | { type: 'tool'; runId: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; runId: string; name: string; ok: boolean; output: string }
  | { type: 'patch'; runId: string; record: AgentPatchRecord }
  | { type: 'review_findings'; runId: string; findings: AgentReviewFinding[] }
  | { type: 'pending'; runId: string; pending: AgentPendingConfirmation }
  | { type: 'done'; runId: string; snapshot: AgentRunSnapshot }
  | { type: 'error'; runId: string; error: string }

export interface DiagnosticHit {
  file?: string
  line?: number
  column?: number
  code?: string
  message: string
  severity?: 'error' | 'warning' | 'info'
  source: 'tsc' | 'eslint' | 'vitest' | 'typescript' | 'generic'
}
