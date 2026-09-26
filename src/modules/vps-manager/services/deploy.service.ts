import type { VPSDeployment } from '../types/project.types'

export async function runPipeline(serverId: string, projectId: string): Promise<VPSDeployment> {
  const result = await window.electronAPI.vps.runDeploy(serverId, projectId)
  if (!result.success || !result.data) throw new Error(result.error ?? 'Deployment failed')
  return result.data
}

export async function getDeployment(deploymentId: string): Promise<VPSDeployment | undefined> {
  const result = await window.electronAPI.vps.getDeploy(deploymentId)
  if (!result.success) throw new Error(result.error ?? 'Failed to get deployment')
  return result.data
}

export function onDeployUpdate(callback: (deployment: VPSDeployment) => void): () => void {
  return window.electronAPI.vps.onDeployUpdate(callback)
}

export function onDeployStepLog(
  callback: (data: { deploymentId: string; stepId: string; chunk: string; stream: string }) => void
): () => void {
  return window.electronAPI.vps.onDeployStepLog(callback)
}
