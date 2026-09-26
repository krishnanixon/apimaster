import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { useSettingsStore, applyTheme } from '@/shared/stores/settings.store'
import { ClipboardQuickPicker } from '../components/ClipboardQuickPicker'

export function ClipboardQuickPickerPage() {
  const { loadSettings, settings } = useSettingsStore()

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (settings?.theme) applyTheme(settings.theme)
  }, [settings?.theme])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <ClipboardQuickPicker />
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: 'rounded-lg border border-border bg-card text-foreground shadow-float text-xs',
          duration: 1800
        }}
      />
    </div>
  )
}
