import { SettingsPageContent } from '@/features/settings/pages/SettingsPage'
import { ModulePage, PageContent } from '@/shared/components/layout/ModulePage'

// Settings panels render their own breadcrumb header, so the page skips PageHeader.
export function GlobalSettingsPage() {
  return (
    <ModulePage>
      <PageContent fullBleed className="overflow-hidden">
        <SettingsPageContent global />
      </PageContent>
    </ModulePage>
  )
}
