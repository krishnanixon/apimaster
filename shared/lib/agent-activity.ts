export const AGENT_CHECKLIST = [
  { id: 'analyze', label: 'Analyze', tools: [] as string[] },
  { id: 'find', label: 'Find files', tools: ['search_code', 'find_symbol', 'find_reference', 'find_definition'] },
  { id: 'read', label: 'Read', tools: ['read_file'] },
  { id: 'modify', label: 'Modify', tools: ['apply_patch', 'write_file', 'create_file', 'delete_file'] },
  { id: 'test', label: 'Test', tools: ['run_test', 'run_linter', 'get_diagnostics', 'run_terminal'] },
  { id: 'verify', label: 'Verify', tools: ['git_diff', 'git_status', 'git_log'] }
] as const

export type AgentChecklistState = 'pending' | 'active' | 'done' | 'skipped'

export interface AgentChecklistItem {
  id: string
  label: string
  state: AgentChecklistState
}

export interface AgentExecutionPlanInput {
  mode: import('../types/agent').AgentMode
  toolsUsed: string[]
  currentTool?: string
  status?: import('../types/agent').AgentRunStatus
}

const TERMINAL_RUN_STATES = new Set(['done', 'error', 'cancelled'])
const SEARCH_TOOLS = ['search_code', 'find_symbol', 'find_reference', 'find_definition']
const READ_TOOLS = ['read_file', 'git_diff', 'git_status', 'git_log']
const EDIT_TOOLS = ['apply_patch', 'write_file', 'create_file', 'delete_file']
const VALIDATE_TOOLS = ['run_test', 'run_linter', 'get_diagnostics', 'run_terminal']

/** Build a visible execution plan locally, without spending a second model request. */
export function deriveExecutionPlan(input: AgentExecutionPlanInput): AgentChecklistItem[] {
  const terminal = Boolean(input.status && TERMINAL_RUN_STATES.has(input.status))
  const running = Boolean(input.status && !TERMINAL_RUN_STATES.has(input.status))
  const used = new Set(input.toolsUsed)
  const canEdit = input.mode === 'edit' || input.mode === 'debug' || input.mode === 'agent'
  const shouldValidate = input.mode === 'debug' || input.mode === 'agent'
  const definitions: Array<{ id: string; label: string; tools: readonly string[] }> = [
    { id: 'analyze', label: 'Analyze request', tools: [] as string[] },
    { id: 'find', label: 'Find relevant code', tools: SEARCH_TOOLS },
    { id: 'read', label: 'Inspect implementation', tools: READ_TOOLS },
    ...(canEdit ? [{ id: 'modify', label: 'Stage changes', tools: EDIT_TOOLS }] : []),
    ...(shouldValidate ? [{ id: 'test', label: 'Validate changes', tools: VALIDATE_TOOLS }] : []),
    { id: 'summarize', label: 'Summarize evidence', tools: [] as string[] }
  ]

  return definitions.map((step, index) => {
    if (step.id === 'analyze') {
      if (input.toolsUsed.length > 0 || terminal) return { id: step.id, label: step.label, state: 'done' }
      return { id: step.id, label: step.label, state: running ? 'active' : 'pending' }
    }
    if (step.id === 'summarize') {
      if (terminal) return { id: step.id, label: step.label, state: 'done' }
      const active = running && !input.currentTool && input.toolsUsed.length > 0
      return { id: step.id, label: step.label, state: active ? 'active' : 'pending' }
    }
    if (input.currentTool && step.tools.includes(input.currentTool)) {
      return { id: step.id, label: step.label, state: 'active' }
    }
    if (step.tools.some((name) => used.has(name))) {
      return { id: step.id, label: step.label, state: 'done' }
    }
    return {
      id: step.id,
      label: step.label,
      state: terminal ? 'skipped' : index === 1 && running && input.toolsUsed.length === 0 ? 'active' : 'pending'
    }
  })
}

export function needsValidationBeforeFinish(mode: import('../types/agent').AgentMode, toolsUsed: string[]): boolean {
  if (mode !== 'agent' && mode !== 'debug') return false
  const used = new Set(toolsUsed)
  return EDIT_TOOLS.some((name) => used.has(name)) && !VALIDATE_TOOLS.some((name) => used.has(name))
}

export function compactAgentConversationItems(
  items: Array<import('../types/agent').PersistedAgentThreadItem | { kind: 'patch'; id: string }>,
  limit = 80
): import('../types/agent').PersistedAgentThreadItem[] {
  return items
    .filter((item): item is import('../types/agent').PersistedAgentThreadItem => item.kind !== 'patch')
    .slice(-Math.max(1, limit))
    .map((item) => {
      if (item.kind !== 'tool') return item
      return {
        ...item,
        status: item.status === 'running' ? 'failed' : item.status,
        output: item.output?.slice(0, 2_000)
      }
    })
}

/** Create a stable, compact history label locally without spending a model request. */
export function agentConversationTitle(goal: string, maxLength = 48): string {
  const compact = goal.replace(/\s+/g, ' ').trim()
  if (!compact) return 'New chat'
  const limit = Math.max(8, maxLength)
  return compact.length > limit ? `${compact.slice(0, limit - 1).trimEnd()}…` : compact
}

export type AgentToolKind = 'read' | 'search' | 'edit' | 'terminal' | 'git' | 'mcp' | 'web' | 'memory' | 'generic'

