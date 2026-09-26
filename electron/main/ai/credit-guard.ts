import { isCloudProviderId } from '@shared/lib/ai-routing'
import { applyConnectionCreditLimits } from '@shared/lib/ai-credit-guard'
import type { AIProviderConfig, AIProviderId } from '@shared/types'
import { usageRepository } from '../repositories/usage.repository'
import type { AIGenerateOptions } from './types'

let reservedTokens = 0
const generatingProjects = new Set<string>()

export class CreditBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CreditBudgetError'
  }
}

export function prepareGenerateOptions(
  options: AIGenerateOptions,
  config: AIProviderConfig
): AIGenerateOptions {
  return applyConnectionCreditLimits(options, config)
}

export async function acquireTokenReservation(
  config: AIProviderConfig,
  providerId: AIProviderId,
  maxTokens: number | undefined
): Promise<number> {
  const amount = Math.max(0, Math.round(maxTokens ?? 0))
  if (!config.creditGuardEnabled || amount <= 0) return 0
  if (!isCloudProviderId(providerId)) return 0

  const budget = config.dailyTokenBudget
  if (budget > 0) {
    const used = await usageRepository.getTodayTokenTotal()
    if (used + reservedTokens + amount > budget) {
      throw new CreditBudgetError(
        `Daily API token budget reached (${used.toLocaleString()} of ${budget.toLocaleString()} tokens used). ` +
          'Raise the budget in Settings → AI, or wait until tomorrow.'
      )
    }
  }
  reservedTokens += amount
  return amount
}

export function releaseTokenReservation(amount: number): void {
  reservedTokens = Math.max(0, reservedTokens - Math.max(0, amount))
}

export function acquireGenerateLock(projectId: string): void {
  const key = projectId || '_global'
  if (generatingProjects.has(key)) {
    throw new CreditBudgetError(
      'A document is already generating for this project. Wait for it to finish to avoid duplicate API charges.'
    )
  }
  generatingProjects.add(key)
}

export function releaseGenerateLock(projectId: string): void {
  generatingProjects.delete(projectId || '_global')
}
