import { StickyNote } from 'lucide-react'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { NotepadDashboard } from '../components/NotepadDashboard'

export function NotepadPage() {
  return (
    <ModulePage>
      <PageHeader
        title="Notepad"
        description="Local-first notes with folders, tags, search, and version history"
        fluid
        actions={
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <StickyNote className="h-3.5 w-3.5 text-primary" />
          </div>
        }
      />
      <PageContent fullBleed className="overflow-hidden">
        <NotepadDashboard />
      </PageContent>
    </ModulePage>
  )
}
