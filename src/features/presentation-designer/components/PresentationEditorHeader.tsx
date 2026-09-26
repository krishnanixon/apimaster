import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Play,
  Redo2,
  Sparkles,
  Undo2,
  Wand2
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'

export type { PresentationInsertTool } from './PresentationCanvasToolbar'

interface PresentationEditorHeaderProps {
  title: string
  saveLabel: string
  canUndo: boolean
  canRedo: boolean
  onBack: () => void
  onTitleChange: (value: string) => void
  onUndo: () => void
  onRedo: () => void
  onOpenDesign: (mode: 'deck' | 'slide' | 'redesign') => void
  onExportPdf: () => void
  onPresent: () => void
}

export function PresentationEditorHeader(props: PresentationEditorHeaderProps) {
  const saved = props.saveLabel === 'Saved'
  const saving = props.saveLabel === 'Saving…' || props.saveLabel.includes('Saving')

  return (
    <header className="immersive-presentation-header mac-window-chrome drag-region grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/80 bg-background px-3">
      {/* Left: navigation + identity */}
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={props.onBack}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={props.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
            className="h-7 min-w-0 max-w-[280px] flex-1 border-none bg-transparent px-1.5 text-[13px] font-semibold shadow-none placeholder:text-muted-foreground focus-visible:bg-muted/50 focus-visible:ring-0"
            aria-label="Presentation title"
            placeholder="Untitled Presentation"
          />

          <span
            className={cn(
              'hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex',
              saved && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              saving && 'bg-muted text-muted-foreground',
              !saved && !saving && 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            )}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : saved ? (
              <Check className="h-3 w-3" />
            ) : null}
            {props.saveLabel}
          </span>
        </div>
      </div>

      {/* Center: history */}
      <div className="flex items-center justify-center">
        <div className="flex items-center rounded-lg border border-border/70 bg-muted/30 p-0.5">
          <ToolButton icon={Undo2} label="Undo" disabled={!props.canUndo} onClick={props.onUndo} />
          <ToolButton icon={Redo2} label="Redo" disabled={!props.canRedo} onClick={props.onRedo} />
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center justify-end gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-border/70 bg-background px-2.5 text-xs font-medium shadow-none"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Design</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => props.onOpenDesign('deck')}>
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              Generate deck
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onOpenDesign('slide')}>
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              Add slide with AI
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => props.onOpenDesign('redesign')}>
              <Wand2 className="mr-2 h-3.5 w-3.5" />
              Redesign current slide
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 border-border/70 bg-background px-2.5 text-xs font-medium shadow-none"
          onClick={props.onExportPdf}
          title="Export PDF"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Export</span>
        </Button>

        <div className="mx-0.5 hidden h-5 w-px bg-border sm:block" />

        <Button size="sm" className="h-7 gap-1.5 px-3 text-xs font-medium" onClick={props.onPresent}>
          <Play className="h-3.5 w-3.5 fill-current" />
          Present
        </Button>
      </div>
    </header>
  )
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-35"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  )
}
