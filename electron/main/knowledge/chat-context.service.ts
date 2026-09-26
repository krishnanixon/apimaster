import type { ChatContextAttachment } from '@shared/types'
import { documentRepository } from '../repositories/document.repository'
import { flowRepository } from '../repositories/flow.repository'
import { buildKnowledgeContext } from './knowledge-context.service'

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function summarizeFlowNodes(nodesJson: string, edgesJson: string): string {
  try {
    const nodes = JSON.parse(nodesJson || '[]') as Array<{
      id: string
      data?: { label?: string; nodeType?: string; description?: string }
    }>
    const edges = JSON.parse(edgesJson || '[]') as Array<{
      source: string
      target: string
      data?: { label?: string }
    }>
    if (nodes.length === 0) return 'Empty flow diagram.'

    const lines = nodes.map((n) => {
      const label = n.data?.label ?? n.id
      const type = n.data?.nodeType ? ` (${n.data.nodeType})` : ''
      const desc = n.data?.description ? `: ${n.data.description}` : ''
      return `- ${label}${type}${desc}`
    })

    const edgeLines = edges.slice(0, 30).map((e) => {
      const label = e.data?.label ? ` [${e.data.label}]` : ''
      return `  ${e.source} → ${e.target}${label}`
    })

    return [
      `Nodes (${nodes.length}):`,
      ...lines.slice(0, 40),
      nodes.length > 40 ? `... and ${nodes.length - 40} more nodes` : '',
      edges.length > 0 ? `\nConnections (${edges.length}):` : '',
      ...edgeLines,
      edges.length > 30 ? `... and ${edges.length - 30} more connections` : ''
    ]
      .filter(Boolean)
      .join('\n')
  } catch {
    return 'Could not parse flow diagram data.'
  }
}

export async function buildAttachmentsContext(
  projectId: string,
  attachments: ChatContextAttachment[]
): Promise<string> {
  if (!attachments.length) return ''

  const blocks: string[] = [
    '=== ATTACHED WORKSPACE CONTEXT (use this for the current user message) ===',
    'The user attached the following project artifacts. Reference them directly; do not ask the user to re-paste this content.'
  ]

  for (const att of attachments) {
    if (att.type === 'document') {
      const doc = await documentRepository.getById(att.id)
      if (!doc || doc.projectId !== projectId) {
        blocks.push(`\n[Document "${att.title}" — not found or inaccessible]`)
        continue
      }
      const text = stripHtml(doc.htmlContent || doc.content || '').slice(0, 12000)
      blocks.push(
        `\n--- DOCUMENT: ${doc.title} (${doc.type}) ---\n${text || '(empty document)'}`
      )
    } else if (att.type === 'flow') {
      const flow = await flowRepository.getById(att.id)
      if (!flow || flow.projectId !== projectId) {
        blocks.push(`\n[Flow "${att.title}" — not found or inaccessible]`)
        continue
      }
      const summary = summarizeFlowNodes(flow.nodes, flow.edges)
      blocks.push(
        `\n--- FLOW DIAGRAM: ${flow.title} (${flow.category}) ---\n${flow.description || ''}\n${summary}`
      )
    } else if (att.type === 'knowledge') {
      const kb = await buildKnowledgeContext(projectId)
      blocks.push(`\n--- KNOWLEDGE BASE (full snapshot) ---\n${kb.formatted}`)
    }
  }

  blocks.push('\n=== END ATTACHED CONTEXT ===')
  return blocks.join('\n')
}
