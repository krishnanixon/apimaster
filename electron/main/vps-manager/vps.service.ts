import {
  quoteRemote,
  remoteCommand,
  readRemoteFile,
  writeRemoteFile,
  WINDOWS_METRICS,
  listWindowsDirectory
} from './remote-platform'
import { randomUUID } from 'crypto'
import type {
  CommandResult,
  DeploymentStep,
  EnvVariable,
  FileEntry,
  PM2Process,
  VPSDeployment,
  VPSProject,
  VPSServerInput,
  VPSServerMetrics
} from '@shared/types/vps'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { connectionManager } from '@vps/core/ConnectionManager'
import { decryptCredential } from './vps-crypto'
import { vpsRepository } from './vps.repository'
import { credentialsFromInput, resolveSshAgentSocket } from './ssh-key'
import { broadcastToWorkbench } from '../windows/window-manager'

function emitLog(serverId: string, chunk: string, stream: 'stdout' | 'stderr'): void {
  broadcastToWorkbench(IPC_CHANNELS.VPS_LOG_CHUNK, { serverId, chunk, stream })
}

// Reflect out-of-band status changes (dropped connections, keepalive failures)
// back into persisted state and the renderer so the UI never shows a stale status.
connectionManager.onStatusChange((serverId, status, lastError) => {
  if (serverId.startsWith('probe-')) return
  vpsRepository.updateServerStatus(serverId, status)
  broadcastToWorkbench(IPC_CHANNELS.VPS_STATUS_CHANGE, { serverId, status, lastError })
})

const activeDeployments = new Map<string, VPSDeployment>()

function getCredentials(serverId: string) {
  const server = vpsRepository.getServerWithCredentials(serverId)
  if (!server) throw new Error('Server not found')
  const hostKey = `${server.host}:${server.port}`
  const verifyHostKey = (fingerprint: string): boolean => {
    const known = vpsRepository.getKnownHostKey(hostKey)
    if (!known) {
      vpsRepository.saveKnownHostKey(hostKey, fingerprint)
      return true
    }
    return known === fingerprint
  }

  if (server.authType === 'agent') {
    return {
      host: server.host,
      port: server.port,
      username: server.username,
      agent: resolveSshAgentSocket(server.agentKind),
      verifyHostKey
    }
  }

  if (!server.encryptedCredential) throw new Error('Server credentials not found')
  const creds = decryptCredential(server.encryptedCredential)
  return {
    host: server.host,
    port: server.port,
    username: server.username,
    password: creds.password,
    privateKey: creds.sshKey,
    passphrase: creds.passphrase,
    // Trust-on-first-use host key pinning: remember the fingerprint on first
    // connect and reject silent changes (potential MITM) on later connects.
    verifyHostKey
  }
}

async function ensureConnected(serverId: string): Promise<void> {
  const status = connectionManager.getStatus(serverId)
  if (status === 'connected') return
  const credentials = getCredentials(serverId)
  vpsRepository.updateServerStatus(serverId, 'reconnecting')
  try {
    await connectionManager.connect(serverId, credentials)
    vpsRepository.updateServerStatus(serverId, 'connected')
  } catch (err) {
    vpsRepository.updateServerStatus(serverId, 'error')
    throw err
  }
}

export class VPSService {
  private platform(serverId: string) {
    const server = vpsRepository.getServer(serverId)
    if (!server) throw new Error('Server not found')
    return server.os ?? 'linux'
  }

  private async checked(serverId: string, command: string): Promise<CommandResult> {
    const result = await this.execute(serverId, command)
    if (result.exitCode !== 0)
      throw new Error(result.stderr.trim() || `Remote command failed (exit ${result.exitCode})`)
    return result
  }

  async connect(serverId: string): Promise<void> {
    await ensureConnected(serverId)
  }

  disconnect(serverId: string): void {
    connectionManager.disconnect(serverId)
    vpsRepository.updateServerStatus(serverId, 'disconnected')
  }

