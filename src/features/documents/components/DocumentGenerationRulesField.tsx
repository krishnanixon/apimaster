import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { MAX_GENERATION_RULES_CHARS } from '@shared/lib/document-generation-rules'

const PLACEHOLDERS = {
  workspace:
    'Leave empty to keep the default generation style.\n\nExample:\n• Number requirements as REQ-001\n• Use British English\n• Include acceptance criteria for every functional requirement',
  project:
    'Leave empty to follow workspace rules (or the default if none are set).\n\nExample:\n• Healthcare product — use HIPAA-aware language\n• Do not mention competitor names\n• Prefer tables for requirement registers'
} as const

export function DocumentGenerationRulesField({
  value,
  onChange,
  scope,
  onSave,
  saving,
  dirty
}: {
  value: string
  onChange: (value: string) => void
  scope: 'workspace' | 'project'
  onSave?: () => void
  saving?: boolean
  dirty?: boolean
}) {
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, MAX_GENERATION_RULES_CHARS))}
        rows={8}
        placeholder={PLACEHOLDERS[scope]}
        className="min-h-[140px] resize-y font-[inherit] text-[13px] leading-relaxed"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {value.trim()
            ? `${value.trim().length.toLocaleString()} / ${MAX_GENERATION_RULES_CHARS.toLocaleString()} characters`
            : 'Empty = default document generation.'}
        </p>
        {onSave && (
          <Button type="button" size="sm" onClick={onSave} disabled={saving || dirty === false}>
            {saving ? 'Saving…' : dirty === false ? 'Saved' : 'Save rules'}
          </Button>
        )}
      </div>
    </div>
  )
}

export function useGenerationRulesDraft(stored: string | undefined) {
  const [draft, setDraft] = useState(stored ?? '')
  useEffect(() => {
    setDraft(stored ?? '')
  }, [stored])
  return {
    draft,
    setDraft,
    dirty: (stored ?? '') !== draft
  }
}
