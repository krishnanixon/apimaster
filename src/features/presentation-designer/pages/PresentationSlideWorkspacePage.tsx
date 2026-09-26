import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Copy, Lock, Trash2, Unlock } from 'lucide-react'
import type { PresentationDocument, PresentationSlide, SlideElement } from '@shared/types/presentation-document'
import { migrateLegacyCards } from '@shared/lib/presentation-migrations'
import { parseCards } from '@shared/lib/presentation-model'
import { parsePresentationDocument, serializePresentationDocument, getSlideElements } from '@shared/lib/presentation-schema'
import { usePresentationStore } from '../stores/presentation.store'
import { usePresentationDocumentStore } from '../stores/presentation-document.store'
import { SlideRenderer } from '../rendering/SlideRenderer'
import { pickImageAsDataUrl } from '../lib/import-image'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { PresentationEditorHeader } from '../components/PresentationEditorHeader'
import { DesignInspectorPanel } from '../components/DesignInspectorPanel'
import { PresentationLeftRail, useCloseOnOutsidePointer } from '../components/SlideNavigatorPanel'
import { PresentationCanvasToolbar, snapValue, type PresentationInsertTool } from '../components/PresentationCanvasToolbar'
import { CanvasQuickActions } from '../components/CanvasQuickActions'
import { ShapeFloatingToolbar } from '../components/ShapeDesignPanel'
import {
  GRID_SIZE,
  pointerToSlidePoint,
  resizeFromHandle,
  rotationFromPointer,
  type ResizeHandle
} from '../lib/canvas-transform'
import { PresentationDesignDialog, type PresentationDesignMode } from '../components/PresentationDesignDialog'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { computeCanvasFitZoom } from '@shared/lib/presentation-geometry'

const AUTOSAVE_MS = 1200

function base(type: SlideElement['type'], x = 220, y = 180, width = 700, height = 220) {
  return { id: crypto.randomUUID(), type, x, y, width, height, rotation: 0, opacity: 1, zIndex: Date.now() % 100000, locked: false }
}

function newText(): SlideElement {
  return { ...base('text'), type: 'text', content: 'Double-click to edit text', fontFamily: 'Inter', fontSize: 48, fontWeight: 600, fontStyle: 'normal', textDecoration: 'none', textColor: '#111827', textAlign: 'left', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0 }
}

function newShape(shape: 'rectangle' | 'rounded-rectangle' | 'circle'): SlideElement {
  return { ...base('shape', 300, 240, 420, 260), type: 'shape', shape, fill: '#6366f1', stroke: '#4338ca', strokeWidth: 2, borderRadius: shape === 'rounded-rectangle' ? 32 : 0 }
}

function newLine(shape: 'line' | 'arrow'): SlideElement {
  return { ...base('shape', 320, 300, 600, 80), type: 'shape', shape, fill: 'transparent', stroke: '#334155', strokeWidth: 6 }
}

function newTriangle(): SlideElement {
  return { ...base('shape', 320, 220, 360, 300), type: 'shape', shape: 'triangle', fill: '#6366f1', stroke: '#4338ca', strokeWidth: 2 }
}

function newIcon(): SlideElement {
  return { ...base('icon', 360, 240, 180, 180), type: 'icon', icon: 'star', color: '#f59e0b', strokeWidth: 2 }
}

function newTable(): SlideElement {
  return { ...base('table', 220, 180, 1100, 420), type: 'table', rows: [['Feature', 'Status'], ['Presentation schema', 'Ready'], ['Editor', 'In progress']], headerRow: true, borderColor: '#cbd5e1', headerBackground: '#e2e8f0', cellBackground: '#ffffff', textColor: '#0f172a', fontSize: 24 }
}

function newCode(): SlideElement {
  return { ...base('code', 220, 160, 1100, 560), type: 'code', language: 'typescript', code: 'interface Presentation {\n  slides: Slide[]\n}', showLineNumbers: true, theme: 'dark', fileName: 'presentation.ts', highlightedLines: [] }
}

