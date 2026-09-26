import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { parseFlowGraph, validateFlowGraph } from '@shared/lib/flow-intelligence'
import type { FlowValidationIssue } from '@shared/types/flow-intelligence'

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
}

export function useFlowValidation(nodes: Node[], edges: Edge[]) {
  return useMemo(() => {
    if (nodes.length === 0) {
      return { score: 100, issues: [] as FlowValidationIssue[], nodeSeverity: new Map<string, string>() }
    }
    const graph = parseFlowGraph(JSON.stringify(nodes), JSON.stringify(edges))
    const result = validateFlowGraph(graph)
    const nodeSeverity = new Map<string, string>()

    for (const issue of result.issues) {
      if (!issue.node) continue
      const current = nodeSeverity.get(issue.node)
      if (!current || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[current]) {
        nodeSeverity.set(issue.node, issue.severity)
      }
    }

    return {
      score: result.validationScore,
      issues: result.issues,
      nodeSeverity
    }
  }, [nodes, edges])
}
