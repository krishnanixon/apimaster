import { createHash } from 'crypto'
import { Client, type ConnectConfig } from 'ssh2'
import type { CommandResult } from '../types/session.types'

export interface SSHConnectOptions {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  /** ssh-agent socket, Windows OpenSSH pipe, or 'pageant' */
  agent?: string
  readyTimeout?: number
  keepaliveInterval?: number
  keepaliveCountMax?: number
  /**
   * Called with the SHA-256 fingerprint of the server's host key.
   * Return false (or a rejected promise) to abort the handshake.
   */
  verifyHostKey?: (fingerprint: string) => boolean | Promise<boolean>
  /** Called when the connection closes after being established (e.g. dropped). */
  onClose?: (hadError: boolean) => void
}

export class SSHClient {
  private client: Client | null = null
  private connected = false

  async connect(options: SSHConnectOptions): Promise<void> {
    if (this.connected) return

    const config: ConnectConfig = {
      host: options.host,
      port: options.port,
      username: options.username,
      readyTimeout: options.readyTimeout ?? 20000,
      keepaliveInterval: options.keepaliveInterval ?? 15000,
      keepaliveCountMax: options.keepaliveCountMax ?? 3
    }

    if (options.verifyHostKey) {
      const verify = options.verifyHostKey
      config.hostVerifier = ((key: Buffer, verifyCb: (ok: boolean) => void) => {
        const fingerprint = createHash('sha256').update(key).digest('base64')
        Promise.resolve(verify(`SHA256:${fingerprint}`))
          .then((ok) => verifyCb(ok))
          .catch(() => verifyCb(false))
      }) as ConnectConfig['hostVerifier']
    }

    if (options.agent) {
      config.agent = options.agent
    } else if (options.privateKey) {
      config.privateKey = options.privateKey
      if (options.passphrase) config.passphrase = options.passphrase
    } else if (options.password) {
      config.password = options.password
    } else {
      throw new Error('SSH credentials missing')
    }

    await new Promise<void>((resolve, reject) => {
      const client = new Client()
      let ready = false

      client
        .on('ready', () => {
          ready = true
          this.client = client
          this.connected = true
          resolve()
        })
        .on('error', (err) => {
          this.connected = false
          if (!ready) reject(err)
        })
        .on('close', () => {
          const wasConnected = this.connected
          this.connected = false
          this.client = null
          if (ready && wasConnected) options.onClose?.(false)
        })
        .connect(config)
    })
  }

  isConnected(): boolean {
    return this.connected && this.client !== null
  }

  async exec(command: string): Promise<CommandResult> {
    if (!this.client || !this.connected) {
      throw new Error('SSH client not connected')
    }

    return new Promise((resolve, reject) => {
      this.client!.exec(command, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        let stdout = ''
        let stderr = ''

        stream
          .on('close', (code: number | null) => {
            resolve({
              stdout,
              stderr,
              exitCode: code ?? 1
            })
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString()
          })

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      })
    })
  }

  async execStream(
    command: string,
    onData: (chunk: string, stream: 'stdout' | 'stderr') => void
  ): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('SSH client not connected')
    }

    return new Promise((resolve, reject) => {
      this.client!.exec(command, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        stream
          .on('close', (code: number | null) => resolve(code ?? 1))
          .on('data', (data: Buffer) => onData(data.toString(), 'stdout'))

        stream.stderr.on('data', (data: Buffer) => onData(data.toString(), 'stderr'))
      })
    })
  }

  disconnect(): void {
    if (this.client) {
      this.client.end()
      this.client = null
    }
    this.connected = false
  }
}
