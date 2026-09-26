import { logger } from '../infra/logger.service'
import { aiRouter } from '../ai'
import type { AIChatMessage } from '../ai/types'
import type { DocumentLength } from '@shared/types'
import type {
  EditDocumentInput,
  EditDocumentSectionInput,
  EditDocumentSectionResult,
  EditSelectionInput,
  GenerateRequirementInput
} from '@shared/types'
import {
  buildSectionScaffoldHtml,
  getSectionBlueprints,
  getTypeSystemPrompt,
  type SectionBlueprint
} from '@shared/lib/document-prompts'
import { findHeadingSection, replaceHtmlSection } from '@shared/lib/document-html'
import { resolveSectionMaxTokens } from '@shared/lib/ai-credit-guard'
import { aiConfigService } from '../ai/config/ai-config.service'

function normalizeHtmlOutput(raw: string): string {
  let text = raw.trim()
  const fenceMatch = text.match(/^```(?:html)?\s*([\s\S]*?)```$/i)
  if (fenceMatch) text = fenceMatch[1].trim()
  return text
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const WORDS_BY_LENGTH: Record<DocumentLength, number> = {
  concise: 2000,
  standard: 4000,
  detailed: 7500,
  comprehensive: 12000,
  custom: 4000
}

/** Resolve the total word target the caller asked for, from any of the length fields. */
function resolveWordTarget(input: GenerateRequirementInput): number {
  if (input.wordTarget && input.wordTarget > 0) return input.wordTarget
  if (input.customWordCount && input.customWordCount > 0) return input.customWordCount
  if (input.documentLength) return WORDS_BY_LENGTH[input.documentLength] ?? 4000
  return 4000
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

export class AIService {
  /**
   * Stream a chat completion through the AI router. The router selects the
   * active provider (OpenAI / Ollama / Hybrid), so switching providers in the
   * header changes where chat runs without touching this call site. The
   * `model`/`temperature`/`maxTokens` here are the project/app defaults; the
   * router overrides the model per the selected provider.
   */
  async *streamChat(
    messages: AIChatMessage[],
    model: string,
    temperature: number,
    maxTokens: number,
    signal?: AbortSignal,
    meta?: { projectId?: string; feature?: string }
  ): AsyncGenerator<string> {
    yield* aiRouter.streamChat(messages, {
      model,
      temperature,
      maxTokens,
      signal,
      requestType: 'CHAT',
      meta
    })
  }

  /**
   * Generate a full document.
   *
   * A single completion cannot reliably reach large word targets (models tend
   * to stop around 500–1,500 words no matter the `max_tokens` cap). To hit the
   * requested length, the document is generated section-by-section: each
   * blueprint section is written in its own request with a proportional word
   * budget, then all sections are stitched into one HTML document. Sections are
   * generated concurrently so total latency stays close to a single request.
   */
  async generateRequirement(
    input: GenerateRequirementInput,
    projectContext?: string,
    knowledgeContext?: string,
    modelConfig?: { model?: string; temperature?: number; generationRules?: string }
  ): Promise<string> {
    const model = modelConfig?.model
    const temperature = modelConfig?.temperature ?? 0.7
    const combinedContext = [projectContext, knowledgeContext].filter(Boolean).join('\n\n')
    const systemMessage = getTypeSystemPrompt(
      input.type,
      input.style,
      combinedContext || undefined,
      modelConfig?.generationRules
    )
    const wordTarget = resolveWordTarget(input)
    const blueprints = getSectionBlueprints(input.type)

    try {
      const numSections = Math.max(1, blueprints.length)
      const perSectionWords = Math.max(250, Math.round(wordTarget / numSections))
      const outline = blueprints
        .map((s, i) => `${i + 1}. ${s.title} — subsections: ${s.subsections.join(', ')}`)
        .join('\n')

      const sections = await mapWithConcurrency(blueprints, 2, (section, index) =>
        this.generateDocumentSection({
          model,
          temperature,
          systemMessage,
          sharedContext: input.prompt,
          outline,
          section,
          sectionNumber: index + 1,
          perSectionWords,
          requestMaxTokens: input.maxTokens,
          projectId: input.projectId
        }).catch((error) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          logger.warn(
            `Section "${section.title}" generation failed (${message}); using scaffold fallback`,
            'AIService'
          )
          return buildSectionScaffoldHtml(section, index, {
            title: input.title ?? section.title,
            projectName: '',
            description: ''
          })
        })
      )

      const titleHtml = input.title ? `<h1>${escapeHtmlText(input.title)}</h1>` : ''
      const body = sections.map((html) => html.trim()).filter(Boolean).join('\n')
      const full = [titleHtml, body].filter(Boolean).join('\n')

      if (!body.trim()) {
        throw new Error('The model returned no content. Please try again.')
      }
      return full
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error'
      logger.error(`AI generate error: ${message}`, 'AIService')
      throw new Error(message)
    }
  }

  /** Generate a single section of a larger document with its own word budget. */
  private async generateDocumentSection(params: {
    model?: string
    temperature: number
    systemMessage: string
    sharedContext: string
    outline: string
    section: SectionBlueprint
    sectionNumber: number
    perSectionWords: number
    requestMaxTokens?: number
    projectId?: string
  }): Promise<string> {
    const {
      model,
      temperature,
      systemMessage,
      sharedContext,
      outline,
      section,
      sectionNumber,
      perSectionWords,
      requestMaxTokens,
      projectId
    } = params

    const sectionInstruction = `${sharedContext}

--- YOUR TASK ---
The context above describes the WHOLE document, but right now you must write ONLY one section of it. Ignore any instruction above about total document length or writing every section — another process writes the other sections.

Full document outline (for orientation only — DO NOT write these other sections):
${outline}

Write ONLY section ${sectionNumber}: "${section.title}".
- Required subsections: ${section.subsections.join(', ')}
- Section focus: ${section.guidance}
- Write approximately ${perSectionWords} words for THIS section alone — be thorough, specific to the project context, and avoid filler or repeating content that belongs to other sections.
- Begin with <h2>${sectionNumber}. ${section.title}</h2> and use <h3> headings for each subsection.
- Return ONLY the HTML for this one section: no <html>/<head>/<body> wrappers, no markdown fences, no commentary.`

    const maxTokens = resolveSectionMaxTokens(
      perSectionWords,
      requestMaxTokens,
      aiConfigService.get().openai.maxTokens
    )

    const result = await aiRouter.chat(
      [
        { role: 'system', content: systemMessage },
        { role: 'user', content: sectionInstruction }
      ],
      {
        model,
        temperature,
        maxTokens,
        requestType: 'DOCUMENTATION',
        meta: { projectId, feature: 'generate' }
      }
    )

    return normalizeHtmlOutput(result.text)
  }

  async editSelection(input: EditSelectionInput): Promise<string> {
    const style = input.style ?? 'professional'

    try {
      const result = await aiRouter.chat(
        [
          {
            role: 'system',
            content: `You edit a short text selection from a ${style} requirement document.
Apply the user's instruction to ONLY the selected text.
Return ONLY the replacement text — no quotes, no markdown fences, no commentary.
Preserve inline formatting intent (lists, emphasis) using simple HTML tags only when needed.
Do not return the full document.`
          },
          {
            role: 'user',
            content: `Instruction: ${input.instruction}\n\nSelected text:\n${input.selectedText}`
          }
        ],
        {
          temperature: 0.4,
          maxTokens: 2048,
          requestType: 'CLEANUP',
          meta: { projectId: input.projectId, feature: 'edit-selection' }
        }
      )

      let text = (result.text || input.selectedText).trim()
      const fenceMatch = text.match(/^```(?:html|text)?\s*([\s\S]*?)```$/i)
      if (fenceMatch) text = fenceMatch[1].trim()
      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error'
      logger.error(`AI selection edit error: ${message}`, 'AIService')
      throw new Error(message)
    }
  }

  async editDocument(
    input: EditDocumentInput,
    knowledgeContext?: string,
    generationRules?: string
  ): Promise<string> {
    const style = input.style ?? 'professional'
    const basePrompt = getTypeSystemPrompt(
      input.type ?? 'requirements',
      style,
      knowledgeContext,
      generationRules
    )
    const systemMessage = `${basePrompt}

You are editing an existing document. Apply the user's instruction while preserving structure, tables, and formatting.
Return ONLY the complete updated HTML document — no markdown, no code fences, no commentary.`

    try {
      const result = await aiRouter.chat(
        [
          { role: 'system', content: systemMessage },
          {
            role: 'user',
            content: `Document title: ${input.title ?? 'Untitled'}\n\nInstruction: ${input.instruction}\n\nCurrent HTML:\n${input.htmlContent}`
          }
        ],
        {
          temperature: 0.5,
          maxTokens: 8192,
          requestType: 'DOCUMENTATION',
          meta: { projectId: input.projectId, feature: 'edit-document' }
        }
      )

      return normalizeHtmlOutput(result.text || input.htmlContent)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error'
      logger.error(`AI edit error: ${message}`, 'AIService')
      throw new Error(message)
    }
  }

  /**
   * Section-scoped edit: only the targeted section's HTML is sent to the model
   * and only that section is replaced. Reduces hallucination and drift versus
   * a full-document rewrite when the user only wants one section changed.
   */
  async editSection(
    input: EditDocumentSectionInput,
    knowledgeContext?: string,
    generationRules?: string
  ): Promise<EditDocumentSectionResult> {
    const section = findHeadingSection(input.htmlContent, input.sectionTitle)
    if (!section) {
      throw new Error(`Section "${input.sectionTitle}" was not found in this document.`)
    }

    const style = input.style ?? 'professional'
    const basePrompt = getTypeSystemPrompt(
      input.type ?? 'requirements',
      style,
      knowledgeContext,
      generationRules
    )
    const systemMessage = `${basePrompt}

You are editing ONLY ONE SECTION of a larger document. Apply the user's instruction to this section only.
Keep the section's opening heading (same tag level, same or refined title) unless explicitly told to rename it.
Preserve any tables, lists, and formatting conventions used elsewhere in the document.
Return ONLY the replacement HTML for this section — no markdown, no code fences, no commentary, and do not include content from other sections.`

    try {
      const result = await aiRouter.chat(
        [
          { role: 'system', content: systemMessage },
          {
            role: 'user',
            content: `Document title: ${input.title ?? 'Untitled'}\n\nInstruction: ${input.instruction}\n\nCurrent section HTML ("${section.title}"):\n${section.html}`
          }
        ],
        {
          temperature: 0.5,
          maxTokens: 4096,
          requestType: 'DOCUMENTATION',
          meta: { projectId: input.projectId, feature: 'edit-section' }
        }
      )

      const sectionHtml = normalizeHtmlOutput(result.text || section.html)
      const fullHtml = replaceHtmlSection(input.htmlContent, section, sectionHtml)
      return { fullHtml, sectionHtml }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error'
      logger.error(`AI section edit error: ${message}`, 'AIService')
      throw new Error(message)
    }
  }

  /**
   * Title generation is a lightweight "background" task, routed as TITLE so that
   * in Hybrid/Ollama mode it runs on the local model and never spends OpenAI
   * tokens. Falls back to a truncated first message if generation fails.
   */
  async generateConversationTitle(firstMessage: string): Promise<string> {
    try {
      const result = await aiRouter.chat(
        [
          {
            role: 'system',
            content:
              'Generate a short, descriptive title (max 6 words) for a conversation based on the first message. Return only the title, no quotes.'
          },
          { role: 'user', content: firstMessage }
        ],
        { temperature: 0.5, maxTokens: 30, requestType: 'TITLE', meta: { feature: 'title' } }
      )
      const title = result.text.trim().replace(/^["']|["']$/g, '')
      return title || firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '')
    } catch {
      return firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '')
    }
  }
}

export const aiService = new AIService()
