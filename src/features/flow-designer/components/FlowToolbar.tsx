import { useRef } from 'react'
import {
  Undo2,
  Redo2,
  Trash2,
  LayoutGrid,
  Download,
  Upload,
  Grid3X3,
  Magnet,
  Map,
  FileJson,
  Image,
  Printer,
  ArrowLeft,
  Loader2,
  Check,
  ShieldCheck,
  ChevronDown,
  Eye,
  Copy
} from 'lucide-react'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { FLOW_TEMPLATES, templateToPayload } from '../lib/templates'
import {
  exportFlowToJson,
  exportFlowToMermaid,
  exportFlowToPng,
  exportFlowToSvg,
  importFlowFromJson,
  printFlow
} from '../lib/export'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'
import type { FlowLayoutEngine, FlowCategory } from '@shared/types'

const CATEGORY_LABELS: Record<FlowCategory, string> = {
  process: 'Process',
  architecture: 'Architecture',
  api: 'API',
  database: 'Database',
  uml: 'UML',
  bpmn: 'BPMN',
  journey: 'Journey',
  requirements: 'Requirements'
}

const PRIMARY_CATEGORIES: FlowCategory[] = [
  'process',
  'architecture',
  'api',
  'database',
  'journey',
  'requirements'
]

interface FlowToolbarProps {
  title: string
  onTitleChange: (title: string) => void
  category?: FlowCategory
  onCategoryChange?: (category: FlowCategory) => void
  isSaving?: boolean
  onBack: () => void
}

export function FlowToolbar({
  title,
  onTitleChange,
  category,
  onCategoryChange,
  isSaving,
  onBack
}: FlowToolbarProps) {
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    deleteSelected,
    autoLayout,
    toggleGrid,
    toggleMinimap,
    toggleSnapToGrid,
    showGrid,
    showMinimap,
    snapToGrid,
    showValidation,
    toggleValidation,
    turboMode,
    toggleTurboMode,
    loadSnapshot,
    nodes,
    edges,
    viewport,
    fitViewToContent
  } = useFlowEditorStore()
  const importInputRef = useRef<HTMLInputElement>(null)

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const { nodes: n, edges: ed, viewport: v } = importFlowFromJson(String(reader.result))
        loadSnapshot(n, ed, v, { recordHistory: true })
        fitViewToContent()
        toast.success('Flow imported')
      } catch {
        toast.error('Invalid flow JSON file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExport = async (format: 'json' | 'png' | 'svg' | 'mermaid' | 'print') => {
    const el = document.querySelector('.react-flow__viewport') as HTMLElement
    if (!el && format !== 'json' && format !== 'mermaid') {
      toast.error('Canvas not ready')
      return
    }
    const safeName = title.replace(/[^a-z0-9-_]/gi, '_') || 'flow'
    try {
      if (format === 'json') exportFlowToJson(nodes, edges, viewport, safeName)
      else if (format === 'mermaid') {
        const mermaid = exportFlowToMermaid(nodes, edges)
        navigator.clipboard.writeText(mermaid)
        toast.success('Mermaid copied to clipboard')
      } else if (format === 'png' && el) await exportFlowToPng(el, safeName)
      else if (format === 'svg' && el) await exportFlowToSvg(el, safeName)
      else if (format === 'print' && el) printFlow(el)
    } catch {
      toast.error('Export failed')
    }
  }

  const applyTemplate = (templateId: string) => {
    const template = FLOW_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    const { nodes: n, edges: e, viewport: v } = templateToPayload(template)
    loadSnapshot(n, e, v, { recordHistory: true })
    fitViewToContent()
    toast.success(`Applied “${template.title}”`)
  }

  const layouts: { id: FlowLayoutEngine; label: string }[] = [
    { id: 'hierarchical', label: 'Vertical' },
    { id: 'horizontal', label: 'Horizontal' },
    { id: 'tree', label: 'Compact' }
  ]

  return (
    <header className="immersive-flow-header drag-region flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-2.5">
      <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Flows</span>
      </Button>

      <div className="h-5 w-px shrink-0 bg-border" />

      <Input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="h-8 max-w-[180px] border-none bg-transparent px-1 font-semibold shadow-none focus-visible:ring-0"
        aria-label="Flow title"
      />

      {category && onCategoryChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden h-7 gap-1 px-2 text-[10px] sm:flex">
              {CATEGORY_LABELS[category]}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PRIMARY_CATEGORIES.map((cat) => (
              <DropdownMenuItem key={cat} onClick={() => onCategoryChange(cat)}>
                {CATEGORY_LABELS[cat]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <span
        className={cn(
          'hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:flex',
          isSaving
            ? 'border-border text-muted-foreground'
            : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
        )}
      >
        {isSaving ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving
          </>
        ) : (
          <>
            <Check className="h-3 w-3" />
            Saved
          </>
        )}
      </span>

      <ToolbarGroup>
        <ToolbarBtn icon={Undo2} title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
        <ToolbarBtn icon={Redo2} title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo} />
        <ToolbarBtn icon={Trash2} title="Delete" onClick={deleteSelected} />
      </ToolbarGroup>

      <ToolbarGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
              <LayoutGrid className="h-3.5 w-3.5" />
              Layout
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {layouts.map((l) => (
              <DropdownMenuItem key={l.id} onClick={() => autoLayout(l.id)}>
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              Templates
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
            {FLOW_TEMPLATES.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => applyTemplate(t.id)}>
                <div className="min-w-0">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-[10px] text-muted-foreground">{t.description}</p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="hidden h-7 gap-1.5 px-2 text-xs md:flex">
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuCheckboxItem
            checked={showGrid}
            onCheckedChange={toggleGrid}
            onSelect={(e) => e.preventDefault()}
          >
            <Grid3X3 className="mr-2 h-3.5 w-3.5" />
            Grid
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={snapToGrid}
            onCheckedChange={toggleSnapToGrid}
            onSelect={(e) => e.preventDefault()}
          >
            <Magnet className="mr-2 h-3.5 w-3.5" />
            Snap to grid
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showMinimap}
            onCheckedChange={toggleMinimap}
            onSelect={(e) => e.preventDefault()}
          >
            <Map className="mr-2 h-3.5 w-3.5" />
            Minimap
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showValidation}
            onCheckedChange={toggleValidation}
            onSelect={(e) => e.preventDefault()}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Validation badges
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={turboMode}
            onCheckedChange={toggleTurboMode}
            onSelect={(e) => e.preventDefault()}
          >
            Turbo mode
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={() => importInputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Import</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Export diagram</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => handleExport('png')}>
            <Image className="mr-2 h-3.5 w-3.5" /> PNG
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('svg')}>
            <Image className="mr-2 h-3.5 w-3.5" /> SVG
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('json')}>
            <FileJson className="mr-2 h-3.5 w-3.5" /> JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('mermaid')}>
            <Copy className="mr-2 h-3.5 w-3.5" /> Mermaid
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport('print')}>
            <Printer className="mr-2 h-3.5 w-3.5" /> Print
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImport}
      />
    </header>
  )
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden items-center rounded-md border bg-background p-0.5 shadow-sm md:flex">
      {children}
    </div>
  )
}

function ToolbarBtn({
  icon: Icon,
  title,
  onClick,
  disabled,
  active
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('h-7 w-7 p-0', active && 'bg-primary/10 text-primary')}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  )
}
