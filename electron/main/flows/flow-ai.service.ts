import { v4 as uuidv4 } from 'uuid'
import {
  analyzeFlow,
  detectRequirementCoverage,
  explainFlowGraph,
  generateFlowArchitecture,
  parseFlowGraph,
  type CoverageItem
} from '@shared/lib/flow-intelligence'
import { logger } from '../infra/logger.service'
import { aiRouter } from '../ai'
import { documentRepository } from '../repositories/document.repository'
import { knowledgeRepository } from '../repositories/knowledge.repository'
import { resolveProjectKnowledgeText } from '../knowledge/project-knowledge.service'
import type {
  AnalyzeFlowInput,
  ExplainFlowInput,
  FlowAIActionInput,
  FlowAnalysisResult,
  FlowArchitectureResult,
  FlowExplanationResult,
  FlowRequirementCoverageInput,
  GenerateFlowArchitectureInput,
  GenerateFlowInput,
  GeneratedFlowResult,
  RequirementCoverageResult,
  ReverseFlowInput
} from '@shared/types'

const FLOW_GENERATION_SYSTEM = `You are an expert solution architect designing production-grade system flows.
Generate React Flow compatible diagram data as JSON only.

Return a JSON object with:
- nodes: array of { id, type: "flowNode", position: {x,y}, data: { label, shape, nodeType, category, color, description, status, priority, tags } }
- edges: array of { id, source, target, type: "labeled", data: { label, condition }, animated: false }
- summary: brief description

Node types to use:
- User actions, API calls, services, DB operations, conditions as distinct nodes
- shape: rounded (process), diamond (decision), circle (start/end), cylinder (database), rectangle (generic)

Mandatory rules:
- No orphan nodes — every node must be connected
- Always include explicit Start and End nodes
- Always include error handling nodes and failure edges for every API, DB, and external service call
- Always include retry/fallback paths for external calls where appropriate
- Decision nodes must have at least two labeled outgoing edges (success/failure or conditional branches)
- Include validation steps before data mutations
- Include authentication/authorization when APIs or protected resources are involved
- Label edges with conditions: success, failure, retry, timeout, valid, invalid
- Position nodes in readable layout (x increments ~220, y increments ~120)
- IDs must be unique strings
- Max 30 nodes unless complexity requires more`

function parseFlowJson(raw: string): GeneratedFlowResult {
  let text = raw.trim()
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()
  const parsed = JSON.parse(text) as {
    nodes?: Array<Record<string, unknown>>
    edges?: Array<Record<string, unknown>>
    summary?: string
  }

  const nodes = (parsed.nodes ?? []).map((n) => ({
    id: String(n.id ?? uuidv4()),
    type: String(n.type ?? 'flowNode'),
    position: (n.position as { x: number; y: number }) ?? { x: 0, y: 0 },
    data: {
      label: String((n.data as Record<string, unknown>)?.label ?? 'Node'),
      shape: String((n.data as Record<string, unknown>)?.shape ?? 'rounded'),
      nodeType: String((n.data as Record<string, unknown>)?.nodeType ?? 'process'),
      category: String((n.data as Record<string, unknown>)?.category ?? 'flowchart'),
      color: String((n.data as Record<string, unknown>)?.color ?? '#6366f1'),
      description: String((n.data as Record<string, unknown>)?.description ?? ''),
      status: 'draft',
      priority: 'medium',
      tags: []
    },
    ...(n.parentId ? { parentId: String(n.parentId) } : {}),
    ...(n.style ? { style: n.style } : {})
  }))

  const edges = (parsed.edges ?? []).map((e) => ({
    id: String(e.id ?? uuidv4()),
    source: String(e.source),
    target: String(e.target),
    type: String(e.type ?? 'labeled'),
    animated: Boolean(e.animated),
    data: {
      label: String((e.data as Record<string, unknown>)?.label ?? ''),
      condition: String((e.data as Record<string, unknown>)?.condition ?? '')
    }
  }))

  return {
    nodes: JSON.stringify(nodes),
    edges: JSON.stringify(edges),
    summary: parsed.summary
  }
}

function formatComplexityMarkdown(result: FlowAnalysisResult): string {
  const { complexity } = result
  return [
    `## Flow Complexity`,
    ``,
    `**Score:** ${complexity.complexityScore}/100 (${complexity.level})`,
    `_${complexity.reasoning}_`,
    ``,
    `### Factors`,
    `- Nodes: ${complexity.factors.nodeCount}`,
    `- Edge density: ${complexity.factors.edgeDensity}`,
    `- Branching factor: ${complexity.factors.branchingFactor}`,
    `- External dependencies: ${complexity.factors.externalDependencies}`
  ].join('\n')
}

