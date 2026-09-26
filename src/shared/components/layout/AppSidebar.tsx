import { useState } from 'react'
import { NavLink, useLocation, useParams } from 'react-router-dom'
import {
  Search,
  ChevronLeft,
  PanelLeft,
  ChevronRight,
  ChevronDown,
  PanelTop,
  Settings,
  AppWindow,
  MoreHorizontal,
  SquarePlus,
  Home,
  MessageSquareWarning,
  Plus
} from 'lucide-react'
import { useUIStore } from '@/shared/stores/ui.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { useModulesStore } from '@/shared/stores/modules.store'
import { cn } from '@/shared/lib/utils'
import { getSidebarNavigation, getProjectWindowNavigation } from '@/shared/lib/navigation'
import { resolveModulePath, type NavTreeNode } from '@/shared/lib/module-registry'
import { useScopeContext } from '@/core/scope/useScopeContext'
import { handleModifiedWindowClick, isProjectWindowView, openInWorkbench, openNewWindow, windowHref } from '@/shared/lib/windows'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/shared/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'

function projectInitial(name: string): string {
  return (name.trim()[0] ?? 'P').toUpperCase()
}

/** Pinned in the footer or the "New chat" action — omit from the scrollable tree to avoid duplicates */
const PINNED_MODULE_IDS = new Set(['settings', 'apps', 'assistant'])

const appleMenuClass =
  'w-52 overflow-hidden rounded-xl border-border bg-popover p-1 shadow-float'

const appleTooltipClass = 'apple-sidebar-tooltip leading-none'

const collapsedHitClass = cn(
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
  'text-sidebar-muted transition-colors duration-150',
  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40'
)

const footerControlClass = cn(
  'apple-sidebar-footer-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-lg no-underline',
  'transition-colors duration-150',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/35'
)

const footerActiveClass = 'bg-sidebar-accent text-sidebar-accent-foreground'

/** Plain Claude-style sidebar row (New chat, Search) */
const actionRowClass = cn(
  'group flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13.5px] text-sidebar-foreground',
  'transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40'
)