  async reconnect(serverId: string): Promise<void> {
    const credentials = getCredentials(serverId)
    vpsRepository.updateServerStatus(serverId, 'reconnecting')
    try {
      await connectionManager.reconnect(serverId, credentials)
      vpsRepository.updateServerStatus(serverId, 'connected')
    } catch (err) {
      vpsRepository.updateServerStatus(serverId, 'error')
      throw err
    }
  }

  async execute(serverId: string, command: string): Promise<CommandResult> {
    await ensureConnected(serverId)
    return connectionManager.execute(
      serverId,
      remoteCommand(command, this.platform(serverId)),
      command
    )
  }

  getSessions() {
    return connectionManager.listSessions()
  }

  async getMetrics(serverId: string): Promise<VPSServerMetrics> {
    await ensureConnected(serverId)
    if (this.platform(serverId) === 'windows') {
      const result = await this.checked(serverId, WINDOWS_METRICS)
      return { ...JSON.parse(result.stdout), serverId, fetchedAt: new Date().toISOString() }
    }
    const result = await this.checked(serverId, METRICS_COMMAND)
    return parseMetrics(serverId, result.stdout)
  }

  getAuditLog(serverId?: string) {
    return connectionManager.getAuditLog(serverId)
  }

  async testConnection(input: VPSServerInput): Promise<void> {
    const credentials = credentialsFromInput(input)
    const probeId = `probe-${randomUUID()}`
    try {
      await connectionManager.connect(probeId, credentials)
      const result = await connectionManager.execute(
        probeId,
        remoteCommand(
          input.os === 'windows' ? '$PSVersionTable.PSVersion.ToString()' : 'uname -s',
          input.os
        )
      )
      if (result.exitCode !== 0)
        throw new Error('SSH connected, but the selected operating system shell is unavailable')
    } finally {
      connectionManager.disconnect(probeId)
    }
  }

  async listPM2(serverId: string): Promise<PM2Process[]> {
    const result = await this.checked(serverId, 'pm2 jlist')
    try {
      const parsed = JSON.parse(result.stdout) as Array<{
        pm_id: number
        name: string
        pm2_env?: { status?: string; restart_time?: number; pm_uptime?: number }
        monit?: { cpu?: number; memory?: number }
      }>
      return parsed.map((p) => ({
        id: p.pm_id,
        name: p.name,
        status: p.pm2_env?.status ?? 'unknown',
        cpu: `${p.monit?.cpu ?? 0}%`,
        memory: `${Math.round((p.monit?.memory ?? 0) / 1024 / 1024)}MB`,
        uptime: p.pm2_env?.pm_uptime ? new Date(p.pm2_env.pm_uptime).toISOString() : '-',
        restarts: p.pm2_env?.restart_time ?? 0
      }))
    } catch {
      throw new Error(
        'Could not read PM2 processes. Check that PM2 is installed and available in the SSH PATH.'
      )
    }
  }

  async pm2Action(
    serverId: string,
    action: 'restart' | 'reload' | 'stop' | 'delete',
    name: string
  ): Promise<CommandResult> {
    if (!['restart', 'reload', 'stop', 'delete'].includes(action))
      throw new Error('Invalid PM2 action')
    return this.checked(serverId, `pm2 ${action} ${quoteRemote(name, this.platform(serverId))}`)
  }

  async streamPM2Logs(serverId: string, name: string): Promise<void> {
    await ensureConnected(serverId)
    await connectionManager.executeStream(
      serverId,
      remoteCommand(
        `pm2 logs ${quoteRemote(name, this.platform(serverId))} --lines 100 --nostream`,
        this.platform(serverId)
      ),
      (chunk, stream) => emitLog(serverId, chunk, stream)
    )
  }

  async fetchEnv(serverId: string, filePath: string): Promise<EnvVariable[]> {
    return parseEnvFile(await this.readFile(serverId, filePath))
  }

  async updateEnv(
    serverId: string,
    filePath: string,
    variables: EnvVariable[]
  ): Promise<{ backupPath: string }> {
    const backupPath = `${filePath}.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`
    const os = this.platform(serverId)
    const source = quoteRemote(filePath, os)
    const dest = quoteRemote(backupPath, os)
    await this.checked(
      serverId,
      os === 'windows'
        ? `Copy-Item -LiteralPath ${source} -Destination ${dest}`
        : `cp -- ${source} ${dest}`
    )
    await this.writeFile(serverId, filePath, serializeEnvFile(variables))
    return { backupPath }
  }