function formatAnalysisMarkdown(result: FlowAnalysisResult): string {
  const lines: string[] = [
    `## Flow Analysis`,
    ``,
    `**Validation Score:** ${result.validation.validationScore}/100`,
    `**Complexity:** ${result.complexity.complexityScore}/100 (${result.complexity.level})`,
    `_${result.complexity.reasoning}_`,
    ``,
    `### Validation Issues (${result.validation.issues.length})`
  ]

  if (result.validation.issues.length === 0) {
    lines.push('- No issues detected')
  } else {
    for (const issue of result.validation.issues) {
      lines.push(`- **[${issue.severity}]** ${issue.type}: ${issue.description}`)
    }
  }

  lines.push(``, `### Missing Flows (${result.missingFlows.length})`)
  if (result.missingFlows.length === 0) {
    lines.push('- No missing flows detected')
  } else {
    for (const missing of result.missingFlows) {
      lines.push(
        `- **[${missing.severity}]** ${missing.category}: ${missing.description}`,
        `  - Suggested nodes: ${missing.suggestedNodes.join(', ')}`
      )
    }
  }

  lines.push(
    ``,
    `### Complexity Factors`,
    `- Nodes: ${result.complexity.factors.nodeCount}`,
    `- Edge density: ${result.complexity.factors.edgeDensity}`,
    `- Branching factor: ${result.complexity.factors.branchingFactor}`,
    `- External dependencies: ${result.complexity.factors.externalDependencies}`
  )

  return lines.join('\n')
}

function formatExplanationMarkdown(result: FlowExplanationResult): string {
  const lines: string[] = [
    `## Flow Explanation`,
    ``,
    result.summary,
    ``,
    `### Execution Sequence`,
    ...result.executionSequence.map((step, i) => `${i + 1}. ${step}`),
    ``,
    `### Normal Flow`,
    ...result.normalFlow.map((step) => `- ${step}`),
    ``,
    `### Alternative Flows`,
    ...(result.alternativeFlows.length > 0
      ? result.alternativeFlows.map((f) => `- ${f}`)
      : ['- None identified']),
    ``,
    `### Failure Flows`,
    ...(result.failureFlows.length > 0
      ? result.failureFlows.map((f) => `- ${f}`)
      : ['- No explicit failure paths labeled']),
    ``,
    `### Decision Points`,
    ...result.decisionPoints.map((d) => `- **${d.title}:** ${d.content || 'No branches'}`),
    ``,
    `### Data Movement`,
    ...(result.dataMovement.length > 0
      ? result.dataMovement.map((d) => `- **${d.title}:** ${d.content}`)
      : ['- No API/DB nodes detected']),
    ``,
    `### External Dependencies`,
    ...(result.externalDependencies.length > 0
      ? result.externalDependencies.map((d) => `- ${d}`)
      : ['- None detected'])
  ]

  return lines.join('\n')
}

export class FlowAIService {
  analyze(input: AnalyzeFlowInput): FlowAnalysisResult {
    return analyzeFlow(input.nodes, input.edges)
  }

  explain(input: ExplainFlowInput): FlowExplanationResult {
    const graph = parseFlowGraph(input.nodes, input.edges)
    return explainFlowGraph(graph)
  }

  generateArchitecture(input: GenerateFlowArchitectureInput): FlowArchitectureResult {
    const graph = parseFlowGraph(input.nodes, input.edges)
    return generateFlowArchitecture(graph)
  }

  /**
   * Cross-checks the flow against the project's knowledge base requirements
   * and features to detect what was never translated into the flow design.
   */
  async requirementCoverage(input: FlowRequirementCoverageInput): Promise<RequirementCoverageResult> {
    const graph = parseFlowGraph(input.nodes, input.edges)
    const bundle = await knowledgeRepository.loadBundle(input.projectId)

    const items: CoverageItem[] = [
      ...bundle.requirements
        .filter((r) => !r.deletedAt)
        .map((r) => ({ id: r.id, title: r.title, description: r.description, kind: 'requirement' as const })),
      ...bundle.features
        .filter((f) => !f.deletedAt)
        .map((f) => ({ id: f.id, title: f.title, description: f.description, kind: 'feature' as const }))
    ]

    return detectRequirementCoverage(graph, items)
  }

  async generateFlow(input: GenerateFlowInput): Promise<GeneratedFlowResult> {
    let context = ''

    const knowledgeText = await resolveProjectKnowledgeText(input.projectId, {
      mode: 'auto',
      query: [input.prompt, input.category, 'generate flow diagram'].filter(Boolean).join(' ')
    })
    context += `Project knowledge:\n${knowledgeText}\n\n`

    if (input.documentId) {
      const doc = await documentRepository.getById(input.documentId)
      if (doc) {
        context += `Requirement document "${doc.title}":\n${doc.htmlContent || doc.content}\n\n`
      }
    }

    const userPrompt = `Category: ${input.category ?? 'process'}
${context}
User request: ${input.prompt}

Generate a complete production-grade system flow with error handling, validation, auth where needed, and retry paths.`

    try {
      const result = await aiRouter.chat(
        [
          { role: 'system', content: FLOW_GENERATION_SYSTEM },
          { role: 'user', content: userPrompt }
        ],
        {
          temperature: 0.5,
          maxTokens: 8192,
          json: true,
          requestType: 'FLOW_GENERATION',
          meta: { projectId: input.projectId, feature: 'flow' }
        }
      )
      return parseFlowJson(result.text || '{}')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Flow generation failed'
      logger.error(message, 'FlowAIService')
      throw new Error(message)
    }
  }

