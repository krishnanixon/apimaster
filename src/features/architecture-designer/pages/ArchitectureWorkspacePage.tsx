import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useNavigate, useParams } from 'react-router-dom'
import { ARCH_SECTIONS } from '@shared/lib/architecture-catalog'
import type { ArchSectionId } from '@shared/types/architecture'
import { parseModel, serializeModel } from '@shared/lib/architecture-model'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { useArchitectureStore } from '../stores/architecture.store'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { useArchitectureKeyboard } from '../hooks/useArchitectureKeyboard'
import { ArchitectureToolbar } from '../components/ArchitectureToolbar'
import { WorkspaceNav } from '../components/WorkspaceNav'
import { PropertiesPanel } from '../components/PropertiesPanel'
import { SectionRouter } from '../sections/SectionRouter'
import { cn } from '@/shared/lib/utils'

const AUTOSAVE_DELAY_MS = 1500

const CANVAS_SECTIONS = new Set(
  ARCH_SECTIONS.filter((section) => section.canvas).map((section) => section.id)
)

export function ArchitectureWorkspacePage() {
  const { projectId, diagramId } = useParams<{ projectId: string; diagramId: string }>()
  const navigate = useNavigate()

  const { currentDiagram, isLoading, isSaving, loadDiagram, updateDiagram, setCurrentDiagram } =
    useArchitectureStore()
  const {
    model,
    activeSection,
    isDirty,
    panelLayout,
    selectedComponentIds,
    selectedConnectionId,
    setActiveSection,
    loadModel,
    resetEditor,
    markSaved
  } = useArchitectureEditorStore()
  const [loadError, setLoadError] = useState<string | null>(null)

  /** Guards autosave until the initial load has populated the editor. */
  const hydrated = useRef(false)

  useEffect(() => {
    hydrated.current = false
    setLoadError(null)
    if (!diagramId) return

    let cancelled = false
    void loadDiagram(diagramId).then((diagram) => {
      if (cancelled) return
      if (!diagram) {
        setLoadError('Could not load this architecture.')
        return
      }
      loadModel(parseModel(diagram.model))
      hydrated.current = true
    })

    return () => {
      cancelled = true
    }
  }, [diagramId, loadDiagram, loadModel])

  useEffect(
    () => () => {
      resetEditor()
      setCurrentDiagram(null)
    },
    [resetEditor, setCurrentDiagram]
  )

  const save = useCallback(() => {
    if (!diagramId || !hydrated.current) return
    void updateDiagram(diagramId, { model: serializeModel(model) })
    markSaved()
  }, [diagramId, model, updateDiagram, markSaved])

  // Debounced autosave — the model is the only thing worth persisting here.
  useEffect(() => {
    if (!hydrated.current || !isDirty) return
    const timer = setTimeout(save, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [model, isDirty, save])

  useArchitectureKeyboard({ onSave: save })

  const sectionCounts = useMemo<Partial<Record<ArchSectionId, number>>>(
    () => ({
      components: model.components.length,
      services: model.components.filter((c) => c.category === 'backend').length,
      database: model.components.filter((c) => c.category === 'database').length,
      integrations: model.components.filter(
        (c) => c.category === 'integration' || c.category === 'ai'
      ).length,
      infrastructure: model.components.filter((c) => c.category === 'infrastructure').length,
      architecture: model.components.length,
      api: model.components.reduce((sum, c) => sum + c.apis.length, 0),
      environments: model.environments.length
    }),
    [model]
  )

  const handleTitleChange = useCallback(
    (title: string) => {
      if (!diagramId) return
      void updateDiagram(diagramId, { title })
      useArchitectureEditorStore.getState().dispatch({ type: 'UPDATE_METADATA', patch: { name: title } })
    },
    [diagramId, updateDiagram]
  )

  const hasSelection = selectedComponentIds.length > 0 || Boolean(selectedConnectionId)
  const showRightPanel =
    !panelLayout.rightCollapsed && (hasSelection || CANVAS_SECTIONS.has(activeSection))

  if (isLoading && !currentDiagram) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (loadError || !currentDiagram) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">{loadError ?? 'Architecture not found.'}</p>
        <Button variant="outline" onClick={() => navigate(`/project/${projectId}/architecture-designer`)}>
          Back to architectures
        </Button>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <ArchitectureToolbar
          title={currentDiagram.title}
          isSaving={isSaving}
          showViewSwitcher={activeSection === 'architecture'}
          onBack={() => navigate(`/project/${projectId}/architecture-designer`)}
          onTitleChange={handleTitleChange}
        />

        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              'shrink-0 overflow-hidden border-r border-transparent transition-[width] duration-fast ease-out',
              panelLayout.leftCollapsed && 'border-transparent'
            )}
            style={{ width: panelLayout.leftCollapsed ? 0 : panelLayout.leftWidth }}
          >
            {!panelLayout.leftCollapsed && (
              <WorkspaceNav
                activeSection={activeSection}
                onSelect={setActiveSection}
                counts={sectionCounts}
              />
            )}
          </div>

          <main className="min-w-0 flex-1 overflow-hidden">
            <SectionRouter section={activeSection} onNavigate={setActiveSection} />
          </main>

          <div
            className="shrink-0 overflow-hidden transition-[width] duration-fast ease-out"
            style={{ width: showRightPanel ? panelLayout.rightWidth : 0 }}
          >
            {showRightPanel && <PropertiesPanel />}
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