export function PresentationSlideWorkspacePage() {
  const { projectId, presentationId } = useParams<{ projectId: string; presentationId: string }>()
  const navigate = useNavigate()
  const loadPresentation = usePresentationStore((state) => state.loadPresentation)
  const updatePresentation = usePresentationStore((state) => state.updatePresentation)
  const isLoading = usePresentationStore((state) => state.isLoading)
  const isSaving = usePresentationStore((state) => state.isSaving)
  const document = usePresentationDocumentStore((state) => state.document)
  const activeSlideId = usePresentationDocumentStore((state) => state.activeSlideId)
  const selectedIds = usePresentationDocumentStore((state) => state.selectedElementIds)
  const editingElementId = usePresentationDocumentStore((state) => state.editingElementId)
  const zoom = usePresentationDocumentStore((state) => state.zoom)
  const isDirty = usePresentationDocumentStore((state) => state.isDirty)
  const canUndo = usePresentationDocumentStore((state) => state.canUndo)
  const canRedo = usePresentationDocumentStore((state) => state.canRedo)
  const loadDocument = usePresentationDocumentStore((state) => state.loadDocument)
  const replaceDocument = usePresentationDocumentStore((state) => state.replaceDocument)
  const markSaved = usePresentationDocumentStore((state) => state.markSaved)
  const selectElements = usePresentationDocumentStore((state) => state.selectElements)
  const toggleElement = usePresentationDocumentStore((state) => state.toggleElement)
  const setEditingElement = usePresentationDocumentStore((state) => state.setEditingElement)
  const setZoom = usePresentationDocumentStore((state) => state.setZoom)
  const dispatch = usePresentationDocumentStore((state) => state.dispatch)
  const duplicateSelection = usePresentationDocumentStore((state) => state.duplicateSelection)
  const updateElement = usePresentationDocumentStore((state) => state.updateElement)
  const showGrid = usePresentationDocumentStore((state) => state.showGrid)
  const snapToGrid = usePresentationDocumentStore((state) => state.snapToGrid)
  const documents = useDocumentStore((state) => state.documents)
  const loadDocuments = useDocumentStore((state) => state.loadDocuments)
  const [ready, setReady] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [presentIndex, setPresentIndex] = useState(0)
  const [designOpen, setDesignOpen] = useState(false)
  const [designMode, setDesignMode] = useState<PresentationDesignMode>('deck')
  const [templatesSignal, setTemplatesSignal] = useState(0)
  const [elementMenu, setElementMenu] = useState<{ x: number; y: number; elementId: string } | null>(null)
  const [slideMenu, setSlideMenu] = useState<{ x: number; y: number; slideId: string } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const userAdjustedZoomRef = useRef(false)

  const slide = document?.slides.find((item) => item.id === activeSlideId) ?? document?.slides[0]
  const slideElements = getSlideElements(slide)
  const selected =
    slideElements.find((element) => selectedIds.length >= 1 && element.id === selectedIds[0]) ?? undefined

  useEffect(() => {
    if (projectId) void loadDocuments(projectId)
  }, [projectId, loadDocuments])

  useEffect(() => {
    if (!presentationId) return
    let cancelled = false
    setReady(false)
    void loadPresentation(presentationId).then((record) => {
      if (!record || cancelled) return
      const persisted = parsePresentationDocument(record.documentJson)
      const next = persisted ?? migrateLegacyCards({ id: record.id, projectId: record.projectId, title: record.title, description: record.description, themeId: record.themeId, cards: parseCards(record.cards), createdAt: record.createdAt, updatedAt: record.updatedAt })
      loadDocument(next)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [presentationId, loadPresentation, loadDocument])

  useEffect(() => {
    if (!ready || !presentationId || !document || !isDirty) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const serialized = serializePresentationDocument(document)
    saveTimer.current = setTimeout(() => {
      void updatePresentation(presentationId, { documentJson: serialized, schemaVersion: document.schemaVersion, title: document.title, description: document.description ?? '', themeId: document.themeId, templateId: document.templateId ?? '' }).then((saved) => {
        if (saved && serializePresentationDocument(usePresentationDocumentStore.getState().document!) === serialized) markSaved()
      })
    }, AUTOSAVE_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [ready, presentationId, document, isDirty, updatePresentation, markSaved])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      const state = usePresentationDocumentStore.getState()
      if (presenting) {
        if (event.key === 'Escape') setPresenting(false)
        if (event.key === 'ArrowRight' || event.key === ' ') setPresentIndex((value) => Math.min((state.document?.slides.length ?? 1) - 1, value + 1))
        if (event.key === 'ArrowLeft') setPresentIndex((value) => Math.max(0, value - 1))
        return
      }
      if (editing) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) state.redo(); else state.undo() }
      else if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); state.redo() }
      else if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); state.copy() }
      else if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); state.paste() }
      else if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); state.duplicateSelection() }
      else if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); state.selectAll() }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); state.deleteSelection() }
      else if (event.key === 'Escape') { state.selectElements([]); state.setEditingElement(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting])

  useCloseOnOutsidePointer(Boolean(elementMenu), () => setElementMenu(null))
  useCloseOnOutsidePointer(Boolean(slideMenu), () => setSlideMenu(null))

  const addElement = (element: SlideElement) => {
    if (!slide) return
    dispatch({ type: 'ADD_ELEMENT', slideId: slide.id, element })
    selectElements([element.id])
  }

  const handlePointerDown = (event: React.PointerEvent, element: SlideElement) => {
    if (element.locked || !slide) return
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey) toggleElement(element.id)
    else if (!selectedIds.includes(element.id)) selectElements([element.id])
    const ids = event.shiftKey ? [...new Set([...selectedIds, element.id])] : selectedIds.includes(element.id) ? selectedIds : [element.id]
    const target = event.target as HTMLElement
    const resizeHandle = target.closest('[data-resize-handle]')?.getAttribute('data-resize-handle') as ResizeHandle | null
    const rotating = Boolean(target.closest('[data-rotate-handle]'))
    const startX = event.clientX
    const startY = event.clientY
    const slideNode = viewportRef.current?.querySelector<HTMLElement>(`[data-presentation-slide="${CSS.escape(slide.id)}"]`) ?? null
    const starts = new Map(
      slideElements
        .filter((item) => ids.includes(item.id))
        .map((item) => [item.id, { x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation }])
    )
    const origin = starts.get(element.id)
    const onMove = (move: PointerEvent) => {
      const dx = (move.clientX - startX) / zoom
      const dy = (move.clientY - startY) / zoom
      for (const [id, start] of starts) {
        const node = viewportRef.current?.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(id)}"]`)
        if (!node) continue
        if (rotating && id === element.id && origin) {
          const pointer = pointerToSlidePoint(move.clientX, move.clientY, slideNode, zoom)
          const center = { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 }
          node.style.transform = `rotate(${rotationFromPointer(center, pointer)}deg)`
        } else if (resizeHandle && id === element.id && origin) {
          const next = resizeFromHandle(origin, resizeHandle, dx, dy, { minWidth: 20, minHeight: 20 })
          node.style.left = `${next.x}px`
          node.style.top = `${next.y}px`
          node.style.width = `${next.width}px`
          node.style.height = `${next.height}px`
        } else if (!resizeHandle && !rotating) {
          node.style.left = `${start.x + dx}px`
          node.style.top = `${start.y + dy}px`
        }
      }
    }
    const onUp = (up: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const dx = (up.clientX - startX) / zoom
      const dy = (up.clientY - startY) / zoom
      if (rotating && origin) {
        const pointer = pointerToSlidePoint(up.clientX, up.clientY, slideNode, zoom)
        const center = { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 }
        updateElement(element.id, { rotation: rotationFromPointer(center, pointer) })
      } else if (resizeHandle && origin) {
        const next = resizeFromHandle(origin, resizeHandle, dx, dy, {
          minWidth: 20,
          minHeight: 20,
          snap: snapToGrid,
          grid: GRID_SIZE
        })
        updateElement(element.id, next)
      } else if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        const start = starts.get(element.id)
        const finalDx = start ? snapValue(start.x + dx, snapToGrid) - start.x : dx
        const finalDy = start ? snapValue(start.y + dy, snapToGrid) - start.y : dy
        dispatch({ type: 'MOVE_ELEMENTS', slideId: slide.id, elementIds: ids, dx: finalDx, dy: finalDy })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  const importImage = async () => {
    const picked = await pickImageAsDataUrl()
    if (!picked) return
    addElement({ ...base('image', 300, 180, 900, 560), type: 'image', src: picked.src, alt: picked.name, objectFit: 'contain', borderWidth: 0, borderRadius: 12 })
  }

  const openDesign = (mode: PresentationDesignMode) => {
    setDesignMode(mode)
    setDesignOpen(true)
  }

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || !document) return
    const scale = computeCanvasFitZoom(
      { width: viewport.clientWidth, height: viewport.clientHeight },
      document.logicalSize
    )
    setZoom(scale)
  }, [document, setZoom])

  useEffect(() => {
    userAdjustedZoomRef.current = false
  }, [presentationId])

  useEffect(() => {
    if (!ready || !document) return
    const viewport = viewportRef.current
    if (!viewport) return

    const applyFit = () => {
      if (userAdjustedZoomRef.current) return
      fitToScreen()
    }

    applyFit()
    const observer = new ResizeObserver(applyFit)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [ready, document, fitToScreen])

  const isEmptySlide = slideElements.length === 0

  const exportPdf = async () => {
    try {
      const serialized = serializePresentationDocument(document)
      if (isDirty) {
        const saved = await updatePresentation(presentationId, { documentJson: serialized, schemaVersion: document.schemaVersion, title: document.title, description: document.description ?? '', themeId: document.themeId })
        if (!saved) throw new Error('Save failed; PDF export was cancelled.')
        markSaved()
      }
      const api = await waitForDesktopApi()
      const result = await api?.presentations.exportPdf(presentationId)
      if (!result?.success || !result.data) throw new Error(result?.error ?? 'PDF export failed')
      toast.success(`Exported PDF to ${result.data.path}`)
    } catch (error) {
      if (error instanceof Error && error.message === 'Export cancelled') return
      toast.error(error instanceof Error ? error.message : 'PDF export failed')
    }
  }

  const insertTool = (tool: PresentationInsertTool) => {
    switch (tool) {
      case 'text': addElement(newText()); break
      case 'rectangle': addElement(newShape('rectangle')); break
      case 'rounded-rectangle': addElement(newShape('rounded-rectangle')); break
      case 'circle': addElement(newShape('circle')); break
      case 'line': addElement(newLine('line')); break
      case 'arrow': addElement(newLine('arrow')); break
      case 'triangle': addElement(newTriangle()); break
      case 'icon': addElement(newIcon()); break
      case 'image': void importImage(); break
      case 'table': addElement(newTable()); break
      case 'code': addElement(newCode()); break
    }
  }

  if (!projectId || !presentationId) return null
  if (isLoading || !ready || !document || !slide) return <div className="flex h-full items-center justify-center"><Spinner size="lg" /></div>

  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
    <PresentationEditorHeader
      title={document.title}
      saveLabel={isSaving ? 'Saving…' : isDirty ? 'Unsaved' : 'Saved'}
      canUndo={canUndo}
      canRedo={canRedo}
      onBack={() => navigate(`/project/${projectId}/presentations`)}
      onTitleChange={(title) => dispatch({ type: 'UPDATE_META', patch: { title } })}
      onUndo={() => usePresentationDocumentStore.getState().undo()}
      onRedo={() => usePresentationDocumentStore.getState().redo()}
      onOpenDesign={openDesign}
      onExportPdf={() => void exportPdf()}
      onPresent={() => { setPresentIndex(Math.max(0, document.slides.findIndex((item) => item.id === slide.id))); setPresenting(true); void globalThis.document.documentElement?.requestFullscreen?.() }}
    />
    <div className="flex min-h-0 flex-1">
      <PresentationLeftRail
        document={document}
        activeSlideId={slide.id}
        projectId={projectId}
        onOpenDesign={openDesign}
        openTemplatesSignal={templatesSignal}
        onSlideContextMenu={(event, slideId) =>
          setSlideMenu({
            x: Math.min(event.clientX, window.innerWidth - 210),
            y: Math.min(event.clientY, window.innerHeight - 260),
            slideId
          })
        }
      />
      <main
        ref={viewportRef}
        className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto bg-muted/50 p-6 dark:bg-background"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) selectElements([])
        }}
      >
        <div
          style={{ width: document.logicalSize.width * zoom, height: document.logicalSize.height * zoom }}
          className="shrink-0 rounded-lg bg-card shadow-card ring-1 ring-border/60"
        >
          <div
            style={{
              width: document.logicalSize.width,
              height: document.logicalSize.height,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left'
            }}
          >
            <SlideRenderer
              slide={slide}
              logicalSize={document.logicalSize}
              interactive
              showGrid={showGrid}
              selectedIds={selectedIds}
              editingElementId={editingElementId}
              onElementPointerDown={handlePointerDown}
              onElementDoubleClick={(element) => element.type === 'text' && setEditingElement(element.id)}
              onElementContextMenu={(event, element) => {
                event.preventDefault()
                event.stopPropagation()
                if (!selectedIds.includes(element.id)) selectElements([element.id])
                setElementMenu({
                  x: Math.min(event.clientX, window.innerWidth - 210),
                  y: Math.min(event.clientY, window.innerHeight - 290),
                  elementId: element.id
                })
              }}
              onTextChange={(element, value) => updateElement(element.id, { content: value } as Partial<SlideElement>)}
            />
          </div>
        </div>
        {isEmptySlide ? (
          <CanvasQuickActions
            onAddText={() => addElement(newText())}
            onAddImage={() => void importImage()}
            onPickLayout={() => setTemplatesSignal((value) => value + 1)}
            onDesignWithAI={() => openDesign('slide')}
          />
        ) : null}
        {selected?.type === 'shape' && selectedIds.length === 1 ? (
          <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
            <ShapeFloatingToolbar
              element={selected}
              onUpdate={(patch) => updateElement(selected.id, patch)}
              onDuplicate={() => duplicateSelection()}
            />
          </div>
        ) : null}
        <PresentationCanvasToolbar
          zoom={zoom}
          onInsert={insertTool}
          onZoomChange={(nextZoom) => {
            userAdjustedZoomRef.current = true
            setZoom(nextZoom)
          }}
          onFitToScreen={() => {
            userAdjustedZoomRef.current = false
            fitToScreen()
          }}
        />
      </main>
      <DesignInspectorPanel
        slide={slide}
        element={selected}
        selectedIds={selectedIds}
        slideSize={document.logicalSize}
      />
    </div>
    {elementMenu ? <ElementContextMenu menu={elementMenu} slide={slide} onClose={() => setElementMenu(null)} /> : null}
    {slideMenu ? <SlideContextMenu menu={slideMenu} document={document} onClose={() => setSlideMenu(null)} /> : null}
    {projectId && presentationId ? (
      <PresentationDesignDialog
        open={designOpen}
        onOpenChange={setDesignOpen}
        projectId={projectId}
        presentationId={presentationId}
        documents={documents}
        mode={designMode}
      />
    ) : null}
    {presenting ? <PresentOverlay document={document} index={presentIndex} onIndex={setPresentIndex} onClose={() => setPresenting(false)} /> : null}
  </div>
}

