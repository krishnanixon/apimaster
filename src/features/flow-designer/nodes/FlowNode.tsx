import { memo, useState, useRef, useEffect } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle } from 'lucide-react'
import type { FlowNodeData, FlowNodeShape } from '@shared/types'
import { cn } from '@/shared/lib/utils'
import { DynamicIcon } from '../lib/dynamic-icon'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { useNodeValidationSeverity } from '../context/flow-validation.context'

const NON_RESIZABLE_SHAPES = new Set<FlowNodeShape>(['circle', 'sticky'])

const shapeClasses: Record<FlowNodeShape, string> = {
  rectangle: 'rounded-lg',
  circle: 'rounded-full aspect-square',
  diamond: '',
  rounded: 'rounded-2xl',
  ellipse: 'rounded-[50%]',
  triangle: 'clip-triangle',
  hexagon: 'clip-hexagon',
  parallelogram: 'skew-x-[-12deg] [&_.flow-node-inner]:skew-x-[12deg]',
  cylinder: 'shape-cylinder',
  document: 'shape-document',
  terminal: 'rounded-full px-6',
  sticky: 'rounded-md shadow-md border-yellow-300/60 rotate-[-0.4deg]',
  swimlane: 'rounded-lg border-dashed',
  group: 'rounded-xl border-dashed border-2'
}

const CENTERED_SHAPES = new Set<FlowNodeShape>([
  'circle',
  'ellipse',
  'diamond',
  'triangle',
  'hexagon',
  'terminal'
])

const SEVERITY_RING: Record<string, string> = {
  CRITICAL: 'ring-destructive/60',
  HIGH: 'ring-orange-500/50',
  MEDIUM: 'ring-amber-500/40',
  LOW: 'ring-muted-foreground/30'
}

function NodeHandles({ color, visible }: { color: string; visible: boolean }) {
  const base = cn(
    '!h-2.5 !w-2.5 !border-2 !bg-background transition-opacity duration-150',
    visible ? '!opacity-100' : '!opacity-0 group-hover:!opacity-100'
  )
  const style = { borderColor: color }
  return (
    <>
      <Handle type="target" position={Position.Top} className={base} style={style} />
      <Handle type="target" position={Position.Left} className={base} style={style} />
      <Handle type="source" position={Position.Bottom} className={base} style={style} />
      <Handle type="source" position={Position.Right} className={base} style={style} />
    </>
  )
}

export function InlineLabel({
  id,
  label,
  centered,
  className
}: {
  id: string
  label: string
  centered?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)
  const updateNodeData = useFlowEditorStore((s) => s.updateNodeData)

  useEffect(() => {
    setValue(label)
  }, [label])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed && trimmed !== label) {
      updateNodeData(id, { label: trimmed })
    } else {
      setValue(label)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setValue(label)
            setEditing(false)
          }
          e.stopPropagation()
        }}
        className={cn(
          'nodrag nopan w-full rounded border border-primary bg-background px-1 py-0.5 text-xs font-semibold outline-none',
          centered && 'text-center',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <p
      className={cn(
        'text-xs font-semibold leading-tight',
        centered ? 'line-clamp-2 max-w-full' : 'truncate',
        className
      )}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      title="Double-click to rename"
    >
      {label}
    </p>
  )
}

function ValidationBadge({ nodeId }: { nodeId: string }) {
  const showValidation = useFlowEditorStore((s) => s.showValidation)
  const severity = useNodeValidationSeverity(nodeId)
  if (!showValidation || !severity) return null

  const colors: Record<string, string> = {
    CRITICAL: 'bg-destructive text-destructive-foreground',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-amber-500 text-white',
    LOW: 'bg-muted text-muted-foreground'
  }

  return (
    <span
      className={cn(
        'absolute -left-1.5 -top-1.5 z-30 flex h-4 w-4 items-center justify-center rounded-full shadow-sm',
        colors[severity] ?? colors.LOW
      )}
      title={`Validation: ${severity}`}
    >
      <AlertTriangle className="h-2.5 w-2.5" />
    </span>
  )
}

