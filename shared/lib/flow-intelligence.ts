import type {
  FlowAnalysisResult,
  FlowApiEndpoint,
  FlowArchitectureResult,
  FlowComplexityLevel,
  FlowComplexityResult,
  FlowExplanationResult,
  FlowIssueSeverity,
  FlowValidationIssue,
  FlowValidationResult,
  MissingFlowSuggestion,
  RequirementCoverageResult,
  RequirementFlowGap
} from '../types/flow-intelligence'

export interface ParsedFlowNode {
  id: string
  label: string
  nodeType: string
  category: string
  shape: string
  description: string
  tags: string[]
}

export interface ParsedFlowEdge {
  id: string
  source: string
  target: string
  label: string
  condition: string
}

export interface ParsedFlowGraph {
  nodes: ParsedFlowNode[]
  edges: ParsedFlowEdge[]
}

const START_TYPES = new Set(['start', 'startevent', 'start_event'])
const END_TYPES = new Set(['end', 'endevent', 'end_event'])
const DECISION_TYPES = new Set([
  'decision',
  'gateway',
  'exclusivegateway',
  'parallelgateway',
  'businessrule'
])
const API_TYPES = new Set([
  'endpoint',
  'service',
  'external',
  'webhook',
  'gateway',
  'auth',
  'broker',
  'queue',
  'cache'
])
const DB_TYPES = new Set([
  'database',
  'table',
  'storage',
  'view',
  'procedure',
  'schema',
  'primarykey',
  'foreignkey'
])
const EXTERNAL_CATEGORIES = new Set(['api', 'database'])
const FAILURE_KEYWORDS =
  /\b(error|fail|failure|invalid|reject|denied|timeout|exception|rollback|abort)\b/i
const SUCCESS_KEYWORDS = /\b(success|ok|valid|pass|complete|done|approved)\b/i
const RETRY_KEYWORDS = /\b(retry|again|re-?attempt|backoff)\b/i
const AUTH_KEYWORDS = /\b(auth|login|token|session|credential|permission|authorize)\b/i

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function nodeText(node: ParsedFlowNode): string {
  return [node.label, node.description, node.nodeType, node.category, ...node.tags]
    .join(' ')
    .toLowerCase()
}

export function parseFlowGraph(nodesJson: string, edgesJson: string): ParsedFlowGraph {
  const rawNodes = JSON.parse(nodesJson) as Array<{ id: string; data?: Record<string, unknown> }>
  const rawEdges = JSON.parse(edgesJson) as Array<{
    id: string
    source: string
    target: string
    data?: Record<string, unknown>
  }>

  const nodes = rawNodes.map((n) => {
    const data = n.data ?? {}
    return {
      id: String(n.id),
      label: String(data.label ?? 'Node'),
      nodeType: normalize(String(data.nodeType ?? 'process')),
      category: normalize(String(data.category ?? 'flowchart')),
      shape: normalize(String(data.shape ?? 'rounded')),
      description: String(data.description ?? ''),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : []
    }
  })

  const edges = rawEdges.map((e) => ({
    id: String(e.id),
    source: String(e.source),
    target: String(e.target),
    label: String(e.data?.label ?? ''),
    condition: String(e.data?.condition ?? '')
  }))

  return { nodes, edges }
}

function isStartNode(node: ParsedFlowNode): boolean {
  if (START_TYPES.has(node.nodeType)) return true
  return node.shape === 'circle' && /\bstart\b/i.test(node.label)
}

function isEndNode(node: ParsedFlowNode): boolean {
  if (END_TYPES.has(node.nodeType)) return true
  return node.shape === 'circle' && /\bend\b/i.test(node.label)
}

function isDecisionNode(node: ParsedFlowNode): boolean {
  return DECISION_TYPES.has(node.nodeType) || node.shape === 'diamond'
}

function isApiNode(node: ParsedFlowNode): boolean {
  return EXTERNAL_CATEGORIES.has(node.category) && API_TYPES.has(node.nodeType)
}

function isDbNode(node: ParsedFlowNode): boolean {
  return node.category === 'database' || DB_TYPES.has(node.nodeType) || node.shape === 'cylinder'
}

function isExternalNode(node: ParsedFlowNode): boolean {
  return isApiNode(node) || isDbNode(node) || node.nodeType === 'external'
}

