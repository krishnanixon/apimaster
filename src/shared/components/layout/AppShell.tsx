import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { Bot, Bug, Send, Server, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AppLogo } from '@/shared/components/AppLogo'
import { ErrorBoundary } from '@/shared/components/ui/error-boundary'
import { isMacClient } from '@/shared/hooks/useMacWindowChrome'
import { cn } from '@/shared/lib/utils'
import { PRODUCT_NAME } from '@shared/constants/product'

const NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/', label: 'Requests', icon: Send, end: true },
  { to: '/mock-servers', label: 'Mock Servers', icon: Server },
  { to: '/ai-engineer', label: 'AI Engineer', icon: Bot },
  { to: '/diagnostics', label: 'Bug Reports', icon: Bug },
  { to: '/settings', label: 'Settings', icon: Settings }
]

function TitleBar() {
  const mac = isMacClient()

  return (
    <header
      className={cn(
        'workbench-titlebar drag-region flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-3 text-sidebar-foreground',
        mac ? 'h-[38px] pl-[84px]' : 'h-11'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <AppLogo className="h-5 w-5 rounded-[5px]" />
        <span className="truncate text-[13px] font-semibold">{PRODUCT_NAME}</span>
      </div>
      <nav className="ml-auto flex items-center gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) =>
              cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
              )
            }
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </nav>
    </header>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

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
    if (!window.electronAPI?.app?.onNavigate) return
    return window.electronAPI.app.onNavigate((path) => navigate(path))
  }, [navigate])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <TitleBar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Keyed by route so navigating away clears a previous failure. */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'rounded-xl border border-border bg-card text-foreground shadow-float',
          duration: 3500
        }}
      />
    </div>
  )
}
