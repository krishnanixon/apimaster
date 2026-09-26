import { ClipboardList } from 'lucide-react'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { ClipboardPanel } from '../components/ClipboardPanel'

export function ClipboardManagerPage() {
  return (
    <ModulePage>
      <PageHeader
        title="Clipboard Manager"
        description="History, search, pin, and paste. Ctrl+Shift+V (⌘⇧V on Mac) opens the picker over any app, including fullscreen."
        fluid
        actions={
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <ClipboardList className="h-3.5 w-3.5 text-primary" />
          </div>
        }
      />
      <PageContent fullBleed className="overflow-hidden">
        <ClipboardPanel />
      </PageContent>
    </ModulePage>
  )
}
