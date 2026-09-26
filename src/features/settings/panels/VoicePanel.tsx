import { Link2 } from 'lucide-react'
import { VoiceAssistantSettingsHost } from '@/features/settings/hosts/VoiceSettingsHost'
import { SettingsNote, SettingsSection } from '@/features/settings/components/SettingsSection'

export function VoicePanel() {
  return (
    <SettingsSection>
      <SettingsNote icon={Link2}>
        Tess uses your <strong className="font-medium text-foreground">Vector DB</strong> for
        retrieval (RAG) and the keys from{' '}
        <strong className="font-medium text-foreground">AI</strong> for cloud speech. Configure
        those sections first if you want cloud or knowledge-aware replies.
      </SettingsNote>
      <VoiceAssistantSettingsHost />
    </SettingsSection>
  )
}
