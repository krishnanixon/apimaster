import { parseVoiceModelOutput } from './voice-model-output'

export interface PipelineSTT {
  transcribe(audio: { mimeType: string; dataBase64: string }): Promise<{ text: string }>
}

export interface PipelineAI {
  chat(transcript: string, toolResults: string[]): Promise<string>
}

export interface PipelineTTS {
  speak(text: string): Promise<void>
  stop(): void
}

export interface PipelineTool {
  execute(name: string, input: Record<string, unknown>): Promise<string>
}

export interface VoicePipelineResult {
  transcript: string
  response: string
  toolOutputs: string[]
  spoken: boolean
}

/**
 * Provider-agnostic STT → AI → optional tool → AI → TTS path.
 * Used by integration tests; the Electron VoiceEngine follows the same sequence.
 */
export async function runVoicePipeline(input: {
  audio: { mimeType: string; dataBase64: string }
  stt: PipelineSTT
  ai: PipelineAI
  tts: PipelineTTS
  tools?: PipelineTool
  signal?: AbortSignal
}): Promise<VoicePipelineResult> {
  if (input.signal?.aborted) throw new Error('cancelled')

  const transcript = (await input.stt.transcribe(input.audio)).text.trim()
  if (!transcript) throw new Error('Empty transcript')

  const toolOutputs: string[] = []
  let raw = await input.ai.chat(transcript, toolOutputs)
  let parsed = parseVoiceModelOutput(raw)

  if (parsed.toolName) {
    if (!input.tools) throw new Error('Tool calling is not available')
    const output = await input.tools.execute(parsed.toolName, parsed.toolInput ?? {})
    toolOutputs.push(output)
    raw = await input.ai.chat(transcript, toolOutputs)
    parsed = parseVoiceModelOutput(raw)
  }

  const response = parsed.text.trim()
  if (!response) throw new Error('Empty AI response')
  if (input.signal?.aborted) {
    input.tts.stop()
    throw new Error('cancelled')
  }
  await input.tts.speak(response)
  return { transcript, response, toolOutputs, spoken: true }
}
