import { useLocation } from 'react-router-dom'
import { AppWindow, Search, SquareArrowOutUpRight, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { resolveRouteModule } from '@/shared/lib/resolve-route-module'
import { getModuleById } from '@/shared/lib/module-registry'
import { getModuleWindowProfile, MODULE_WINDOW_MENU } from '@shared/lib/module-windows'
import { currentViewPath, openInWorkbench, openModuleWindow } from '@/shared/lib/windows'
import { useUIStore } from '@/shared/stores/ui.store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'

export function ModuleWindowBar() {
  const { pathname, search } = useLocation()
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const resolved = resolveRouteModule(pathname)
  const module = resolved ? getModuleById(resolved.moduleId) : null
  const profile = getModuleWindowProfile(pathname)
  const Icon = module?.icon
  const label = profile?.label ?? module?.label ?? 'Module'
  const path = currentViewPath(pathname, search)

  return (
    <div className="mac-window-chrome drag-region relative flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="truncate text-[12px] font-medium">{label}</span>
      </div>
      <div className="pointer-events-none absolute inset-x-28 flex justify-center sm:inset-x-40">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="pointer-events-auto flex h-7 w-full max-w-[360px] items-center gap-2 rounded-md border border-border/70 bg-muted/50 px-2.5 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
      </div>
      <div className="flex min-w-0 flex-1 shrink-0 items-center justify-end gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground">
              Modules
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Open in window
            </DropdownMenuLabel>
            {MODULE_WINDOW_MENU.map((item) => (
              <DropdownMenuItem key={item.path} onSelect={() => void openModuleWindow(item.path)}>
                {item.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void openInWorkbench(path)}>
              <AppWindow className="h-3.5 w-3.5" />
              Open in workbench
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
          onClick={() => void openInWorkbench(path)}
          title="Open this module in the main workbench"
        >
          <AppWindow className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Workbench</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 px-0 text-muted-foreground"
          onClick={() => void window.electronAPI.windows.close()}
          title="Close window"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function PopOutButton({ path, compact = false }: { path: string; compact?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
      onClick={() => void openModuleWindow(path)}
      title="Open this module in a new window"
    >
      <SquareArrowOutUpRight className="h-3.5 w-3.5" />
      {!compact && <span>Pop out</span>}
    </Button>
  )
}