function ElementContextMenu({ menu, slide, onClose }: { menu: { x: number; y: number; elementId: string }; slide: PresentationSlide; onClose: () => void }) {
  const state = usePresentationDocumentStore.getState()
  const element = getSlideElements(slide).find((item) => item.id === menu.elementId)
  if (!element) return null
  const run = (action: () => void) => { action(); onClose() }
  return <ContextMenuFrame x={menu.x} y={menu.y}>
    <ContextAction label="Copy" shortcut="⌘C" icon={Copy} onClick={() => run(() => state.copy())} />
    <ContextAction label="Duplicate" shortcut="⌘D" icon={Copy} onClick={() => run(() => state.duplicateSelection())} />
    <ContextDivider />
    <ContextAction label="Bring forward" icon={ArrowUp} onClick={() => run(() => state.dispatch({ type: 'SET_ELEMENT_ORDER', slideId: slide.id, elementId: element.id, direction: 'forward' }))} />
    <ContextAction label="Send backward" icon={ArrowDown} onClick={() => run(() => state.dispatch({ type: 'SET_ELEMENT_ORDER', slideId: slide.id, elementId: element.id, direction: 'backward' }))} />
    <ContextAction label={element.locked ? 'Unlock' : 'Lock'} icon={element.locked ? Unlock : Lock} onClick={() => run(() => state.updateElement(element.id, { locked: !element.locked } as Partial<SlideElement>))} />
    <ContextDivider />
    <ContextAction label="Delete" shortcut="Del" icon={Trash2} destructive onClick={() => run(() => state.deleteSelection())} />
  </ContextMenuFrame>
}

