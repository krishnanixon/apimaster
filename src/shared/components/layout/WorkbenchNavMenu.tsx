import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, LayoutGrid } from 'lucide-react'
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
import { Button } from '@/shared/components/ui/button'
import { useModulesStore } from '@/shared/stores/modules.store'
import { getSidebarNavigation } from '@/shared/lib/navigation'
import { resolveModulePath, type NavTreeNode } from '@/shared/lib/module-registry'
import { cn } from '@/shared/lib/utils'

function normalizePath(path: string): string {
  return path.split('?')[0]?.replace(/\/+$/, '') || '/'
}

function isActivePath(currentPath: string, targetPath: string): boolean {
  const current = normalizePath(currentPath)
  const target = normalizePath(targetPath)
  if (target === '/') return current === '/'
  return current === target || current.startsWith(`${target}/`)
}

function NavTreeItems({
  nodes,
  projectId,
  currentPath,
  onNavigate,
  depth = 0
}: {
  nodes: NavTreeNode[]
  projectId?: string
  currentPath: string
  onNavigate: (path: string) => void
  depth?: number
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
                  depth={depth + 1}
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

export function WorkbenchNavMenu({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const { enabled, sidebarTreeDepth } = useModulesStore()

  const preferences = useMemo(() => ({ enabled, sidebarTreeDepth }), [enabled, sidebarTreeDepth])
  const navSections = useMemo(
    () => getSidebarNavigation(preferences, projectId),
    [preferences, projectId]
  )

  const developerToolsIndex = navSections.findIndex((s) => s.categoryId === 'developer-tools')
  const leadingSections = developerToolsIndex >= 0 ? navSections.slice(0, developerToolsIndex) : []
  const developerToolsSection =
    developerToolsIndex >= 0 ? navSections[developerToolsIndex] : null
  const trailingSections =
    developerToolsIndex >= 0 ? navSections.slice(developerToolsIndex + 1) : navSections

  const handleNavigate = (path: string) => {
    navigate(path)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md px-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Go
          </button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
            <LayoutGrid className="h-3.5 w-3.5" />
            Tools
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(70vh,520px)] w-64 overflow-y-auto">
        {leadingSections.map((section, index) => (
          <div key={`${section.categoryId}-leading-${index}`}>
            {index > 0 && <DropdownMenuSeparator />}
            {section.categoryLabel ? (
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {section.categoryLabel}
              </DropdownMenuLabel>
            ) : null}
            <NavTreeItems
              nodes={section.nodes}
              projectId={projectId}
              currentPath={pathname}
              onNavigate={handleNavigate}
            />
          </div>
        ))}

        {developerToolsSection && (
          <>
            {leadingSections.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {developerToolsSection.categoryLabel}
            </DropdownMenuLabel>
            <NavTreeItems
              nodes={developerToolsSection.nodes}
              projectId={projectId}
              currentPath={pathname}
              onNavigate={handleNavigate}
            />
          </>
        )}

        {trailingSections.map((section, index) => (
          <div key={`${section.categoryId}-trailing-${index}`}>
            <DropdownMenuSeparator />
            {section.categoryLabel ? (
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {section.categoryLabel}
              </DropdownMenuLabel>
            ) : null}
            <NavTreeItems
              nodes={section.nodes}
              projectId={projectId}
              currentPath={pathname}
              onNavigate={handleNavigate}
            />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