function isErrorNode(node: ParsedFlowNode): boolean {
  return FAILURE_KEYWORDS.test(nodeText(node)) || node.nodeType === 'bug'
}

function edgeText(edge: ParsedFlowEdge): string {
  return `${edge.label} ${edge.condition}`.trim()
}

function isFailureEdge(edge: ParsedFlowEdge): boolean {
  return FAILURE_KEYWORDS.test(edgeText(edge))
}

function isSuccessEdge(edge: ParsedFlowEdge): boolean {
  const text = edgeText(edge)
  return text.length === 0 || SUCCESS_KEYWORDS.test(text) || !FAILURE_KEYWORDS.test(text)
}

function indegree(nodeId: string, edges: ParsedFlowEdge[]): number {
  return edges.filter((e) => e.target === nodeId).length
}

function outdegree(nodeId: string, edges: ParsedFlowEdge[]): number {
  return edges.filter((e) => e.source === nodeId).length
}

function outgoingEdges(nodeId: string, graph: ParsedFlowGraph): ParsedFlowEdge[] {
  return graph.edges.filter((e) => e.source === nodeId)
}

function reachableFromStarts(graph: ParsedFlowGraph): Set<string> {
  const starts = graph.nodes.filter(isStartNode).map((n) => n.id)
  const entryNodes =
    starts.length > 0 ? starts : graph.nodes.filter((n) => indegree(n.id, graph.edges) === 0).map((n) => n.id)

  const visited = new Set<string>()
  const queue = [...entryNodes]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of outgoingEdges(current, graph)) {
      if (!visited.has(edge.target)) queue.push(edge.target)
    }
  }

  return visited
}

function detectCycles(graph: ParsedFlowGraph): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const stack = new Set<string>()
  const path: string[] = []

  const adjacency = new Map<string, string[]>()
  for (const node of graph.nodes) adjacency.set(node.id, [])
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target)

  function dfs(nodeId: string): void {
    visited.add(nodeId)
    stack.add(nodeId)
    path.push(nodeId)

    for (const next of adjacency.get(nodeId) ?? []) {
      if (!visited.has(next)) {
        dfs(next)
      } else if (stack.has(next)) {
        const cycleStart = path.indexOf(next)
        if (cycleStart >= 0) cycles.push(path.slice(cycleStart))
      }
    }

    path.pop()
    stack.delete(nodeId)
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) dfs(node.id)
  }

  return cycles
}

function severityWeight(severity: FlowIssueSeverity): number {
  switch (severity) {
    case 'CRITICAL':
      return 25
    case 'HIGH':
      return 15
    case 'MEDIUM':
      return 8
    case 'LOW':
      return 3
  }
}

