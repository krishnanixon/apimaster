import { memo } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { FlowNodeData } from '@shared/types'
import { cn } from '@/shared/lib/utils'
import { FlowNode, InlineLabel } from './FlowNode'
import { useFlowEditorStore } from '../stores/flow-editor.store'

export const SwimlaneNode = memo(function SwimlaneNode({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData
  return (
    <>
      <NodeResizer minWidth={300} minHeight={150} isVisible={selected} />
      <div
        className={cn(
          'flex h-full w-full flex-col rounded-lg border-2 border-dashed border-border/80 bg-muted/20',
          selected && 'ring-2 ring-primary/40'
        )}
      >
        <div
          className="shrink-0 border-b border-border/60 px-3 py-2"
          style={{ backgroundColor: `${d.color ?? '#64748b'}15` }}
        >
          <InlineLabel id={id} label={d.label} className="text-xs font-semibold uppercase tracking-wide" />
        </div>
        <div className="flex-1" />
      </div>
    </>
  )
})

export const GroupNode = memo(function GroupNode({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData & { collapsed?: boolean }
  const toggleGroupCollapsed = useFlowEditorStore((s) => s.toggleGroupCollapsed)

  return (
    <>
      <NodeResizer minWidth={200} minHeight={120} isVisible={selected} />
      <div
        className={cn(
          'flex h-full w-full flex-col rounded-xl border-2 border-dashed bg-background/50',
          selected && 'border-primary/50 ring-2 ring-primary/20'
        )}
        style={{ borderColor: `${d.color ?? '#6366f1'}44` }}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation()
              toggleGroupCollapsed(id)
            }}
            title={d.collapsed ? 'Expand group' : 'Collapse group'}
          >
            {d.collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <InlineLabel id={id} label={d.label} />
          </div>
          {d.collapsed && (
            <span className="text-[10px] text-muted-foreground">(collapsed)</span>
          )}
        </div>
        {!d.collapsed && <div className="flex-1 p-2" />}
      </div>
    </>
  )
})

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData
  return (
    <div
      className={cn(
        'min-w-[100px] rounded-md px-2 py-1 text-sm',
        selected && 'ring-2 ring-primary ring-offset-1'
      )}
    >
      <InlineLabel id={id} label={d.label} centered className="text-sm font-medium" />
    </div>
  )
})

export const nodeTypes = {
  flowNode: FlowNode,
  swimlane: SwimlaneNode,
  group: GroupNode,
  text: TextNode
}
