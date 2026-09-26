import type { CommandRiskResult } from '../lib/command-risk'

/** PTY-backed local terminal events */

export interface TerminalDataEvent {
  id: string
  chunk: string
  stream: 'stdout' | 'stderr'
}

export interface TerminalExitEvent {
  id: string
  code: number
  cwd: string
}

export interface TerminalResizeInput {
  id: string
  cols: number
  rows: number
}

export interface PersistedTerminalGroup {
  cwds: string[]
  activeIndex: number
}

/** Persisted terminal workspace — recent folders and open sessions */
export interface TerminalWorkspaceState {
  lastCwd: string | null
  recentFolderPaths: string[]
  terminalCwds: string[]
  activeTerminalIndex: number
  /** Split-aware layout. Legacy clients can continue using terminalCwds. */
  terminalGroups: PersistedTerminalGroup[]
  activeTerminalGroupIndex: number
}

export const DEFAULT_TERMINAL_WORKSPACE_STATE: TerminalWorkspaceState = {
  lastCwd: null,
  recentFolderPaths: [],
  terminalCwds: [],
  activeTerminalIndex: 0,
  terminalGroups: [],
  activeTerminalGroupIndex: 0
}

export const MAX_RECENT_TERMINAL_FOLDERS = 12

export interface TerminalExecRequest {
  id: string
  command: string
  cwd: string
  timeoutMs?: number
  env?: Record<string, string>
  /** Required to run DANGEROUS commands. BLOCKED commands never run. */
  acceptRisk?: boolean
}

export interface TerminalExecResult {
  id: string
  command: string
  cwd: string
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
  risk: CommandRiskResult
  cancelled: boolean
  blocked: boolean
}
