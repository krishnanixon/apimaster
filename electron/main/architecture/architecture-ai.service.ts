/**
 * Architecture Designer — AI generation and assistant.
 *
 * Two entry points, both grounded in the same project material (linked
 * requirement documents plus the knowledge base):
 *
 * - `generate` designs a whole architecture from scratch and returns a
 *   serialized model the editor can load.
 * - `assist` proposes incremental `ArchitectureAction`s against an existing
 *   model, which the user approves before anything is applied.
 */

import { aiRouter } from '../ai'
import { logger } from '../infra/logger.service'
import { documentRepository } from '../repositories/document.repository'
import { resolveProjectKnowledgeText } from '../knowledge/project-knowledge.service'
import {
  ARCH_COMPONENT_KINDS,
  ARCH_CONNECTION_KINDS,
  ARCH_SYSTEM_TYPES
} from '@shared/lib/architecture-catalog'
import { parseModel, serializeModel } from '@shared/lib/architecture-model'
import {
  buildModelFromDraft,
  buildProposal,
  parseJsonObject,
  type ArchitectureDraft
} from '@shared/lib/architecture-generation'
import type {
  ArchitectureAssistantInput,
  ArchitectureAssistantResult,
  ArchitectureModel,
  GenerateArchitectureInput,
  GeneratedArchitectureResult
} from '@shared/types/architecture'

/** Per-document budget. Enough for a full SRS section without blowing context. */
const DOCUMENT_CHAR_LIMIT = 12000
const TOTAL_DOCUMENT_CHAR_LIMIT = 40000

const KIND_LIST = ARCH_COMPONENT_KINDS.map((meta) => meta.kind).join(', ')
const CONNECTION_LIST = ARCH_CONNECTION_KINDS.map((meta) => meta.kind).join(', ')
const SYSTEM_TYPE_LIST = ARCH_SYSTEM_TYPES.map((type) => type.id).join(', ')

const GENERATION_SYSTEM = `You are a principal software architect. You read product and requirement documents and design the system architecture they imply.

Return JSON only, matching this shape:
{
  "name": string,
  "systemType": one of [${SYSTEM_TYPE_LIST}],
  "description": string,
  "summary": string,
  "components": [
    {
      "name": string,
      "kind": one of [${KIND_LIST}],
      "technology": string,
      "description": string,
      "responsibilities": string[],
      "apis": [{ "method": string, "path": string, "description": string, "auth": string }],
      "security": { "authentication": string, "authorization": string, "encryption": string }
    }
  ],
  "connections": [
    { "from": component name, "to": component name, "kind": one of [${CONNECTION_LIST}], "label": string, "description": string, "async": boolean }
  ],
  "technologies": [{ "layer": string, "name": string, "rationale": string, "alternatives": string[] }],
  "environments": [{ "name": string, "description": string }],
  "decisions": [{ "title": string, "context": string, "decision": string, "consequences": string }]
}

Rules:
- Ground every component in the supplied documents. Do not invent features the documents never mention.
- "from" and "to" must exactly match a component "name" in this response.
- Use the exact kind and connection strings listed above; never invent new ones.
- Include the data stores, third-party integrations and auth providers the documents imply.
- Every component must take part in at least one connection.
- Prefer 6-20 components. Only exceed that when the documents genuinely describe more.
- "summary" is 1-3 sentences on what you designed and why.`

const ASSISTANT_SYSTEM = `You are a principal software architect reviewing an existing architecture model.
Propose changes as a list of actions. Return JSON only:
{
  "summary": string,
  "rationale": string,
  "actions": [ ... ]
}

Supported actions:
- { "type": "ADD_COMPONENT", "component": { "name": string, "kind": string, "technology": string, "description": string, "responsibilities": string[] } }
- { "type": "REMOVE_COMPONENT", "componentId": component id or exact name }
- { "type": "UPDATE_COMPONENT", "componentId": component id or exact name, "patch": { "description"?: string, "technology"?: string, "responsibilities"?: string[] } }
- { "type": "CONNECT_COMPONENTS", "connection": { "from": id or name, "to": id or name, "kind": string, "label": string, "async": boolean } }
- { "type": "DISCONNECT_COMPONENTS", "connectionId": connection id }
- { "type": "CHANGE_TECHNOLOGY", "componentId": id or name, "technology": string }
- { "type": "ADD_API", "componentId": id or name, "api": { "method": string, "path": string, "description": string } }
- { "type": "ADD_ENVIRONMENT", "environment": { "name": string, "description": string } }
- { "type": "ADD_DECISION", "decision": { "title": string, "context": string, "decision": string, "consequences": string } }
- { "type": "UPDATE_METADATA", "patch": { "description"?: string, "systemType"?: string } }

Rules:
- Component kinds must come from: ${KIND_LIST}
- Connection kinds must come from: ${CONNECTION_LIST}
- Only reference components and connections that exist in the supplied model.
- Return the smallest set of actions that satisfies the instruction.
- "rationale" explains the trade-offs in 1-3 sentences.`

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface DocumentContext {
  text: string
  titles: string[]
}

/**
 * Reads the linked documents, newest content first, stopping once the total
 * budget is spent so a huge document set cannot overflow the context window.
 */
