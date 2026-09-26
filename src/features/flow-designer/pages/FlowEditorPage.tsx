import { useEffect, useCallback, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useParams, useNavigate } from 'react-router-dom'
import { FlowCanvas } from '../components/FlowCanvas'
import { FlowToolbar } from '../components/FlowToolbar'
import { NodeLibraryPanel } from '../components/NodeLibraryPanel'
import { RightSidebar } from '../components/RightSidebar'
import { StatusBar } from '../components/StatusBar'
import { useFlowStore } from '../stores/flow.store'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { useFlowKeyboard } from '../hooks/useFlowKeyboard'

function FlowEditorInner() {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>()
  const navigate = useNavigate()
  const { currentFlow, loadFlow, updateFlow, isLoading, isSaving } = useFlowStore()
  const {
    nodes,
    edges,
    viewport,
    panelLayout,
    setPanelLayout,
    loadSnapshot,
    resetEditor
  } = useFlowEditorStore()
  const { loadDocuments } = useDocumentStore()
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [title, setTitle] = useState('Untitled Flow')
  const [loadError, setLoadError] = useState<string | null>(null)
  const hydrated = useRef(false)

  useFlowKeyboard()

  useEffect(() => {
    if (projectId) loadDocuments(projectId)
  }, [projectId, loadDocuments])

  useEffect(() => {
    hydrated.current = false
    setLoadError(null)
    if (flowId) {
      void loadFlow(flowId).then((ok) => {
        if (!ok) setLoadError('Could not load this flow diagram.')
      })
    }
    return () => {
      resetEditor()
      hydrated.current = false
    }
  }, [flowId, loadFlow, resetEditor])

  useEffect(() => {
    if (currentFlow && currentFlow.id === flowId && !hydrated.current) {
      try {
        const n = JSON.parse(currentFlow.nodes || '[]')
        const e = JSON.parse(currentFlow.edges || '[]')
        const v = JSON.parse(currentFlow.viewport || '{}')
        loadSnapshot(n, e, v.x !== undefined ? v : { x: 0, y: 0, zoom: 1 })
        if (currentFlow.layoutState) {
          try {
            setPanelLayout(JSON.parse(currentFlow.layoutState))
          } catch {
            /* ignore invalid layout */
          }
        }
        setTitle(currentFlow.title)
        hydrated.current = true
      } catch {
        setLoadError('This flow file is corrupted and could not be opened.')
      }
    }
  }, [currentFlow, flowId, loadSnapshot, setPanelLayout])

  const persist = useCallback(() => {
    if (!flowId || !hydrated.current) return
    updateFlow(flowId, {
      title,
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
      viewport: JSON.stringify(viewport),
      layoutState: JSON.stringify(panelLayout)
    })
  }, [flowId, title, nodes, edges, viewport, panelLayout, updateFlow])

  useEffect(() => {
    if (!flowId || isLoading || !hydrated.current) return
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(persist, 2000)
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
    }
  }, [nodes, edges, viewport, title, panelLayout, flowId, isLoading, persist])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    )
  }

  if (loadError || !currentFlow) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">{loadError ?? 'Flow not found.'}</p>
        <Button variant="outline" onClick={() => navigate(`/project/${projectId}/flows`)}>
          Back to Flows
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <FlowToolbar
        title={title}
        onTitleChange={setTitle}
        category={currentFlow.category}
        onCategoryChange={(category) => updateFlow(flowId!, { category })}
        isSaving={isSaving}
        onBack={() => navigate(`/project/${projectId}/flows`)}
      />

      <div className="flex min-h-0 flex-1">
        <NodeLibraryPanel
          collapsed={panelLayout.leftCollapsed}
          width={panelLayout.leftWidth}
          flowCategory={currentFlow.category}
          onToggle={() => setPanelLayout({ leftCollapsed: !panelLayout.leftCollapsed })}
          onResize={(delta) =>
            setPanelLayout({
              leftWidth: Math.min(400, Math.max(200, panelLayout.leftWidth + delta))
            })
          }
        />

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,hsl(var(--muted)/0.45)_0%,hsl(var(--background))_70%)]">
          <FlowCanvas />
        </div>

        <RightSidebar flowId={flowId} onFlowGenerated={persist} />
      </div>

      <StatusBar zoom={viewport.zoom} />
    </div>
  )
}

export function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  )
}
