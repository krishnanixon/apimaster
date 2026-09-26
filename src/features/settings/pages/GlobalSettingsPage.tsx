import { SettingsPageContent } from '@/features/settings/pages/SettingsPage'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'

export function GlobalSettingsPage() {
  return (
    <ModulePage>
      <PageHeader
        title="Settings"
        description="Customize Tessarok — AI providers, appearance, integrations, and export defaults"
        fluid
      />
      <PageContent fullBleed className="overflow-hidden">
        <SettingsPageContent global />
      </PageContent>
    </ModulePage>
  )
}
