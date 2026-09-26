import type { AssistantTool } from '../types'
import { ASSISTANT_NAME } from '@shared/constants/product'
import { voiceMemoryRepository } from '../../voice-db'

export const rememberFactTool: AssistantTool = {
  name: 'remember_fact',
  description: `Store a fact ${ASSISTANT_NAME} should remember later. Use when the user says remember this, keep that in mind, or similar.`,
  riskLevel: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      fact: { type: 'string', description: 'The fact to remember, in a short sentence' },
      topic: { type: 'string', description: 'Optional short topic label' }
    },
    required: ['fact'],
    additionalProperties: false
  },
  async execute(input) {
    const { fact, topic } = input as { fact: string; topic?: string }
    try {
      const saved = await voiceMemoryRepository.remember({
        content: String(fact ?? ''),
        topic: topic ? String(topic) : undefined,
        source: 'spoken'
      })
      return { ok: true, output: `Remembered: ${saved.content}` }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not save that memory.' }
    }
  }
}

export const recallFactsTool: AssistantTool = {
  name: 'recall_facts',
  description: `Look up facts ${ASSISTANT_NAME} previously remembered. Use when the user asks what you remember.`,
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional topic or search text' }
    },
    additionalProperties: false
  },
  async execute(input) {
    const query = String((input as { query?: string }).query ?? '').trim()
    try {
      const rows = query
        ? await voiceMemoryRepository.search(query, 16)
        : await voiceMemoryRepository.list(16)
      if (rows.length === 0) return { ok: true, output: 'I do not have any saved memories yet.' }
      return {
        ok: true,
        output: rows.map((row) => `- ${row.topic ? `${row.topic}: ` : ''}${row.content}`).join('\n')
      }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not recall memories.' }
    }
  }
}
