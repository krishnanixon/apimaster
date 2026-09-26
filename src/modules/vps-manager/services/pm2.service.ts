import type { PM2Process } from '@shared/types/vps'
import type { CommandResult } from '../types/session.types'

export async function listPM2(serverId: string): Promise<PM2Process[]> {
  const result = await window.electronAPI.vps.listPM2(serverId)
  if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to list PM2')
  return result.data
}

export async function pm2Action(
  serverId: string,
  action: 'restart' | 'reload' | 'stop' | 'delete',
  name: string
): Promise<CommandResult> {
  const result = await window.electronAPI.vps.pm2Action(serverId, action, name)
  if (!result.success || !result.data) throw new Error(result.error ?? 'PM2 action failed')
  return result.data
}

export async function streamPM2Logs(serverId: string, name: string): Promise<void> {
  const result = await window.electronAPI.vps.streamPM2Logs(serverId, name)
  if (!result.success) throw new Error(result.error ?? 'Failed to stream logs')
}
