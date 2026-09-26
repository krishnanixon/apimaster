import type { VoiceToolRiskLevel } from '../types/voice-assistant'

export interface ToolPermissionDecision {
  execute: boolean
  requireConfirmation: boolean
  reason: string
}

export function decideToolPermission(input: {
  riskLevel: VoiceToolRiskLevel
  trustedWriteTools: string[]
  toolName: string
}): ToolPermissionDecision {
  if (input.riskLevel === 'read') {
    return { execute: true, requireConfirmation: false, reason: 'Read tools run automatically.' }
  }

  if (input.riskLevel === 'write') {
    const trusted = input.trustedWriteTools.includes(input.toolName)
    if (trusted) {
      return { execute: true, requireConfirmation: false, reason: 'Write tool is marked trusted.' }
    }
    return {
      execute: false,
      requireConfirmation: true,
      reason: 'Write tools require confirmation unless trusted.'
    }
  }

  return {
    execute: false,
    requireConfirmation: true,
    reason: 'Destructive tools always require confirmation.'
  }
}

export function confirmationMessage(toolName: string, riskLevel: VoiceToolRiskLevel): string {
  if (riskLevel === 'destructive') {
    return `This action is destructive (${toolName}) and cannot be undone. Do you want me to continue?`
  }
  if (riskLevel === 'write') {
    return `This will change something on your device (${toolName}). Do you want me to continue?`
  }
  return `Allow ${toolName}?`
}
