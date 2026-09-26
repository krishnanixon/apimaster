import type { FileEntry } from '@shared/types/vps'

export async function listDirectory(serverId: string, dirPath: string): Promise<FileEntry[]> {
  const result = await window.electronAPI.vps.listFiles(serverId, dirPath)
  if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to list directory')
  return result.data
}

export async function readFile(serverId: string, filePath: string): Promise<string> {
  const result = await window.electronAPI.vps.readFile(serverId, filePath)
  if (!result.success || result.data === undefined) throw new Error(result.error ?? 'Failed to read file')
  return result.data
}

export async function writeFile(serverId: string, filePath: string, content: string): Promise<void> {
  const result = await window.electronAPI.vps.writeFile(serverId, filePath, content)
  if (!result.success) throw new Error(result.error ?? 'Failed to write file')
}
