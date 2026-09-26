import { classifyCommandRisk } from './command-risk'
import type { AgentMode, AgentToolRisk } from '../types/agent'

export const AGENT_MODES: AgentMode[] = ['ask', 'edit', 'agent', 'debug', 'plan', 'review']

const READ_TOOLS = [
  'read_file',
  'search_code',
  'find_symbol',
  'find_reference',
  'find_definition',
  'git_status',
  'git_diff',
  'git_log',
  'recall_memory',
  'mcp_list_servers',
  'mcp_list_tools'
] as const

const EDIT_TOOLS = ['apply_patch', 'write_file', 'create_file', 'rename_symbol'] as const
const DEBUG_TOOLS = ['run_test', 'run_linter', 'get_diagnostics', 'run_terminal'] as const
const AGENT_EXTRA = ['delete_file', 'git_commit', 'remember_memory', 'browser_fetch', 'mcp_call'] as const

export const MODE_TOOLS: Record<AgentMode, readonly string[]> = {
  ask: READ_TOOLS,
  plan: READ_TOOLS,
  review: READ_TOOLS,
  edit: [...READ_TOOLS, ...EDIT_TOOLS],
  debug: [...READ_TOOLS, ...EDIT_TOOLS, ...DEBUG_TOOLS],
  agent: [...READ_TOOLS, ...EDIT_TOOLS, ...DEBUG_TOOLS, ...AGENT_EXTRA]
}

export function isToolAllowed(mode: AgentMode, toolName: string): boolean {
  return MODE_TOOLS[mode].includes(toolName)
}

export interface AgentPermissionDecision {
  allow: boolean
  requireConfirmation: boolean
  reason: string
}

export function decideAgentPermission(input: {
  mode: AgentMode
  toolName: string
  riskLevel: AgentToolRisk
  command?: string
}): AgentPermissionDecision {
  if (!isToolAllowed(input.mode, input.toolName)) {
    return {
      allow: false,
      requireConfirmation: false,
      reason: `Tool "${input.toolName}" is not available in ${input.mode} mode.`
    }
  }

  if (input.command) {
    const risk = classifyCommandRisk(input.command)
    if (risk.level === 'BLOCKED') {
      return { allow: false, requireConfirmation: false, reason: risk.reason }
    }
    if (risk.level === 'DANGEROUS' || risk.level === 'WARNING') {
      return {
        allow: true,
        requireConfirmation: true,
        reason: risk.reason
      }
    }
    return { allow: true, requireConfirmation: false, reason: risk.reason }
  }

  if (input.riskLevel === 'read') {
    return { allow: true, requireConfirmation: false, reason: 'Read tools run automatically.' }
  }

  if (EDIT_TOOLS.includes(input.toolName as (typeof EDIT_TOOLS)[number])) {
    return {
      allow: true,
      requireConfirmation: false,
      reason: 'File edits are staged in the Changes panel for review.'
    }
  }

  return {
    allow: true,
    requireConfirmation: true,
    reason:
      input.riskLevel === 'destructive'
        ? 'Destructive tools always require confirmation.'
        : 'Write tools require confirmation before changing files.'
  }
}
