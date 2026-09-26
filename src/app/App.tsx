import { useEffect, lazy, Suspense, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useSettingsStore, applyTheme } from '@/shared/stores/settings.store'
import { useUIStore } from '@/shared/stores/ui.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { BootScreen } from '@/shared/components/BootScreen'
import { AppLogo } from '@/shared/components/AppLogo'
import { AppShell } from '@/shared/components/layout/AppShell'
import { WindowOpenOverlay } from '@/shared/components/layout/WindowOpenOverlay'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
import { PRODUCT_NAME } from '@shared/constants/product'
import { getModuleWindowProfile } from '@shared/lib/module-windows'
import { isModuleWindowView, isProjectWindowView } from '@/shared/lib/windows'
import { useMacWindowChrome } from '@/shared/hooks/useMacWindowChrome'
import { SetupFlow, loadOnboardingComplete } from '@/features/onboarding/SetupFlow'
import { DashboardPage } from '@/features/projects/pages/DashboardPage'
import { ProjectsPage } from '@/features/projects/pages/ProjectsPage'
import { ProjectProvider } from '@/features/projects/components/ProjectProvider'
import { ChatPage } from '@/features/chat/pages/ChatPage'
import { DocumentsPage } from '@/features/documents/pages/DocumentsPage'
import { DocumentLibraryPage } from '@/features/documents/pages/DocumentLibraryPage'
import { TemplatesGatewayPage } from '@/features/documents/pages/TemplatesGatewayPage'
import { TemplatesPage } from '@/features/settings/pages/FeaturePages'
import { GeneratePage } from '@/features/documents/pages/GeneratePage'
import { KnowledgePage } from '@/features/knowledge/pages/KnowledgePage'
import { EditorPage } from '@/features/editor/pages/EditorPage'
import { FlowsPage } from '@/features/flow-designer/pages/FlowsPage'
import { FlowEditorPage } from '@/features/flow-designer/pages/FlowEditorPage'
import { ArchitectureListPage } from '@/features/architecture-designer/pages/ArchitectureListPage'
import { ArchitectureWorkspacePage } from '@/features/architecture-designer/pages/ArchitectureWorkspacePage'
import { PresentationsListPage } from '@/features/presentation-designer/pages/PresentationsListPage'
import { PresentationSlideWorkspacePage } from '@/features/presentation-designer/pages/PresentationSlideWorkspacePage'
import { GlobalSettingsPage } from '@/features/settings/pages/GlobalSettingsPage'
import { AppsPage } from '@/features/apps/pages/AppsPage'
import { DocumentationPage } from '@/features/documentation/pages/DocumentationPage'
import { VaultPage } from '@/modules/password-vault/pages/VaultPage'
import { NotepadPage } from '@/modules/notepad/pages/NotepadPage'
import { QuickNotePopupPage } from '@/modules/notepad/pages/QuickNotePopupPage'
import { VPSManagerPage } from '@/modules/vps-manager/pages/VPSManagerPage'
import { ClipboardManagerPage } from '@/modules/clipboard-manager/pages/ClipboardManagerPage'
import { AssistantPage } from '@/modules/assistant/pages/AssistantPage'
import { DatabaseWorkspacePage } from '@/modules/database-studio/pages/DatabaseWorkspacePage'
import { VectorWorkspacePage } from '@/modules/vector-studio/pages/VectorWorkspacePage'
import { RagStudioPage } from '@/modules/rag-studio/pages/RagStudioPage'
import { ProjectOverviewPage } from '@/features/projects/pages/ProjectOverviewPage'
import { DiagnosticsPage } from '@/features/diagnostics/pages/DiagnosticsPage'

const TerminalPage = lazy(() =>
  import('@/modules/terminal/pages/TerminalPage').then((m) => ({
    default: m.TerminalPage
  }))
)

const CodeEditorPage = lazy(() =>
  import('@/modules/code-editor/pages/CodeEditorPage').then((m) => ({
    default: m.CodeEditorPage
  }))
)

const ApiStudioPage = lazy(() =>
  import('@/modules/api-studio/pages/ApiStudioPage').then((m) => ({
    default: m.ApiStudioPage
  }))
)

