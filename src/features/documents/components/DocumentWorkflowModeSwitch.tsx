import { useSettingsStore } from '@/shared/stores/settings.store'
import { cn } from '@/shared/lib/utils'
import type { DocumentWorkflowMode } from '@shared/types'

const OPTIONS: { value: DocumentWorkflowMode; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'expert', label: 'Expert' }
]

export function DocumentWorkflowModeSwitch() {
  const { settings, updateSettings } = useSettingsStore()
  const mode: DocumentWorkflowMode = settings?.documentWorkflowMode === 'expert' ? 'expert' : 'simple'

  const setMode = (next: DocumentWorkflowMode) => {
    if (!settings || next === mode) return
    void updateSettings({ documentWorkflowMode: next })
  }

  return (
    <div
      className="inline-flex h-7 items-center rounded-md border border-border/60 bg-muted/30 p-0.5"
      role="group"
      aria-label="Document workflow"
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setMode(value)}
          className={cn(
            'h-6 rounded px-2 text-[11px] font-medium',
            mode === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
