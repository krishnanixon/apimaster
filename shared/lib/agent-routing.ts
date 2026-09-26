import type { AIRequestType } from '../types/ai'
import type { AgentMode } from '../types/agent'

/** Map agent mode onto the existing LLM gateway request types. */
export function agentRequestType(mode: AgentMode): AIRequestType {
  if (mode === 'review' || mode === 'plan') return 'CODE_REVIEW'
  if (mode === 'ask') return 'CHAT'
  if (mode === 'debug') return 'CODE_GENERATION'
  return 'CODE_GENERATION'
}

export function agentTemperature(mode: AgentMode): number {
  if (mode === 'review' || mode === 'plan') return 0.2
  if (mode === 'debug' || mode === 'edit') return 0.2
  return 0.3
}