function SlideContextMenu({ menu, document, onClose }: { menu: { x: number; y: number; slideId: string }; document: PresentationDocument; onClose: () => void }) {
  const state = usePresentationDocumentStore.getState()
  const slide = document.slides.find((item) => item.id === menu.slideId)
  if (!slide) return null
  const index = document.slides.findIndex((item) => item.id === slide.id)
  const run = (action: () => void) => { action(); onClose() }
  return <ContextMenuFrame x={menu.x} y={menu.y}>
    <ContextAction label="Duplicate slide" icon={Copy} onClick={() => run(() => state.duplicateActiveSlide())} />
    <ContextAction label="Move up" icon={ArrowUp} disabled={index <= 0} onClick={() => run(() => state.dispatch({ type: 'MOVE_SLIDE', slideId: slide.id, toIndex: index - 1 }))} />
    <ContextAction label="Move down" icon={ArrowDown} disabled={index >= document.slides.length - 1} onClick={() => run(() => state.dispatch({ type: 'MOVE_SLIDE', slideId: slide.id, toIndex: index + 1 }))} />
    <ContextAction label={slide.hidden ? 'Show slide' : 'Hide slide'} icon={slide.hidden ? Unlock : Lock} onClick={() => run(() => state.dispatch({ type: 'UPDATE_SLIDE', slideId: slide.id, patch: { hidden: !slide.hidden } }))} />
    <ContextDivider />
    <ContextAction label="Delete slide" icon={Trash2} destructive onClick={() => run(() => state.deleteActiveSlide())} />
  </ContextMenuFrame>
}

