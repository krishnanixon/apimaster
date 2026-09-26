import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Circle,
  Code2,
  FileImage,
  Grid3x3,
  Magnet,
  Maximize2,
  Minus,
  Plus,
  Shapes,
  Square,
  Star,
  Table2,
  Triangle,
  Type
} from 'lucide-react'
import { usePresentationDocumentStore } from '../stores/presentation-document.store'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'

export type PresentationInsertTool =
  | 'text'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'triangle'
  | 'icon'
  | 'image'
  | 'table'
  | 'code'

const shapeTools: Array<{ id: PresentationInsertTool; label: string; icon: LucideIcon }> = [
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'rounded-rectangle', label: 'Rounded rectangle', icon: Square },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'triangle', label: 'Triangle', icon: Triangle }
]

const insertTools: Array<{ id: PresentationInsertTool; label: string; icon: LucideIcon }> = [
  { id: 'text', label: 'Text', icon: Type },
  { id: 'image', label: 'Image', icon: FileImage },
  { id: 'icon', label: 'Icon', icon: Star },
  { id: 'table', label: 'Table', icon: Table2 },
  { id: 'code', label: 'Code block', icon: Code2 }
]

interface PresentationCanvasToolbarProps {
  zoom: number
  onZoomChange: (zoom: number) => void
  onFitToScreen?: () => void
  onInsert: (tool: PresentationInsertTool) => void
}

export function PresentationCanvasToolbar({
  zoom,
  onZoomChange,
  onFitToScreen,
  onInsert
}: PresentationCanvasToolbarProps) {
  const showGrid = usePresentationDocumentStore((state) => state.showGrid)
  const snapToGrid = usePresentationDocumentStore((state) => state.snapToGrid)
  const setShowGrid = usePresentationDocumentStore((state) => state.setShowGrid)
  const setSnapToGrid = usePresentationDocumentStore((state) => state.setSnapToGrid)

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border/70 bg-background/95 p-1 shadow-md backdrop-blur-md">
      {insertTools.map((tool) => (
        <ToolbarBtn
          key={tool.id}
          icon={tool.icon}
          label={tool.label}
          onClick={() => onInsert(tool.id)}
        />
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Shapes"
            aria-label="Shapes"
            className="pointer-events-auto h-7 gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Shapes className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="w-40">
          {shapeTools.map((tool) => (
            <DropdownMenuItem key={tool.id} className="text-xs" onClick={() => onInsert(tool.id)}>
              <tool.icon className="mr-2 h-3.5 w-3.5" />
              {tool.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolbarDivider />

      <ToolbarBtn icon={Minus} label="Zoom out" onClick={() => onZoomChange(zoom - 0.1)} />
      <span className="min-w-[2.5rem] px-0.5 text-center text-[11px] tabular-nums text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <ToolbarBtn icon={Plus} label="Zoom in" onClick={() => onZoomChange(zoom + 0.1)} />
      {onFitToScreen ? (
        <>
          <ToolbarDivider />
          <ToolbarBtn icon={Maximize2} label="Fit to screen" onClick={onFitToScreen} />
        </>
      ) : null}
      <ToolbarDivider />
      <ToolbarBtn
        icon={Grid3x3}
        label="Show grid"
        active={showGrid}
        onClick={() => setShowGrid(!showGrid)}
      />
      <ToolbarBtn
        icon={Magnet}
        label="Snap to grid"
        active={snapToGrid}
        onClick={() => setSnapToGrid(!snapToGrid)}
      />
    </div>
  )
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />
}

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  active
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'pointer-events-auto h-7 w-7 rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground',
        active && 'bg-primary/10 text-primary'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  )
}

export const GRID_SIZE = 20

export function snapValue(value: number, enabled: boolean, grid = GRID_SIZE): number {
  return enabled ? Math.round(value / grid) * grid : value
}
