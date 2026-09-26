import { describe, it, expect } from 'vitest'
import {
  analyzeFlow,
  computeFlowComplexity,
  detectMissingFlows,
  explainFlowGraph,
  generateFlowArchitecture,
  parseFlowGraph,
  validateFlowGraph
} from '../shared/lib/flow-intelligence'

const authFlowNodes = JSON.stringify([
  { id: 'start', data: { label: 'Start', nodeType: 'start', shape: 'circle', category: 'flowchart' } },
  { id: 'login', data: { label: 'Login', nodeType: 'process', shape: 'rounded', category: 'flowchart' } },
  { id: 'auth', data: { label: 'Validate Token', nodeType: 'auth', shape: 'rounded', category: 'api' } },
  { id: 'api', data: { label: 'Fetch Profile', nodeType: 'endpoint', shape: 'rounded', category: 'api' } },
  { id: 'ok', data: { label: 'Return Profile', nodeType: 'process', shape: 'rounded', category: 'flowchart' } },
  { id: 'err', data: { label: 'Show Error', nodeType: 'process', shape: 'rounded', category: 'flowchart' } },
  { id: 'end', data: { label: 'End', nodeType: 'end', shape: 'circle', category: 'flowchart' } }
])

const authFlowEdges = JSON.stringify([
  { id: 'e1', source: 'start', target: 'login', data: {} },
  { id: 'e2', source: 'login', target: 'auth', data: {} },
  { id: 'e3', source: 'auth', target: 'api', data: { label: 'valid' } },
  { id: 'e3b', source: 'auth', target: 'err', data: { label: 'invalid' } },
  { id: 'e4', source: 'api', target: 'ok', data: { label: 'success' } },
  { id: 'e5', source: 'api', target: 'err', data: { label: 'failure' } },
  { id: 'e6', source: 'ok', target: 'end', data: {} },
  { id: 'e7', source: 'err', target: 'end', data: {} }
])

describe('flow-intelligence', () => {
  it('parses flow graph nodes and edges', () => {
    const graph = parseFlowGraph(authFlowNodes, authFlowEdges)
    expect(graph.nodes).toHaveLength(7)
    expect(graph.edges).toHaveLength(8)
  })

  it('validates a complete flow with high score', () => {
    const graph = parseFlowGraph(authFlowNodes, authFlowEdges)
    const result = validateFlowGraph(graph)
    expect(result.validationScore).toBeGreaterThan(50)
    expect(result.issues.filter((i) => i.severity === 'CRITICAL')).toHaveLength(0)
  })

  it('flags missing error paths on external nodes', () => {
    const nodes = JSON.stringify([
      { id: 'start', data: { label: 'Start', nodeType: 'start', shape: 'circle', category: 'flowchart' } },
      { id: 'api', data: { label: 'Call Payment API', nodeType: 'endpoint', shape: 'rounded', category: 'api' } },
      { id: 'end', data: { label: 'End', nodeType: 'end', shape: 'circle', category: 'flowchart' } }
    ])
    const edges = JSON.stringify([
      { id: 'e1', source: 'start', target: 'api', data: {} },
      { id: 'e2', source: 'api', target: 'end', data: { label: 'success' } }
    ])
    const graph = parseFlowGraph(nodes, edges)
    const result = validateFlowGraph(graph)
    expect(result.issues.some((i) => i.type === 'MISSING_ERROR_PATH')).toBe(true)
  })

  it('detects missing authentication for protected flows', () => {
    const nodes = JSON.stringify([
      { id: 'api', data: { label: 'Create Order', nodeType: 'endpoint', category: 'api' } },
      { id: 'db', data: { label: 'Save Order', nodeType: 'table', category: 'database' } }
    ])
    const edges = JSON.stringify([{ id: 'e1', source: 'api', target: 'db', data: {} }])
    const missing = detectMissingFlows(parseFlowGraph(nodes, edges))
    expect(missing.some((m) => m.category === 'authentication')).toBe(true)
  })

  it('computes complexity level', () => {
    const graph = parseFlowGraph(authFlowNodes, authFlowEdges)
    const complexity = computeFlowComplexity(graph)
    expect(complexity.complexityScore).toBeGreaterThan(0)
    expect(['SIMPLE', 'MEDIUM', 'COMPLEX']).toContain(complexity.level)
  })

  it('generates architecture artifacts from flow', () => {
    const graph = parseFlowGraph(authFlowNodes, authFlowEdges)
    const architecture = generateFlowArchitecture(graph)
    expect(architecture.apis.length).toBeGreaterThan(0)
    expect(architecture.services.controllers.length).toBeGreaterThan(0)
  })

  it('explains execution sequence', () => {
    const graph = parseFlowGraph(authFlowNodes, authFlowEdges)
    const explanation = explainFlowGraph(graph)
    expect(explanation.executionSequence[0]).toBe('Start')
    expect(explanation.externalDependencies.length).toBeGreaterThan(0)
  })

  it('runs full flow analysis', () => {
    const analysis = analyzeFlow(authFlowNodes, authFlowEdges)
    expect(analysis.validation).toBeDefined()
    expect(analysis.complexity).toBeDefined()
    expect(Array.isArray(analysis.missingFlows)).toBe(true)
  })
})
