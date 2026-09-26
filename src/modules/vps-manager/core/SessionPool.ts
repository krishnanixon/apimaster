import type { ServerStatus } from '../types/server.types'
import { SSHClient } from './SSHClient'

export interface SessionEntry {
  serverId: string
  client: SSHClient
  status: ServerStatus
  connectedAt?: Date
  lastError?: string
  activeProcesses: number
}

export class SessionPool {
  private sessions = new Map<string, SessionEntry>()

  get(serverId: string): SessionEntry | undefined {
    return this.sessions.get(serverId)
  }

  has(serverId: string): boolean {
    return this.sessions.has(serverId)
  }

  set(serverId: string, entry: SessionEntry): void {
    this.sessions.set(serverId, entry)
  }

  delete(serverId: string): void {
    const session = this.sessions.get(serverId)
    if (session) {
      session.client.disconnect()
      this.sessions.delete(serverId)
    }
  }

  updateStatus(serverId: string, status: ServerStatus, lastError?: string): void {
    const session = this.sessions.get(serverId)
    if (session) {
      session.status = status
      if (lastError !== undefined) session.lastError = lastError
    }
  }

  incrementProcesses(serverId: string): void {
    const session = this.sessions.get(serverId)
    if (session) session.activeProcesses += 1
  }

  decrementProcesses(serverId: string): void {
    const session = this.sessions.get(serverId)
    if (session && session.activeProcesses > 0) session.activeProcesses -= 1
  }

  list(): SessionEntry[] {
    return Array.from(this.sessions.values())
  }

  disconnectAll(): void {
    for (const [id] of this.sessions) {
      this.delete(id)
    }
  }
}
