import net from 'net'
import { Client } from 'ssh2'
import type { DbConnectionConfig, DbConnectionSecrets } from '@shared/types/database-workspace'
import { logger } from '../infra/logger.service'

export interface DbSshTunnel {
  localHost: string
  localPort: number
  close: () => Promise<void>
}

const tunnels = new Map<string, DbSshTunnel>()

/**
 * Open an SSH local port-forward to the database host and return the local endpoint.
 * The database driver then connects to 127.0.0.1:<localPort> instead of the remote host.
 */
export async function openSshTunnel(
  config: DbConnectionConfig,
  secrets: DbConnectionSecrets,
  defaultDbPort: number
): Promise<DbSshTunnel> {
  const ssh = config.sshTunnel
  if (!ssh?.enabled || !ssh.host) throw new Error('SSH tunnel is not configured')

  const dstHost = config.host || '127.0.0.1'
  const dstPort = config.port ?? defaultDbPort
  const client = new Client()

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => reject(new Error(`SSH tunnel failed: ${err.message}`))
    client.once('ready', () => {
      client.off('error', onError)
      resolve()
    })
    client.once('error', onError)
    client.connect({
      host: ssh.host,
      port: ssh.port ?? 22,
      username: ssh.username,
      ...(ssh.authMethod === 'privateKey'
        ? { privateKey: secrets.sshPrivateKey, passphrase: secrets.sshPassphrase || undefined }
        : { password: secrets.sshPassword }),
      readyTimeout: config.connectionTimeoutMs ?? 15_000,
      keepaliveInterval: (ssh.keepAliveIntervalSec ?? 30) * 1000
    })
  })

  const server = net.createServer((socket) => {
    client.forwardOut('127.0.0.1', socket.localPort ?? 0, dstHost, dstPort, (err, stream) => {
      if (err) {
        logger.warn(`SSH forward error: ${err.message}`, 'DbSshTunnel')
        socket.destroy()
        return
      }
      socket.pipe(stream).pipe(socket)
      stream.on('error', () => socket.destroy())
      socket.on('error', () => stream.destroy())
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  const localPort = typeof address === 'object' && address ? address.port : 0
  client.on('error', (err) => logger.warn(`SSH tunnel error: ${err.message}`, 'DbSshTunnel'))

  return {
    localHost: '127.0.0.1',
    localPort,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        client.end()
      })
  }
}

/** Get (or open) the persistent tunnel for a connection session. */
export async function ensureSessionTunnel(
  connectionId: string,
  config: DbConnectionConfig,
  secrets: DbConnectionSecrets,
  defaultDbPort: number
): Promise<DbSshTunnel> {
  const existing = tunnels.get(connectionId)
  if (existing) return existing
  const tunnel = await openSshTunnel(config, secrets, defaultDbPort)
  tunnels.set(connectionId, tunnel)
  return tunnel
}

export async function closeSessionTunnel(connectionId: string): Promise<void> {
  const tunnel = tunnels.get(connectionId)
  if (!tunnel) return
  tunnels.delete(connectionId)
  await tunnel.close().catch(() => {})
}
