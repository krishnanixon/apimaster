import { v4 as uuidv4 } from 'uuid'
import type { ApiSpec, ApiSpecEndpoint, AiGeneratedTest } from '../../types/ai-engineer'
import { riskLevelForCategory } from './execution-policy'

function absoluteUrl(baseUrl: string, path: string): string {
  if (path.startsWith('http')) return path
  const base = baseUrl.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

function baselineFunctionalTest(analysisId: string, endpoint: ApiSpecEndpoint, baseUrl: string): AiGeneratedTest {
  const expected = endpoint.responses.some((r) => r.status.startsWith('4'))
    ? [400, 401, 403, 404, 422]
    : [200, 201, 202, 204]
  return {
    id: uuidv4(),
    analysisId,
    endpointId: endpoint.id,
    name: `${endpoint.method} ${endpoint.path} — reachable`,
    method: endpoint.method,
    url: absoluteUrl(baseUrl, endpoint.path),
    headers: {},
    query: {},
    bodyType: 'none',
    expectedStatus: expected,
    assertions: [{ type: 'status', values: expected }],
    reason: 'Baseline connectivity and status check derived from the API specification.',
    riskLevel: riskLevelForCategory('functional', endpoint.method),
    category: 'functional',
    requiresApproval: false,
    aiGenerated: false
  }
}

function baselineAuthTest(analysisId: string, endpoint: ApiSpecEndpoint, baseUrl: string): AiGeneratedTest | null {
  if (!endpoint.securityRequired) return null
  return {
    id: uuidv4(),
    analysisId,
    endpointId: endpoint.id,
    name: `${endpoint.method} ${endpoint.path} — missing auth`,
    method: endpoint.method,
    url: absoluteUrl(baseUrl, endpoint.path),
    headers: {},
    query: {},
    bodyType: 'none',
    expectedStatus: [401, 403],
    assertions: [{ type: 'status', values: [401, 403] }],
    reason: 'Protected endpoint should reject unauthenticated access.',
    riskLevel: 'low',
    category: 'auth',
    requiresApproval: SAFE_METHOD(endpoint.method),
    aiGenerated: false
  }
}

function SAFE_METHOD(method: ApiSpecEndpoint['method']): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

export function generateBaselineTests(analysisId: string, spec: ApiSpec): AiGeneratedTest[] {
  const tests: AiGeneratedTest[] = []
  for (const endpoint of spec.endpoints) {
    tests.push(baselineFunctionalTest(analysisId, endpoint, spec.baseUrl))
    const auth = baselineAuthTest(analysisId, endpoint, spec.baseUrl)
    if (auth) tests.push(auth)
  }
  return tests
}
