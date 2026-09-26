import type { HttpMethod } from '../../types/api-studio'
import type { AiEngineerConfig, AiGeneratedTest, AiTestRiskLevel } from '../../types/ai-engineer'

const SAFE_METHODS = new Set<HttpMethod>(['GET', 'HEAD', 'OPTIONS'])
const MUTATION_METHODS = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE'])

export function testRequiresApproval(
  test: Pick<AiGeneratedTest, 'method' | 'riskLevel'>,
  config: AiEngineerConfig
): boolean {
  if (test.riskLevel === 'high') return true
  if (MUTATION_METHODS.has(test.method) && config.requireApprovalForMutations) return true
  if (SAFE_METHODS.has(test.method) && test.riskLevel === 'low' && config.autoExecuteSafeMethods) {
    return false
  }
  return test.riskLevel !== 'low'
}

export function canAutoRun(test: AiGeneratedTest, config: AiEngineerConfig, approvedMutations: boolean): boolean {
  if (testRequiresApproval(test, config)) return approvedMutations
  return true
}

export function riskLevelForCategory(category: AiGeneratedTest['category'], method: HttpMethod): AiTestRiskLevel {
  if (category === 'auth') return method === 'GET' ? 'low' : 'medium'
  if (category === 'edge') return MUTATION_METHODS.has(method) ? 'medium' : 'low'
  if (MUTATION_METHODS.has(method)) return 'medium'
  return 'low'
}
