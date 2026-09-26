import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { EnvVariable, VPSProjectInput, VPSServerInput } from '@shared/types/vps'
import { vpsRepository } from '../vps-manager/vps.repository'
import { vpsService } from '../vps-manager/vps.service'
import { inspectSshKey, normalizeServerInput, hydrateKeyFromPath, credentialsFromInput, readAndInspectKeyFile } from '../vps-manager/ssh-key'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'VPSIPC')
  return { success: false, error }
}

export function registerVPSHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.VPS_SERVER_LIST, async () => {
    try {
      const servers = vpsRepository.listServers()
      const sessions = vpsService.getSessions()
      const merged = servers.map((s) => {
        const session = sessions.find((sess) => sess.serverId === s.id)
        return { ...s, status: session?.status ?? 'disconnected' }
      })
      return success(merged)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list servers')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_SERVER_GET, async (_e, id: string) => {
    try {
      return success(vpsRepository.getServer(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_SERVER_CREATE, async (_e, input: VPSServerInput) => {
    try {
      const normalized = normalizeServerInput(input)
      if (normalized.authType !== 'agent') credentialsFromInput(normalized)
      return success(vpsRepository.createServer(normalized))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_SERVER_UPDATE, async (_e, id: string, input: Partial<VPSServerInput>) => {
    try {
      return success(vpsRepository.updateServer(id, hydrateKeyFromPath(input)))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_SERVER_DELETE, async (_e, id: string) => {
    try {
      vpsService.disconnect(id)
      return success(vpsRepository.deleteServer(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete server')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_CONNECT, async (_e, serverId: string) => {
    try {
      await vpsService.connect(serverId)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Connection failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_DISCONNECT, async (_e, serverId: string) => {
    try {
      vpsService.disconnect(serverId)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Disconnect failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_RECONNECT, async (_e, serverId: string) => {
    try {
      await vpsService.reconnect(serverId)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Reconnect failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_PICK_KEY_FILE, async (_e, passphrase?: string) => {
    try {
      const win = getMainWindow()
      const options = {
        title: 'Select PEM or SSH private key',
        filters: [
          { name: 'SSH private keys', extensions: ['pem', 'key', 'ppk', 'openssh'] },
          { name: 'PEM (AWS, DigitalOcean, Lightsail)', extensions: ['pem'] },
          { name: 'PuTTY private key', extensions: ['ppk'] },
          { name: 'All files', extensions: ['*'] }
        ],
        properties: ['openFile'] as Array<'openFile'>
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return success(null)
      return success(readAndInspectKeyFile(result.filePaths[0], passphrase))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read key file')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_INSPECT_KEY, async (_e, content: string, passphrase?: string) => {
    try {
      return success(inspectSshKey(content, passphrase))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to inspect key')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_TEST_CONNECTION, async (_e, input: VPSServerInput) => {
    try {
      await vpsService.testConnection(normalizeServerInput(input))
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Connection test failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_EXECUTE, async (_e, serverId: string, command: string) => {
    try {
      return success(await vpsService.execute(serverId, command))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Command failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_SESSIONS, async () => {
    try {
      return success(vpsService.getSessions())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get sessions')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_METRICS, async (_e, serverId: string) => {
    try {
      return success(await vpsService.getMetrics(serverId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to fetch metrics')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_AUDIT_LOG, async (_e, serverId?: string) => {
    try {
      return success(vpsService.getAuditLog(serverId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get audit log')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_PROJECT_LIST, async (_e, serverId?: string) => {
    try {
      return success(vpsRepository.listProjects(serverId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list projects')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_PROJECT_CREATE, async (_e, input: VPSProjectInput) => {
    try {
      return success(vpsRepository.createProject(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_PROJECT_UPDATE, async (_e, id: string, input: Partial<VPSProjectInput>) => {
    try {
      return success(vpsRepository.updateProject(id, input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_PROJECT_DELETE, async (_e, id: string) => {
    try {
      return success(vpsRepository.deleteProject(id))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete project')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_PM2_LIST, async (_e, serverId: string) => {
    try {
      return success(await vpsService.listPM2(serverId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list PM2 processes')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.VPS_PM2_ACTION,
    async (_e, serverId: string, action: 'restart' | 'reload' | 'stop' | 'delete', name: string) => {
      try {
        return success(await vpsService.pm2Action(serverId, action, name))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'PM2 action failed')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.VPS_PM2_LOGS, async (_e, serverId: string, name: string) => {
    try {
      await vpsService.streamPM2Logs(serverId, name)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to stream logs')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_ENV_FETCH, async (_e, serverId: string, filePath: string) => {
    try {
      return success(await vpsService.fetchEnv(serverId, filePath))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to fetch env')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.VPS_ENV_UPDATE,
    async (_e, serverId: string, filePath: string, variables: EnvVariable[]) => {
      try {
        return success(await vpsService.updateEnv(serverId, filePath, variables))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to update env')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.VPS_FILE_LIST, async (_e, serverId: string, dirPath: string) => {
    try {
      return success(await vpsService.listDirectory(serverId, dirPath))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list directory')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_FILE_READ, async (_e, serverId: string, filePath: string) => {
    try {
      return success(await vpsService.readFile(serverId, filePath))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read file')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_FILE_WRITE, async (_e, serverId: string, filePath: string, content: string) => {
    try {
      await vpsService.writeFile(serverId, filePath, content)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to write file')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_DEPLOY_RUN, async (_e, serverId: string, projectId: string) => {
    try {
      return success(await vpsService.runPipeline(serverId, projectId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Deployment failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VPS_DEPLOY_GET, async (_e, deploymentId: string) => {
    try {
      return success(vpsService.getDeployment(deploymentId))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to get deployment')
    }
  })
}
