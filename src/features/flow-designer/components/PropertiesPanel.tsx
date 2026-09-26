import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { FlowNodeData } from '@shared/types'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Badge } from '@/shared/components/ui/badge'
import { ExternalLink, MousePointerClick, Waypoints } from 'lucide-react'

const EDGE_ROUTING_OPTIONS = [
  { value: 'smoothstep', label: 'Smooth step' },
  { value: 'bezier', label: 'Curved' },
  { value: 'straight', label: 'Straight' }
]

function EdgeProperties() {
  const { nodes, edges, selectedEdgeIds, updateEdge } = useFlowEditorStore()

  const edge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeIds[0]) ?? null,
    [edges, selectedEdgeIds]
  )

  if (!edge) return null

  const sourceLabel = nodes.find((n) => n.id === edge.source)?.data?.label as string | undefined
  const targetLabel = nodes.find((n) => n.id === edge.target)?.data?.label as string | undefined
  const data = (edge.data ?? {}) as { label?: string; condition?: string; edgeType?: string }
  const stroke = (edge.style?.stroke as string) ?? '#94a3b8'

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <Section title="Connection">
          <div className="flex items-center gap-1.5 rounded-md bg-muted/30 px-2 py-1.5 text-[11px]">
            <span className="min-w-0 flex-1 truncate font-medium">{sourceLabel ?? edge.source}</span>
            <Waypoints className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-right font-medium">
              {targetLabel ?? edge.target}
            </span>
          </div>
          <Field label="Label">
            <Input
              value={data.label ?? ''}
              onChange={(e) => updateEdge(edge.id, { data: { ...data, label: e.target.value } })}
              placeholder="e.g. success, on error"
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Condition">
            <Input
              value={data.condition ?? ''}
              onChange={(e) => updateEdge(edge.id, { data: { ...data, condition: e.target.value } })}
              placeholder="e.g. amount > 100"
              className="h-8 font-mono text-xs"
            />
          </Field>
        </Section>

        <Section title="Style">
          <Field label="Routing">
            <select
              value={data.edgeType ?? 'smoothstep'}
              onChange={(e) => updateEdge(edge.id, { data: { ...data, edgeType: e.target.value } })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              {EDGE_ROUTING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={stroke}
                onChange={(e) => updateEdge(edge.id, { style: { ...edge.style, stroke: e.target.value } })}
                className="h-8 w-10 cursor-pointer rounded border border-border"
              />
              <Input
                value={stroke}
                onChange={(e) => updateEdge(edge.id, { style: { ...edge.style, stroke: e.target.value } })}
                className="h-8 flex-1 font-mono text-xs"
              />
            </div>
          </Field>
          <label className="flex items-center justify-between rounded-md border border-input bg-background px-2.5 py-2 text-xs">
            Animated flow
            <input
              type="checkbox"
              checked={!!edge.animated}
              onChange={(e) => updateEdge(edge.id, { animated: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary"
            />
          </label>
        </Section>
      </div>
    </ScrollArea>
  )
}

export function PropertiesPanel() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { nodes, selectedNodeIds, selectedEdgeIds, updateNodeData, pushHistory } = useFlowEditorStore()
  const { documents } = useDocumentStore()

  const selectedNode = useMemo(() => {
    if (selectedNodeIds.length !== 1) return null
    return nodes.find((n) => n.id === selectedNodeIds[0]) ?? null
  }, [nodes, selectedNodeIds])

  const hasSelectedEdge = selectedNodeIds.length === 0 && selectedEdgeIds.length === 1

  if (hasSelectedEdge) {
    return <EdgeProperties />
  }

  if (!selectedNode) {
    if (selectedNodeIds.length > 1) {
      const applyColorToAll = (color: string) => {
        pushHistory()
        selectedNodeIds.forEach((id) => updateNodeData(id, { color }))
      }

      return (
        <div className="flex h-full flex-col p-3">
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">{selectedNodeIds.length} nodes selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bulk edit below, or use the floating toolbar to align, duplicate, or delete.
            </p>
            <Field label="Apply color to all">
              <div className="mt-2 flex gap-2">
                <input
                  type="color"
                  defaultValue="#6366f1"
                  onChange={(e) => applyColorToAll(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-border"
                />
                <span className="self-center text-[10px] text-muted-foreground">
                  Pick a color to apply to all selected nodes
                </span>
              </div>
            </Field>
            <div className="mt-3 space-y-1">
              {selectedNodeIds.slice(0, 8).map((id) => {
                const n = nodes.find((node) => node.id === id)
                return (
                  <div key={id} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: String(n?.data?.color ?? '#6366f1') }}
                    />
                    <span className="truncate">{String(n?.data?.label ?? id)}</span>
                  </div>
                )
              })}
              {selectedNodeIds.length > 8 && (
                <p className="text-[10px] text-muted-foreground">
                  +{selectedNodeIds.length - 8} more
                </p>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <MousePointerClick className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No selection</p>
        <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
          Select a node to edit properties, or an edge to set its label, routing, and style.
        </p>
      </div>
    )
  }

  const data = selectedNode.data as FlowNodeData

  const update = (patch: Partial<FlowNodeData>) => {
    updateNodeData(selectedNode.id, patch)
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <Section title="General">
          <Field label="Title">
            <Input
              value={data.label ?? ''}
              onChange={(e) => update({ label: e.target.value })}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={data.description ?? ''}
              onChange={(e) => update({ description: e.target.value })}
              rows={3}
              className="text-xs"
              placeholder="What this step does"
            />
          </Field>
          <Field label="Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={data.color ?? '#6366f1'}
                onChange={(e) => update({ color: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-border"
              />
              <Input
                value={data.color ?? '#6366f1'}
                onChange={(e) => update({ color: e.target.value })}
                className="h-8 flex-1 font-mono text-xs"
              />
            </div>
          </Field>
        </Section>

        <Section title="Link">
          <Field label="Requirement document">
            <select
              value={data.linkedDocumentId ?? ''}
              onChange={(e) => update({ linkedDocumentId: e.target.value || undefined })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">None</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.title}</option>
              ))}
            </select>
          </Field>
          {data.linkedDocumentId && projectId && (
            <button
              type="button"
              onClick={() =>
                navigate(`/project/${projectId}/editor/${data.linkedDocumentId}`)
              }
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open linked document
            </button>
          )}
        </Section>

        <Section title="Notes">
          <Textarea
            value={data.notes ?? ''}
            onChange={(e) => update({ notes: e.target.value })}
            rows={4}
            className="text-xs"
            placeholder="Implementation notes, constraints, or open questions"
          />
        </Section>

        <div className="flex flex-wrap gap-1.5 px-1">
          {data.nodeType && <Badge variant="secondary" className="text-[10px]">{data.nodeType}</Badge>}
          {data.category && <Badge variant="outline" className="text-[10px]">{data.category}</Badge>}
          {data.shape && <Badge variant="outline" className="text-[10px]">{data.shape}</Badge>}
        </div>
      </div>
    </ScrollArea>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <h4 className="mb-2.5 text-xs font-semibold">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
