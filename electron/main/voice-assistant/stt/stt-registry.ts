import type { VoiceSTTProviderId } from '@shared/types/voice-assistant'
import type { STTProvider } from './STTProvider'
import { cloudSTTProvider } from './providers/CloudSTTProvider'
import { localWhisperProvider } from './providers/LocalWhisperProvider'

const PROVIDERS: Record<Exclude<VoiceSTTProviderId, 'browser'>, STTProvider> = {
  'openai-whisper': cloudSTTProvider,
  'local-whisper': localWhisperProvider
}

export function getSTTProvider(id: VoiceSTTProviderId): STTProvider | null {
  if (id === 'browser') return null
  return PROVIDERS[id]
}