const TOOL_KIND: Record<string, AgentToolKind> = {
  read_file: 'read',
  write_file: 'edit',
  create_file: 'edit',
  delete_file: 'edit',
  apply_patch: 'edit',
  search_code: 'search',
  find_symbol: 'search',
  find_reference: 'search',
  find_definition: 'search',
  run_terminal: 'terminal',
  run_test: 'terminal',
  run_linter: 'terminal',
  get_diagnostics: 'terminal',
  git_status: 'git',
  git_diff: 'git',
  git_log: 'git',
  git_commit: 'git',
  remember_memory: 'memory',
  recall_memory: 'memory',
  browser_fetch: 'web',
  mcp_list_servers: 'mcp',
  mcp_list_tools: 'mcp',
  mcp_call: 'mcp'
}

const TOOL_RUNNING: Record<string, string> = {
  read_file: 'Reading',
  write_file: 'Writing',
  create_file: 'Creating',
  delete_file: 'Deleting',
  apply_patch: 'Editing',
  search_code: 'Searching',
  find_symbol: 'Finding symbol',
  find_reference: 'Finding references',
  find_definition: 'Finding definition',
  run_terminal: 'Running',
  run_test: 'Running tests',
  run_linter: 'Linting',
  get_diagnostics: 'Checking diagnostics',
  git_status: 'Git status',
  git_diff: 'Git diff',
  git_log: 'Git log',
  git_commit: 'Committing',
  remember_memory: 'Remembering',
  recall_memory: 'Recalling',
  browser_fetch: 'Fetching',
  mcp_list_servers: 'Listing MCP servers',
  mcp_list_tools: 'Listing MCP tools',
  mcp_call: 'Calling MCP'
}

const TOOL_DONE: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Wrote',
  create_file: 'Created',
  delete_file: 'Deleted',
  apply_patch: 'Edited',
  search_code: 'Searched',
  find_symbol: 'Found symbol',
  find_reference: 'Found references',
  find_definition: 'Found definition',
  run_terminal: 'Ran',
  run_test: 'Ran tests',
  run_linter: 'Linted',
  get_diagnostics: 'Checked diagnostics',
  git_status: 'Git status',
  git_diff: 'Git diff',
  git_log: 'Git log',
  git_commit: 'Committed',
  remember_memory: 'Remembered',
  recall_memory: 'Recalled',
  browser_fetch: 'Fetched',
  mcp_list_servers: 'Listed MCP servers',
  mcp_list_tools: 'Listed MCP tools',
  mcp_call: 'Called MCP'
}

function humanizeToolName(name: string): string {
  return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}

export function classifyTool(name: string): AgentToolKind {
  if (TOOL_KIND[name]) return TOOL_KIND[name]
  if (name.startsWith('mcp_') || name.includes('mcp')) return 'mcp'
  if (name.startsWith('git_')) return 'git'
  if (name.startsWith('browser_') || name.startsWith('http')) return 'web'
  return 'generic'
}

function toolTarget(input: Record<string, unknown> = {}): string {
  const keys = ['path', 'query', 'command', 'symbol', 'name', 'url', 'serverId', 'message'] as const
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) {
      const compact = value.replace(/\s+/g, ' ').trim()
      return compact.length > 72 ? `${compact.slice(0, 69)}…` : compact
    }
  }
  return ''
}

export function formatToolActivity(name: string, input: Record<string, unknown> = {}): string {
  const verb = TOOL_RUNNING[name] ?? humanizeToolName(name)
  const target = toolTarget(input)
  return target ? `${verb} ${target}` : verb
}

export function formatToolDone(
  name: string,
  input: Record<string, unknown> = {},
  ok = true
): string {
  const verb = TOOL_DONE[name] ?? humanizeToolName(name)
  const target = toolTarget(input)
  const label = target ? `${verb} ${target}` : verb
  return ok ? label : `${label} failed`
}

export function deriveChecklist(toolsUsed: string[], running?: boolean, currentTool?: string): AgentChecklistItem[] {
  const used = new Set(toolsUsed)
  let foundActive = false
  return AGENT_CHECKLIST.map((step, index) => {
    const stepTools: readonly string[] = step.tools
    const matched = stepTools.some((tool) => used.has(tool))
    const isCurrent = currentTool ? stepTools.includes(currentTool) : false
    if (index === 0) {
      if (toolsUsed.length === 0 && running) return { id: step.id, label: step.label, state: 'active' }
      return { id: step.id, label: step.label, state: 'done' }
    }
    if (isCurrent && running) {
      foundActive = true
      return { id: step.id, label: step.label, state: 'active' }
    }
    if (matched) return { id: step.id, label: step.label, state: 'done' }
    if (!foundActive && running && !matched && toolsUsed.length > 0) {
      const previousDone = AGENT_CHECKLIST.slice(1, index).every(
        (prev) => prev.tools.length === 0 || prev.tools.some((tool) => used.has(tool))
      )
      if (previousDone && index === firstPendingIndex(used)) {
        foundActive = true
        return { id: step.id, label: step.label, state: 'active' }
      }
    }
    return { id: step.id, label: step.label, state: 'pending' }
  })
}

function firstPendingIndex(used: Set<string>): number {
  const index = AGENT_CHECKLIST.findIndex(
    (step, i) => i > 0 && !step.tools.some((tool) => used.has(tool))
  )
  return index === -1 ? AGENT_CHECKLIST.length - 1 : index
}
