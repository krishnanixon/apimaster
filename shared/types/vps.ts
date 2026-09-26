export type ServerStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error'
export type ServerOS = 'linux' | 'windows'
export type AuthType = 'password' | 'sshKey' | 'agent'
export type SshKeyFormat = 'pem' | 'openssh' | 'pkcs8' | 'ppk' | 'public' | 'unknown'
export type SshAgentKind = 'openssh' | 'pageant'

export interface VPSServer {
  id: string
  name: string
  host: string
  /** Legacy profiles default to Linux. Windows uses PowerShell over OpenSSH. */
  os?: ServerOS
  port: number
  username: string
  authType: AuthType
  /** Encrypted credential blob — never sent to renderer */
  encryptedCredential?: string
  /** Original key filename for display, e.g. "lightsail.pem" */
  keyFileName?: string
  /** Detected private-key format when authType is sshKey */
  keyFormat?: SshKeyFormat
  /** Which local agent to use when authType is agent */
  agentKind?: SshAgentKind
  status: ServerStatus
  createdAt: string
  updatedAt: string
}

export interface VPSServerInput {
  name: string
  host: string
  /** Legacy profiles default to Linux. Windows uses PowerShell over OpenSSH. */
  os?: ServerOS
  port: number
  username: string
  authType: AuthType
  password?: string
  sshKey?: string
  passphrase?: string
  /** Absolute path — main process reads the key file */
  sshKeyPath?: string
  keyFileName?: string
  agentKind?: SshAgentKind
}

export interface VPSKeyInspectResult {
  format: SshKeyFormat
  /** ssh-rsa, ssh-ed25519, ecdsa-sha2-nistp256, … */
  keyType?: string
  encrypted: boolean
  comment?: string
  fileName?: string
  valid: boolean
  error?: string
}

export interface VPSPickedKey extends VPSKeyInspectResult {
  privateKey: string
}

export interface VPSProject {
  id: string
  serverId: string
  name: string
  path: string
  repoUrl?: string
  pm2Name: string
  buildCommand: string
  installCommand: string
  startCommand: string
  envFilePath: string
  createdAt: string
  updatedAt: string
}

export interface VPSProjectInput {
  serverId: string
  name: string
  path: string
  repoUrl?: string
  pm2Name: string
  buildCommand?: string
  installCommand?: string
  startCommand?: string
  envFilePath?: string
}

export interface VPSSessionInfo {
  serverId: string
  status: ServerStatus
  connectedAt?: string
  lastError?: string
  activeProcesses: number
}

/** Live resource usage sampled from a connected server. */
export interface VPSServerMetrics {
  serverId: string
  cpu: number
  memUsedMb: number
  memTotalMb: number
  diskUsedPct: number
  uptimeSec: number
  loadAvg: number
  fetchedAt: string
}

/** Pushed to the renderer when a session's status changes out-of-band (e.g. dropped). */
export interface VPSStatusChange {
  serverId: string
  status: ServerStatus
  lastError?: string
}

export type DeploymentStepId = 'git-pull' | 'install-deps' | 'build' | 'restart-pm2'
export type DeploymentStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export interface DeploymentStep {
  id: DeploymentStepId
  label: string
  command: string
  status: DeploymentStepStatus
  logs: string
  startedAt?: string
  finishedAt?: string
}

export type DeploymentStatus = 'pending' | 'running' | 'success' | 'failed'

export interface VPSDeployment {
  id: string
  projectId: string
  serverId: string
  status: DeploymentStatus
  steps: DeploymentStep[]
  logs: string
  startedAt: string
  finishedAt?: string
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface PM2Process {
  id: number
  name: string
  status: string
  cpu: string
  memory: string
  uptime: string
  restarts: number
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
}

export interface EnvVariable {
  key: string
  value: string
}

export interface AuditLogEntry {
  id: string
  serverId: string
  command: string
  timestamp: string
  exitCode?: number
  destructive: boolean
}

export interface SmartIntentResult {
  intent: string
  command?: string
  action?: 'deploy' | 'env-editor' | 'pm2-logs' | 'pm2-restart'
  requiresConfirmation: boolean
  confirmationReason?: string
}

export interface TerminalMode {
  mode: 'raw' | 'smart'
}
