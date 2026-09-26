import { useState } from 'react'
import { FileText, HardDrive, Wand2 } from 'lucide-react'
import { DocumentWorkflowModeSwitch } from '@/features/documents/components/DocumentWorkflowModeSwitch'
import {
  DocumentGenerationRulesField,
  useGenerationRulesDraft
} from '@/features/documents/components/DocumentGenerationRulesField'
import {
  SegmentedControl,
  SettingsGroup,
  SettingsNote,
  SettingsRow,
  SettingsSection
} from '@/features/settings/components/SettingsSection'
import { useSettingsStore } from '@/shared/stores/settings.store'

const AUTO_SAVE_PRESETS = [
  { label: 'Off', value: 0 },
  { label: '1s', value: 1000 },
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 }
] as const

export function GeneralPanel({ global }: { global?: boolean }) {
  const { settings, updateSettings } = useSettingsStore()
  const [savingRules, setSavingRules] = useState(false)
  const {
    draft: rulesDraft,
    setDraft: setRulesDraft,
    dirty: rulesDirty
  } = useGenerationRulesDraft(settings?.documentGenerationRules)

  const autoSaveMs = settings?.autoSaveMs ?? 3000

  return (
    <SettingsSection>
      <SettingsGroup
        title="Documents"
        description="How the document editor and generator behave."
        icon={FileText}
        flush
      >
        <SettingsRow
          label="Workflow mode"
          description="Simple uses a 4-step generate flow. Expert unlocks the 9-step wizard and the full lifecycle navigator."
          stacked
        >
          <DocumentWorkflowModeSwitch />
        </SettingsRow>
        <SettingsRow
          label="Auto-save delay"
          description={
            autoSaveMs === 0
              ? 'Auto-save is off — documents only save when you save them manually.'
              : `Saves ${autoSaveMs / 1000}s after you stop typing.`
          }
        >
          <SegmentedControl
            ariaLabel="Auto-save delay"
            value={autoSaveMs}
            options={AUTO_SAVE_PRESETS}
            onChange={(value) => settings && updateSettings({ ...settings, autoSaveMs: value })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Generation rules"
        description="Optional rules applied to every AI-generated document in this workspace. Project rules take precedence when they conflict."
        icon={Wand2}
      >
        <DocumentGenerationRulesField
          scope="workspace"
          value={rulesDraft}
          onChange={setRulesDraft}
          dirty={rulesDirty}
          saving={savingRules}
          onSave={() => {
            if (!settings) return
            setSavingRules(true)
            void updateSettings({ documentGenerationRules: rulesDraft }).finally(() =>
              setSavingRules(false)
            )
          }}
        />
      </SettingsGroup>

      <SettingsNote icon={HardDrive} title="Your data stays on this device">
        Projects, documents, flows, and knowledge bases are stored locally. Nothing leaves your
        machine except requests to the AI provider you choose.
        {global && (
          <span className="mt-2 block">
            Each project manages its own context — summary, requirements, APIs, and branding — in{' '}
            <strong className="font-medium text-foreground">Knowledge Base → Overview</strong>.
          </span>
        )}
      </SettingsNote>
    </SettingsSection>
  )
}
