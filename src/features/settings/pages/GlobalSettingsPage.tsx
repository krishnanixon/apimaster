import { SettingsPageContent } from '@/features/settings/pages/SettingsPage'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { PRODUCT_NAME } from '@shared/constants/product'

export function GlobalSettingsPage() {
  return (
    <ModulePage>
      <PageHeader
        title="Settings"
        description={`Customize ${PRODUCT_NAME} — AI providers, appearance, integrations, and export defaults`}
        fluid
      />
      <PageContent fullBleed className="overflow-hidden">
        <SettingsPageContent global />
      </PageContent>
    </ModulePage>
  )
}
