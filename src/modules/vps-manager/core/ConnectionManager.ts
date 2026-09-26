import type { ServerStatus } from '../types/server.types'
import type { CommandResult, VPSSessionInfo } from '../types/session.types'
import { SSHClient, type SSHConnectOptions } from './SSHClient'
import { SessionPool } from './SessionPool'
import { CommandExecutor } from './CommandExecutor'

export interface ConnectCredentials {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  agent?: string
  verifyHostKey?: (fingerprint: string) => boolean | Promise<boolean>
}

export type StatusChangeListener = (
  serverId: string,
  status: ServerStatus,
  lastError?: string
) => void

export class ConnectionManager {
  private pool = new SessionPool()
  private executor = new CommandExecutor(this.pool)
  private logListeners = new Map<
    string,
    Set<(chunk: string, stream: 'stdout' | 'stderr') => void>
  >()
  private statusListeners = new Set<StatusChangeListener>()

  async connect(serverId: string, credentials: ConnectCredentials): Promise<void> {
    if (this.pool.has(serverId)) {
      const existing = this.pool.get(serverId)!
      if (existing.status === 'connected' && existing.client.isConnected()) return
      this.pool.delete(serverId)
    }

    this.pool.set(serverId, {
      serverId,
      client: new SSHClient(),
      status: 'reconnecting',
      activeProcesses: 0
    })

    const session = this.pool.get(serverId)!
    const options: SSHConnectOptions = {
      ...credentials,
      onClose: (hadError) => this.handleUnexpectedClose(serverId, hadError)
    }
    try {
      await session.client.connect(options)
      session.status = 'connected'
      session.connectedAt = new Date()
      session.lastError = undefined
      this.emitStatus(serverId, 'connected')
    } catch (err) {
      session.status = 'error'
      session.lastError = err instanceof Error ? err.message : 'Connection failed'
      this.emitStatus(serverId, 'error', session.lastError)
      throw err
    }
  }

  onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private emitStatus(serverId: string, status: ServerStatus, lastError?: string): void {
    this.statusListeners.forEach((fn) => fn(serverId, status, lastError))
  }

  private handleUnexpectedClose(serverId: string, hadError: boolean): void {
    const session = this.pool.get(serverId)
    if (!session) return
    session.status = hadError ? 'error' : 'disconnected'
    session.activeProcesses = 0
    if (hadError) session.lastError = 'Connection lost'
    this.emitStatus(serverId, session.status, session.lastError)
  }

  disconnect(serverId: string): void {
    this.pool.delete(serverId)
    this.logListeners.delete(serverId)
    this.emitStatus(serverId, 'disconnected')
  }

  async reconnect(serverId: string, credentials: ConnectCredentials): Promise<void> {
    this.disconnect(serverId)
    await this.connect(serverId, credentials)
  }

  async execute(serverId: string, command: string, auditCommand = command): Promise<CommandResult> {
    return this.executor.execute(serverId, command, auditCommand)
  }

  async executeStream(
    serverId: string,
    command: string,
    onData?: (chunk: string, stream: 'stdout' | 'stderr') => void,
    auditCommand = command
  ): Promise<number> {
    const handler = onData ?? this.getBroadcastHandler(serverId)
    return this.executor.executeStream(serverId, command, handler, auditCommand)
  }

  streamLogs(serverId: string, command: string): void {
    void this.executeStream(serverId, command, this.getBroadcastHandler(serverId))
  }

  onLog(
    serverId: string,
    listener: (chunk: string, stream: 'stdout' | 'stderr') => void
  ): () => void {
    if (!this.logListeners.has(serverId)) {
      this.logListeners.set(serverId, new Set())
    }
    this.logListeners.get(serverId)!.add(listener)
    return () => this.logListeners.get(serverId)?.delete(listener)
  }

  getSessionInfo(serverId: string): VPSSessionInfo | null {
    const session = this.pool.get(serverId)
    if (!session) return null
    return {
      serverId,
      status: session.status,
      connectedAt: session.connectedAt?.toISOString(),
      lastError: session.lastError,
      activeProcesses: session.activeProcesses
    }
  }

  listSessions(): VPSSessionInfo[] {
    return this.pool.list().map((s) => ({
      serverId: s.serverId,
      status: s.status,
      connectedAt: s.connectedAt?.toISOString(),
      lastError: s.lastError,
      activeProcesses: s.activeProcesses
    }))
  }

  getStatus(serverId: string): ServerStatus {
    return this.pool.get(serverId)?.status ?? 'disconnected'
  }

  getAuditLog(serverId?: string) {
    return this.executor.getAuditLog(serverId)
  }

  disconnectAll(): void {
    this.pool.disconnectAll()
    this.logListeners.clear()
  }

  private getBroadcastHandler(serverId: string) {
    return (chunk: string, stream: 'stdout' | 'stderr') => {
      this.logListeners.get(serverId)?.forEach((fn) => fn(chunk, stream))
    }
  }
}

export const connectionManager = new ConnectionManager()
