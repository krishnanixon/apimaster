import { useEffect, useState, useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Command } from 'cmdk'
import { AppWindow, Search, Plus, FolderKanban, SquarePlus, Bot, AlertCircle, FolderOpen, Terminal } from 'lucide-react'
import { useUIStore } from '@/shared/stores/ui.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { useModulesStore } from '@/shared/stores/modules.store'
import { cn } from '@/shared/lib/utils'
import { currentViewPath, isModuleWindowView, isProjectWindowView, openInWorkbench, openModuleWindow, openNewWindow, openPathInNewWindow, openProjectWindow, windowHref } from '@/shared/lib/windows'
import { isPopoutModulePath, MODULE_WINDOW_MENU, parseProjectIdFromPath } from '@shared/lib/module-windows'
import { getCommandPaletteByCategory, getProjectCommandPalette } from '@/shared/lib/navigation'
import type { SearchResult } from '@shared/types'

export function CommandPalette() {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore()
  const { projects } = useProjectStore()
  const { enabled, sidebarTreeDepth } = useModulesStore()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const projectWindow = isProjectWindowView(location.search)

  const preferences = useMemo(() => ({ enabled, sidebarTreeDepth }), [enabled, sidebarTreeDepth])
  const moduleGroups = useMemo(
    () =>
      projectWindow && projectId
        ? getProjectCommandPalette(preferences, projectId)
        : getCommandPaletteByCategory(preferences, projectId),
    [preferences, projectId, projectWindow]
  )

  const close = useCallback(() => {
    setCommandPaletteOpen(false)
    setQuery('')
    setSearchResults([])
  }, [setCommandPaletteOpen])

  const go = useCallback(
    (path: string) => {
      const targetProjectId = parseProjectIdFromPath(path)
      if (targetProjectId) {
        const alreadyInProject = targetProjectId === projectId
        if (alreadyInProject && projectWindow) {
          navigate(windowHref(path, location.search))
        } else if (alreadyInProject) {
          navigate(path)
        } else {
          const prefix = `/project/${targetProjectId}`
          const segment = path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : 'overview'
          void openProjectWindow(targetProjectId, segment)
        }
        close()
        return
      }
      if (isModuleWindowView(location.search) || projectWindow) {
        if (isPopoutModulePath(path)) {
          void openModuleWindow(path)
        } else {
          void openInWorkbench(path)
        }
        close()
        return
      }
      navigate(path)
      close()
    },
    [navigate, close, location.search, projectWindow, projectId]
  )

  const inCodeEditor = location.pathname.includes('code-editor')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey) {
        if (inCodeEditor) return
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
      if (e.key === 'Escape' && commandPaletteOpen) close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setCommandPaletteOpen, commandPaletteOpen, close, inCodeEditor])

  useEffect(() => {
    if (!projectId || !query.trim()) {
      setSearchResults([])
      return
    }
    const t = setTimeout(async () => {
      const result = await window.electronAPI.search.global(projectId, query)
      if (result.success && result.data) setSearchResults(result.data)
    }, 200)
    return () => clearTimeout(t)
  }, [query, projectId])

  if (!commandPaletteOpen) return null

  const base = projectId ? `/project/${projectId}` : ''

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh] backdrop-blur-sm">
      <div className="absolute inset-0" onClick={close} />
      <Command
        className="animate-fade-in relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-float backdrop-blur-2xl"
        shouldFilter={!projectId || !query.trim()}
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search projects, documents, tools..."
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Command.List className="max-h-72 overflow-y-auto p-1">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results</Command.Empty>

          <Command.Group heading="Windows" className="px-2 py-1 text-xs text-muted-foreground">
            {projectWindow ? (
              <CommandItem
                icon={AppWindow}
                onSelect={() => {
                  void openInWorkbench('/dashboard')
                  close()
                }}
                label="Open workbench"
                badge="Window"
              />
            ) : (
              <>
                <CommandItem
                  icon={SquarePlus}
                  onSelect={() => {
                    void openNewWindow()
                    close()
                  }}
                  label="New Window"
                  badge="Window"
                />
                <CommandItem
                  icon={AppWindow}
                  onSelect={() => {
                    void openPathInNewWindow(currentViewPath(location.pathname, location.search))
                    close()
                  }}
                  label="Open current view in new window"
                />
                {MODULE_WINDOW_MENU.map((item) => (
                  <CommandItem
                    key={item.path}
                    icon={AppWindow}
                    onSelect={() => {
                      void openModuleWindow(item.path)
                      close()
                    }}
                    label={`Open ${item.label} in window`}
                    badge="Module"
                  />
                ))}
              </>
            )}
          </Command.Group>

          <Command.Group heading="Code Editor" className="px-2 py-1 text-xs text-muted-foreground">
            <CommandItem
              icon={Bot}
              onSelect={() => {
                void import('@/modules/code-editor/stores/workbench.store').then(({ useWorkbenchLayoutStore }) => {
                  useWorkbenchLayoutStore.getState().openAgent()
                })
                go('/code-editor')
              }}
              label="Open Agent"
              badge="Ctrl+L"
            />
            <CommandItem
              icon={AlertCircle}
              onSelect={() => {
                void import('@/modules/code-editor/stores/workbench.store').then(({ useWorkbenchLayoutStore }) => {
                  useWorkbenchLayoutStore.getState().openProblems()
                })
                go('/code-editor')
              }}
              label="Problems"
              badge="Ctrl+Shift+M"
            />
            <CommandItem
              icon={Search}
              onSelect={() => {
                void import('@/modules/code-editor/stores/workbench.store').then(({ useWorkbenchLayoutStore }) => {
                  useWorkbenchLayoutStore.getState().setLeftTab('search')
                })
                go('/code-editor')
              }}
              label="Search in files"
              badge="Ctrl+Shift+F"
            />
            <CommandItem
              icon={Terminal}
              onSelect={() => {
                void import('@/modules/code-editor/stores/workbench.store').then(({ useWorkbenchLayoutStore }) => {
                  useWorkbenchLayoutStore.getState().setBottomTab('terminal')
                })
                go('/code-editor')
              }}
              label="Terminal"
              badge="Ctrl+`"
            />
            <CommandItem icon={FolderOpen} onSelect={() => go('/code-editor')} label="Open Code Editor" />
          </Command.Group>

          {moduleGroups.map(({ categoryLabel, items }) => (
            <Command.Group
              key={categoryLabel}
              heading={categoryLabel}
              className="px-2 py-1 text-xs text-muted-foreground"
            >
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  icon={item.icon}
                  onSelect={() => go(item.to)}
                  label={item.label}
                  badge={
                    item.scope === 'HYBRID' ? 'Hybrid' : item.scope === 'PROJECT' ? 'Project' : 'Global'
                  }
                />
              ))}
            </Command.Group>
          ))}

          {!projectId && (
            <Command.Group heading="Projects" className="px-2 py-1 text-xs text-muted-foreground">
              <CommandItem icon={Plus} onSelect={() => go('/projects')} label="All Projects" />
              {projects.slice(0, 8).map((p) => (
                <CommandItem
                  key={p.id}
                  icon={FolderKanban}
                  onSelect={() => go(`/project/${p.id}/overview`)}
                  label={p.name}
                  badge="Project"
                />
              ))}
            </Command.Group>
          )}

          {projectId &&
            searchResults.map((r) => (
              <CommandItem
                key={r.id}
                icon={Search}
                onSelect={() =>
                  go(
                    r.entityType === 'document'
                      ? `${base}/editor/${r.entityId}`
                      : r.entityType.startsWith('knowledge_')
                          ? `${base}/knowledge`
                          : r.entityType === 'conversation' || r.entityType === 'message'
                            ? `${base}/chat?conversationId=${r.entityId}`
                            : `${base}/chat`
                  )
                }
                label={r.title}
                sub={r.entityType.replace('knowledge_', '')}
                badge={r.scope ?? 'Project'}
              />
            ))}
        </Command.List>
      </Command>
    </div>
  )
}

function CommandItem({
  icon: Icon,
  label,
  sub,
  badge,
  onSelect
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  sub?: string
  badge?: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground/85 aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      <Icon className="h-4 w-4 opacity-60" />
      <span className="flex-1 truncate">{label}</span>
      {sub && <span className="text-xs opacity-60">{sub}</span>}
      {badge && (
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase opacity-70')}>
          {badge}
        </span>
      )}
    </Command.Item>
  )
}
