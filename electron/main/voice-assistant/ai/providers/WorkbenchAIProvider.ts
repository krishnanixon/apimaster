import { parseVoiceModelOutput } from '@shared/lib/voice-model-output'
import { DEFAULT_AI_MODEL } from '@shared/lib/ai-models'
import { aiRouter } from '../../../ai'
import type { AIChatMessage } from '../../../ai/types'
import type { VoiceAIProvider, VoiceAIRequest, VoiceAIResponse } from '../AIProvider'

function toChatMessages(request: VoiceAIRequest): AIChatMessage[] {
  return request.messages.map((m) => ({ role: m.role, content: m.content }))
}

function toResponse(text: string): VoiceAIResponse {
  const parsed = parseVoiceModelOutput(text)
  if (parsed.toolName) {
    return {
      text: '',
      toolCalls: [{ id: `call_${parsed.toolName}`, name: parsed.toolName, arguments: parsed.toolInput ?? {} }]
    }
  }
  return { text: parsed.text, toolCalls: [] }
}

function chatOptions(request: VoiceAIRequest) {
  return {
    temperature: request.settings.ai.temperature,
    maxTokens: request.settings.ai.maxTokens,
    model: DEFAULT_AI_MODEL,
    signal: request.signal,
    requestType: 'CHAT' as const,
    meta: { feature: 'voice-assistant' }
  }
}

export class WorkbenchAIProvider implements VoiceAIProvider {
  readonly id = 'workbench'

  async chat(request: VoiceAIRequest): Promise<VoiceAIResponse> {
    const result = await aiRouter.chat(toChatMessages(request), chatOptions(request))
    return toResponse(result.text)
  }

  async *stream(request: VoiceAIRequest) {
    for await (const text of aiRouter.streamChat(toChatMessages(request), chatOptions(request))) {
      yield { text }
    }
  }
}

export const workbenchAIProvider = new WorkbenchAIProvider()