export function validateFlowGraph(graph: ParsedFlowGraph): FlowValidationResult {
  const issues: FlowValidationIssue[] = []
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const reachable = reachableFromStarts(graph)
  const starts = graph.nodes.filter(isStartNode)
  const ends = graph.nodes.filter(isEndNode)

  if (graph.nodes.length === 0) {
    return {
      validationScore: 0,
      issues: [
        {
          type: 'INCOMPLETE_DESIGN',
          severity: 'CRITICAL',
          description: 'Flow has no nodes.'
        }
      ]
    }
  }

  if (starts.length === 0) {
    issues.push({
      type: 'MISSING_ENTRY',
      severity: 'HIGH',
      description: 'No explicit start/entry node detected.'
    })
  }

  if (ends.length === 0) {
    issues.push({
      type: 'MISSING_EXIT',
      severity: 'HIGH',
      description: 'No explicit end/exit node detected.'
    })
  }

  for (const node of graph.nodes) {
    const inCount = indegree(node.id, graph.edges)
    const outCount = outdegree(node.id, graph.edges)

    if (!reachable.has(node.id)) {
      issues.push({
        type: 'UNREACHABLE_NODE',
        severity: 'HIGH',
        node: node.id,
        description: `Node "${node.label}" is unreachable from the flow entry.`
      })
    }

    if (inCount === 0 && !isStartNode(node) && graph.nodes.length > 1) {
      issues.push({
        type: 'ORPHAN_NODE',
        severity: 'MEDIUM',
        node: node.id,
        description: `Node "${node.label}" has no incoming edges and is not marked as a start node.`
      })
    }

    if (outCount === 0 && !isEndNode(node)) {
      issues.push({
        type: 'DEAD_END',
        severity: 'MEDIUM',
        node: node.id,
        description: `Node "${node.label}" has no outgoing edges and is not marked as an end node.`
      })
    }

    if (isDecisionNode(node) && outCount < 2) {
      issues.push({
        type: 'INCOMPLETE_BRANCH',
        severity: 'HIGH',
        node: node.id,
        description: `Decision node "${node.label}" must have at least two outgoing branches.`
      })
    }

    if (isExternalNode(node)) {
      const outgoing = outgoingEdges(node.id, graph)
      const hasSuccess = outgoing.some(isSuccessEdge)
      const hasFailure =
        outgoing.some(isFailureEdge) ||
        outgoing.some((e) => {
          const target = nodeById.get(e.target)
          return target ? isErrorNode(target) : false
        })

      if (!hasSuccess) {
        issues.push({
          type: 'MISSING_ERROR_PATH',
          severity: 'CRITICAL',
          node: node.id,
          description: `External node "${node.label}" is missing a success path.`
        })
      }
      if (!hasFailure) {
        issues.push({
          type: 'MISSING_ERROR_PATH',
          severity: 'CRITICAL',
          node: node.id,
          description: `External node "${node.label}" is missing a failure/error path.`
        })
      }
    }
  }

  for (const cycle of detectCycles(graph)) {
    const hasExit = cycle.some((nodeId) => {
      const node = nodeById.get(nodeId)
      return node && (isDecisionNode(node) || node.nodeType === 'loop')
    })
    if (!hasExit) {
      issues.push({
        type: 'UNSAFE_CYCLE',
        severity: 'HIGH',
        description: `Unsafe cycle detected without exit condition: ${cycle
          .map((id) => nodeById.get(id)?.label ?? id)
          .join(' → ')}.`
      })
    }
  }

  const penalty = issues.reduce((sum, issue) => sum + severityWeight(issue.severity), 0)
  const validationScore = Math.max(0, Math.min(100, 100 - penalty))

  return { validationScore, issues }
}