async function buildDocumentContext(
  projectId: string,
  documentIds: string[]
): Promise<DocumentContext> {
  const blocks: string[] = []
  const titles: string[] = []
  let budget = TOTAL_DOCUMENT_CHAR_LIMIT

  for (const id of documentIds) {
    if (budget <= 0) break

    const doc = await documentRepository.getById(id)
    if (!doc || doc.projectId !== projectId) {
      logger.warn(`Skipped document ${id}: not found in project ${projectId}`, 'ArchitectureAI')
      continue
    }

    const text = stripHtml(doc.htmlContent || doc.content || '').slice(
      0,
      Math.min(DOCUMENT_CHAR_LIMIT, budget)
    )
    if (!text) continue

    budget -= text.length
    titles.push(doc.title)
    blocks.push(`\n--- DOCUMENT: ${doc.title} (${doc.type}) ---\n${text}`)
  }

  return { text: blocks.join('\n'), titles }
}

async function buildContext(
  projectId: string,
  documentIds: string[],
  includeKnowledge: boolean,
  query: string
): Promise<DocumentContext> {
  const documents = await buildDocumentContext(projectId, documentIds)
  const sections: string[] = []

  if (includeKnowledge) {
    const knowledge = await resolveProjectKnowledgeText(projectId, { mode: 'auto', query })
    if (knowledge.trim()) {
      sections.push(`=== PROJECT KNOWLEDGE BASE ===\n${knowledge}`)
    }
  }

  if (documents.text) {
    sections.push(`=== LINKED REQUIREMENT DOCUMENTS ===${documents.text}`)
  }

  return { text: sections.join('\n\n'), titles: documents.titles }
}

/** A compact projection of the model — full ids, no layout noise. */
function describeModel(model: ArchitectureModel): string {
  const components = model.components.map((component) => ({
    id: component.id,
    name: component.name,
    kind: component.kind,
    technology: component.technology,
    description: component.description,
    apis: component.apis.map((api) => `${api.method} ${api.path}`)
  }))

  const connections = model.connections.map((connection) => ({
    id: connection.id,
    from: connection.from,
    to: connection.to,
    kind: connection.kind,
    label: connection.label
  }))

  return JSON.stringify(
    {
      name: model.metadata.name,
      systemType: model.metadata.systemType,
      description: model.metadata.description,
      components,
      connections,
      environments: model.environments.map((env) => env.name)
    },
    null,
    2
  )
}

export class ArchitectureAIService {
  async generate(input: GenerateArchitectureInput): Promise<GeneratedArchitectureResult> {
    const documentIds = input.documentIds ?? []
    const requirements = input.prompt?.trim() ?? ''

    if (!requirements && documentIds.length === 0) {
      throw new Error('Add requirements text or link at least one document first.')
    }

    const context = await buildContext(
      input.projectId,
      documentIds,
      input.includeKnowledge !== false,
      [requirements, 'system architecture design'].filter(Boolean).join(' ')
    )

    const userPrompt = [
      context.text,
      requirements ? `=== ARCHITECT INSTRUCTIONS ===\n${requirements}` : '',
      input.systemType ? `Target system type: ${input.systemType}` : '',
      'Design the architecture these documents describe.'
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const result = await aiRouter.chat(
        [
          { role: 'system', content: GENERATION_SYSTEM },
          { role: 'user', content: userPrompt }
        ],
        {
          temperature: 0.3,
          maxTokens: 8192,
          json: true,
          requestType: 'FLOW_GENERATION',
          meta: { projectId: input.projectId, feature: 'architecture-generate' }
        }
      )

      const draft = parseJsonObject<ArchitectureDraft>(result.text || '{}')
      const built = buildModelFromDraft(draft, {
        name: draft.name?.trim() || 'Generated Architecture',
        systemType: input.systemType ?? 'web',
        requirements,
        linkedDocumentIds: documentIds
      })

      if (built.model.components.length === 0) {
        throw new Error('The AI did not return any components. Try adding more detail or another document.')
      }

      return {
        model: serializeModel(built.model),
        summary: built.summary,
        sources: context.titles
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Architecture generation failed'
      logger.error(message, 'ArchitectureAI')
      throw new Error(message)
    }
  }

  async assist(input: ArchitectureAssistantInput): Promise<ArchitectureAssistantResult> {
    const instruction = input.instruction?.trim()
    if (!instruction) throw new Error('Describe the change you want first.')

    const model = parseModel(input.model)
    const context = await buildContext(
      input.projectId,
      input.documentIds ?? [],
      input.includeKnowledge === true,
      instruction
    )

    const userPrompt = [
      context.text,
      `=== CURRENT ARCHITECTURE ===\n${describeModel(model)}`,
      `=== INSTRUCTION ===\n${instruction}`
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const result = await aiRouter.chat(
        [
          { role: 'system', content: ASSISTANT_SYSTEM },
          { role: 'user', content: userPrompt }
        ],
        {
          temperature: 0.2,
          maxTokens: 4096,
          json: true,
          requestType: 'FLOW_GENERATION',
          meta: { projectId: input.projectId, feature: 'architecture-assist' }
        }
      )

      const raw = parseJsonObject<{ summary?: string; rationale?: string; actions?: unknown }>(
        result.text || '{}'
      )
      const proposal = buildProposal(raw, model)

      if (proposal.actions.length === 0) {
        throw new Error('The AI did not propose any change that fits this architecture.')
      }

      return {
        summary: proposal.summary,
        rationale: proposal.rationale,
        actions: JSON.stringify(proposal.actions)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Architecture assistant failed'
      logger.error(message, 'ArchitectureAI')
      throw new Error(message)
    }
  }
}

export const architectureAIService = new ArchitectureAIService()
