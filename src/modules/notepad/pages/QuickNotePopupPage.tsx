import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { useSettingsStore, applyTheme } from '@/shared/stores/settings.store'
import { QuickNotePopup } from '../components/QuickNotePopup'

export function QuickNotePopupPage() {
  const { loadSettings, settings } = useSettingsStore()

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (settings?.theme) applyTheme(settings.theme)
  }, [settings?.theme])

  return (
    <div className="h-screen overflow-hidden bg-background p-1">
      <QuickNotePopup />
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: 'rounded-xl border border-border bg-card text-foreground shadow-float',
          duration: 2500
        }}
      />
    </div>
  )
}