export function detectMissingFlows(graph: ParsedFlowGraph): MissingFlowSuggestion[] {
  const suggestions: MissingFlowSuggestion[] = []
  const hasAuthNode = graph.nodes.some((n) => AUTH_KEYWORDS.test(nodeText(n)) || n.nodeType === 'auth')
  const hasApiOrExternal = graph.nodes.some(isApiNode)
  const hasMutations = graph.nodes.some(
    (n) =>
      isDbNode(n) ||
      /\b(create|update|delete|insert|save|write|mutate|persist)\b/i.test(nodeText(n))
  )
  const hasValidation = graph.nodes.some((n) => /\b(validat|verify|check|sanitize)\b/i.test(nodeText(n)))
  const hasRetry = graph.nodes.some(
    (n) => RETRY_KEYWORDS.test(nodeText(n)) || graph.edges.some((e) => RETRY_KEYWORDS.test(edgeText(e)))
  )
  const hasTimeout = graph.nodes.some((n) => /\b(timeout|timed out|deadline)\b/i.test(nodeText(n)))
  const hasAsync = graph.nodes.some((n) =>
    /\b(async|queue|webhook|callback|notification|event)\b/i.test(nodeText(n))
  )
  const hasEmptyState = graph.nodes.some((n) => /\b(empty|no data|not found|zero)\b/i.test(nodeText(n)))
  const multiStepMutations = graph.nodes.filter(
    (n) => isDbNode(n) || /\b(transaction|payment|order|booking)\b/i.test(nodeText(n))
  ).length

  const externalWithoutError = graph.nodes.filter((n) => {
    if (!isExternalNode(n)) return false
    const outgoing = outgoingEdges(n.id, graph)
    return (
      !outgoing.some(isFailureEdge) &&
      !outgoing.some((e) => {
        const target = graph.nodes.find((x) => x.id === e.target)
        return target ? isErrorNode(target) : false
      })
    )
  })

  if ((hasApiOrExternal || hasMutations) && !hasAuthNode) {
    suggestions.push({
      category: 'authentication',
      severity: 'HIGH',
      description: 'Flow performs protected operations but has no authentication/authorization step.',
      suggestedNodes: ['Validate Token', 'Check Permissions', 'Unauthorized Handler']
    })
  }

  if (externalWithoutError.length > 0) {
    suggestions.push({
      category: 'error_handling',
      severity: 'CRITICAL',
      description: `${externalWithoutError.length} external operation(s) lack explicit error handling paths.`,
      suggestedNodes: ['Handle API Error', 'Log Failure', 'Return Error Response']
    })
  }

  if (graph.nodes.some(isExternalNode) && !hasRetry) {
    suggestions.push({
      category: 'retry_fallback',
      severity: 'MEDIUM',
      description: 'External calls exist without retry or fallback handling.',
      suggestedNodes: ['Retry Request', 'Fallback Service', 'Circuit Breaker']
    })
  }

  if (graph.nodes.some(isExternalNode) && !hasTimeout) {
    suggestions.push({
      category: 'timeout',
      severity: 'MEDIUM',
      description: 'External service/DB operations have no timeout handling.',
      suggestedNodes: ['Set Timeout', 'Handle Timeout', 'Cancel Operation']
    })
  }

  if (hasMutations && !hasValidation) {
    suggestions.push({
      category: 'validation',
      severity: 'HIGH',
      description: 'Data mutations exist without input validation steps.',
      suggestedNodes: ['Validate Input', 'Sanitize Payload', 'Validation Error Response']
    })
  }

  if (hasAsync) {
    const asyncNodes = graph.nodes.filter((n) =>
      /\b(async|queue|webhook|callback|notification)\b/i.test(nodeText(n))
    )
    const incompleteAsync = asyncNodes.filter((n) => outdegree(n.id, graph.edges) === 0)
    if (incompleteAsync.length > 0) {
      suggestions.push({
        category: 'async_completion',
        severity: 'MEDIUM',
        description: 'Async operations may be missing completion or callback handling.',
        suggestedNodes: ['Await Callback', 'Process Webhook', 'Update Status']
      })
    }
  }

  if (
    /\b(list|search|fetch|load|query|get)\b/i.test(graph.nodes.map((n) => nodeText(n)).join(' ')) &&
    !hasEmptyState
  ) {
    suggestions.push({
      category: 'empty_state',
      severity: 'LOW',
      description: 'Read/query flows should handle empty result states.',
      suggestedNodes: ['Check Empty Result', 'Show Empty State', 'Return No Content']
    })
  }

  if (multiStepMutations >= 2) {
    suggestions.push({
      category: 'compensation',
      severity: 'MEDIUM',
      description: 'Multi-step operations may need compensation/rollback on partial failure.',
      suggestedNodes: ['Begin Transaction', 'Compensate Previous Step', 'Rollback Changes']
    })
  }

  return suggestions
}

export function computeFlowComplexity(graph: ParsedFlowGraph): FlowComplexityResult {
  const nodeCount = graph.nodes.length
  const edgeCount = graph.edges.length
  const decisionCount = graph.nodes.filter(isDecisionNode).length
  const externalCount = graph.nodes.filter(isExternalNode).length

  const edgeDensity = nodeCount <= 1 ? 0 : Number((edgeCount / nodeCount).toFixed(2))
  const branchingFactor = nodeCount === 0 ? 0 : Number((decisionCount / nodeCount).toFixed(2))

  let nodeScore = 0
  if (nodeCount <= 10) nodeScore = nodeCount * 2
  else if (nodeCount <= 30) nodeScore = 20 + (nodeCount - 10)
  else nodeScore = 40 + Math.min(20, nodeCount - 30)

  const densityScore = Math.min(20, edgeDensity * 5)
  const branchScore = Math.min(25, branchingFactor * 50)
  const externalScore = Math.min(15, externalCount * 3)

  const complexityScore = Math.min(100, Math.round(nodeScore + densityScore + branchScore + externalScore))

  let level: FlowComplexityLevel = 'SIMPLE'
  if (complexityScore >= 60) level = 'COMPLEX'
  else if (complexityScore >= 30) level = 'MEDIUM'

  const reasoning =
    level === 'SIMPLE'
      ? 'Small flow with limited branching and few external dependencies.'
      : level === 'MEDIUM'
        ? 'Moderate node count with decision branches and some external integrations.'
        : 'Large flow with significant branching, connectivity, and external system dependencies.'

  return {
    complexityScore,
    level,
    factors: {
      nodeCount,
      edgeDensity,
      branchingFactor,
      externalDependencies: externalCount
    },
    reasoning
  }
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'resource'
}

