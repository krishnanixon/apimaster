import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { AppSidebar } from './AppSidebar'
import { WorkbenchTitleBar } from './WorkbenchTitleBar'
import { CommandPalette } from './CommandPalette'
import { ModuleWindowBar } from './ModuleWindowBar'
import { useImmersiveLayoutEffect } from '@/shared/hooks/useImmersiveLayout'
import { isModuleWindowView, isProjectWindowView, windowHref } from '@/shared/lib/windows'
import { parseProjectIdFromPath, withProjectWindowQuery } from '@shared/lib/module-windows'
import { useUIStore } from '@/shared/stores/ui.store'
import { useNotepadStore } from '@/modules/notepad/stores/notepad.store'
import { NotepadVoiceBridge } from '@/modules/notepad/components/NotepadVoiceBridge'
import { TessBot } from '@/modules/voice-assistant/components/TessBot'
import { ErrorBoundary } from '@/shared/components/ui/error-boundary'
import { GenerationBlockingOverlay } from '@/features/documents/components/GenerationBlockingOverlay'
import { cn } from '@/shared/lib/utils'
import { useTrackNavigation } from '@/shared/hooks/useTrackNavigation'

export function AppShell() {
  const { pathname, search } = useLocation()
  useTrackNavigation()
  const navigate = useNavigate()
  const immersive = useImmersiveLayoutEffect()
  const moduleWindow = isModuleWindowView(search)
  const projectWindow = isProjectWindowView(search)
  const navChromeStyle = useUIStore((s) => s.navChromeStyle)
  const useHeaderNav = navChromeStyle === 'header' && !projectWindow
  const showSidebar = !immersive && !useHeaderNav && !moduleWindow
  const showTitleBar = !immersive && !moduleWindow
  const showModuleWindowBar = moduleWindow && !immersive
  // Claude-style frame: content floats as an inset pane over the sidebar surface
  const framed = showSidebar ? 'true' : showTitleBar ? 'top' : undefined

  useEffect(() => {
    const reportError = (event: ErrorEvent) => {
      void window.electronAPI?.log?.write({
        level: 'error',
        context: 'Renderer',
        message: `${event.message}${event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : ''}`
      })
    }
    const reportRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason)
      void window.electronAPI?.log?.write({ level: 'error', context: 'RendererPromise', message: reason })
    }
    window.addEventListener('error', reportError)
    window.addEventListener('unhandledrejection', reportRejection)
    return () => {
      window.removeEventListener('error', reportError)
      window.removeEventListener('unhandledrejection', reportRejection)
    }
  }, [])

  useEffect(() => {
    const routeId = parseProjectIdFromPath(pathname)
    const locked = sessionStorage.getItem('project-window-id')

    if (projectWindow && routeId) {
      if (locked && routeId !== locked) {
        navigate(withProjectWindowQuery(`/project/${locked}/overview`), { replace: true })
        return
      }
      sessionStorage.setItem('project-window-id', routeId)
      return
    }

    if (!locked) return

    if (routeId === locked) {
      if (!projectWindow) {
        navigate(withProjectWindowQuery(`${pathname}${search}`), { replace: true })
      }
      return
    }

    navigate(withProjectWindowQuery(`/project/${locked}/overview`), { replace: true })
  }, [pathname, search, projectWindow, navigate])

  useEffect(() => {
    if (!window.electronAPI?.clipboard) return
    return window.electronAPI.clipboard.onOpenPanel(() => {
      if (moduleWindow || projectWindow) return
      navigate('/clipboard')
    })
  }, [navigate, moduleWindow, projectWindow])

  useEffect(() => {
    if (!window.electronAPI?.app?.onNavigate) return
    return window.electronAPI.app.onNavigate((path) => {
      navigate(windowHref(path, search))
    })
  }, [navigate, search])

  useEffect(() => {
    const quickNoteApi = window.electronAPI?.quickNote
    if (!quickNoteApi) return
    return quickNoteApi.onSaved(() => {
      void useNotepadStore.getState().refreshFromStorage()
    })
  }, [])

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
        framed ? 'app-frame' : 'bg-background'
      )}
    >
      <NotepadVoiceBridge />
      {showTitleBar && <WorkbenchTitleBar />}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showSidebar && <AppSidebar />}

        <main
          data-framed={framed}
          className={cn(
            'app-main-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            immersive && 'immersive-main'
          )}
        >
          {showModuleWindowBar && <ModuleWindowBar />}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Keyed by route so navigating away clears a previous failure. */}
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <CommandPalette />
      {/* Tess owns the mic app-wide; pop-out windows stay silent to avoid two listeners. */}
      {!moduleWindow && !projectWindow && <TessBot primary />}
      <GenerationBlockingOverlay />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            'rounded-xl border border-border bg-card text-foreground shadow-float',
          duration: 3500
        }}
      />
    </div>
  )
}
