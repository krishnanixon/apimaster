import { spawn, type ChildProcess } from 'child_process'
import { parseInspectorWebSocketUrl, pathToBreakpointRegex } from '@shared/lib/debug-protocol'
import type {
  DebugBreakpoint,
  DebugConsoleLine,
  DebugEvent,
  DebugLaunchInput,
  DebugScope,
  DebugSnapshot,
  DebugStackFrame,
  DebugVariable
} from '@shared/types/debug'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { workspaceSession } from '../security/workspace-session'
import { logger } from '../infra/logger.service'
import { broadcastToWorkbench } from '../windows/window-manager'

interface CdpResponse {
  id?: number
  method?: string
  result?: Record<string, unknown>
  params?: Record<string, unknown>
  error?: { message: string }
}

class CdpClient {
  private socket: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>()
  onEvent: ((method: string, params: Record<string, unknown>) => void) | null = null

  async connect(url: string): Promise<void> {
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not available in this Electron runtime')
    }
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      socket.onopen = () => resolve()
      socket.onerror = () => reject(new Error('Failed to connect to the Node inspector'))
      socket.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data)
        let message: CdpResponse
        try {
          message = JSON.parse(raw) as CdpResponse
        } catch {
          return
        }
        if (message.id != null) {
          const waiter = this.pending.get(message.id)
          if (!waiter) return
          this.pending.delete(message.id)
          if (message.error) waiter.reject(new Error(message.error.message))
          else waiter.resolve(message.result ?? {})
          return
        }
        if (message.method) this.onEvent?.(message.method, message.params ?? {})
      }
      socket.onclose = () => {
        for (const waiter of this.pending.values()) waiter.reject(new Error('Inspector connection closed'))
        this.pending.clear()
      }
    })
  }

  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Inspector is not connected'))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket?.send(JSON.stringify({ id, method, params }))
    })
  }

  close(): void {
    this.socket?.close()
    this.socket = null
    this.pending.clear()
  }
}

class NodeDebuggerService {
  private child: ChildProcess | null = null
  private client: CdpClient | null = null
  private scriptPath: string | null = null
  private state: DebugSnapshot['state'] = 'idle'
  private frames: DebugStackFrame[] = []
  private scopes: DebugScope[] = []
  private console: DebugConsoleLine[] = []
  private breakpoints: DebugBreakpoint[] = []
  private error: string | undefined

  snapshot(): DebugSnapshot {
    return {
      state: this.state,
      scriptPath: this.scriptPath,
      frames: this.frames,
      scopes: this.scopes,
      console: this.console.slice(-200),
      error: this.error
    }
  }

  setBreakpoints(breakpoints: DebugBreakpoint[]): void {
    this.breakpoints = breakpoints.filter((bp) => bp.enabled)
    if (this.client && this.state !== 'idle' && this.state !== 'stopped') {
      void this.applyBreakpoints()
    }
  }