  async listDirectory(serverId: string, dirPath: string): Promise<FileEntry[]> {
    const os = this.platform(serverId)
    const result = await this.checked(
      serverId,
      os === 'windows'
        ? listWindowsDirectory(dirPath)
        : `ls -la --time-style=+%Y-%m-%dT%H:%M:%S -- ${quoteRemote(dirPath)}`
    )
    const entries: FileEntry[] =
      os === 'windows' ? JSON.parse(result.stdout) : parseLsOutput(dirPath, result.stdout)
    return entries.sort(
      (a, b) =>
        Number(b.type === 'directory') - Number(a.type === 'directory') ||
        a.name.localeCompare(b.name)
    )
  }

  async readFile(serverId: string, filePath: string): Promise<string> {
    return (await this.checked(serverId, readRemoteFile(filePath, this.platform(serverId)))).stdout
  }

  async writeFile(serverId: string, filePath: string, content: string): Promise<void> {
    await this.checked(serverId, writeRemoteFile(filePath, content, this.platform(serverId)))
  }

  async runPipeline(serverId: string, projectId: string): Promise<VPSDeployment> {
    const project = vpsRepository.getProject(projectId)
    if (!project) throw new Error('Project not found')
    if (project.serverId !== serverId) throw new Error('Project does not belong to this server')

    await ensureConnected(serverId)
    const os = this.platform(serverId)
    const deployment: VPSDeployment = {
      id: randomUUID(),
      projectId,
      serverId,
      status: 'running',
      steps: buildPipelineSteps(project).map((step) =>
        step.id === 'restart-pm2'
          ? { ...step, command: `pm2 restart ${quoteRemote(project.pm2Name, os)}` }
          : step
      ),
      logs: '',
      startedAt: new Date().toISOString()
    }

    activeDeployments.set(deployment.id, deployment)
    this.emitDeploymentUpdate(deployment)

    for (const step of deployment.steps) {
      step.status = 'running'
      step.startedAt = new Date().toISOString()
      this.emitDeploymentUpdate(deployment)

      try {
        const exitCode = await connectionManager.executeStream(
          serverId,
          remoteCommand(
            os === 'windows'
              ? `Set-Location -LiteralPath ${quoteRemote(project.path, os)}; ${step.command}`
              : `cd ${quoteRemote(project.path)} && ${step.command}`,
            os
          ),
          (chunk, stream) => {
            step.logs += chunk
            deployment.logs += chunk
            broadcastToWorkbench(IPC_CHANNELS.VPS_DEPLOY_STEP_LOG, {
              deploymentId: deployment.id,
              stepId: step.id,
              chunk,
              stream
            })
          }
        )
        step.finishedAt = new Date().toISOString()
        if (exitCode === 0) {
          step.status = 'success'
        } else {
          step.status = 'failed'
          deployment.status = 'failed'
          deployment.finishedAt = new Date().toISOString()
          this.emitDeploymentUpdate(deployment)
          return deployment
        }
      } catch (err) {
        step.status = 'failed'
        step.logs += `\nError: ${err instanceof Error ? err.message : 'Unknown error'}`
        deployment.status = 'failed'
        deployment.finishedAt = new Date().toISOString()
        this.emitDeploymentUpdate(deployment)
        return deployment
      }
      this.emitDeploymentUpdate(deployment)
    }

    deployment.status = 'success'
    deployment.finishedAt = new Date().toISOString()
    this.emitDeploymentUpdate(deployment)
    return deployment
  }

  getDeployment(id: string): VPSDeployment | undefined {
    return activeDeployments.get(id)
  }

  private emitDeploymentUpdate(deployment: VPSDeployment): void {
    broadcastToWorkbench(IPC_CHANNELS.VPS_DEPLOY_UPDATE, deployment)
  }
}

