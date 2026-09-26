import type { EnvVariable } from '@shared/types/vps'

export async function fetchEnv(serverId: string, filePath: string): Promise<EnvVariable[]> {
  const result = await window.electronAPI.vps.fetchEnv(serverId, filePath)
  if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to fetch env')
  return result.data
}

export async function updateEnv(
  serverId: string,
  filePath: string,
  variables: EnvVariable[]
): Promise<{ backupPath: string }> {
  const result = await window.electronAPI.vps.updateEnv(serverId, filePath, variables)
  if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to update env')
  return result.data
}
