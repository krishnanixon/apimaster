import { randomUUID } from 'crypto'
import type { AuditLogEntry, CommandResult } from '../types/session.types'
import { isDestructiveCommand } from './intentParser'
import type { SessionPool } from './SessionPool'

export class CommandExecutor {
  private auditLog: AuditLogEntry[] = []

  constructor(private pool: SessionPool) {}

  async execute(serverId: string, command: string, auditCommand = command): Promise<CommandResult> {
    const session = this.pool.get(serverId)
    if (!session || session.status !== 'connected') {
      throw new Error(`No active session for server ${serverId}`)
    }

    session.activeProcesses += 1
    try {
      const result = await session.client.exec(command)
      this.recordAudit(serverId, auditCommand, result.exitCode)
      return result
    } finally {
      session.activeProcesses = Math.max(0, session.activeProcesses - 1)
    }
  }

  async executeStream(
    serverId: string,
    command: string,
    onData: (chunk: string, stream: 'stdout' | 'stderr') => void,
    auditCommand = command
  ): Promise<number> {
    const session = this.pool.get(serverId)
    if (!session || session.status !== 'connected') {
      throw new Error(`No active session for server ${serverId}`)
    }

    session.activeProcesses += 1
    try {
      const exitCode = await session.client.execStream(command, onData)
      this.recordAudit(serverId, auditCommand, exitCode)
      return exitCode
    } finally {
      session.activeProcesses = Math.max(0, session.activeProcesses - 1)
    }
  }

  getAuditLog(serverId?: string): AuditLogEntry[] {
    if (serverId) return this.auditLog.filter((e) => e.serverId === serverId)
    return [...this.auditLog]
  }

  private recordAudit(serverId: string, command: string, exitCode?: number): void {
    this.auditLog.unshift({
      id: randomUUID(),
      serverId,
      command,
      timestamp: new Date().toISOString(),
      exitCode,
      destructive: isDestructiveCommand(command)
    })
    if (this.auditLog.length > 500) this.auditLog.pop()
  }
}
