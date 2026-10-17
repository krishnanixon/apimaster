import { useEffect, lazy, Suspense, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { PRODUCT_NAME } from '@shared/constants/product'
import { useSettingsStore, applyTheme } from '@/shared/stores/settings.store'
import { useUIStore } from '@/shared/stores/ui.store'
import { BootScreen } from '@/shared/components/BootScreen'
import { AppShell } from '@/shared/components/layout/AppShell'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
import { useMacWindowChrome } from '@/shared/hooks/useMacWindowChrome'
import { SetupFlow, type SetupDestination } from '@/features/onboarding/SetupFlow'
import { TermsUpdateScreen } from '@/features/onboarding/TermsUpdateScreen'
import {
  readOnboardingRecord,
  resolveOnboardingPhase,
  type OnboardingPhase
} from '@/features/onboarding/onboarding-state'
import { TermsPage } from '@/features/legal/pages/TermsPage'
import type { ApiStudioLaunchState } from '@/modules/api-studio/services/launchIntent'
import { startMcpToolBridge } from '@/modules/api-studio/services/mcp/bridge'
import { startCollectionFolderSync } from '@/modules/api-studio/services/collectionFolderSync'
import { GlobalSettingsPage } from '@/features/settings/pages/GlobalSettingsPage'
import { DiagnosticsPage } from '@/features/diagnostics/pages/DiagnosticsPage'

const MockServersPage = lazy(() =>
  import('@/modules/mock-server/pages/MockServersPage').then((m) => ({
    default: m.MockServersPage
  }))
)

const AIEngineerPage = lazy(() =>
  import('@/modules/ai-engineer/pages/AIEngineerPage').then((m) => ({
    default: m.AIEngineerPage
  }))
)

const CodeScannerPage = lazy(() =>
  import('@/modules/code-scanner/pages/CodeScannerPage').then((m) => ({
    default: m.CodeScannerPage
  }))
)

const ApiStudioPage = lazy(() =>
  import('@/modules/api-studio/pages/ApiStudioPage').then((m) => ({
    default: m.ApiStudioPage
  }))
)

export function App() {
  useMacWindowChrome()
  useEffect(() => startMcpToolBridge(), [])
  useEffect(() => startCollectionFolderSync(), [])
  const { loadSettings, loadApiKeyStatus, settings } = useSettingsStore()
  const applyAppearance = useUIStore((s) => s.applyAppearance)
  const navigate = useNavigate()
  const [phase, setPhase] = useState<OnboardingPhase | null>(null)
  const [acceptedTermsVersion, setAcceptedTermsVersion] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
    loadApiKeyStatus()
  }, [loadSettings, loadApiKeyStatus])

  useEffect(() => {
    let cancelled = false
    void readOnboardingRecord()
      .then((record) => {
        if (cancelled) return
        setAcceptedTermsVersion(record.termsVersion)
        setPhase(resolveOnboardingPhase(record))
      })
      .catch(() => {
        // Unreadable state: fall back to first-run setup rather than skipping the terms.
        if (!cancelled) setPhase('setup')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    applyAppearance()
  }, [applyAppearance])

  useEffect(() => {
    if (settings?.theme) applyTheme(settings.theme)
  }, [settings?.theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (settings?.theme === 'system') applyTheme('system')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings?.theme])

  function finishSetup(destination: SetupDestination) {
    if (destination === 'ai-settings') {
      navigate('/settings?tab=ai', { replace: true })
    } else {
      const state: ApiStudioLaunchState | undefined =
        destination === 'workspace' ? undefined : { apiStudioIntent: destination }
      navigate('/', { replace: true, state })
    }
    setPhase('complete')
  }

  if (!phase) {
    return <BootScreen message={`Starting ${PRODUCT_NAME}…`} />
  }

  if (phase !== 'complete') {
    return (
      <TooltipProvider delayDuration={200} skipDelayDuration={300}>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          {phase === 'setup' ? (
            <SetupFlow onComplete={finishSetup} />
          ) : (
            <TermsUpdateScreen
              previousVersion={acceptedTermsVersion}
              onAccepted={() => setPhase('complete')}
            />
          )}
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              <Suspense fallback={<BootScreen message="Loading…" />}>
                <ApiStudioPage />
              </Suspense>
            }
          />
          <Route
            path="/mock-servers"
            element={
              <Suspense fallback={<BootScreen message="Loading…" />}>
                <MockServersPage />
              </Suspense>
            }
          />
          <Route
            path="/ai-engineer"
            element={
              <Suspense fallback={<BootScreen message="Loading…" />}>
                <AIEngineerPage />
              </Suspense>
            }
          />
          <Route
            path="/code-scanner"
            element={
              <Suspense fallback={<BootScreen message="Loading…" />}>
                <CodeScannerPage />
              </Suspense>
            }
          />
          <Route path="/settings" element={<GlobalSettingsPage />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </TooltipProvider>
  )
}
