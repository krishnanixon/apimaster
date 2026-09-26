import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HardDrive, Rocket, Scale } from 'lucide-react'
import { AppLogo } from '@/shared/components/AppLogo'
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@shared/constants/product'
import {
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
  TERMS_TITLE,
  TERMS_VERSION
} from '@shared/constants/terms'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from '@/features/settings/components/SettingsSection'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { ScrollArea } from '@/shared/components/ui/scroll-area'

export function AboutPanel() {
  const [termsOpen, setTermsOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <SettingsSection>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-soft">
        <AppLogo className="h-14 w-14 rounded-xl shadow-soft" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight">{PRODUCT_NAME}</h3>
          <p className="text-sm text-muted-foreground">{PRODUCT_TAGLINE}</p>
        </div>
        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
          v1.0.0
        </span>
      </div>

      <SettingsGroup title="Getting started" icon={Rocket} flush>
        <SettingsRow
          label="1. Connect an AI provider"
          description="Add an API key or point to a local Ollama server."
        >
          <Button variant="outline" size="sm" onClick={() => navigate('/settings?tab=ai')}>
            Open AI settings
          </Button>
        </SettingsRow>
        <SettingsRow
          label="2. Create a project"
          description="Projects hold your documents, flows, and knowledge base."
        >
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
            Go to dashboard
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Privacy & legal" icon={Scale} flush>
        <SettingsRow
          label="Local-first storage"
          description="All projects and settings are stored on this device."
        >
          <HardDrive className="h-4 w-4 text-muted-foreground" />
        </SettingsRow>
        <SettingsRow
          label={TERMS_TITLE}
          description={`Version ${TERMS_VERSION} · Updated ${TERMS_LAST_UPDATED}`}
        >
          <Button variant="outline" size="sm" onClick={() => setTermsOpen(true)}>
            Read
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>{TERMS_TITLE}</DialogTitle>
            <DialogDescription>
              Version {TERMS_VERSION} · Updated {TERMS_LAST_UPDATED}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[min(50vh,420px)] pr-3">
            <div className="space-y-4 pb-2">
              {TERMS_SECTIONS.map((section) => (
                <div key={section.heading}>
                  <h4 className="text-sm font-semibold">{section.heading}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {section.body}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
