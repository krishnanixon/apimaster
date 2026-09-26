export type DebugSessionState = 'idle' | 'launching' | 'running' | 'paused' | 'stopped'

export interface DebugBreakpoint {
  path: string
  line: number
  enabled: boolean
}

export interface DebugStackFrame {
  id: number
  functionName: string
  path?: string
  line?: number
  column?: number
}

export interface DebugVariable {
  name: string
  value: string
  type?: string
}

export interface DebugScope {
  name: string
  variables: DebugVariable[]
}

export interface DebugConsoleLine {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug' | 'system'
  text: string
}

export interface DebugLaunchInput {
  scriptPath: string
  args?: string[]
}

export interface DebugSnapshot {
  state: DebugSessionState
  scriptPath: string | null
  reason?: string
  frames: DebugStackFrame[]
  scopes: DebugScope[]
  console: DebugConsoleLine[]
  error?: string
}

export type DebugEvent =
  | { type: 'state'; snapshot: DebugSnapshot }
  | { type: 'console'; line: DebugConsoleLine }
  | { type: 'paused'; snapshot: DebugSnapshot }
  | { type: 'stopped'; snapshot: DebugSnapshot }
