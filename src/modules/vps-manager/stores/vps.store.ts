import { create } from 'zustand'
import { toast } from 'sonner'
import type { AuditLogEntry, VPSServerMetrics, VPSSessionInfo } from '../types/session.types'
import type { VPSDeployment, VPSProject } from '../types/project.types'
import type {
  VPSServer,
  VPSServerInput,
  VPSProjectInput,
  VPSKeyInspectResult,
  VPSPickedKey
} from '@shared/types/vps'

export type ServerAction = 'connect' | 'disconnect' | 'reconnect'

interface VPSStore {
  servers: VPSServer[]
  projects: VPSProject[]
  sessions: VPSSessionInfo[]
  metrics: Record<string, VPSServerMetrics>
  metricErrors: Record<string, string>
  selectedServerId: string | null
  activeDeployment: VPSDeployment | null
  auditLog: AuditLogEntry[]
  terminalLogs: Record<string, string>
  isInitialLoading: boolean
  isCreatingServer: boolean
  pendingServerActions: Record<string, ServerAction>
  error: string | null

  loadServers: () => Promise<void>
  loadMetrics: (serverId: string) => Promise<void>
  createServer: (input: VPSServerInput) => Promise<VPSServer>
  pickKeyFile: (passphrase?: string) => Promise<VPSPickedKey | null>
  inspectKey: (content: string, passphrase?: string) => Promise<VPSKeyInspectResult>
  testConnection: (input: VPSServerInput) => Promise<void>
  deleteServer: (id: string) => Promise<void>
  connect: (serverId: string, autoOpen?: boolean) => Promise<void>
  disconnect: (serverId: string) => Promise<void>
  reconnect: (serverId: string) => Promise<void>
  selectServer: (id: string | null) => void
  loadProjects: (serverId?: string) => Promise<void>
  createProject: (input: VPSProjectInput) => Promise<VPSProject>
  deleteProject: (id: string) => Promise<void>
  executeCommand: (serverId: string, command: string) => Promise<string>
  loadAuditLog: (serverId?: string) => Promise<void>
  appendTerminalLog: (serverId: string, chunk: string) => void
  clearTerminalLog: (serverId: string) => void
  setActiveDeployment: (deployment: VPSDeployment | null) => void
  clearError: () => void
  subscribeToEvents: () => () => void
}

function setServerPending(
  pending: Record<string, ServerAction>,
  serverId: string,
  action: ServerAction | null
): Record<string, ServerAction> {
  const next = { ...pending }
  if (action) next[serverId] = action
  else delete next[serverId]
  return next
}