// Single-shot POSIX-sh snippet that samples CPU (two /proc/stat reads 1s apart),
// memory, disk, uptime and load average, emitting parseable key=value lines.
const METRICS_COMMAND = [
  'MEM=$(free -m 2>/dev/null | awk \'/^Mem:/{print $3","$2}\')',
  'DISK=$(df -P / 2>/dev/null | awk \'NR==2{gsub(/%/,"",$5); print $5}\')',
  "UP=$(awk '{print int($1)}' /proc/uptime 2>/dev/null)",
  "LOAD=$(awk '{print $1}' /proc/loadavg 2>/dev/null)",
  'R1=$(awk \'/^cpu /{print ($2+$3+$4+$5+$6+$7+$8)" "$5}\' /proc/stat 2>/dev/null)',
  'sleep 1',
  'R2=$(awk \'/^cpu /{print ($2+$3+$4+$5+$6+$7+$8)" "$5}\' /proc/stat 2>/dev/null)',
  'echo "mem=$MEM"; echo "disk=$DISK"; echo "uptime=$UP"; echo "load=$LOAD"; echo "cpu1=$R1"; echo "cpu2=$R2"'
].join('; ')

function parseMetrics(serverId: string, output: string): VPSServerMetrics {
  const fields: Record<string, string> = {}
  for (const line of output.split('\n')) {
    const eq = line.indexOf('=')
    if (eq === -1) continue
    fields[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }

  const [memUsed, memTotal] = (fields.mem ?? '0,0').split(',').map((n) => parseInt(n, 10) || 0)
  const [total1, idle1] = (fields.cpu1 ?? '0 0').split(' ').map((n) => parseInt(n, 10) || 0)
  const [total2, idle2] = (fields.cpu2 ?? '0 0').split(' ').map((n) => parseInt(n, 10) || 0)
  const totalDelta = total2 - total1
  const idleDelta = idle2 - idle1
  const cpu =
    totalDelta > 0
      ? Math.max(0, Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)))
      : 0

  return {
    serverId,
    cpu,
    memUsedMb: memUsed,
    memTotalMb: memTotal,
    diskUsedPct: parseInt(fields.disk ?? '0', 10) || 0,
    uptimeSec: parseInt(fields.uptime ?? '0', 10) || 0,
    loadAvg: parseFloat(fields.load ?? '0') || 0,
    fetchedAt: new Date().toISOString()
  }
}

function buildPipelineSteps(project: VPSProject): DeploymentStep[] {
  const steps: DeploymentStep[] = []
  if (project.repoUrl) {
    steps.push({
      id: 'git-pull',
      label: 'Git Pull',
      command: 'git pull origin HEAD',
      status: 'pending',
      logs: ''
    })
  }
  steps.push(
    {
      id: 'install-deps',
      label: 'Install Dependencies',
      command: project.installCommand,
      status: 'pending',
      logs: ''
    },
    {
      id: 'build',
      label: 'Build Project',
      command: project.buildCommand,
      status: 'pending',
      logs: ''
    },
    {
      id: 'restart-pm2',
      label: 'Restart PM2',
      command: `pm2 restart ${project.pm2Name}`,
      status: 'pending',
      logs: ''
    }
  )
  return steps
}

function parseEnvFile(content: string): EnvVariable[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=')
      if (eq === -1) return { key: line, value: '' }
      return { key: line.slice(0, eq), value: line.slice(eq + 1) }
    })
}

function serializeEnvFile(variables: EnvVariable[]): string {
  return variables.map(({ key, value }) => `${key}=${value}`).join('\n') + '\n'
}

function parseLsOutput(basePath: string, output: string): FileEntry[] {
  const entries: FileEntry[] = []
  for (const line of output.split('\n').filter(Boolean)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 7) continue
    const permissions = parts[0]
    const size = parseInt(parts[4], 10)
    const modified = parts[5]
    const name = parts.slice(6).join(' ')
    if (name === '.' || name === '..') continue
    const isDir = permissions.startsWith('d')
    entries.push({
      name,
      path: basePath.endsWith('/') ? `${basePath}${name}` : `${basePath}/${name}`,
      type: isDir ? 'directory' : 'file',
      size: isDir ? undefined : size,
      modified
    })
  }
  return entries
}

export const vpsService = new VPSService()
