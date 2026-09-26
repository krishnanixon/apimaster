import type {
  VoiceAIProviderId,
  VoiceAssistantSettings,
  VoiceProcessingMode
} from '@shared/types/voice-assistant'

export interface RoutedVoiceModel {
  provider: VoiceAIProviderId
  requestType: 'CHAT'
  processingMode: VoiceProcessingMode
}

export function routeVoiceModel(
  settings: VoiceAssistantSettings,
  workbenchMode: 'openai' | 'ollama' | 'hybrid' = 'openai'
): RoutedVoiceModel {
  if (settings.privacy.preferLocalProcessing || settings.ai.provider === 'ollama') {
    return { provider: 'ollama', requestType: 'CHAT', processingMode: 'local' }
  }
  if (settings.ai.provider === 'openai') {
    return { provider: 'openai', requestType: 'CHAT', processingMode: 'cloud' }
  }
  if (settings.ai.provider === 'anthropic') {
    return { provider: 'anthropic', requestType: 'CHAT', processingMode: 'cloud' }
  }

  if (workbenchMode === 'ollama')
    return { provider: 'workbench', requestType: 'CHAT', processingMode: 'local' }
  if (workbenchMode === 'hybrid')
    return { provider: 'workbench', requestType: 'CHAT', processingMode: 'hybrid' }
  return { provider: 'workbench', requestType: 'CHAT', processingMode: 'cloud' }
}

export function isCloudVoicePipeline(
  settings: VoiceAssistantSettings,
  workbenchMode: 'openai' | 'ollama' | 'hybrid' = 'openai'
): boolean {
  const sttCloud = settings.stt.provider === 'openai-whisper'
  const ttsCloud = settings.tts.provider === 'openai'
  const aiCloud = routeVoiceModel(settings, workbenchMode).processingMode !== 'local'
  return sttCloud || ttsCloud || aiCloud
}