export const useVPSStore = create<VPSStore>((set, get) => ({
  servers: [],
  projects: [],
  sessions: [],
  metrics: {},
  metricErrors: {},
  selectedServerId: null,
  activeDeployment: null,
  auditLog: [],
  terminalLogs: {},
  isInitialLoading: true,
  isCreatingServer: false,
  pendingServerActions: {},
  error: null,

  loadServers: async () => {
    const isFirst = get().isInitialLoading
    if (isFirst) set({ isInitialLoading: true, error: null })
    const result = await window.electronAPI.vps.listServers()
    if (result.success && result.data) {
      set({ servers: result.data, isInitialLoading: false, error: null })
    } else {
      set({
        isInitialLoading: false,
        error: result.error ?? 'Failed to load servers'
      })
    }
  },

  loadMetrics: async (serverId) => {
    try {
      const result = await window.electronAPI.vps.getMetrics(serverId)
      if (!result.success || !result.data) throw new Error(result.error ?? 'Metrics unavailable')
      set((s) => ({
        metrics: { ...s.metrics, [serverId]: result.data! },
        metricErrors: { ...s.metricErrors, [serverId]: '' }
      }))
    } catch (error) {
      set((s) => {
        const metrics = { ...s.metrics }
        delete metrics[serverId]
        return {
          metrics,
          metricErrors: {
            ...s.metricErrors,
            [serverId]: error instanceof Error ? error.message : 'Metrics unavailable'
          }
        }
      })
    }
  },

  createServer: async (input) => {
    set({ isCreatingServer: true, error: null })
    try {
      const result = await window.electronAPI.vps.createServer(input)
      if (!result.success || !result.data)
        throw new Error(result.error ?? 'Failed to create server')
      await get().loadServers()
      toast.success(`Server "${input.name}" added`)
      return result.data
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create server'
      toast.error(msg)
      throw e
    } finally {
      set({ isCreatingServer: false })
    }
  },

  pickKeyFile: async (passphrase) => {
    const result = await window.electronAPI.vps.pickKeyFile(passphrase)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to read key file')
      throw new Error(result.error)
    }
    return result.data ?? null
  },

  inspectKey: async (content, passphrase) => {
    const result = await window.electronAPI.vps.inspectKey(content, passphrase)
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to inspect key')
    }
    return result.data
  },

  testConnection: async (input) => {
    const result = await window.electronAPI.vps.testConnection(input)
    if (!result.success) {
      const msg = result.error ?? 'Connection test failed'
      toast.error(msg)
      throw new Error(msg)
    }
    toast.success('Connection successful')
  },

  deleteServer: async (id) => {
    const server = get().servers.find((s) => s.id === id)
    const result = await window.electronAPI.vps.deleteServer(id)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete server')
      throw new Error(result.error)
    }
    if (get().selectedServerId === id) set({ selectedServerId: null })
    await get().loadServers()
    toast.success(server ? `"${server.name}" removed` : 'Server removed')
  },

  connect: async (serverId, autoOpen = false) => {
    const server = get().servers.find((s) => s.id === serverId)
    set((s) => ({
      pendingServerActions: setServerPending(s.pendingServerActions, serverId, 'connect'),
      error: null
    }))
    try {
      const result = await window.electronAPI.vps.connect(serverId)
      if (!result.success) throw new Error(result.error ?? 'Connection failed')
      await get().loadServers()
      toast.success(server ? `Connected to ${server.name}` : 'Connected')
      if (autoOpen) set({ selectedServerId: serverId })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed'
      toast.error(msg)
      set({ error: msg })
      throw e
    } finally {
      set((s) => ({
        pendingServerActions: setServerPending(s.pendingServerActions, serverId, null)
      }))
    }
  },

  disconnect: async (serverId) => {
    const server = get().servers.find((s) => s.id === serverId)
    set((s) => ({
      pendingServerActions: setServerPending(s.pendingServerActions, serverId, 'disconnect')
    }))
    try {
      const result = await window.electronAPI.vps.disconnect(serverId)
      if (!result.success) {
        toast.error(result.error ?? 'Disconnect failed')
        return
      }
      await get().loadServers()
      toast.success(server ? `Disconnected from ${server.name}` : 'Disconnected')
    } finally {
      set((s) => ({
        pendingServerActions: setServerPending(s.pendingServerActions, serverId, null)
      }))
    }
  },

  reconnect: async (serverId) => {
    const server = get().servers.find((s) => s.id === serverId)
    set((s) => ({
      pendingServerActions: setServerPending(s.pendingServerActions, serverId, 'reconnect'),
      error: null
    }))
    try {
      const result = await window.electronAPI.vps.reconnect(serverId)
      if (!result.success) throw new Error(result.error ?? 'Reconnect failed')
      await get().loadServers()
      toast.success(server ? `Reconnected to ${server.name}` : 'Reconnected')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Reconnect failed'
      toast.error(msg)
      set({ error: msg })
      throw e
    } finally {
      set((s) => ({
        pendingServerActions: setServerPending(s.pendingServerActions, serverId, null)
      }))
    }
  },

  selectServer: (id) => set({ selectedServerId: id }),

  loadProjects: async (serverId) => {
    const result = await window.electronAPI.vps.listProjects(serverId)
    if (result.success && result.data) set({ projects: result.data })
  },

  createProject: async (input) => {
    const result = await window.electronAPI.vps.createProject(input)
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to create project')
      throw new Error(result.error ?? 'Failed to create project')
    }
    await get().loadProjects(input.serverId)
    toast.success(`Project "${input.name}" created`)
    return result.data
  },

  deleteProject: async (id) => {
    const project = get().projects.find((p) => p.id === id)
    const result = await window.electronAPI.vps.deleteProject(id)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete project')
      throw new Error(result.error)
    }
    const serverId = get().selectedServerId ?? undefined
    await get().loadProjects(serverId)
    toast.success(project ? `"${project.name}" removed` : 'Project removed')
  },

  executeCommand: async (serverId, command) => {
    const result = await window.electronAPI.vps.execute(serverId, command)
    if (!result.success || !result.data) {
      const msg = result.error ?? 'Command failed'
      get().appendTerminalLog(serverId, `$ ${command}\nError: ${msg}\n`)
      toast.error(msg)
      throw new Error(msg)
    }
    get().appendTerminalLog(serverId, `$ ${command}\n${result.data.stdout}${result.data.stderr}`)
    await get().loadAuditLog(serverId)
    return `${result.data.stdout}${result.data.stderr}`
  },

  loadAuditLog: async (serverId) => {
    const result = await window.electronAPI.vps.getAuditLog(serverId)
    if (result.success && result.data) set({ auditLog: result.data })
  },

  appendTerminalLog: (serverId, chunk) => {
    set((s) => ({
      terminalLogs: {
        ...s.terminalLogs,
        [serverId]: (s.terminalLogs[serverId] ?? '') + chunk
      }
    }))
  },

  clearTerminalLog: (serverId) => {
    set((s) => ({
      terminalLogs: { ...s.terminalLogs, [serverId]: '' }
    }))
  },

  setActiveDeployment: (deployment) => set({ activeDeployment: deployment }),

  clearError: () => set({ error: null }),

  subscribeToEvents: () => {
    const unsubLog = window.electronAPI.vps.onLogChunk(({ serverId, chunk }) => {
      get().appendTerminalLog(serverId, chunk)
    })
    const unsubDeploy = window.electronAPI.vps.onDeployUpdate((deployment) => {
      get().setActiveDeployment(deployment)
      if (deployment.status === 'success') toast.success('Deployment completed successfully')
      if (deployment.status === 'failed') toast.error('Deployment failed')
    })
    const unsubStatus = window.electronAPI.vps.onStatusChange(({ serverId, status, lastError }) => {
      set((s) => ({
        servers: s.servers.map((srv) => (srv.id === serverId ? { ...srv, status } : srv))
      }))
      if (status === 'error') {
        const server = get().servers.find((srv) => srv.id === serverId)
        toast.error(
          `${server?.name ?? 'Server'} connection lost${lastError ? `: ${lastError}` : ''}`
        )
      }
    })
    return () => {
      unsubLog()
      unsubDeploy()
      unsubStatus()
    }
  }
}))
