import { useState } from 'react'
import {
  ArrowLeft,
  Check,
  Loader2,
  PanelLeft,
  PanelRight,
  Redo2,
  Search,
  Sparkles,
  Undo2
} from 'lucide-react'
import { ARCH_VIEWS, PRIMARY_ARCH_VIEWS } from '@shared/lib/architecture-catalog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { cn } from '@/shared/lib/utils'

interface ArchitectureToolbarProps {
  title: string
  isSaving: boolean
  showViewSwitcher: boolean
  onBack: () => void
  onTitleChange: (title: string) => void
}

export function ArchitectureToolbar({
  title,
  isSaving,
  showViewSwitcher,
  onBack,
  onTitleChange
}: ArchitectureToolbarProps) {
  const [draftTitle, setDraftTitle] = useState(title)
  const [editingTitle, setEditingTitle] = useState(false)

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    isDirty,
    activeView,
    setActiveView,
    searchQuery,
    setSearchQuery,
    setActiveSection,
    panelLayout,
    setPanelLayout
  } = useArchitectureEditorStore()

  const primaryViews = ARCH_VIEWS.filter((view) => PRIMARY_ARCH_VIEWS.includes(view.id))
  const moreViews = ARCH_VIEWS.filter((view) => !PRIMARY_ARCH_VIEWS.includes(view.id))
  const activeViewLabel = ARCH_VIEWS.find((v) => v.id === activeView)?.label ?? 'View'

  const commitTitle = () => {
    setEditingTitle(false)
    const next = draftTitle.trim()
    if (next && next !== title) onTitleChange(next)
    else setDraftTitle(title)
  }

  return (
    <header className="mac-window-chrome drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-border/80 bg-background px-2.5">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack} aria-label="Back to architectures">
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {editingTitle ? (
        <Input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTitle()
            if (e.key === 'Escape') {
              setDraftTitle(title)
              setEditingTitle(false)
            }
          }}
          className="h-7 w-52 text-[13px] font-medium"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraftTitle(title)
            setEditingTitle(true)
          }}
          className="max-w-52 truncate rounded px-1.5 py-0.5 text-[13px] font-medium hover:bg-muted"
        >
          {title}
        </button>
      )}

      <SaveIndicator isSaving={isSaving} isDirty={isDirty} />

      <div className="mx-1 h-4 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!canUndo}
            onClick={undo}
            aria-label="Undo"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!canRedo}
            onClick={redo}
            aria-label="Redo"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      {showViewSwitcher && (
        <>
          <div className="mx-1 h-4 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 max-w-[140px] truncate text-[12px]">
                {activeViewLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                Diagram view
              </DropdownMenuLabel>
              {primaryViews.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  onSelect={() => setActiveView(view.id)}
                  className={cn('flex-col items-start gap-0.5', view.id === activeView && 'bg-muted')}
                >
                  <span className="text-[13px]">{view.label}</span>
                  <span className="text-[11px] text-muted-foreground">{view.description}</span>
                </DropdownMenuItem>
              ))}
              {moreViews.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] text-muted-foreground">More</DropdownMenuLabel>
                  {moreViews.map((view) => (
                    <DropdownMenuItem
                      key={view.id}
                      onSelect={() => setActiveView(view.id)}
                      className={cn('flex-col items-start gap-0.5', view.id === activeView && 'bg-muted')}
                    >
                      <span className="text-[13px]">{view.label}</span>
                      <span className="text-[11px] text-muted-foreground">{view.description}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <div className="relative ml-auto hidden w-48 sm:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search…"
          className="h-7 pl-8 text-[12px]"
        />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPanelLayout({ leftCollapsed: !panelLayout.leftCollapsed })}
            aria-label={panelLayout.leftCollapsed ? 'Show sections' : 'Hide sections'}
            aria-pressed={!panelLayout.leftCollapsed}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {panelLayout.leftCollapsed ? 'Show sections' : 'Hide sections'}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPanelLayout({ rightCollapsed: !panelLayout.rightCollapsed })}
            aria-label={panelLayout.rightCollapsed ? 'Show properties' : 'Hide properties'}
            aria-pressed={!panelLayout.rightCollapsed}
          >
            <PanelRight className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {panelLayout.rightCollapsed ? 'Show properties' : 'Hide properties'}
        </TooltipContent>
      </Tooltip>

      <Button size="sm" className="h-7" onClick={() => setActiveSection('ai-architect')}>
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden md:inline">AI</span>
      </Button>
    </header>
  )
}

function SaveIndicator({ isSaving, isDirty }: { isSaving: boolean; isDirty: boolean }) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving
      </span>
    )
  }
  if (isDirty) {
    return <span className="text-[11px] text-muted-foreground">Unsaved</span>
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Check className="h-3 w-3" />
      Saved
    </span>
  )
}
