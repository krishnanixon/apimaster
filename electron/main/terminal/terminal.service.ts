import * as pty from 'node-pty'
import { accessSync, constants, existsSync, statSync } from 'fs'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { TerminalDataEvent, TerminalExitEvent } from '@shared/types/terminal'
import { broadcastToWorkbench } from '../windows/window-manager'

interface TerminalSession {
  pty: pty.IPty
  cwd: string
}

const sessions = new Map<string, TerminalSession>()

function emitData(id: string, chunk: string): void {
  if (!chunk) return
  const payload: TerminalDataEvent = { id, chunk, stream: 'stdout' }
  broadcastToWorkbench(IPC_CHANNELS.TERMINAL_DATA, payload)
}

function emitExit(id: string, code: number, cwd: string): void {
  const payload: TerminalExitEvent = { id, code, cwd }
  broadcastToWorkbench(IPC_CHANNELS.TERMINAL_EXIT, payload)
}

function resolveShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] }
  }

  const candidates = [
    process.env.SHELL,
    process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash',
    '/bin/sh'
  ].filter(Boolean) as string[]

  for (const shell of candidates) {
    if (!existsSync(shell)) continue
    try {
      accessSync(shell, constants.X_OK)
      const args = shell.endsWith('zsh') || shell.endsWith('bash') ? ['-l'] : []
      return { file: shell, args }
    } catch {
      // try next shell
    }
  }

  return { file: '/bin/sh', args: [] }
}

function buildTerminalEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  return env
}

function formatSpawnError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Failed to create terminal'
  if (message.includes('posix_spawnp failed')) {
    return new Error(
      'Terminal failed to start (PTY helper is missing or not executable). Run: npm run rebuild:native'
    )
  }
  return error instanceof Error ? error : new Error(message)
}

class TerminalService {
  create(id: string, cwd: string, cols = 80, rows = 24): void {
    const existing = sessions.get(id)
    if (existing) {
      try {
        existing.pty.resize(Math.max(cols, 10), Math.max(rows, 4))
      } catch {
        // ignore resize races
      }
      return
    }

    const safeCwd = existsSync(cwd) && statSync(cwd).isDirectory() ? cwd : process.cwd()
    const { file, args } = resolveShell()

    let ptyProcess: pty.IPty
    try {
      ptyProcess = pty.spawn(file, args, {
        name: 'xterm-256color',
        cols: Math.max(cols, 10),
        rows: Math.max(rows, 4),
        cwd: safeCwd,
        env: buildTerminalEnv()
      })
    } catch (error) {
      throw formatSpawnError(error)
    }

    sessions.set(id, { pty: ptyProcess, cwd: safeCwd })

    ptyProcess.onData((data) => emitData(id, data))
    ptyProcess.onExit(({ exitCode }) => {
      const session = sessions.get(id)
      emitExit(id, exitCode ?? 0, session?.cwd ?? safeCwd)
      sessions.delete(id)
    })
  }

  write(id: string, data: string): void {
    sessions.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = sessions.get(id)
    if (!session) return
    try {
      session.pty.resize(Math.max(cols, 10), Math.max(rows, 4))
    } catch {
      // ignore resize races during dispose
    }
  }

  /** Send interrupt signal (Ctrl+C) */
  stop(id: string): void {
    const session = sessions.get(id)
    if (!session) return
    session.pty.write('\x03')
  }

  run(id: string, command: string): void {
    const session = sessions.get(id)
    if (!session) return
    session.pty.write(`${command}\r`)
  }

  dispose(id: string): void {
    const session = sessions.get(id)
    if (!session) return
    try {
      session.pty.kill()
    } catch {
      // already dead
    }
    sessions.delete(id)
  }
}

export const terminalService = new TerminalService()
