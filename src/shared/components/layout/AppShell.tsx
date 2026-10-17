import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { Bot, Bug, ChevronRight, ScanSearch, Send, Server, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AppLogo } from '@/shared/components/AppLogo'
import { ErrorBoundary } from '@/shared/components/ui/error-boundary'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip'
import { isMacClient } from '@/shared/hooks/useMacWindowChrome'
import { cn } from '@/shared/lib/utils'
import { PRODUCT_NAME } from '@shared/constants/product'

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Requests', icon: Send, end: true },
  { to: '/mock-servers', label: 'Mock Servers', icon: Server },
  { to: '/ai-engineer', label: 'AI Engineer', icon: Bot },
  { to: '/code-scanner', label: 'Code Scanner', icon: ScanSearch }
]

const SECONDARY_NAV: NavItem[] = [
  { to: '/diagnostics', label: 'Bug Reports', icon: Bug },
  { to: '/settings', label: 'Settings', icon: Settings }
]

const SECTION_LABELS: Record<string, string> = {
  '/terms': 'Terms'
}

function sectionLabel(pathname: string): string {
  const item = [...PRIMARY_NAV, ...SECONDARY_NAV].find(({ to, end }) =>
    end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  )
  return item?.label ?? SECTION_LABELS[pathname] ?? ''
}

function TitleBar() {
  const mac = isMacClient()
  const { pathname } = useLocation()
  const section = sectionLabel(pathname)

  return (
    <header
      className={cn(
        // Left inset for the traffic lights comes from globals.css, which drops it in full screen.
        'workbench-titlebar drag-region flex shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3 text-sidebar-foreground',
        mac ? 'h-[38px]' : 'h-10'
      )}
    >
      <AppLogo className="h-[18px] w-[18px]" />
      <span className="text-[12.5px] font-semibold tracking-tight">{PRODUCT_NAME}</span>
      {section && (
        <>
          <ChevronRight className="h-3 w-3 text-muted-foreground/70" aria-hidden />
          <span className="truncate text-[12.5px] text-muted-foreground">{section}</span>
        </>
      )}
    </header>
  )
}

function RailLink({ to, label, icon: Icon, end }: NavItem) {
  // Resolved here rather than via NavLink's className callback: TooltipTrigger's
  // Slot merges className as a string and would stringify the function.
  const isActive = useMatch({ path: to, end: end ?? false }) !== null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          end={end}
          aria-label={label}
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:-left-[9px] before:top-2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-primary'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" className="px-2 py-1">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function ActivityRail() {
  return (
    <nav
      aria-label="Main"
      className="flex w-[52px] shrink-0 flex-col items-center justify-between border-r border-border bg-sidebar py-2"
    >
      <div className="flex flex-col items-center gap-1">
        {PRIMARY_NAV.map((item) => (
          <RailLink key={item.to} {...item} />
        ))}
      </div>
      <div className="flex flex-col items-center gap-1">
        {SECONDARY_NAV.map((item) => (
          <RailLink key={item.to} {...item} />
        ))}
      </div>
    </nav>
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
      const reason =
        event.reason instanceof Error
          ? (event.reason.stack ?? event.reason.message)
          : String(event.reason)
      void window.electronAPI?.log?.write({
        level: 'error',
        context: 'RendererPromise',
        message: reason
      })
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityRail />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Keyed by route so navigating away clears a previous failure. */}
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
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
