import { Panel } from '@xyflow/react'
import {
  MousePointer2,
  Hand,
  Spline,
  Eraser,
  Zap,
  Group,
  Ungroup,
  Minus,
  Plus,
  Maximize2,
  Focus
} from 'lucide-react'
import type { FlowTool } from '@shared/types'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { cn } from '@/shared/lib/utils'
import { toast } from 'sonner'

interface ToolDef {
  id: FlowTool
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut: string
}

/** Primary edit tools — pan is optional; Space / scroll / middle-click work in Select. */
const TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
  { id: 'pan', icon: Hand, label: 'Hand (sticky pan)', shortcut: 'H' },
  { id: 'connect', icon: Spline, label: 'Connect', shortcut: 'C' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' }
]

export function FlowToolPalette() {
  const activeTool = useFlowEditorStore((s) => s.activeTool)
  const setActiveTool = useFlowEditorStore((s) => s.setActiveTool)
  const turboMode = useFlowEditorStore((s) => s.turboMode)
  const toggleTurboMode = useFlowEditorStore((s) => s.toggleTurboMode)
  const selectedNodeIds = useFlowEditorStore((s) => s.selectedNodeIds)
  const nodes = useFlowEditorStore((s) => s.nodes)
  const viewport = useFlowEditorStore((s) => s.viewport)
  const reactFlowInstance = useFlowEditorStore((s) => s.reactFlowInstance)
  const groupSelectionIntoSubflow = useFlowEditorStore((s) => s.groupSelectionIntoSubflow)
  const ungroupSubflow = useFlowEditorStore((s) => s.ungroupSubflow)
  const fitViewToContent = useFlowEditorStore((s) => s.fitViewToContent)

  const groupableCount = nodes.filter(
    (n) => selectedNodeIds.includes(n.id) && n.type !== 'group' && n.type !== 'swimlane' && !n.parentId
  ).length
  const selectedGroup = nodes.find(
    (n) => selectedNodeIds.includes(n.id) && (n.type === 'group' || n.type === 'swimlane')
  )

  const zoomPct = Math.round((viewport.zoom ?? 1) * 100)

  const handleGroup = () => {
    if (groupableCount < 1) {
      toast.info('Select one or more free nodes to group into a sub flow')
      return
    }
    groupSelectionIntoSubflow()
    toast.success('Grouped into sub flow')
  }

  const handleUngroup = () => {
    if (!selectedGroup) return
    ungroupSubflow(selectedGroup.id)
    toast.success('Sub flow ungrouped')
  }

  const zoomBy = (factor: number) => {
    if (!reactFlowInstance) return
    const next = Math.min(2.5, Math.max(0.2, (viewport.zoom ?? 1) * factor))
    reactFlowInstance.zoomTo(next, { duration: 120 })
  }

  return (
    <Panel position="bottom-center" className="!m-0 !mb-3">
      <div className="flex items-center gap-0.5 rounded-xl border border-border/80 bg-card/95 p-1 shadow-lg backdrop-blur-md">
        {TOOLS.map((tool) => (
          <PaletteButton
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
            active={activeTool === tool.id}
            danger={tool.id === 'eraser'}
            onClick={() => setActiveTool(tool.id)}
          />
        ))}

        <ToolbarDivider />

        <PaletteButton
          icon={Zap}
          label="Turbo mode"
          shortcut="T"
          active={turboMode}
          highlight
          onClick={toggleTurboMode}
        />
        <PaletteButton
          icon={Group}
          label="Group into sub flow"
          shortcut="Ctrl+G"
          disabled={groupableCount < 1}
          onClick={handleGroup}
        />
        <PaletteButton
          icon={Ungroup}
          label="Ungroup sub flow"
          shortcut="Ctrl+Shift+G"
          disabled={!selectedGroup}
          onClick={handleUngroup}
        />

        <ToolbarDivider />

        <PaletteButton
          icon={Minus}
          label="Zoom out"
          shortcut="Ctrl+-"
          disabled={!reactFlowInstance}
          onClick={() => zoomBy(1 / 1.2)}
        />
        <button
          type="button"
          title="Reset zoom to 100%"
          disabled={!reactFlowInstance}
          onClick={() => reactFlowInstance?.zoomTo(1, { duration: 160 })}
          className="min-w-[2.75rem] rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          {zoomPct}%
        </button>
        <PaletteButton
          icon={Plus}
          label="Zoom in"
          shortcut="Ctrl+="
          disabled={!reactFlowInstance}
          onClick={() => zoomBy(1.2)}
        />
        <PaletteButton
          icon={Maximize2}
          label="Fit all"
          shortcut="Shift+1"
          disabled={!reactFlowInstance}
          onClick={() => fitViewToContent()}
        />
        <PaletteButton
          icon={Focus}
          label="Fit selection"
          shortcut="Shift+2"
          disabled={!reactFlowInstance || selectedNodeIds.length === 0}
          onClick={() =>
            reactFlowInstance?.fitView({
              padding: 0.25,
              duration: 200,
              nodes: nodes.filter((n) => selectedNodeIds.includes(n.id))
            })
          }
        />
      </div>
    </Panel>
  )
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
}

function PaletteButton({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  danger,
  highlight,
  onClick
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
  highlight?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'group/palette relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        active && !danger && !highlight && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        active && danger && 'bg-destructive text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground',
        active && highlight && 'bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white hover:text-white'
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md group-hover/palette:block">
        {label}
        {shortcut && <span className="ml-1.5 text-muted-foreground">{shortcut}</span>}
      </span>
    </button>
  )
}