function ContextMenuFrame({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      role="menu"
      className="fixed z-[250] w-48 animate-fade-in rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )
}

function ContextDivider() { return <div className="my-1 h-px bg-border" /> }

function ContextAction({ label, shortcut, icon: Icon, onClick, disabled, destructive }: { label: string; shortcut?: string; icon: typeof Copy; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-35', destructive && 'text-destructive hover:bg-destructive/10')}><Icon className="h-3.5 w-3.5" /><span>{label}</span>{shortcut ? <span className="ml-auto text-[10px] text-muted-foreground">{shortcut}</span> : null}</button>
}

function PresentOverlay({ document, index, onIndex, onClose }: { document: PresentationDocument; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const slide = document.slides[index] ?? document.slides[0]
  if (!slide) return null
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black" onClick={() => onIndex(Math.min(document.slides.length - 1, index + 1))}><div style={{ width: '100vw', aspectRatio: `${document.logicalSize.width}/${document.logicalSize.height}`, maxHeight: '100vh' }}><div style={{ width: document.logicalSize.width, height: document.logicalSize.height, transform: `scale(${Math.min(window.innerWidth / document.logicalSize.width, window.innerHeight / document.logicalSize.height)})`, transformOrigin: 'top left' }}><SlideRenderer slide={slide} logicalSize={document.logicalSize} /></div></div><button type="button" className="absolute right-4 top-4 rounded bg-white/10 px-3 py-2 text-white" onClick={(event) => { event.stopPropagation(); onClose(); void globalThis.document.exitFullscreen?.() }}>Esc</button><span className="absolute bottom-4 right-4 text-sm text-white/70">{index + 1} / {document.slides.length}</span></div>
}
