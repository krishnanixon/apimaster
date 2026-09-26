import { spawn } from 'child_process'
import { classifyCommandRisk, canAutoExecute } from '@shared/lib/command-risk'
import type { TerminalExecRequest, TerminalExecResult } from '@shared/types/terminal'
import { mainEventBus } from '../events/bus'
import { workspaceSession } from '../security/workspace-session'
import { logger } from '../infra/logger.service'

const MAX_OUTPUT_CHARS = 1_000_000
const DEFAULT_TIMEOUT_MS = 60_000

const running = new Map<string, { child: ReturnType<typeof spawn>; timedOut: boolean }>()

function appendCapped(current: string, chunk: string): string {
  if (current.length >= MAX_OUTPUT_CHARS) return current
  const next = current + chunk
  if (next.length <= MAX_OUTPUT_CHARS) return next
  return `${next.slice(0, MAX_OUTPUT_CHARS)}\n…[truncated]`
}

function killProcess(child: ReturnType<typeof spawn>): void {
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGTERM')
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // already exited
        }
      }, 1500)
    }
  } catch {
    // ignore
  }
}

class CommandExecService {
  async exec(request: TerminalExecRequest): Promise<TerminalExecResult> {
    const risk = classifyCommandRisk(request.command)
    const started = Date.now()
    const cwd = workspaceSession.resolveCwd(request.cwd)

    if (!canAutoExecute(risk.level, request.acceptRisk === true)) {
      return {
        id: request.id,
        command: request.command,
        cwd,
        stdout: '',
        stderr: risk.reason,
        exitCode: null,
        durationMs: Date.now() - started,
        risk,
        cancelled: false,
        blocked: true
      }
    }

    mainEventBus.emit('TERMINAL_STARTED', { id: request.id, command: request.command, cwd })

    return new Promise((resolve) => {
      const timeoutMs = request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : DEFAULT_TIMEOUT_MS
      let stdout = ''
      let stderr = ''
      let settled = false

      const child = spawn(request.command, {
        cwd,
        shell: true,
        windowsHide: true,
        env: { ...process.env, ...(request.env ?? {}) }
      })

      running.set(request.id, { child, timedOut: false })

      const finish = (exitCode: number | null, cancelled: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        running.delete(request.id)
        const durationMs = Date.now() - started
        mainEventBus.emit('TERMINAL_EXITED', { id: request.id, exitCode: exitCode ?? -1, durationMs })
        resolve({
          id: request.id,
          command: request.command,
          cwd,
          stdout,
          stderr,
          exitCode,
          durationMs,
          risk,
          cancelled,
          blocked: false
        })
      }

      const timer = setTimeout(() => {
        const session = running.get(request.id)
        if (session) session.timedOut = true
        killProcess(child)
        stderr = appendCapped(stderr, `\nCommand timed out after ${timeoutMs}ms`)
      }, timeoutMs)

      child.stdout?.on('data', (buf: Buffer) => {
        stdout = appendCapped(stdout, buf.toString('utf8'))
      })
      child.stderr?.on('data', (buf: Buffer) => {
        stderr = appendCapped(stderr, buf.toString('utf8'))
      })
      child.on('error', (error) => {
        logger.warn(`terminal.exec spawn error: ${error.message}`, 'TerminalExec')
        stderr = appendCapped(stderr, error.message)
        finish(1, false)
      })
      child.on('close', (code) => {
        const session = running.get(request.id)
        finish(code, session?.timedOut === true)
      })
    })
  }

  cancel(id: string): boolean {
    const session = running.get(id)
    if (!session) return false
    killProcess(session.child)
    return true
  }
}

export const commandExecService = new CommandExecService()