export function AppSidebar() {
  const { search } = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const { sidebarCollapsed, toggleSidebar, setCommandPaletteOpen } = useUIStore()
  const { currentProject } = useProjectStore()
  const { isProjectScoped } = useScopeContext()
  const { enabled, sidebarTreeDepth } = useModulesStore()
  const projectWindow = isProjectWindowView(search)
  const chatPath = projectId ? `/project/${projectId}/chat` : '/assistant'

  const preferences = { enabled, sidebarTreeDepth }
  const navSections = (
    projectWindow && projectId
      ? getProjectWindowNavigation(preferences, projectId)
      : getSidebarNavigation(preferences, projectId)
  )
    .map((section) => ({
      ...section,
      nodes: section.nodes.filter((n) => !PINNED_MODULE_IDS.has(n.module.id))
    }))
    .filter((section) => section.nodes.length > 0)

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={0}>
      <aside
        className={cn(
          'app-sidebar apple-sidebar relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden select-none',
          'transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]',
          sidebarCollapsed ? 'w-14 [--sidebar-inset:0px]' : 'w-[260px]'
        )}
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
      >
        {/* Primary actions — New chat + Search (Claude desktop) */}
        <div
          className={cn(
            'relative z-10 flex shrink-0 flex-col',
            sidebarCollapsed ? 'items-center gap-1 pb-2 pt-2.5' : 'app-sidebar-inset gap-px pb-3 pt-2.5'
          )}
        >
          <SidebarTooltip label="New chat" collapsed={sidebarCollapsed}>
            <NavLink
              to={windowHref(chatPath, search)}
              aria-label="New chat"
              className={cn(
                'claude-new-chat',
                sidebarCollapsed ? collapsedHitClass : cn(actionRowClass, 'font-medium')
              )}
            >
              <span className="claude-new-chat-disc flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full">
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              </span>
              {!sidebarCollapsed && <span className="flex-1 truncate text-left">New chat</span>}
            </NavLink>
          </SidebarTooltip>

          <SidebarTooltip label="Search (⌘K)" collapsed={sidebarCollapsed}>
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className={sidebarCollapsed ? collapsedHitClass : actionRowClass}
            >
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                <Search
                  className="h-4 w-4 text-sidebar-muted group-hover:text-sidebar-accent-foreground"
                  strokeWidth={1.8}
                />
              </span>
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1 text-left">Search</span>
                  <kbd className="font-sans text-[11px] font-medium tabular-nums text-sidebar-muted/80 opacity-0 transition-opacity group-hover:opacity-100">
                    ⌘K
                  </kbd>
                </>
              )}
            </button>
          </SidebarTooltip>
        </div>

        {/* Project chip — Settings-style account row */}
        {isProjectScoped && currentProject && (
          <div
            className={cn(
              'relative z-10 shrink-0',
              sidebarCollapsed ? 'flex justify-center pb-2' : 'app-sidebar-inset pb-3'
            )}
          >
            <SidebarTooltip label={currentProject.name} collapsed={sidebarCollapsed}>
              <div
                className={cn(
                  'flex items-center',
                  sidebarCollapsed
                    ? collapsedHitClass
                    : 'gap-2.5 rounded-xl border border-sidebar-border bg-background/60 px-2.5 py-2'
                )}
              >
                <span
                  className={cn(
                    'relative flex shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-semibold text-sidebar-primary-foreground',
                    sidebarCollapsed ? 'h-6 w-6 text-[10px]' : 'h-6 w-6 text-[10px]'
                  )}
                >
                  {projectInitial(currentProject.name)}
                  {!sidebarCollapsed && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-sidebar bg-emerald-500" />
                  )}
                </span>
                {!sidebarCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium leading-tight text-sidebar-accent-foreground">
                      {currentProject.name}
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-tight text-sidebar-muted">
                      Active project
                    </p>
                  </div>
                )}
              </div>
            </SidebarTooltip>
          </div>
        )}

        {/* Source list — isolated scroll region so the footer never overlays items */}
        <nav
          className={cn(
            'relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain',
            '[scrollbar-color:hsl(var(--sidebar-muted)/0.3)_transparent] [scrollbar-width:thin]',
            sidebarCollapsed
              ? 'flex flex-col items-center gap-1 px-0 py-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              : 'app-sidebar-inset py-0.5 pb-3'
          )}
          aria-label="Primary navigation"
        >
          {sidebarCollapsed ? (
            navSections.flatMap(({ nodes }) =>
              nodes.map((node) => (
                <SidebarTreeNode
                  key={node.module.id}
                  node={node}
                  projectId={projectId}
                  collapsed
                  treeDepth={sidebarTreeDepth}
                  depth={0}
                />
              ))
            )
          ) : (
            navSections.map(({ categoryId, categoryLabel, nodes }, sectionIndex) => (
              <NavGroup
                key={`${categoryId}-${sectionIndex}`}
                label={categoryLabel || undefined}
                first={sectionIndex === 0}
                last={sectionIndex === navSections.length - 1}
              >
                {nodes.map((node) => (
                  <SidebarTreeNode
                    key={node.module.id}
                    node={node}
                    projectId={projectId}
                    collapsed={false}
                    treeDepth={sidebarTreeDepth}
                    depth={0}
                  />
                ))}
              </NavGroup>
            ))
          )}
        </nav>

        {/* Footer toolbar — pinned below the scroll region */}
        <div
          className={cn(
            'apple-sidebar-footer relative z-20 mt-auto shrink-0',
            sidebarCollapsed
              ? 'flex flex-col items-center gap-1 py-2.5'
              : 'px-2 pb-2 pt-1.5'
          )}
        >
          {sidebarCollapsed ? (
            <>
              <CollapsedFooterMenu projectWindow={projectWindow} />
              <FooterIconButton
                icon={PanelLeft}
                label="Expand sidebar"
                tooltipSide="right"
                onClick={toggleSidebar}
                collapsed
              />
            </>
          ) : (
            <div className="flex w-full items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-0.5">
                {projectWindow ? (
                  <>
                    <FooterIconButton
                      icon={Home}
                      label="Workbench"
                      onClick={() => void openInWorkbench('/dashboard')}
                    />
                    <FooterIconButton
                      icon={Settings}
                      label="Settings"
                      onClick={() => void openInWorkbench('/settings')}
                    />
                  </>
                ) : (
                  <>
                    <FooterIconLink to="/apps" icon={AppWindow} label="Apps" />
                    <FooterIconLink to="/settings" icon={Settings} label="Settings" />
                    <FooterIconLink to="/diagnostics" icon={MessageSquareWarning} label="Report bug" />
                    <FooterIconButton
                      icon={PanelTop}
                      label="Use header menus"
                      onClick={() => useUIStore.getState().setNavChromeStyle('header')}
                    />
                    <FooterIconButton
                      icon={SquarePlus}
                      label="New window"
                      onClick={() => void openNewWindow()}
                    />
                  </>
                )}
              </div>
              <FooterIconButton
                icon={ChevronLeft}
                label="Collapse sidebar"
                onClick={toggleSidebar}
              />
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}

function SidebarTooltip({
  label,
  collapsed,
  children
}: {
  label: string
  collapsed: boolean
  children: React.ReactElement
}) {
  if (!collapsed) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className={appleTooltipClass}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function CollapsedFooterMenu({ projectWindow = false }: { projectWindow?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={collapsedHitClass} aria-label="More sidebar options">
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.85} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className={appleMenuClass}>
        <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-medium text-sidebar-muted">
          {projectWindow ? 'Project' : 'Sidebar'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projectWindow ? (
          <>
            <DropdownMenuItem className="rounded-[8px] text-[13px]" onSelect={() => void openInWorkbench('/dashboard')}>
              <Home className="h-4 w-4" strokeWidth={1.6} />
              Workbench
            </DropdownMenuItem>
            <DropdownMenuItem
              className="rounded-[8px] text-[13px]"
              onSelect={() => void openInWorkbench('/settings')}
            >
              <Settings className="h-4 w-4" strokeWidth={1.6} />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2.5 rounded-[8px] text-[13px]"
              onSelect={() => void window.electronAPI?.windows?.close()}
            >
              Close Window
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild className="rounded-[8px] text-[13px]">
              <NavLink to="/apps" className="gap-2.5">
                <AppWindow className="h-4 w-4" strokeWidth={1.6} />
                Apps
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-[8px] text-[13px]">
              <NavLink to="/settings" className="gap-2.5">
                <Settings className="h-4 w-4" strokeWidth={1.6} />
                Settings
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-[8px] text-[13px]">
              <NavLink to="/diagnostics" className="gap-2.5">
                <MessageSquareWarning className="h-4 w-4" strokeWidth={1.6} />
                Report bug
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2.5 rounded-[8px] text-[13px]"
              onSelect={() => void openNewWindow()}
            >
              <SquarePlus className="h-4 w-4" strokeWidth={1.6} />
              New Window
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2.5 rounded-[8px] text-[13px]"
              onSelect={() => useUIStore.getState().setNavChromeStyle('header')}
            >
              <PanelTop className="h-4 w-4" strokeWidth={1.6} />
              Use header menus
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FooterIconLink({
  to,
  icon: Icon,
  label
}: {
  to: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
}) {
  return (
    <NavLink
      to={to}
      end
      aria-label={label}
      title={label}
      className={({ isActive }) => cn(footerControlClass, isActive && footerActiveClass)}
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
    </NavLink>
  )
}

function FooterIconButton({
  icon: Icon,
  label,
  tooltipSide = 'top',
  onClick,
  collapsed
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  tooltipSide?: 'top' | 'right'
  onClick: () => void
  collapsed?: boolean
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={collapsed ? undefined : label}
      className={collapsed ? collapsedHitClass : footerControlClass}
    >
      <Icon
        className={cn(collapsed ? 'h-[18px] w-[18px]' : 'h-4 w-4')}
        strokeWidth={1.8}
      />
    </button>
  )

  if (!collapsed) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide} sideOffset={10} className={appleTooltipClass}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function SidebarTreeNode({
  node,
  projectId,
  collapsed,
  treeDepth,
  depth
}: {
  node: NavTreeNode
  projectId?: string
  collapsed: boolean
  treeDepth: 0 | 1 | 2
  depth: number
}) {
  const { module, children } = node
  const [open, setOpen] = useState(true)
  const hasChildren = children.length > 0
  const isCollapsibleGroup = treeDepth === 2 && module.isGroup && hasChildren

  if (module.isGroup && treeDepth >= 1) {
    if (collapsed) {
      return (
        <>
          {children.map((child) => (
            <SidebarTreeNode
              key={child.module.id}
              node={child}
              projectId={projectId}
              collapsed={collapsed}
              treeDepth={treeDepth}
              depth={depth}
            />
          ))}
        </>
      )
    }

    return (
      <div className="mb-0.5">
        {isCollapsibleGroup ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            {open ? (
              <ChevronDown className="h-3 w-3" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-3 w-3" strokeWidth={2} />
            )}
            {module.label}
          </button>
        ) : (
          <p className="mb-1 px-2 pt-1 text-[11.5px] font-medium text-sidebar-muted">
            {module.label}
          </p>
        )}
        {(open || !isCollapsibleGroup) && (
          <div
            className={cn(
              'app-sidebar-nav',
              treeDepth >= 1 && 'ml-3 border-l border-sidebar-border pl-1.5'
            )}
          >
            {children.map((child) => (
              <SidebarTreeNode
                key={child.module.id}
                node={child}
                projectId={projectId}
                collapsed={collapsed}
                treeDepth={treeDepth}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (module.isGroup) return null

  const path = resolveModulePath(module, projectId)

  return (
    <>
      <SidebarLink
        to={path}
        icon={module.icon}
        label={module.label}
        collapsed={collapsed}
        end={path === '/' || path === '/dashboard'}
        indent={depth > 0 && !collapsed ? depth : 0}
      />
      {treeDepth >= 1 &&
        hasChildren &&
        children.map((child) => (
          <SidebarTreeNode
            key={child.module.id}
            node={child}
            projectId={projectId}
            collapsed={collapsed}
            treeDepth={treeDepth}
            depth={depth + 1}
          />
        ))}
    </>
  )
}

function NavGroup({
  label,
  first,
  last,
  children
}: {
  label?: string
  first?: boolean
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn('app-sidebar-section', first && 'mt-0', last && 'mb-0')}>
      {label && (
        <p className="mb-1 px-2 text-[11.5px] font-medium text-sidebar-muted">
          {label}
        </p>
      )}
      <div className="app-sidebar-nav">{children}</div>
    </div>
  )
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  collapsed,
  end,
  indent = 0
}: {
  to: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  collapsed: boolean
  end?: boolean
  indent?: number
}) {
  const { search } = useLocation()
  if (!to) return null
  const href = windowHref(to, search)

  const link = (
    <NavLink
      to={href}
      end={end}
      onClick={(event) => {
        if (handleModifiedWindowClick(event, to)) {
          event.preventDefault()
        }
      }}
      onAuxClick={(event) => {
        if (handleModifiedWindowClick(event, to)) {
          event.preventDefault()
        }
      }}
      style={
        indent > 0 && !collapsed ? { paddingLeft: `${8 + indent * 10}px` } : undefined
      }
      className={cn(
        'apple-sidebar-item group relative',
        collapsed
          ? 'h-9 w-9 shrink-0 justify-center rounded-lg'
          : 'h-8 w-full gap-2.5 rounded-lg px-2 text-[13.5px]'
      )}
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn('shrink-0', collapsed ? 'h-[18px] w-[18px]' : 'h-4 w-4')}
            strokeWidth={isActive ? 1.9 : 1.7}
          />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">{link}</span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className={appleTooltipClass}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** @deprecated use AppSidebar */
export const ModernSidebar = AppSidebar
