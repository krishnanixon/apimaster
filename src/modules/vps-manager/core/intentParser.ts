import type { SmartIntentResult } from '../types/session.types'

const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf/i,
  /shutdown/i,
  /\b(Remove-Item|Restart-Computer|Stop-Computer|Format-Volume|Clear-Disk)\b/i,
  /reboot/i,
  /pm2\s+delete\s+all/i,
  /mkfs/i,
  /dd\s+if=/i
]

export function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(command))
}

export function parseSmartIntent(input: string, pm2Name?: string): SmartIntentResult {
  const trimmed = input.trim().toLowerCase()
  const processName = pm2Name ?? 'app'

  if (/^(restart|reload)\s+(app|service|process)/.test(trimmed) || trimmed === 'restart app') {
    const cmd = `pm2 restart ${processName}`
    return {
      intent: 'restart-app',
      command: cmd,
      action: 'pm2-restart',
      requiresConfirmation: false
    }
  }

  if (/^(show|view|tail)\s+logs/.test(trimmed) || trimmed === 'show logs' || trimmed === 'logs') {
    const cmd = `pm2 logs ${processName} --lines 50 --nostream`
    return { intent: 'show-logs', command: cmd, action: 'pm2-logs', requiresConfirmation: false }
  }

  if (/^deploy(\s+project)?$/.test(trimmed) || trimmed === 'deploy project') {
    return { intent: 'deploy-project', action: 'deploy', requiresConfirmation: false }
  }

  if (/^(update|edit|open)\s+env/.test(trimmed) || trimmed === 'update env') {
    return { intent: 'update-env', action: 'env-editor', requiresConfirmation: false }
  }

  if (/^pm2\s+list/.test(trimmed) || trimmed === 'list processes') {
    return { intent: 'pm2-list', command: 'pm2 list', requiresConfirmation: false }
  }

  if (/^pm2\s+stop/.test(trimmed)) {
    const cmd = `pm2 stop ${processName}`
    return { intent: 'pm2-stop', command: cmd, requiresConfirmation: false }
  }

  if (/^pm2\s+delete/.test(trimmed)) {
    const cmd = `pm2 delete ${processName}`
    return {
      intent: 'pm2-delete',
      command: cmd,
      requiresConfirmation: true,
      confirmationReason: `This will delete the PM2 process "${processName}".`
    }
  }

  if (isDestructiveCommand(input)) {
    return {
      intent: 'destructive',
      command: input,
      requiresConfirmation: true,
      confirmationReason: 'This command may cause irreversible changes to the server.'
    }
  }

  return { intent: 'raw', command: input, requiresConfirmation: isDestructiveCommand(input) }
}