export const FlowNode = memo(function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData
  const shape = (d.shape ?? 'rounded') as FlowNodeShape
  const color = d.color ?? '#6366f1'
  const isSticky = shape === 'sticky'
  const centered = CENTERED_SHAPES.has(shape)
  const showValidation = useFlowEditorStore((s) => s.showValidation)
  const activeTool = useFlowEditorStore((s) => s.activeTool)
  const turboMode = useFlowEditorStore((s) => s.turboMode)
  const severity = useNodeValidationSeverity(id)
  const validationRing = showValidation && severity ? SEVERITY_RING[severity] : null
  const handlesVisible = Boolean(selected) || activeTool === 'connect'
  const isRound = shape === 'circle'
  const canResize =
    Boolean(selected) && activeTool === 'select' && !NON_RESIZABLE_SHAPES.has(shape)

  const iconBadge = d.icon ? (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
      style={{ backgroundColor: color }}
    >
      <DynamicIcon name={d.icon} className="h-3.5 w-3.5" />
    </span>
  ) : null

  const linkedBadge = d.linkedDocumentId ? (
    <span className="absolute -right-1 -top-1 z-20 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
  ) : null

  if (shape === 'diamond') {
    return (
      <div className={cn('flow-node group relative', turboMode && 'flow-turbo-node')} style={{ width: 148, height: 148 }}>
        <ValidationBadge nodeId={id} />
        <div
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 backdrop-blur-sm transition-shadow',
            selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
            validationRing
          )}
          style={{
            width: '70.7%',
            height: '70.7%',
            borderColor: `${color}55`,
            backgroundColor: `${color}12`,
            boxShadow: selected ? `0 6px 20px ${color}40` : `0 1px 3px ${color}1a`,
            borderRadius: 8
          }}
        />
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 px-6 text-center">
          {iconBadge}
          <InlineLabel id={id} label={d.label} centered className="text-[11px]" />
          {d.description && (
            <p className="line-clamp-2 max-w-full text-[9px] leading-tight text-muted-foreground">
              {d.description}
            </p>
          )}
        </div>
        {linkedBadge}
        <NodeHandles color={color} visible={handlesVisible} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flow-node group relative border-2 backdrop-blur-sm transition-all duration-150',
        isRound ? 'flex items-center justify-center' : 'min-h-[44px] min-w-[150px]',
        !isRound && 'h-full w-full',
        shapeClasses[shape] ?? shapeClasses.rounded,
        selected
          ? 'shadow-lg ring-2 ring-primary ring-offset-2 ring-offset-background'
          : 'shadow-sm hover:shadow-md',
        validationRing,
        turboMode && 'flow-turbo-node',
        d.locked && 'opacity-80'
      )}
      style={{
        borderColor: `${color}50`,
        backgroundColor: isSticky ? '#fef9c3' : `${color}0d`,
        boxShadow: selected ? `0 6px 20px ${color}40` : undefined,
        ...(isRound ? { width: 120, height: 120 } : null)
      }}
    >
      {canResize && (
        <NodeResizer
          color={color}
          isVisible
          minWidth={120}
          minHeight={44}
          keepAspectRatio={shape === 'ellipse' || shape === 'triangle' || shape === 'hexagon'}
          handleClassName="!h-2 !w-2 !rounded-sm !border !border-background"
        />
      )}
      <ValidationBadge nodeId={id} />
      <NodeHandles color={color} visible={handlesVisible} />

      <div
        className={cn(
          'flow-node-inner flex h-full gap-2',
          centered
            ? 'flex-col items-center justify-center px-4 py-2 text-center'
            : 'items-center px-3 py-2.5'
        )}
      >
        {iconBadge}
        <div className={cn('min-w-0', centered ? 'flex flex-col items-center' : 'flex-1')}>
          <InlineLabel id={id} label={d.label} centered={centered} />
          {d.description && (
            <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{d.description}</p>
          )}
        </div>
      </div>

      {linkedBadge}
    </div>
  )
})