function inferHttpMethod(node: ParsedFlowNode): string {
  const text = nodeText(node)
  if (/\b(delete|remove|cancel)\b/.test(text)) return 'DELETE'
  if (/\b(update|edit|patch|modify)\b/.test(text)) return 'PATCH'
  if (/\b(create|add|register|submit|post|send)\b/.test(text)) return 'POST'
  if (/\b(get|fetch|load|list|search|read|query)\b/.test(text)) return 'GET'
  return 'POST'
}

export function generateFlowArchitecture(graph: ParsedFlowGraph): FlowArchitectureResult {
  const actionable = graph.nodes.filter(
    (n) => !isStartNode(n) && !isEndNode(n) && !isDecisionNode(n)
  )

  const apis: FlowApiEndpoint[] = actionable
    .filter((n) => isApiNode(n) || /\b(api|request|call|submit|fetch)\b/i.test(nodeText(n)))
    .map((node) => {
      const slug = slugify(node.label)
      const method = inferHttpMethod(node)
      return {
        nodeId: node.id,
        name: node.label,
        method,
        path: `/api/v1/${slug}`,
        description: node.description || `Handles ${node.label}`,
        requiresAuth: !AUTH_KEYWORDS.test(nodeText(node)),
        requestSchema: { type: 'object', properties: {} },
        responseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
        errorResponses: [
          { status: 400, description: 'Validation error' },
          { status: 401, description: 'Unauthorized' },
          { status: 500, description: 'Internal server error' }
        ]
      }
    })

  const dbNodes = graph.nodes.filter(isDbNode)
  const tables: FlowArchitectureResult['database']['tables'] = dbNodes.map((node) => ({
    name: slugify(node.label).replace(/-/g, '_'),
    description: node.description || `Persisted data for ${node.label}`,
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true, indexed: true, nullable: false },
      { name: 'created_at', type: 'timestamp', nullable: false },
      { name: 'updated_at', type: 'timestamp', nullable: false }
    ],
    relationships: []
  }))

  const serviceNames = [...new Set(actionable.map((n) => slugify(n.label)))]
  const controllers = serviceNames.slice(0, 8).map((name) => ({
    name: `${name}.controller`,
    path: `controllers/${name}.controller.ts`,
    description: `HTTP controller for ${name}`,
    dependencies: [`${name}.service`]
  }))

  const services = serviceNames.slice(0, 8).map((name) => ({
    name: `${name}.service`,
    path: `services/${name}.service.ts`,
    description: `Business logic for ${name}`,
    dependencies: [`${name}.repository`]
  }))

  const repositories = dbNodes.map((node) => {
    const name = slugify(node.label)
    return {
      name: `${name}.repository`,
      path: `repositories/${name}.repository.ts`,
      description: `Data access for ${node.label}`,
      dependencies: [`${slugify(node.label).replace(/-/g, '_')}.model`]
    }
  })

  const models = tables.map((table) => ({
    name: `${table.name}.model`,
    path: `models/${table.name}.model.ts`,
    description: `Domain model for ${table.name}`,
    dependencies: []
  }))

  const asyncJobs = graph.nodes
    .filter((n) => /\b(queue|async|background|job|notification|email|sms)\b/i.test(nodeText(n)))
    .map((n) => `Process: ${n.label}`)

  const eventDriven = graph.nodes
    .filter((n) => /\b(event|webhook|publish|subscribe|broker)\b/i.test(nodeText(n)))
    .map((n) => `Event: ${n.label}`)

  return {
    apis,
    database: {
      tables,
      indexSuggestions: tables.flatMap((t) =>
        t.fields
          .filter((f) => f.indexed)
          .map((f) => `CREATE INDEX idx_${t.name}_${f.name} ON ${t.name}(${f.name});`)
      )
    },
    services: {
      controllers,
      services,
      repositories,
      models,
      utils: [
        {
          name: 'flow-mapper',
          path: 'utils/flow-mapper.ts',
          description: 'Maps flow nodes to handlers',
          dependencies: []
        }
      ],
      asyncJobs,
      eventDriven
    }
  }
}