  async start(input: DebugLaunchInput): Promise<DebugSnapshot> {
    await this.stop()
    const scriptPath = workspaceSession.resolve(input.scriptPath, { mustExist: true })
    const root = workspaceSession.requireRoot()
    this.scriptPath = scriptPath
    this.state = 'launching'
    this.frames = []
    this.scopes = []
    this.console = []
    this.error = undefined
    this.emit('state')

    const args = ['--inspect-brk=127.0.0.1:0']
    if (/\.(ts|mts|tsx)$/i.test(scriptPath)) args.push('--experimental-strip-types')
    args.push(scriptPath)
    if (input.args?.length) args.push(...input.args.filter((arg) => !arg.startsWith('-')))

    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' }
    })
    this.child = child

    const wsUrl = await this.waitForInspector(child)
    const client = new CdpClient()
    this.client = client
    client.onEvent = (method, params) => void this.handleEvent(method, params)
    await client.connect(wsUrl)
    await client.send('Debugger.enable')
    await client.send('Runtime.enable')
    await this.applyBreakpoints()
    await client.send('Runtime.runIfWaitingForDebugger')
    this.state = 'running'
    this.pushConsole('system', `Debugging ${scriptPath}`)
    this.emit('state')

    child.on('exit', (code) => {
      if (this.child !== child) return
      this.state = 'stopped'
      this.pushConsole('system', `Process exited (${code ?? 0})`)
      this.client?.close()
      this.client = null
      this.child = null
      this.emit('stopped')
    })

    return this.snapshot()
  }

  async stop(): Promise<DebugSnapshot> {
    this.client?.close()
    this.client = null
    if (this.child && !this.child.killed) this.child.kill()
    this.child = null
    this.state = 'idle'
    this.frames = []
    this.scopes = []
    this.scriptPath = null
    this.error = undefined
    this.emit('state')
    return this.snapshot()
  }

  async continue(): Promise<void> {
    await this.client?.send('Debugger.resume')
  }

  async pause(): Promise<void> {
    await this.client?.send('Debugger.pause')
  }

  async stepOver(): Promise<void> {
    await this.client?.send('Debugger.stepOver')
  }

  async stepInto(): Promise<void> {
    await this.client?.send('Debugger.stepInto')
  }

  async stepOut(): Promise<void> {
    await this.client?.send('Debugger.stepOut')
  }

  async evaluate(expression: string): Promise<string> {
    const trimmed = expression.trim()
    if (!trimmed) return ''
    const result = await this.client?.send('Runtime.evaluate', {
      expression: trimmed,
      includeCommandLineAPI: true,
      silent: true
    })
    const value = result?.result as { value?: unknown; description?: string } | undefined
    if (value?.description) return value.description
    if (value && 'value' in value) return String(value.value)
    return '(no result)'
  }

  private async applyBreakpoints(): Promise<void> {
    if (!this.client) return
    for (const bp of this.breakpoints) {
      try {
        const path = workspaceSession.resolve(bp.path)
        await this.client.send('Debugger.setBreakpointByUrl', {
          urlRegex: pathToBreakpointRegex(path),
          lineNumber: Math.max(0, bp.line - 1)
        })
      } catch (error) {
        logger.warn(error instanceof Error ? error.message : 'Failed to set breakpoint', 'Debug')
      }
    }
  }

  private async handleEvent(method: string, params: Record<string, unknown>): Promise<void> {
    if (method === 'Debugger.paused') {
      this.state = 'paused'
      const callFrames = Array.isArray(params.callFrames) ? params.callFrames : []
      this.frames = callFrames.slice(0, 40).map((frame, index) => this.mapFrame(frame as Record<string, unknown>, index))
      this.scopes = await this.loadScopes(callFrames[0] as Record<string, unknown> | undefined)
      this.emit('paused')
      return
    }
    if (method === 'Debugger.resumed') {
      this.state = 'running'
      this.emit('state')
      return
    }
    if (method === 'Runtime.consoleAPICalled') {
      const type = String(params.type ?? 'log')
      const args = Array.isArray(params.args) ? params.args : []
      const text = args
        .map((arg) => {
          const record = arg as { value?: unknown; description?: string }
          if (record.description) return record.description
          if ('value' in record) return String(record.value)
          return ''
        })
        .filter(Boolean)
        .join(' ')
      const level: DebugConsoleLine['level'] =
        type === 'warning' || type === 'warn'
          ? 'warn'
          : type === 'error'
            ? 'error'
            : type === 'info' || type === 'debug'
              ? (type as 'info' | 'debug')
              : 'log'
      this.pushConsole(level, text || type)
      this.emit('console', { type: 'console', line: { level, text: text || type } })
    }
  }

  private mapFrame(frame: Record<string, unknown>, index: number): DebugStackFrame {
    const location = (frame.location ?? {}) as { scriptId?: string; lineNumber?: number; columnNumber?: number }
    const url = String(frame.url ?? '')
    const path = url.startsWith('file:') ? decodeURIComponent(url.replace(/^file:\/\//, '').replace(/^\/([a-zA-Z]:)/, '$1')) : url || undefined
    return {
      id: index + 1,
      functionName: String(frame.functionName || '(anonymous)'),
      path,
      line: typeof location.lineNumber === 'number' ? location.lineNumber + 1 : undefined,
      column: typeof location.columnNumber === 'number' ? location.columnNumber + 1 : undefined
    }
  }

  private async loadScopes(frame: Record<string, unknown> | undefined): Promise<DebugScope[]> {
    if (!frame || !this.client) return []
    const rawScopes = Array.isArray(frame.scopeChain) ? frame.scopeChain : []
    const scopes: DebugScope[] = []
    for (const scope of rawScopes.slice(0, 4)) {
      const record = scope as { type?: string; object?: { objectId?: string } }
      const objectId = record.object?.objectId
      if (!objectId) continue
      try {
        const props = await this.client.send('Runtime.getProperties', {
          objectId,
          ownProperties: true,
          accessorPropertiesOnly: false,
          generatePreview: true
        })
        const result = Array.isArray(props.result) ? props.result : []
        const variables: DebugVariable[] = result.slice(0, 40).map((item) => {
          const entry = item as { name?: string; value?: { description?: string; type?: string; value?: unknown } }
          const value = entry.value
          return {
            name: String(entry.name ?? ''),
            value: value?.description ?? (value && 'value' in value ? String(value.value) : ''),
            type: value?.type
          }
        })
        scopes.push({ name: String(record.type ?? 'scope'), variables })
      } catch {
        // Scope may be unavailable (e.g. global). Skip it.
      }
    }
    return scopes
  }

  private waitForInspector(child: ChildProcess): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = ''
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('Timed out waiting for the Node inspector'))
      }, 12_000)
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const url = parseInspectorWebSocketUrl(buffer)
        if (url) {
          cleanup()
          resolve(url)
        }
      }
      const onExit = () => {
        cleanup()
        reject(new Error(buffer.trim() || 'Debug process exited before the inspector started'))
      }
      const cleanup = () => {
        clearTimeout(timer)
        child.stderr?.off('data', onData)
        child.stdout?.off('data', onData)
        child.off('exit', onExit)
      }
      child.stderr?.on('data', onData)
      child.stdout?.on('data', onData)
      child.on('exit', onExit)
    })
  }

  private pushConsole(level: DebugConsoleLine['level'], text: string): void {
    this.console = [...this.console, { level, text }].slice(-200)
  }

  private emit(type: DebugEvent['type'], extra?: DebugEvent): void {
    const event: DebugEvent =
      extra ??
      (type === 'paused'
        ? { type: 'paused', snapshot: this.snapshot() }
        : type === 'stopped'
          ? { type: 'stopped', snapshot: this.snapshot() }
          : { type: 'state', snapshot: this.snapshot() })
    if (event.type === 'console') {
      broadcastToWorkbench(IPC_CHANNELS.DEBUG_EVENT, event)
      return
    }
    broadcastToWorkbench(IPC_CHANNELS.DEBUG_EVENT, event)
  }
}

export const nodeDebuggerService = new NodeDebuggerService()