  async reverseEngineer(input: ReverseFlowInput, nodes: string, edges: string): Promise<string> {
    const outputLabels: Record<ReverseFlowInput['outputType'], string> = {
      requirements: 'a detailed requirements document in HTML',
      user_stories: 'user stories with acceptance criteria in HTML',
      acceptance_criteria: 'acceptance criteria list in HTML',
      api_spec: 'API specification in HTML',
      database: 'database design document in HTML',
      test_cases: 'test cases document in HTML',
      business_rules: 'business rules document in HTML'
    }

    const analysis = analyzeFlow(nodes, edges)
    const explanation = explainFlowGraph(parseFlowGraph(nodes, edges))
    const architecture = generateFlowArchitecture(parseFlowGraph(nodes, edges))

    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content: `You analyze flow diagrams and produce ${outputLabels[input.outputType]}. Return clean semantic HTML only. Use the provided flow intelligence context for accuracy.`
        },
        {
          role: 'user',
          content: `Flow nodes: ${nodes}
Flow edges: ${edges}

Flow analysis: ${JSON.stringify(analysis)}
Flow explanation: ${JSON.stringify(explanation)}
Architecture hints: ${JSON.stringify(architecture)}

Generate ${outputLabels[input.outputType]}.`
        }
      ],
      {
        temperature: 0.4,
        maxTokens: 8192,
        requestType: 'DOCUMENTATION',
        meta: { projectId: input.projectId, feature: 'flow-reverse' }
      }
    )

    return result.text
  }

  async runAction(input: FlowAIActionInput): Promise<string> {
    const analysis = analyzeFlow(input.nodes, input.edges)

    if (input.action === 'complexity') {
      return formatComplexityMarkdown(analysis)
    }

    if (input.action === 'missing_steps') {
      const lines = [
        `## Missing Flow Detection`,
        ``,
        ...(analysis.missingFlows.length === 0
          ? ['No missing flows detected.']
          : analysis.missingFlows.map(
              (m) =>
                `### ${m.category} [${m.severity}]\n${m.description}\n**Suggested nodes:** ${m.suggestedNodes.join(', ')}`
            ))
      ]
      return lines.join('\n')
    }

    if (input.action === 'explain') {
      const explanation = explainFlowGraph(parseFlowGraph(input.nodes, input.edges))
      return formatExplanationMarkdown(explanation)
    }

    if (input.action === 'apis' || input.action === 'database') {
      const architecture = generateFlowArchitecture(parseFlowGraph(input.nodes, input.edges))
      if (input.action === 'apis') {
        return ['## Generated APIs', '', '```json', JSON.stringify(architecture.apis, null, 2), '```'].join('\n')
      }
      return [
        '## Generated Database Schema',
        '',
        '```json',
        JSON.stringify(architecture.database, null, 2),
        '```',
        '',
        '## Service Structure',
        '',
        '```json',
        JSON.stringify(architecture.services, null, 2),
        '```'
      ].join('\n')
    }

    const actionPrompts: Record<Exclude<FlowAIActionInput['action'], 'explain' | 'apis' | 'database' | 'complexity' | 'missing_steps'>, string> = {
      improve: 'Suggest specific improvements to this flow based on validation issues and missing flows.',
      optimize: 'Optimize this process for efficiency while preserving error handling.',
      bottlenecks: 'Identify bottlenecks and delays.',
      alternatives: 'Propose alternative flow designs with complete error paths.',
      automation: 'Suggest automation opportunities.',
      documentation: 'Generate professional flow documentation including normal, alternative, and failure flows.'
    }

    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content:
            'You are a senior solution architect. Respond in clear markdown. Never assume missing logic — flag gaps explicitly.'
        },
        {
          role: 'user',
          content: `${actionPrompts[input.action as keyof typeof actionPrompts]}

Flow analysis context:
${JSON.stringify(analysis)}

Nodes: ${input.nodes}
Edges: ${input.edges}`
        }
      ],
      {
        temperature: 0.5,
        maxTokens: 4096,
        requestType: 'DOCUMENTATION',
        meta: { projectId: input.projectId, feature: 'flow-action' }
      }
    )

    return result.text
  }
}

export const flowAIService = new FlowAIService()
