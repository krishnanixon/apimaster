/**
 * Presentation Studio — AI generation and assistant.
 */

import { aiRouter } from '../ai'
import { logger } from '../infra/logger.service'
import { documentRepository } from '../repositories/document.repository'
import { resolveProjectKnowledgeText } from '../knowledge/project-knowledge.service'
import {
  buildCardsFromDraft,
  buildPresentationProposal,
  parseCards,
  parseJsonObject,
  serializeCards,
  type PresentationDraft
} from '@shared/lib/presentation-model'
import type {
  GeneratePresentationInput,
  GeneratedPresentationResult,
  PresentationAssistantInput,
  PresentationAssistantResult,
  PresentationCard
} from '@shared/types/presentation'
import { presentationContextService } from './presentation-context.service'

const DOCUMENT_CHAR_LIMIT = 12000
const TOTAL_DOCUMENT_CHAR_LIMIT = 40000

const GENERATION_SYSTEM = `You are an expert presentation designer. You turn product and requirement material into a Gamma-style card deck.

Return JSON only, matching this shape:
{
  "title": string,
  "themeId": one of [professional, modern, bold, minimal, warm, dark, coral, forest, midnight, canvas],
  "summary": string,
  "cards": [
    {
      "layout": one of [title, content, split, bullets, metrics, quote, closing, image-focus, media-left, media-right],
      "notes": string,
      "blocks": [
        { "type": "heading", "text": string, "level": 1|2|3 },
        { "type": "text", "text": string },
        { "type": "bullets", "items": string[] },
        { "type": "columns", "columns": [{ "title": string, "body": string }] },
        { "type": "callout", "text": string, "tone": "info"|"success"|"warning"|"neutral" },
        { "type": "divider" },
        { "type": "metric", "metrics": [{ "label": string, "value": string, "hint": string }] },
        { "type": "image", "alt": string, "caption": string }
      ]
    }
  ]
}

Rules:
- First card should usually be layout "title".
- Prefer 6-14 cards unless the user asks otherwise.
- Ground every claim in the supplied documents/knowledge. Do not invent product features.
- Keep copy concise and presentation-ready (short headings, scannable bullets).
- Use "metric" cards when numbers or KPIs are present; otherwise skip them.
- "summary" is 1-3 sentences describing what you built.
- Do not include markdown fencing.`

const ASSISTANT_SYSTEM = `You refine an existing presentation card deck.
Propose changes as a list of actions. Return JSON only:
{
  "summary": string,
  "rationale": string,
  "actions": [ ... ]
}

Supported actions:
- { "type": "REPLACE_CARDS", "cards": [ /* same card shape as generation */ ] }
- { "type": "UPDATE_CARD", "cardId": card id or exact heading text, "patch": { "layout"?: string, "notes"?: string, "blocks"?: [...] } }
- { "type": "INSERT_CARD", "index"?: number, "card": { "layout": string, "notes"?: string, "blocks": [...] } }
- { "type": "DELETE_CARD", "cardId": card id or exact heading text }
- { "type": "MOVE_CARD", "cardId": card id or exact heading text, "toIndex": number }
- { "type": "RESTYLE", "themeId": "professional"|"modern"|"bold"|"minimal"|"warm"|"dark"|"coral"|"forest"|"midnight"|"canvas" }
- { "type": "UPDATE_META", "patch": { "title"?: string, "description"?: string } }

Rules:
- Prefer the smallest set of actions that satisfies the instruction.
- When rewriting many cards, REPLACE_CARDS is fine.
- Only reference cards that exist unless inserting new ones.
- "rationale" explains the change in 1-3 sentences.`

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
      logger.warn(`Skipped document ${id}: not found in project ${projectId}`, 'PresentationAI')
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
    const structured = await presentationContextService.prepareForAI(projectId)
    if (structured.trim()) sections.push(structured)
  }

  if (documents.text) {
    sections.push(`=== LINKED REQUIREMENT DOCUMENTS ===${documents.text}`)
  }

  return { text: sections.join('\n\n'), titles: documents.titles }
}

function describeCards(cards: PresentationCard[]): string {
  return JSON.stringify(
    cards.map((card, index) => ({
      index,
      id: card.id,
      layout: card.layout,
      notes: card.notes,
      blocks: card.blocks
    })),
    null,
    2
  )
}

export class PresentationAIService {
  async generate(input: GeneratePresentationInput): Promise<GeneratedPresentationResult> {
    const documentIds = input.documentIds ?? []
    const prompt = input.prompt?.trim() ?? ''

    if (!prompt && documentIds.length === 0) {
      throw new Error('Add a prompt/outline or link at least one document first.')
    }

    const context = await buildContext(
      input.projectId,
      documentIds,
      input.includeKnowledge !== false,
      [prompt, 'presentation deck'].filter(Boolean).join(' ')
    )

    const userPrompt = [
      context.text,
      prompt ? `=== PRESENTATION BRIEF ===\n${prompt}` : '',
      input.themeId ? `Preferred themeId: ${input.themeId}` : '',
      input.tone ? `Tone: ${input.tone}` : '',
      input.cardCount ? `Target roughly ${input.cardCount} cards.` : '',
      'Create a polished presentation card deck from this material.'
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
          temperature: 0.4,
          maxTokens: 8192,
          json: true,
          requestType: 'FLOW_GENERATION',
          meta: { projectId: input.projectId, feature: 'presentation-generate' }
        }
      )

      const draft = parseJsonObject<PresentationDraft>(result.text || '{}')
      const built = buildCardsFromDraft(draft)

      if (built.cards.length === 0) {
        throw new Error('The AI did not return any cards. Try adding more detail or another document.')
      }

      return {
        title: built.title,
        themeId: input.themeId ?? built.themeId,
        cards: serializeCards(built.cards),
        summary: built.summary,
        sources: context.titles
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Presentation generation failed'
      logger.error(message, 'PresentationAI')
      throw new Error(message)
    }
  }

  async assist(input: PresentationAssistantInput): Promise<PresentationAssistantResult> {
    const instruction = input.instruction?.trim()
    if (!instruction) throw new Error('Describe the change you want first.')

    const cards = parseCards(input.cards)
    const context = await buildContext(
      input.projectId,
      input.documentIds ?? [],
      input.includeKnowledge !== false,
      instruction
    )

    const selected =
      input.selectedCardIds && input.selectedCardIds.length > 0
        ? `Focus on these card ids: ${input.selectedCardIds.join(', ')}`
        : ''

    const userPrompt = [
      context.text,
      input.title ? `Deck title: ${input.title}` : '',
      input.themeId ? `Current themeId: ${input.themeId}` : '',
      `=== CURRENT CARDS ===\n${describeCards(cards)}`,
      selected,
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
          temperature: 0.25,
          maxTokens: 4096,
          json: true,
          requestType: 'FLOW_GENERATION',
          meta: { projectId: input.projectId, feature: 'presentation-assist' }
        }
      )

      const raw = parseJsonObject<{ summary?: string; rationale?: string; actions?: unknown }>(
        result.text || '{}'
      )
      const proposal = buildPresentationProposal(raw, cards)

      if (proposal.actions.length === 0) {
        throw new Error('The AI did not propose any change that fits this presentation.')
      }

      return {
        summary: proposal.summary,
        rationale: proposal.rationale,
        actions: JSON.stringify(proposal.actions)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Presentation assistant failed'
      logger.error(message, 'PresentationAI')
      throw new Error(message)
    }
  }
}

export const presentationAIService = new PresentationAIService()
