import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, HardDrive, Loader2, RefreshCw, Rocket, Scale } from 'lucide-react'
import type { UpdateStatus } from '@shared/types'
import { AppLogo } from '@/shared/components/AppLogo'
import { COMPANY_NAME, PRODUCT_NAME, PRODUCT_TAGLINE } from '@shared/constants/product'
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
import { SettingToggle } from '@/features/settings/components/SettingToggle'
import { useUpdateStatus } from '@/features/updates/useUpdateStatus'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

/** The running build's version, from app.getVersion() in the main process. */
function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    void waitForDesktopApi().then((api) => api?.app.getVersion().then(setVersion))
  }, [])
  return version
}

function updateDescription(status: UpdateStatus | null): string {
  if (!status) return 'Checking the installed version…'
  switch (status.phase) {
    case 'checking':
      return 'Checking GitHub releases…'
    case 'up-to-date':
      return 'You have the latest version.'
    case 'available':
      return `Version ${status.latestVersion} is available to download.`
    case 'downloading':
      return `Downloading ${status.latestVersion}… ${status.progress ?? 0}%`
    case 'downloaded':
      return `Version ${status.latestVersion} is ready. Restart to update.`
    case 'error':
      return status.error ?? 'Update check failed.'
    default:
      return status.mode === 'notify'
        ? 'New versions are announced here with a download link.'
        : 'New versions download in the background.'
  }
}

function UpdatesGroup() {
  const version = useAppVersion()
  const { status, check, install, openRelease } = useUpdateStatus()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const busy = status?.phase === 'checking' || status?.phase === 'downloading'
  const unsupported = status?.mode === 'unsupported'

  return (
    <SettingsGroup title="Updates" icon={RefreshCw} flush>
      <SettingsRow
        label={version ? `Version ${version}` : 'Version'}
        description={updateDescription(status)}
      >
        {status?.phase === 'downloaded' ? (
          <Button size="sm" onClick={() => void install()}>
            Restart and update
          </Button>
        ) : status?.phase === 'available' && status.releaseUrl ? (
          <Button size="sm" onClick={() => void openRelease(status.releaseUrl!)}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || unsupported || !status}
            onClick={() => void check()}
          >
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Check for updates
          </Button>
        )}
      </SettingsRow>
      <SettingToggle
        label="Check for updates automatically"
        description={
          status?.mode === 'notify'
            ? 'Checks GitHub releases on launch and every 6 hours. When off, nothing is checked unless you ask.'
            : 'Checks GitHub releases on launch and every 6 hours, and downloads updates in the background. When off, nothing is checked unless you ask.'
        }
        checked={settings?.autoUpdate ?? true}
        disabled={!settings || unsupported}
        onChange={(autoUpdate) => void updateSettings({ autoUpdate })}
      />
    </SettingsGroup>
  )
}

function AppVersionBadge() {
  const version = useAppVersion()
  if (!version) return null
  return (
    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
      v{version}
    </span>
  )
}

export function AboutPanel() {
  const [termsOpen, setTermsOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <SettingsSection>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-soft">
        <AppLogo className="h-14 w-14 drop-shadow-sm" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight">{PRODUCT_NAME}</h3>
          <p className="text-sm text-muted-foreground">{PRODUCT_TAGLINE}</p>
          <p className="mt-1 text-xs text-muted-foreground/80">A product of {COMPANY_NAME}</p>
        </div>
        <AppVersionBadge />
      </div>

      <UpdatesGroup />

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
          label="2. Send your first request"
          description="Create a collection, or import from Postman or cURL."
        >
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            Open {PRODUCT_NAME}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Privacy & legal" icon={Scale} flush>
        <SettingsRow
          label="Local-first storage"
          description="All collections, environments, and settings are stored on this device."
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
