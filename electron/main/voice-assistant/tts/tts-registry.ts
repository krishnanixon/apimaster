import type { VoiceTTSProviderId } from '@shared/types/voice-assistant'
import type { TTSProvider } from './TTSProvider'
import { systemTTSProvider } from './providers/SystemTTSProvider'
import { cloudTTSProvider } from './providers/CloudTTSProvider'
import { kokoroTTSProvider } from './providers/KokoroTTSProvider'

const PROVIDERS: Record<VoiceTTSProviderId, TTSProvider> = {
  system: systemTTSProvider,
  openai: cloudTTSProvider,
  local: kokoroTTSProvider
}

export function getTTSProvider(id: VoiceTTSProviderId): TTSProvider {
  return PROVIDERS[id]
}

export function stopAllTTS(): void {
  for (const provider of Object.values(PROVIDERS)) {
    provider.stop()
  }
}
