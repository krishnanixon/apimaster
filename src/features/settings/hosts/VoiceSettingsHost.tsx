import { useEffect } from 'react'
import { VoiceSettingsPanel } from '@/modules/voice-assistant/components/VoiceSettingsPanel'
import { useVoiceAssistantStore } from '@/modules/voice-assistant/stores/voice.store'

export function VoiceAssistantSettingsHost() {
  const { settings, microphones, load, updateSettings, clearData } = useVoiceAssistantStore()

  useEffect(() => {
    void load()
  }, [load])

  return (
    <VoiceSettingsPanel
      settings={settings}
      microphones={microphones}
      onChange={(patch) => void updateSettings(patch)}
      onClear={() => void clearData()}
    />
  )
}
