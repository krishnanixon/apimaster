import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Connection, Edge, EdgeChange, Node, NodeChange, Viewport, ReactFlowInstance } from '@xyflow/react'
import { applyEdgeChanges, applyNodeChanges, addEdge } from '@xyflow/react'
import type { FlowLayoutEngine, FlowPanelLayout, FlowTool } from '@shared/types'
import { applyAutoLayout } from '../lib/layouts'
import { alignNodes, distributeNodes, type AlignMode, type DistributeAxis } from '../lib/align'
import { createFlowNodeFromItem, type NodeLibraryItem } from '../lib/node-definitions'

const MAX_HISTORY = 50

interface ClipboardPayload {
  nodes: Node[]
  edges: Edge[]
}

let clipboard: ClipboardPayload | null = null

interface EditorSnapshot {
  nodes: Node[]
  edges: Edge[]
}

/** Absolute canvas position of a node by walking its parent chain. */
function getAbsolutePosition(node: Node, nodes: Node[]): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  const guard = new Set<string>([node.id])
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId)
    const parent = nodes.find((n) => n.id === parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

function getNodeSize(node: Node): { width: number; height: number } {
  const measured = node.measured as { width?: number; height?: number } | undefined
  const width = measured?.width ?? (node.width as number) ?? Number(node.style?.width) ?? 160
  const height = measured?.height ?? (node.height as number) ?? Number(node.style?.height) ?? 56
  return { width, height }
}

const CONTAINER_TYPES = new Set(['group', 'swimlane'])

interface FlowEditorState {
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport
  panelLayout: FlowPanelLayout
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  snapToGrid: boolean
  showGrid: boolean
  showMinimap: boolean
  showValidation: boolean
  activeTool: FlowTool
  turboMode: boolean
  dropTargetId: string | null
  past: EditorSnapshot[]
  future: EditorSnapshot[]
  canUndo: boolean
  canRedo: boolean
  reactFlowInstance: ReactFlowInstance | null

  setReactFlowInstance: (instance: ReactFlowInstance | null) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  setViewport: (viewport: Viewport) => void
  setPanelLayout: (layout: Partial<FlowPanelLayout>) => void
  setSelection: (nodeIds: string[], edgeIds?: string[]) => void
  selectAll: () => void
  clearSelection: () => void
  focusSelection: () => void
  toggleNodeHidden: (nodeId: string) => void
  toggleNodeLocked: (nodeId: string) => void
  bringNodeToFront: (nodeId: string) => void
  sendNodeToBack: (nodeId: string) => void
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  updateEdge: (edgeId: string, patch: Partial<Edge>) => void
  toggleSnapToGrid: () => void
  toggleGrid: () => void
  toggleMinimap: () => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  loadSnapshot: (
    nodes: Node[],
    edges: Edge[],
    viewport?: Viewport,
    options?: { recordHistory?: boolean }
  ) => void
  duplicateSelected: () => void
  deleteSelected: () => void
  autoLayout: (engine?: FlowLayoutEngine) => void
  copySelected: () => void
  pasteClipboard: () => void
  alignSelected: (mode: AlignMode) => void
  distributeSelected: (axis: DistributeAxis) => void
  toggleGroupCollapsed: (nodeId: string) => void
  toggleValidation: () => void
  setActiveTool: (tool: FlowTool) => void
  toggleTurboMode: () => void
  setDropTarget: (nodeId: string | null) => void
  attachNodeToParent: (childId: string, parentId: string) => void
  detachNodeFromParent: (childId: string) => void
  groupSelectionIntoSubflow: () => void
  ungroupSubflow: (groupId: string) => void
  addLibraryNode: (
    item: Pick<NodeLibraryItem, 'label' | 'nodeType' | 'category' | 'shape' | 'icon' | 'color'>,
    position?: { x: number; y: number }
  ) => string
  fitViewToContent: () => void
  beginEraseStroke: () => void
  eraseNode: (nodeId: string) => void
  eraseEdge: (edgeId: string) => void
  resetEditor: () => void
}

const defaultPanelLayout: FlowPanelLayout = {
  leftWidth: 260,
  rightWidth: 320,
  leftCollapsed: false,
  rightCollapsed: false,
  rightTab: 'properties'
}

function snapshot(state: FlowEditorState): EditorSnapshot {
  return {
    nodes: structuredClone(state.nodes),
    edges: structuredClone(state.edges)
  }
}

export const useFlowEditorStore = create<FlowEditorState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      panelLayout: defaultPanelLayout,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      snapToGrid: true,
      showGrid: true,
      showMinimap: true,
      showValidation: true,
      activeTool: 'select',
      turboMode: false,
      dropTargetId: null,
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
      reactFlowInstance: null,

      setReactFlowInstance: (instance) => set({ reactFlowInstance: instance }),
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      onNodesChange: (changes) => {
        const hasRemove = changes.some((c) => c.type === 'remove')
        if (hasRemove) get().pushHistory()

        const { nodes, selectedNodeIds } = get()
        const nextNodes = applyNodeChanges(changes, nodes)
        const removedIds = new Set(
          changes.filter((c) => c.type === 'remove').map((c) => c.id)
        )

        set({
          nodes: nextNodes,
          selectedNodeIds: selectedNodeIds.filter((id) => !removedIds.has(id))
        })
      },

      onEdgesChange: (changes) => {
        const hasRemove = changes.some((c) => c.type === 'remove')
        if (hasRemove) get().pushHistory()

        const { edges, selectedEdgeIds } = get()
        const nextEdges = applyEdgeChanges(changes, edges)
        const removedIds = new Set(
          changes.filter((c) => c.type === 'remove').map((c) => c.id)
        )

        set({
          edges: nextEdges,
          selectedEdgeIds: selectedEdgeIds.filter((id) => !removedIds.has(id))
        })
      },

      onConnect: (connection) => {
        get().pushHistory()
        set({
          edges: addEdge(
            {
              ...connection,
              type: 'labeled',
              data: { label: '', condition: '' }
            },
            get().edges
          )
        })
      },

      setViewport: (viewport) => set({ viewport }),

      setPanelLayout: (layout) =>
        set((state) => ({
          panelLayout: { ...state.panelLayout, ...layout }
        })),

      setSelection: (nodeIds, edgeIds = []) =>
        set((state) => ({
          selectedNodeIds: nodeIds,
          selectedEdgeIds: edgeIds,
          nodes: state.nodes.map((n) => ({ ...n, selected: nodeIds.includes(n.id) })),
          edges: state.edges.map((e) => ({ ...e, selected: edgeIds.includes(e.id) }))
        })),

      selectAll: () => {
        const { nodes, edges } = get()
        get().setSelection(
          nodes.map((n) => n.id),
          edges.map((e) => e.id)
        )
      },

      clearSelection: () => get().setSelection([], []),

      focusSelection: () => {
        const { reactFlowInstance, selectedNodeIds, nodes } = get()
        if (!reactFlowInstance || selectedNodeIds.length === 0) return
        const selected = nodes.filter((n) => selectedNodeIds.includes(n.id))
        if (selected.length === 1) {
          reactFlowInstance.setCenter(selected[0].position.x + 75, selected[0].position.y + 40, {
            zoom: reactFlowInstance.getZoom(),
            duration: 300
          })
        } else {
          reactFlowInstance.fitView({ nodes: selected, padding: 0.4, duration: 300 })
        }
      },

      toggleNodeHidden: (nodeId) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, hidden: !n.hidden, data: { ...n.data, hidden: !n.data?.hidden } }
              : n
          )
        })
      },

      toggleNodeLocked: (nodeId) => {
        set({
          nodes: get().nodes.map((n) => {
            if (n.id !== nodeId) return n
            const locked = !n.data?.locked
            return {
              ...n,
              draggable: !locked,
              deletable: !locked,
              data: { ...n.data, locked }
            }
          })
        })
      },

      bringNodeToFront: (nodeId) => {
        const { nodes } = get()
        const maxZ = Math.max(0, ...nodes.map((n) => n.zIndex ?? 0))
        set({
          nodes: nodes.map((n) => (n.id === nodeId ? { ...n, zIndex: maxZ + 1 } : n))
        })
      },

      sendNodeToBack: (nodeId) => {
        const { nodes } = get()
        const minZ = Math.min(0, ...nodes.map((n) => n.zIndex ?? 0))
        set({
          nodes: nodes.map((n) => (n.id === nodeId ? { ...n, zIndex: minZ - 1 } : n))
        })
      },

      updateNodeData: (nodeId, data) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
          )
        })
      },

      updateEdge: (edgeId, patch) => {
        set({
          edges: get().edges.map((e) =>
            e.id === edgeId
              ? { ...e, ...patch, data: { ...e.data, ...(patch.data ?? {}) } }
              : e
          )
        })
      },

      toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),

      pushHistory: () => {
        const { past } = get()
        const nextPast = [...past, snapshot(get())].slice(-MAX_HISTORY)
        set({ past: nextPast, future: [], canUndo: true, canRedo: false })
      },

      undo: () => {
        const { past, future, nodes, edges } = get()
        if (past.length === 0) return
        const previous = past[past.length - 1]
        const newPast = past.slice(0, -1)
        set({
          nodes: previous.nodes,
          edges: previous.edges,
          past: newPast,
          future: [{ nodes, edges }, ...future].slice(0, MAX_HISTORY),
          canUndo: newPast.length > 0,
          canRedo: true
        })
      },

      redo: () => {
        const { past, future, nodes, edges } = get()
        if (future.length === 0) return
        const next = future[0]
        const newFuture = future.slice(1)
        set({
          nodes: next.nodes,
          edges: next.edges,
          past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
          future: newFuture,
          canUndo: true,
          canRedo: newFuture.length > 0
        })
      },

      loadSnapshot: (nodes, edges, viewport, options) => {
        if (options?.recordHistory) {
          const { past } = get()
          const nextPast = [...past, snapshot(get())].slice(-MAX_HISTORY)
          set({
            nodes,
            edges,
            viewport: viewport ?? get().viewport,
            past: nextPast,
            future: [],
            canUndo: true,
            canRedo: false,
            selectedNodeIds: [],
            selectedEdgeIds: []
          })
          return
        }
        set({
          nodes,
          edges,
          viewport: viewport ?? { x: 0, y: 0, zoom: 1 },
          past: [],
          future: [],
          canUndo: false,
          canRedo: false,
          selectedNodeIds: [],
          selectedEdgeIds: []
        })
      },

      duplicateSelected: () => {
        const { nodes, selectedNodeIds } = get()
        if (selectedNodeIds.length === 0) return
        get().pushHistory()
        const newNodes = selectedNodeIds
          .map((id) => {
            const node = nodes.find((n) => n.id === id)
            if (!node) return null
            return {
              ...node,
              id: `${node.id}-copy-${Date.now()}`,
              position: { x: node.position.x + 40, y: node.position.y + 40 },
              selected: true
            }
          })
          .filter(Boolean) as Node[]

        set({
          nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
          selectedNodeIds: newNodes.map((n) => n.id)
        })
      },

      deleteSelected: () => {
        const { nodes, edges, selectedNodeIds, selectedEdgeIds } = get()
        if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return
        get().pushHistory()
        set({
          nodes: nodes.filter((n) => !selectedNodeIds.includes(n.id)),
          edges: edges.filter(
            (e) =>
              !selectedEdgeIds.includes(e.id) &&
              !selectedNodeIds.includes(e.source) &&
              !selectedNodeIds.includes(e.target)
          ),
          selectedNodeIds: [],
          selectedEdgeIds: []
        })
      },

      autoLayout: (engine = 'hierarchical') => {
        get().pushHistory()
        const laid = applyAutoLayout(get().nodes, get().edges, engine)
        set({ nodes: laid })
      },

      copySelected: () => {
        const { nodes, edges, selectedNodeIds } = get()
        if (selectedNodeIds.length === 0) return
        const idSet = new Set(selectedNodeIds)
        clipboard = {
          nodes: structuredClone(nodes.filter((n) => idSet.has(n.id))),
          edges: structuredClone(
            edges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
          )
        }
      },

      pasteClipboard: () => {
        if (!clipboard || clipboard.nodes.length === 0) return
        get().pushHistory()
        const { nodes, edges } = get()
        const ts = Date.now()
        const idMap = new Map<string, string>()
        clipboard.nodes.forEach((n, i) => idMap.set(n.id, `node-${ts}-${i}`))

        const newNodes = clipboard.nodes.map((n) => ({
          ...n,
          id: idMap.get(n.id)!,
          position: { x: n.position.x + 48, y: n.position.y + 48 },
          selected: true
        }))
        const newEdges = clipboard.edges.map((e, i) => ({
          ...e,
          id: `edge-${ts}-${i}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
          selected: false
        }))

        set({
          nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
          edges: [...edges, ...newEdges],
          selectedNodeIds: newNodes.map((n) => n.id),
          selectedEdgeIds: []
        })
      },

      alignSelected: (mode) => {
        const { nodes, selectedNodeIds } = get()
        if (selectedNodeIds.length < 2) return
        get().pushHistory()
        set({ nodes: alignNodes(nodes, selectedNodeIds, mode) })
      },

      distributeSelected: (axis) => {
        const { nodes, selectedNodeIds } = get()
        if (selectedNodeIds.length < 3) return
        get().pushHistory()
        set({ nodes: distributeNodes(nodes, selectedNodeIds, axis) })
      },

      toggleGroupCollapsed: (nodeId) => {
        const { nodes } = get()
        const group = nodes.find((n) => n.id === nodeId)
        if (!group) return
        const nextCollapsed = !group.data?.collapsed
        const hiddenIds = new Set<string>()
        const seed = new Set<string>([nodeId])
        let changed = true
        while (changed) {
          changed = false
          for (const n of nodes) {
            if (n.parentId && seed.has(n.parentId) && !seed.has(n.id)) {
              seed.add(n.id)
              hiddenIds.add(n.id)
              changed = true
            }
          }
        }
        set({
          nodes: nodes.map((n) => {
            if (n.id === nodeId) {
              return { ...n, data: { ...n.data, collapsed: nextCollapsed } }
            }
            if (hiddenIds.has(n.id)) {
              return { ...n, hidden: nextCollapsed }
            }
            return n
          })
        })
      },

      addLibraryNode: (item, position) => {
        const { reactFlowInstance, nodes } = get()
        let pos = position
        if (!pos && reactFlowInstance) {
          const canvas = document.querySelector('.flow-canvas')
          if (canvas) {
            const rect = canvas.getBoundingClientRect()
            pos = reactFlowInstance.screenToFlowPosition({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2
            })
          }
        }
        if (!pos) pos = { x: 120, y: 80 }
        const stagger = nodes.length % 6
        pos = { x: pos.x + stagger * 18, y: pos.y + stagger * 18 }

        get().pushHistory()
        const newNode = createFlowNodeFromItem(item, pos)
        set({
          nodes: [...nodes.map((n) => ({ ...n, selected: false })), newNode],
          selectedNodeIds: [newNode.id],
          selectedEdgeIds: []
        })
        return newNode.id
      },

      fitViewToContent: () => {
        const { reactFlowInstance } = get()
        requestAnimationFrame(() => {
          reactFlowInstance?.fitView({ padding: 0.2, duration: 280 })
        })
      },

      toggleValidation: () => set((s) => ({ showValidation: !s.showValidation })),

      setActiveTool: (tool) => set({ activeTool: tool }),

      toggleTurboMode: () => set((s) => ({ turboMode: !s.turboMode })),

      setDropTarget: (nodeId) => {
        if (get().dropTargetId === nodeId) return
        set({ dropTargetId: nodeId })
      },

      attachNodeToParent: (childId, parentId) => {
        const { nodes } = get()
        const child = nodes.find((n) => n.id === childId)
        const parent = nodes.find((n) => n.id === parentId)
        if (!child || !parent || childId === parentId) return
        if (child.parentId === parentId) return
        // A container can't become a child of its own descendant.
        if (CONTAINER_TYPES.has(String(child.type))) {
          let p: string | undefined = parent.parentId
          while (p) {
            if (p === childId) return
            p = nodes.find((n) => n.id === p)?.parentId
          }
        }

        get().pushHistory()
        const childAbs = getAbsolutePosition(child, nodes)
        const parentAbs = getAbsolutePosition(parent, nodes)
        const relativePosition = {
          x: childAbs.x - parentAbs.x,
          y: childAbs.y - parentAbs.y
        }
        // No `extent: 'parent'` clamp so children can be freely dragged back out to detach.
        const updatedChild: Node = {
          ...child,
          parentId,
          position: relativePosition,
          selected: true
        }
        // React Flow requires a parent node to appear before its children.
        const rest = nodes.filter((n) => n.id !== childId)
        const parentIndex = rest.findIndex((n) => n.id === parentId)
        const next = [
          ...rest.slice(0, parentIndex + 1),
          updatedChild,
          ...rest.slice(parentIndex + 1)
        ]
        set({ nodes: next, dropTargetId: null })
      },

      detachNodeFromParent: (childId) => {
        const { nodes } = get()
        const child = nodes.find((n) => n.id === childId)
        if (!child?.parentId) return
        get().pushHistory()
        const absolute = getAbsolutePosition(child, nodes)
        set({
          nodes: nodes.map((n) =>
            n.id === childId
              ? { ...n, parentId: undefined, extent: undefined, position: absolute }
              : n
          ),
          dropTargetId: null
        })
      },

      groupSelectionIntoSubflow: () => {
        const { nodes, selectedNodeIds } = get()
        const targets = nodes.filter(
          (n) => selectedNodeIds.includes(n.id) && !CONTAINER_TYPES.has(String(n.type)) && !n.parentId
        )
        if (targets.length < 1) return
        get().pushHistory()

        const padding = 40
        const headerSpace = 24
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const n of targets) {
          const abs = getAbsolutePosition(n, nodes)
          const { width, height } = getNodeSize(n)
          minX = Math.min(minX, abs.x)
          minY = Math.min(minY, abs.y)
          maxX = Math.max(maxX, abs.x + width)
          maxY = Math.max(maxY, abs.y + height)
        }

        const groupPos = { x: minX - padding, y: minY - padding - headerSpace }
        const groupId = `subflow-${Date.now()}`
        const groupNode: Node = {
          id: groupId,
          type: 'group',
          position: groupPos,
          selected: false,
          data: {
            label: 'Sub Flow',
            nodeType: 'group',
            category: 'process',
            shape: 'group',
            icon: 'Layers',
            color: '#6366f1',
            status: 'draft',
            priority: 'medium',
            tags: []
          },
          style: {
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2 + headerSpace
          },
          zIndex: -1
        }

        const targetIds = new Set(targets.map((n) => n.id))
        const reparented = nodes.map((n) => {
          if (!targetIds.has(n.id)) return n
          const abs = getAbsolutePosition(n, nodes)
          return {
            ...n,
            parentId: groupId,
            position: { x: abs.x - groupPos.x, y: abs.y - groupPos.y },
            selected: false
          }
        })

        const others = reparented.filter((n) => !targetIds.has(n.id))
        const children = reparented.filter((n) => targetIds.has(n.id))
        set({
          nodes: [...others, groupNode, ...children],
          selectedNodeIds: [groupId],
          selectedEdgeIds: []
        })
      },

      ungroupSubflow: (groupId) => {
        const { nodes } = get()
        const group = nodes.find((n) => n.id === groupId)
        if (!group) return
        get().pushHistory()
        const next = nodes
          .map((n) => {
            if (n.parentId !== groupId) return n
            const absolute = getAbsolutePosition(n, nodes)
            return { ...n, parentId: undefined, extent: undefined, position: absolute }
          })
          .filter((n) => n.id !== groupId)
        set({ nodes: next, dropTargetId: null, selectedNodeIds: [], selectedEdgeIds: [] })
      },

      beginEraseStroke: () => get().pushHistory(),

      eraseNode: (nodeId) => {
        const { nodes, edges, selectedNodeIds } = get()
        if (!nodes.some((n) => n.id === nodeId)) return
        // Remove the node and any of its subflow children.
        const removed = new Set<string>([nodeId])
        let changed = true
        while (changed) {
          changed = false
          for (const n of nodes) {
            if (n.parentId && removed.has(n.parentId) && !removed.has(n.id)) {
              removed.add(n.id)
              changed = true
            }
          }
        }
        set({
          nodes: nodes.filter((n) => !removed.has(n.id)),
          edges: edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
          selectedNodeIds: selectedNodeIds.filter((id) => !removed.has(id))
        })
      },

      eraseEdge: (edgeId) => {
        const { edges, selectedEdgeIds } = get()
        if (!edges.some((e) => e.id === edgeId)) return
        set({
          edges: edges.filter((e) => e.id !== edgeId),
          selectedEdgeIds: selectedEdgeIds.filter((id) => id !== edgeId)
        })
      },

      resetEditor: () => {
        clipboard = null
        set({
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          past: [],
          future: [],
          canUndo: false,
          canRedo: false,
          selectedNodeIds: [],
          selectedEdgeIds: [],
          activeTool: 'select',
          dropTargetId: null,
          reactFlowInstance: null
        })
      }
    }),
    {
      name: 'flow-designer-layout',
      partialize: (state) => ({ panelLayout: state.panelLayout, turboMode: state.turboMode })
    }
  )
)
