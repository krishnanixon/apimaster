import { memo, useState, useRef, useEffect } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps
} from '@xyflow/react'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { cn } from '@/shared/lib/utils'

export const LabeledEdge = memo(function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  animated,
  style
}: EdgeProps) {
  const updateEdge = useFlowEditorStore((s) => s.updateEdge)
  const turboMode = useFlowEditorStore((s) => s.turboMode)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(data?.label ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  const edgeType = (data?.edgeType as string) ?? 'smoothstep'
  const isTurbo = turboMode || Boolean(data?.turbo)

  const [path, labelX, labelY] =
    edgeType === 'straight'
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : edgeType === 'bezier'
        ? getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
        : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })

  const label = data?.label as string | undefined
  const condition = data?.condition as string | undefined

  useEffect(() => {
    setValue(String(label ?? ''))
  }, [label])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    updateEdge(id, { data: { ...data, label: value.trim() } })
  }

  const baseStroke = (style?.stroke as string) ?? '#94a3b8'

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={cn(isTurbo && 'flow-turbo-edge')}
        style={{
          ...style,
          stroke: isTurbo ? 'url(#flow-turbo-gradient)' : selected ? 'hsl(var(--primary))' : baseStroke,
          strokeWidth: isTurbo ? 2.5 : selected ? 2.5 : 1.5,
          filter: isTurbo ? 'url(#flow-turbo-glow)' : undefined
        }}
        markerEnd={isTurbo ? 'url(#flow-turbo-arrow)' : 'url(#flow-arrow)'}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex flex-col items-center gap-0.5"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
        >
          {editing ? (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') {
                  setValue(String(label ?? ''))
                  setEditing(false)
                }
                e.stopPropagation()
              }}
              placeholder="Label"
              className="w-24 rounded-md border border-primary bg-background px-1.5 py-0.5 text-[10px] font-medium outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : label ? (
            <div
              className={cn(
                'rounded-md border px-1.5 py-0.5 text-[10px] font-medium shadow-sm',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-background/95'
              )}
            >
              {label}
            </div>
          ) : (
            <button
              type="button"
              className="rounded-md border border-dashed border-border/60 bg-background/80 px-1.5 py-0.5 text-[9px] text-muted-foreground opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-60"
              onClick={(e) => {
                e.stopPropagation()
                setEditing(true)
              }}
            >
              + label
            </button>
          )}
          {condition && !editing && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-600 dark:text-amber-400">
              {condition}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
})

export const edgeTypes = {
  labeled: LabeledEdge
}
