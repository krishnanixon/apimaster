import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Eye,
  ExternalLink,
  FileDown,
  History,
  ImagePlus,
  MonitorPlay,
  Play,
  Plus,
  Redo2,
  Sparkles,
  Undo2
} from 'lucide-react'
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
import { cn } from '@/shared/lib/utils'

interface PresentationToolbarProps {
  title: string
  isSaving: boolean
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  onBack: () => void
  onTitleChange: (title: string) => void
  onUndo: () => void
  onRedo: () => void
  onAddCard: () => void
  onImportImage: () => void
  onPresent: () => void
  onGenerate: () => void
  onAssist: () => void
  onExportPdf: () => void
  onExportPptx: () => void
  onPreview: () => void
  onHistory: () => void
  onPresenterView: () => void
  onOpenModule?: () => void
  assistOpen: boolean
  linkedCount?: number
}

export function PresentationToolbar(props: PresentationToolbarProps) {
  const {
    title,
    isSaving,
    isDirty,
    canUndo,
    canRedo,
    onBack,
    onTitleChange,
    onUndo,
    onRedo,
    onAddCard,
    onImportImage,
    onPresent,
    onGenerate,
    onAssist,
    onExportPdf,
    onExportPptx,
    onPreview,
    onHistory,
    onPresenterView,
    onOpenModule,
    assistOpen,
    linkedCount = 0
  } = props

  return (
    <header className="mac-window-chrome drag-region relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-3 shadow-sm backdrop-blur">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 rounded-lg p-0"
        onClick={onBack}
        title="Back to presentations"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 max-w-[320px] flex-1">
        <Input
          value={title}
          aria-label="Presentation title"
          onChange={(event) => onTitleChange(event.target.value)}
          className="h-7 truncate border-transparent bg-transparent px-1 text-sm font-semibold shadow-none hover:bg-muted/50 focus-visible:border-border focus-visible:bg-background"
        />
        <div className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
          {!isDirty && !isSaving ? <Check className="h-3 w-3 text-emerald-500" /> : null}
          <span>
            {isSaving ? 'Saving changes…' : isDirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          {linkedCount > 0 ? (
            <span>
              · {linkedCount} source{linkedCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="hidden items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 md:flex">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Insert
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onSelect={onAddCard}>
            <Plus className="h-4 w-4" /> New slide
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onImportImage}>
            <ImagePlus className="h-4 w-4" /> Image from computer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={assistOpen ? 'secondary' : 'ghost'}
          className={cn('h-8 gap-1.5', assistOpen && 'text-primary')}
          onClick={onAssist}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">AI assist</span>
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 bg-violet-600 text-white hover:bg-violet-700"
          onClick={onGenerate}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Share your presentation</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onPreview}>
              <Eye className="h-4 w-4" /> Preview export
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onExportPdf}>
              <FileDown className="h-4 w-4" /> Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportPptx}>
              <Download className="h-4 w-4" /> Export as PowerPoint
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" className="h-8 gap-1.5">
              <Play className="h-3.5 w-3.5 fill-current" />
              Present
              <ChevronDown className="h-3 w-3 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onPresent}>
              <Play className="h-4 w-4" /> Present in this window
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPresenterView}>
              <MonitorPlay className="h-4 w-4" /> Open presenter view
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onHistory}>
              <History className="h-4 w-4" /> Version history
            </DropdownMenuItem>
            {onOpenModule ? (
              <DropdownMenuItem onSelect={onOpenModule}>
                <ExternalLink className="h-4 w-4" /> Open in new window
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
