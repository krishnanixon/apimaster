import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { VPSProject, VPSProjectInput, VPSServer, VPSServerInput } from '@shared/types/vps'
import { detectSshKeyFormat } from '@shared/lib/vps-connection'
import { decryptCredential, encryptCredential } from './vps-crypto'

interface VPSStore {
  servers: VPSServer[]
  projects: VPSProject[]
  /** Trust-on-first-use host key fingerprints, keyed by "host:port". */
  knownHosts?: Record<string, string>
}

const STORE_FILE = 'vps-manager.json'

function getStorePath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, STORE_FILE)
}

function loadStore(): VPSStore {
  const path = getStorePath()
  if (!existsSync(path)) return { servers: [], projects: [] }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as VPSStore
  } catch {
    return { servers: [], projects: [] }
  }
}

function saveStore(store: VPSStore): void {
  writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf-8')
}

export class VPSRepository {
  listServers(): VPSServer[] {
    return loadStore().servers.map((s) => ({ ...s, encryptedCredential: undefined }))
  }

  getServer(id: string): VPSServer | null {
    const server = loadStore().servers.find((s) => s.id === id)
    if (!server) return null
    return { ...server, encryptedCredential: undefined }
  }

  getServerWithCredentials(id: string): VPSServer | null {
    return loadStore().servers.find((s) => s.id === id) ?? null
  }

  createServer(input: VPSServerInput): VPSServer {
    const store = loadStore()
    const now = new Date().toISOString()
    const credential =
      input.authType === 'agent'
        ? undefined
        : encryptCredential({
            password: input.password,
            sshKey: input.sshKey,
            passphrase: input.passphrase
          })
    const keyFormat = input.sshKey ? detectSshKeyFormat(input.sshKey) : undefined
    const server: VPSServer = {
      id: randomUUID(),
      name: input.name,
      host: input.host,
      os: input.os ?? 'linux',
      port: input.port,
      username: input.username,
      authType: input.authType,
      encryptedCredential: credential,
      keyFileName: input.keyFileName,
      keyFormat: keyFormat && keyFormat !== 'unknown' && keyFormat !== 'public' ? keyFormat : undefined,
      agentKind: input.authType === 'agent' ? (input.agentKind ?? 'openssh') : undefined,
      status: 'disconnected',
      createdAt: now,
      updatedAt: now
    }
    store.servers.push(server)
    saveStore(store)
    return { ...server, encryptedCredential: undefined }
  }

  updateServer(id: string, input: Partial<VPSServerInput>): VPSServer | null {
    const store = loadStore()
    const idx = store.servers.findIndex((s) => s.id === id)
    if (idx === -1) return null

    const existing = store.servers[idx]
    const updated: VPSServer = {
      ...existing,
      name: input.name ?? existing.name,
      host: input.host ?? existing.host,
      os: input.os ?? existing.os ?? 'linux',
      port: input.port ?? existing.port,
      username: input.username ?? existing.username,
      authType: input.authType ?? existing.authType,
      keyFileName: input.keyFileName ?? existing.keyFileName,
      agentKind: input.agentKind ?? existing.agentKind,
      updatedAt: new Date().toISOString()
    }

    if (updated.authType === 'agent') {
      updated.encryptedCredential = undefined
      updated.keyFileName = undefined
      updated.keyFormat = undefined
    } else if (input.password || input.sshKey || input.passphrase) {
      const current = existing.encryptedCredential
        ? decryptCredential(existing.encryptedCredential)
        : {}
      const sshKey = input.sshKey ?? current.sshKey
      updated.encryptedCredential = encryptCredential({
        password: input.password ?? current.password,
        sshKey,
        passphrase: input.passphrase ?? current.passphrase
      })
      if (sshKey) {
        const format = detectSshKeyFormat(sshKey)
        updated.keyFormat = format === 'unknown' || format === 'public' ? undefined : format
      }
    }

    store.servers[idx] = updated
    saveStore(store)
    return { ...updated, encryptedCredential: undefined }
  }

  updateServerStatus(id: string, status: VPSServer['status']): void {
    const store = loadStore()
    const server = store.servers.find((s) => s.id === id)
    if (server) {
      server.status = status
      server.updatedAt = new Date().toISOString()
      saveStore(store)
    }
  }

  deleteServer(id: string): boolean {
    const store = loadStore()
    const before = store.servers.length
    store.servers = store.servers.filter((s) => s.id !== id)
    store.projects = store.projects.filter((p) => p.serverId !== id)
    saveStore(store)
    return store.servers.length < before
  }

  listProjects(serverId?: string): VPSProject[] {
    const projects = loadStore().projects
    return serverId ? projects.filter((p) => p.serverId === serverId) : projects
  }

  getProject(id: string): VPSProject | null {
    return loadStore().projects.find((p) => p.id === id) ?? null
  }

  createProject(input: VPSProjectInput): VPSProject {
    const store = loadStore()
    const now = new Date().toISOString()
    const project: VPSProject = {
      id: randomUUID(),
      serverId: input.serverId,
      name: input.name,
      path: input.path,
      repoUrl: input.repoUrl,
      pm2Name: input.pm2Name,
      buildCommand: input.buildCommand ?? 'npm run build',
      installCommand: input.installCommand ?? 'npm ci',
      startCommand: input.startCommand ?? 'pm2 start ecosystem.config.js',
      envFilePath: input.envFilePath ?? '.env',
      createdAt: now,
      updatedAt: now
    }
    store.projects.push(project)
    saveStore(store)
    return project
  }

  updateProject(id: string, input: Partial<VPSProjectInput>): VPSProject | null {
    const store = loadStore()
    const idx = store.projects.findIndex((p) => p.id === id)
    if (idx === -1) return null
    store.projects[idx] = {
      ...store.projects[idx],
      ...input,
      updatedAt: new Date().toISOString()
    }
    saveStore(store)
    return store.projects[idx]
  }

  deleteProject(id: string): boolean {
    const store = loadStore()
    const before = store.projects.length
    store.projects = store.projects.filter((p) => p.id !== id)
    saveStore(store)
    return store.projects.length < before
  }

  getKnownHostKey(hostKey: string): string | undefined {
    return loadStore().knownHosts?.[hostKey]
  }

  saveKnownHostKey(hostKey: string, fingerprint: string): void {
    const store = loadStore()
    store.knownHosts = { ...(store.knownHosts ?? {}), [hostKey]: fingerprint }
    saveStore(store)
  }

  forgetKnownHost(hostKey: string): void {
    const store = loadStore()
    if (store.knownHosts) {
      delete store.knownHosts[hostKey]
      saveStore(store)
    }
  }
}

export const vpsRepository = new VPSRepository()