function PageLoader() {
  return (
    <div className="boot-screen flex h-full min-h-[200px] flex-col items-center justify-center gap-4">
      <AppLogo className="boot-logo h-10 w-10 rounded-[10px]" />
      <div className="boot-progress" aria-hidden="true" />
      <p className="boot-message text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}

function WorkbenchWindowTitle() {
  const { pathname, search } = useLocation()
  const currentProject = useProjectStore((s) => s.currentProject)

  useEffect(() => {
    const profile = getModuleWindowProfile(pathname)
    if (isModuleWindowView(search) && profile) {
      document.title = `${profile.label} — ${PRODUCT_NAME}`
      return
    }
    if (isProjectWindowView(search) && currentProject) {
      document.title = `${currentProject.name} — ${PRODUCT_NAME}`
      return
    }
    if (currentProject && pathname.includes(`/project/${currentProject.id}`)) {
      document.title = `${currentProject.name} — ${PRODUCT_NAME}`
      return
    }
    document.title = PRODUCT_NAME
  }, [pathname, search, currentProject])

  return null
}

export function App() {
  useMacWindowChrome()
  const { loadSettings, loadApiKeyStatus, settings } = useSettingsStore()
  const { loadRecentProjects } = useProjectStore()
  const applyAppearance = useUIStore((s) => s.applyAppearance)
  const location = useLocation()
  const skipSetupGate =
    location.pathname === '/note-popup' ||
    isModuleWindowView(location.search) ||
    isProjectWindowView(location.search)

  const [setupReady, setSetupReady] = useState(skipSetupGate)
  const [setupChecked, setSetupChecked] = useState(skipSetupGate)

  useEffect(() => {
    loadSettings()
    loadApiKeyStatus()
    loadRecentProjects()
  }, [loadSettings, loadApiKeyStatus, loadRecentProjects])

  useEffect(() => {
    if (skipSetupGate) {
      setSetupReady(true)
      setSetupChecked(true)
      return
    }
    let cancelled = false
    void loadOnboardingComplete().then((complete) => {
      if (cancelled) return
      setSetupReady(complete)
      setSetupChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [skipSetupGate])

  // Covers pop-out module windows, where rehydration may finish before mount.
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

  if (!setupChecked) {
    return (
      <>
        <BootScreen message="Starting workbench…" />
        <WindowOpenOverlay />
      </>
    )
  }

  if (!setupReady && !skipSetupGate) {
    return (
      <TooltipProvider delayDuration={200} skipDelayDuration={300}>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <SetupFlow onComplete={() => setSetupReady(true)} />
        </div>
        <WindowOpenOverlay />
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <WorkbenchWindowTitle />
      <WindowOpenOverlay />
      <Routes>
      <Route path="/note-popup" element={<QuickNotePopupPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/assistant" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/documents" element={<DocumentLibraryPage />} />
        <Route path="/document-library" element={<DocumentLibraryPage />} />
        <Route path="/templates" element={<TemplatesGatewayPage />} />
        <Route path="/docs" element={<DocumentationPage />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/vps" element={<VPSManagerPage />} />
        <Route path="/notepad" element={<NotepadPage />} />
        <Route path="/clipboard" element={<ClipboardManagerPage />} />
        <Route
          path="/terminal"
          element={
            <Suspense fallback={<PageLoader />}>
              <TerminalPage />
            </Suspense>
          }
        />
        <Route
          path="/code-editor"
          element={
            <Suspense fallback={<PageLoader />}>
              <CodeEditorPage />
            </Suspense>
          }
        />
        <Route
          path="/api-studio"
          element={
            <Suspense fallback={<PageLoader />}>
              <ApiStudioPage />
            </Suspense>
          }
        />
        <Route path="/settings" element={<GlobalSettingsPage />} />
        <Route path="/diagnostics" element={<DiagnosticsPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/voice-assistant" element={<Navigate to="/assistant" replace />} />
        <Route path="/database-studio" element={<DatabaseWorkspacePage />} />
        <Route path="/vector-studio" element={<VectorWorkspacePage />} />
        <Route path="/rag-studio" element={<RagStudioPage />} />
        <Route path="/project/:projectId" element={<ProjectProvider />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<ProjectOverviewPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="flows" element={<FlowsPage />} />
          <Route path="flows/:flowId" element={<FlowEditorPage />} />
          <Route path="architecture-designer" element={<ArchitectureListPage />} />
          <Route
            path="architecture-designer/:diagramId"
            element={<ArchitectureWorkspacePage />}
          />
          <Route path="presentations" element={<PresentationsListPage />} />
          <Route path="presentations/:presentationId" element={<PresentationSlideWorkspacePage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="settings" element={<Navigate to="/settings" replace />} />
          <Route path="editor/:documentId" element={<EditorPage />} />
          <Route path="database-studio" element={<DatabaseWorkspacePage />} />
          <Route path="vector-studio" element={<VectorWorkspacePage />} />
          <Route path="rag-studio" element={<RagStudioPage />} />
          <Route
            path="api-studio"
            element={
              <Suspense fallback={<PageLoader />}>
                <ApiStudioPage />
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/assistant" replace />} />
      </Route>
    </Routes>
    </TooltipProvider>
  )
}
