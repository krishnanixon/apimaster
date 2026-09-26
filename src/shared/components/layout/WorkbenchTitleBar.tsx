import { useMemo, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  PanelLeft,
  Search,
  Settings,
  SquareArrowOutUpRight,
  SquarePlus
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { AppLogo } from '@/shared/components/AppLogo'
import { AIStatusButton } from '@/features/ai/components/AITopBar'
import { useModulesStore } from '@/shared/stores/modules.store'
import { useUIStore, type NavChromeStyle } from '@/shared/stores/ui.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { getSidebarNavigation, getProjectWindowNavigation } from '@/shared/lib/navigation'
import { getModuleById, resolveModulePath, type NavTreeNode } from '@/shared/lib/module-registry'
import { resolveRouteModule } from '@/shared/lib/resolve-route-module'
import { PRODUCT_NAME_SHORT } from '@shared/constants/product'
import { cn } from '@/shared/lib/utils'
import {
  currentViewPath,
  isProjectWindowView,
  openInWorkbench,
  openModuleWindow,
  openNewWindow,
  windowHref
} from '@/shared/lib/windows'
import { getModuleWindowProfile, isPopoutModulePath } from '@shared/lib/module-windows'
import { WorkbenchNavMenu } from './WorkbenchNavMenu'
import { isMacClient } from '@/shared/hooks/useMacWindowChrome'

function normalizePath(path: string): string {
  return path.split('?')[0]?.replace(/\/+$/, '') || '/'
}

function isActivePath(currentPath: string, targetPath: string): boolean {
  const current = normalizePath(currentPath)
  const target = normalizePath(targetPath)
  if (target === '/') return current === '/'
  return current === target || current.startsWith(`${target}/`)
}

function sectionHasActive(
  nodes: NavTreeNode[],
  projectId: string | undefined,
  currentPath: string
): boolean {
  for (const node of nodes) {
    if (!node.module.isGroup) {
      const path = resolveModulePath(node.module, projectId)
      if (path && isActivePath(currentPath, path)) return true
    }
    if (node.children.length > 0 && sectionHasActive(node.children, projectId, currentPath)) {
      return true
    }
  }
  return false
}

function NavTreeItems({
  nodes,
  projectId,
  currentPath,
  onNavigate
}: {
  nodes: NavTreeNode[]
  projectId?: string
  currentPath: string
  onNavigate: (path: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const { module, children } = node

        if (module.isGroup && children.length > 0) {
          return (
            <DropdownMenuSub key={module.id}>
              <DropdownMenuSubTrigger className="gap-2">
                <module.icon className="h-4 w-4 opacity-70" />
                <span>{module.label}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                <NavTreeItems
                  nodes={children}
                  projectId={projectId}
                  currentPath={currentPath}
                  onNavigate={onNavigate}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        }

        if (module.isGroup) return null

        const path = resolveModulePath(module, projectId)
        if (!path) return null

        const active = isActivePath(currentPath, path)

        return (
          <DropdownMenuItem
            key={module.id}
            className={cn('gap-2', active && 'bg-accent font-medium')}
            onSelect={() => onNavigate(path)}
          >
            <module.icon className="h-4 w-4 opacity-70" />
            <span className="truncate">{module.label}</span>
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

function CategoryMenu({
  label,
  nodes,
  projectId,
  currentPath,
  onNavigate
}: {
  label: string
  nodes: NavTreeNode[]
  projectId?: string
  currentPath: string
  onNavigate: (path: string) => void
}) {
  const active = sectionHasActive(nodes, projectId, currentPath)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(titleMenuClass, active && 'text-foreground')}>
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(70vh,480px)] w-60 overflow-y-auto">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <NavTreeItems
          nodes={nodes}
          projectId={projectId}
          currentPath={currentPath}
          onNavigate={onNavigate}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const titleMenuClass =
  'inline-flex h-7 shrink-0 items-center rounded-md px-2 text-[12.5px] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'

function TitleIconButton({
  title,
  onClick,
  children,
  disabled
}: {
  title: string
  onClick?: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4"
    >
      {children}
    </button>
  )
}

function shortcutHint(): string {
  if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) return '⌘K'
  return 'Ctrl+K'
}

export function WorkbenchTitleBar() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const { enabled, sidebarTreeDepth } = useModulesStore()
  const navChromeStyle = useUIStore((s) => s.navChromeStyle)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setNavChromeStyle = useUIStore((s) => s.setNavChromeStyle)
  const currentProject = useProjectStore((s) => s.currentProject)
  const projectWindow = isProjectWindowView(search)
  // macOS: traffic lights own the top-left and the native menu bar carries File/View,
  // so the bar reads like Claude desktop — lights, sidebar toggle, back/forward.
  const mac = isMacClient()

  const useHeaderNav = navChromeStyle === 'header' && !projectWindow
  const preferences = useMemo(() => ({ enabled, sidebarTreeDepth }), [enabled, sidebarTreeDepth])
  const navSections = useMemo(
    () =>
      projectWindow && projectId
        ? getProjectWindowNavigation(preferences, projectId)
        : getSidebarNavigation(preferences, projectId),
    [preferences, projectId, projectWindow]
  )

  const resolved = resolveRouteModule(pathname)
  const currentModule = resolved ? getModuleById(resolved.moduleId) : null
  const path = currentViewPath(pathname, search)
  const canPopOut = !projectWindow && isPopoutModulePath(path)
  const profile = getModuleWindowProfile(path)
  const searchLabel =
    (projectId && currentProject?.name) || currentModule?.label || PRODUCT_NAME_SHORT
  const popOutLabel = profile ? `${profile.label} Window` : 'Pop out'
  const chatPath = projectId ? `/project/${projectId}/chat` : '/assistant'
  const go = (next: string) => {
    if (
      projectWindow &&
      (next === '/dashboard' || next === '/projects' || next === '/settings' || next === '/apps')
    ) {
      void openInWorkbench(next)
      return
    }
    navigate(windowHref(next, search))
  }

  return (
    <header
      className={cn(
        'workbench-titlebar drag-region relative z-30 grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(220px,420px)_minmax(0,1fr)] items-center gap-2 bg-sidebar px-2.5 text-sidebar-foreground',
        mac ? 'h-[38px]' : 'h-11'
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        {mac && !useHeaderNav && (
          <TitleIconButton
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            onClick={toggleSidebar}
          >
            <PanelLeft />
          </TitleIconButton>
        )}
        {mac && (
          <>
            <TitleIconButton title="Back" onClick={() => navigate(-1)}>
              <ChevronLeft />
            </TitleIconButton>
            <TitleIconButton title="Forward" onClick={() => navigate(1)}>
              <ChevronRight />
            </TitleIconButton>
          </>
        )}
        {mac && (useHeaderNav || projectWindow) && (
          <nav className="ml-1 hidden min-w-0 items-center overflow-x-auto md:flex">
            {navSections.map((section, sectionIndex) => (
              <CategoryMenu
                key={`${section.categoryId}-${sectionIndex}`}
                label={section.categoryLabel || section.nodes[0]?.module.label || 'Project'}
                nodes={section.nodes}
                projectId={projectId}
                currentPath={pathname}
                onNavigate={go}
              />
            ))}
          </nav>
        )}
        {!mac && (
          <>
            <NavLink
              to={
                projectWindow
                  ? windowHref(projectId ? `/project/${projectId}/overview` : '/dashboard', search)
                  : '/dashboard'
              }
              onClick={(event) => {
                if (!projectWindow) return
                event.preventDefault()
                void openInWorkbench('/dashboard')
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent"
              title={projectWindow ? 'Open workbench' : PRODUCT_NAME_SHORT}
            >
              <AppLogo className="h-4 w-4 rounded-sm" />
            </NavLink>

            <div className="ml-1 flex min-w-0 items-center gap-0.5">
              <FileMenu canPopOut={canPopOut} path={path} projectWindow={projectWindow} />

              <ViewMenu
                useHeaderNav={useHeaderNav}
                sidebarCollapsed={sidebarCollapsed}
                projectWindow={projectWindow}
                onToggleSidebar={toggleSidebar}
                onOpenPalette={() => setCommandPaletteOpen(true)}
                onSetChrome={setNavChromeStyle}
              />

              {useHeaderNav || projectWindow ? (
                <nav className="hidden min-w-0 items-center overflow-x-auto md:flex">
                  {navSections.map((section, sectionIndex) => (
                    <CategoryMenu
                      key={`${section.categoryId}-${sectionIndex}`}
                      label={section.categoryLabel || section.nodes[0]?.module.label || 'Project'}
                      nodes={section.nodes}
                      projectId={projectId}
                      currentPath={pathname}
                      onNavigate={go}
                    />
                  ))}
                </nav>
              ) : (
                <span className="hidden sm:inline-flex">
                  <WorkbenchNavMenu compact />
                </span>
              )}
            </div>

            <span className="mx-1 hidden h-4 w-px bg-sidebar-border sm:block" />

            {!useHeaderNav && (
              <TitleIconButton
                title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                onClick={toggleSidebar}
              >
                <PanelLeft />
              </TitleIconButton>
            )}

            <TitleIconButton title="Back" onClick={() => navigate(-1)}>
              <ChevronLeft />
            </TitleIconButton>
            <TitleIconButton title="Forward" onClick={() => navigate(1)}>
              <ChevronRight />
            </TitleIconButton>
          </>
        )}
      </div>

      <div className="min-w-0 px-1">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          title={`Search (${shortcutHint()})`}
          className="flex h-7 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background/70 px-2.5 text-left text-[12.5px] text-sidebar-muted transition-colors hover:border-foreground/15 hover:bg-background hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate">{searchLabel}</span>
          <kbd className="hidden shrink-0 rounded px-1 py-px font-sans text-[10.5px] font-medium text-sidebar-muted/80 sm:inline">
            {shortcutHint()}
          </kbd>
        </button>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1">
        <AIStatusButton />

        <TitleIconButton
          title="New window (Ctrl+N)"
          onClick={() => void (projectWindow ? openInWorkbench() : openNewWindow())}
        >
          <SquarePlus />
        </TitleIconButton>

        <TitleIconButton title={projectId ? 'Project AI' : 'New Chat'} onClick={() => go(chatPath)}>
          <MessageSquare />
        </TitleIconButton>

        <TitleIconButton title="Settings" onClick={() => go('/settings')}>
          <Settings />
        </TitleIconButton>

        {canPopOut && (
          <button
            type="button"
            onClick={() => void openModuleWindow(path)}
            title={`Open ${profile?.label ?? 'module'} in a new window`}
            className="ml-0.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-sidebar-border bg-background/70 px-2 text-[11.5px] font-medium text-foreground transition-colors hover:bg-background [&_svg]:h-3 [&_svg]:w-3"
          >
            <SquareArrowOutUpRight />
            <span className="hidden max-w-[148px] truncate sm:inline">{popOutLabel}</span>
          </button>
        )}

        {useHeaderNav && (
          <TitleIconButton
            title="Use sidebar navigation"
            onClick={() => setNavChromeStyle('sidebar')}
          >
            <PanelLeft />
          </TitleIconButton>
        )}
      </div>
    </header>
  )
}

function FileMenu({
  canPopOut,
  path,
  projectWindow = false
}: {
  canPopOut: boolean
  path: string
  projectWindow?: boolean
}) {
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={titleMenuClass}>
          File
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {projectWindow ? (
          <>
            <DropdownMenuItem onSelect={() => void openInWorkbench('/dashboard')}>
              Open Workbench
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void openInWorkbench('/projects')}>
              Projects
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void openInWorkbench('/settings')}>
              Settings
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => void openNewWindow()}>New Window</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/dashboard')}>Dashboard</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/projects')}>Projects</DropdownMenuItem>
          </>
        )}
        {canPopOut && (
          <DropdownMenuItem onSelect={() => void openModuleWindow(path)}>
            Open Module Window
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void window.electronAPI?.windows?.close()}>
          Close Window
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ViewMenu({
  useHeaderNav,
  sidebarCollapsed,
  projectWindow = false,
  onToggleSidebar,
  onOpenPalette,
  onSetChrome
}: {
  useHeaderNav: boolean
  sidebarCollapsed: boolean
  projectWindow?: boolean
  onToggleSidebar: () => void
  onOpenPalette: () => void
  onSetChrome: (style: NavChromeStyle) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={titleMenuClass}>
          View
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={onOpenPalette}>Command Palette</DropdownMenuItem>
        {!useHeaderNav && (
          <DropdownMenuItem onSelect={onToggleSidebar}>
            {sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
          </DropdownMenuItem>
        )}
        {!projectWindow && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onSetChrome(useHeaderNav ? 'sidebar' : 'header')}>
              {useHeaderNav ? 'Use Sidebar' : 'Use Header Menus'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