export function explainFlowGraph(graph: ParsedFlowGraph): FlowExplanationResult {
  const starts = graph.nodes.filter(isStartNode)
  const entryIds =
    starts.length > 0
      ? starts.map((n) => n.id)
      : graph.nodes.filter((n) => indegree(n.id, graph.edges) === 0).map((n) => n.id)

  const executionSequence: string[] = []
  const visited = new Set<string>()
  const queue = [...entryIds]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)
    const node = graph.nodes.find((n) => n.id === currentId)
    if (!node) continue
    executionSequence.push(node.label)

    for (const edge of outgoingEdges(currentId, graph)) {
      if (!visited.has(edge.target)) queue.push(edge.target)
    }
  }

  const decisionPoints = graph.nodes
    .filter(isDecisionNode)
    .map((node) => ({
      title: node.label,
      content: outgoingEdges(node.id, graph)
        .map((e) => {
          const target = graph.nodes.find((n) => n.id === e.target)
          const branch = edgeText(e) || 'default'
          return `${branch} → ${target?.label ?? e.target}`
        })
        .join('; ')
    }))

  const dataMovement = graph.nodes
    .filter((n) => isDbNode(n) || isApiNode(n))
    .map((node) => ({
      title: node.label,
      content: isDbNode(node)
        ? `Persists or reads data (${node.nodeType || 'database operation'}).`
        : `Calls external service/API (${node.nodeType || 'service'}).`
    }))

  const externalDependencies = graph.nodes
    .filter(isExternalNode)
    .map((n) => `${n.label} [${n.category}/${n.nodeType}]`)

  const failureFlows = graph.edges
    .filter(isFailureEdge)
    .map((e) => {
      const source = graph.nodes.find((n) => n.id === e.source)
      const target = graph.nodes.find((n) => n.id === e.target)
      return `${source?.label ?? e.source} —(${edgeText(e) || 'failure'})→ ${target?.label ?? e.target}`
    })

  const alternativeFlows = decisionPoints.flatMap((d) =>
    d.content.split('; ').filter((branch) => branch.length > 0)
  )

  return {
    summary: `Flow with ${graph.nodes.length} nodes and ${graph.edges.length} edges.`,
    normalFlow: executionSequence,
    alternativeFlows,
    failureFlows,
    decisionPoints,
    dataMovement,
    externalDependencies,
    executionSequence
  }
}

export interface CoverageItem {
  id: string
  title: string
  description?: string
  kind: 'requirement' | 'feature'
}

const COVERAGE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with',
  'is', 'are', 'be', 'this', 'that', 'user', 'system', 'should', 'will', 'must'
])

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !COVERAGE_STOPWORDS.has(w))
  )
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  return shared / Math.min(a.size, b.size)
}

/**
 * Cross-checks a flow graph against a list of requirements/features from the
 * knowledge base and flags items that have no reasonably-matching flow node —
 * i.e. requirements that were never translated into the flow design.
 */
export function detectRequirementCoverage(
  graph: ParsedFlowGraph,
  items: CoverageItem[]
): RequirementCoverageResult {
  const nodeWordSets = graph.nodes.map((n) => significantWords(nodeText(n)))
  const uncovered: RequirementFlowGap[] = []
  let coveredCount = 0

  const COVERAGE_THRESHOLD = 0.34

  for (const item of items) {
    const itemWords = significantWords(`${item.title} ${item.description ?? ''}`)
    const bestScore = nodeWordSets.reduce((max, ws) => Math.max(max, overlapScore(itemWords, ws)), 0)

    if (bestScore >= COVERAGE_THRESHOLD) {
      coveredCount++
    } else {
      uncovered.push({
        id: item.id,
        title: item.title,
        kind: item.kind,
        reason:
          bestScore > 0
            ? `Only weak overlap with existing flow nodes (best match ~${Math.round(bestScore * 100)}%).`
            : 'No flow node appears to represent this requirement.',
        severity: item.kind === 'requirement' ? 'HIGH' : 'MEDIUM'
      })
    }
  }

  const total = items.length
  return {
    totalRequirements: items.filter((i) => i.kind === 'requirement').length,
    totalFeatures: items.filter((i) => i.kind === 'feature').length,
    coveredCount,
    coveragePercent: total === 0 ? 100 : Math.round((coveredCount / total) * 100),
    uncovered
  }
}

export function analyzeFlow(nodesJson: string, edgesJson: string): FlowAnalysisResult {
  const graph = parseFlowGraph(nodesJson, edgesJson)
  return {
    validation: validateFlowGraph(graph),
    missingFlows: detectMissingFlows(graph),
    complexity: computeFlowComplexity(graph)
  }
}
