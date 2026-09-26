import { useLocation } from 'react-router-dom'
import { PanelLeft, PanelTop } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useUIStore } from '@/shared/stores/ui.store'
import { resolveRouteModule } from '@/shared/lib/resolve-route-module'
import { getModuleById } from '@/shared/lib/module-registry'
import { isPopoutModulePath } from '@shared/lib/module-windows'
import { currentViewPath } from '@/shared/lib/windows'
import { PopOutButton } from './ModuleWindowBar'
import { WorkbenchNavMenu } from './WorkbenchNavMenu'

export function StandaloneModuleNavBar() {
  const { pathname, search } = useLocation()
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const setNavChromeStyle = useUIStore((s) => s.setNavChromeStyle)
  const resolved = resolveRouteModule(pathname)
  const module = resolved ? getModuleById(resolved.moduleId) : null
  const Icon = module?.icon
  const path = currentViewPath(pathname, search)
  const canPopOut = isPopoutModulePath(path)

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-w-0 items-center gap-2">
        <WorkbenchNavMenu />
        {module && (
          <div className="flex min-w-0 items-center gap-2 border-l border-border/60 pl-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" />}
            <span className="truncate text-sm font-medium">{module.label}</span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canPopOut && <PopOutButton path={path} />}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={() => setNavChromeStyle('header')}
          title="Use header menus instead of sidebar"
        >
          <PanelTop className="h-3.5 w-3.5" />
          Header
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={() => setSidebarCollapsed(false)}
          title="Expand sidebar"
        >
          <PanelLeft className="h-3.5 w-3.5" />
          Sidebar
        </Button>
      </div>
    </div>
  )
}
