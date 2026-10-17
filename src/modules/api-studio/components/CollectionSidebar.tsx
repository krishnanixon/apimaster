import { useState, useEffect, type DragEvent, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  Library,
  MoreVertical,
  Braces,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  Download,
  Pencil,
  Copy,
  Play,
  Server
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useMockServerStore } from '@/modules/mock-server/stores/mockServerStore'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { EmptyState } from '@/shared/components/ui/empty-state'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/shared/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { getChildFolders } from '../services/folderTree'
import { collectionHasOwnSettings, folderHasOwnSettings } from '../services/inheritance'
import { NamePromptDialog } from './NamePromptDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { ImportCollectionDialog } from './ImportCollectionDialog'
import { CollectionRunnerDialog } from './CollectionRunnerDialog'
import { CollectionExportDialog } from './CollectionExportDialog'
import { ParentSettingsDialog, type ParentSettingsTarget } from './ParentSettingsDialog'
import { METHOD_COLORS, requestProtocolLabel } from '../types/api.types'
import type { ApiCollection, ApiFolder, ApiRequest } from '../types/api.types'

const TREE_DEPTH_PX = 14

type PromptAction =
  | { type: 'new-collection' }
  | { type: 'rename-collection'; collectionId: string; name: string }
  | { type: 'new-folder'; collectionId: string; parentId?: string | null }
  | { type: 'rename-folder'; collectionId: string; folderId: string; name: string }
  | { type: 'rename-request'; collectionId: string; requestId: string; name: string }

type RunnerAction =
  | { collectionId: string; collectionName: string; folderId?: null }
  | { collectionId: string; collectionName: string; folderId: string; folderName: string }

type DeleteAction =
  | { type: 'collection'; id: string; name: string }
  | { type: 'folder'; collectionId: string; id: string; name: string }
  | { type: 'request'; collectionId: string; id: string; name: string }

/** Drag-and-drop payload/targets. A request can be dropped onto another
 * request (insert before + adopt its folder/collection), a folder header
 * (move into that folder), or a collection header (move to its root). */
type DragPayload =
  | { kind: 'collection'; id: string }
  | { kind: 'folder'; id: string; collectionId: string }
  | { kind: 'request'; id: string; collectionId: string; folderId: string | null }

type DropTarget =
  | { kind: 'collection'; id: string }
  | { kind: 'folder'; id: string; collectionId: string }
  | { kind: 'request'; id: string; collectionId: string; folderId: string | null }

const DRAG_MIME = 'application/x-api-studio-drag'

function matchesSearch(collection: ApiCollection, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return (
    collection.name.toLowerCase().includes(q) ||
    collection.folders.some((f) => f.name.toLowerCase().includes(q)) ||
    collection.requests.some((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q))
  )
}

function targetKey(t: DropTarget): string {
  return `${t.kind}:${t.id}`
}

export function CollectionSidebar() {
  const navigate = useNavigate()
  const importCollectionToMock = useMockServerStore((s) => s.importCollection)
  const createMockFromRequest = useMockServerStore((s) => s.createMockFromRequest)
  const collections = useApiStudioStore((s) => s.collections)
  const search = useApiStudioStore((s) => s.collectionSearch)
  const setSearch = useApiStudioStore((s) => s.setCollectionSearch)
  const createCollection = useApiStudioStore((s) => s.createCollection)
  const renameCollection = useApiStudioStore((s) => s.renameCollection)
  const deleteCollection = useApiStudioStore((s) => s.deleteCollection)
  const createFolder = useApiStudioStore((s) => s.createFolder)
  const renameFolder = useApiStudioStore((s) => s.renameFolder)
  const deleteFolder = useApiStudioStore((s) => s.deleteFolder)
  const createRequest = useApiStudioStore((s) => s.createRequest)
  const deleteRequest = useApiStudioStore((s) => s.deleteRequest)
  const duplicateRequest = useApiStudioStore((s) => s.duplicateRequest)
  const renameRequest = useApiStudioStore((s) => s.renameRequest)
  const openRequestTab = useApiStudioStore((s) => s.openRequestTab)
  const openScratchTab = useApiStudioStore((s) => s.openScratchTab)
  const importCollection = useApiStudioStore((s) => s.importCollection)
  const reorderCollections = useApiStudioStore((s) => s.reorderCollections)
  const moveFolder = useApiStudioStore((s) => s.moveFolder)
  const moveRequest = useApiStudioStore((s) => s.moveRequest)
  const activeTabId = useApiStudioStore((s) => s.activeTabId)
  const tabs = useApiStudioStore((s) => s.tabs)

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(() => new Set())
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [prompt, setPrompt] = useState<PromptAction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteAction | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [runnerTarget, setRunnerTarget] = useState<RunnerAction | null>(null)
  const [exportCollectionTarget, setExportCollectionTarget] = useState<ApiCollection | null>(null)
  const [settingsTarget, setSettingsTarget] = useState<ParentSettingsTarget | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  function expandCollection(id: string) {
    setExpandedCollections((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  function expandFolder(id: string) {
    setExpandedFolders((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  /** Only expand tree paths for saved requests that are open in tabs. */
  useEffect(() => {
    for (const tab of tabs) {
      if (!tab.collectionId) continue
      expandCollection(tab.collectionId)
      const collection = collections.find((c) => c.id === tab.collectionId)
      if (!collection || !tab.request.folderId) continue
      let currentId: string | null = tab.request.folderId
      const byId = new Map(collection.folders.map((f) => [f.id, f]))
      while (currentId) {
        expandFolder(currentId)
        currentId = byId.get(currentId)?.parentId ?? null
      }
    }
  }, [tabs, collections])

  /** While searching, reveal matching collections. */
  useEffect(() => {
    if (!search.trim()) return
    setExpandedCollections((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const collection of collections) {
        if (matchesSearch(collection, search) && !next.has(collection.id)) {
          next.add(collection.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [search, collections])

  function toggleCollection(id: string) {
    setExpandedCollections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleFolder(id: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handlePromptSubmit(value: string) {
    if (!prompt) return
    switch (prompt.type) {
      case 'new-collection':
        expandCollection(createCollection(value).id)
        break
      case 'rename-collection':
        renameCollection(prompt.collectionId, value)
        break
      case 'new-folder': {
        const folderId = createFolder(prompt.collectionId, value, prompt.parentId ?? null)
        expandCollection(prompt.collectionId)
        if (prompt.parentId) expandFolder(prompt.parentId)
        expandFolder(folderId)
        break
      }
      case 'rename-folder':
        renameFolder(prompt.collectionId, prompt.folderId, value)
        break
      case 'rename-request':
        renameRequest(prompt.collectionId, prompt.requestId, value)
        break
    }
    setPrompt(null)
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    if (deleteTarget.type === 'collection') deleteCollection(deleteTarget.id)
    if (deleteTarget.type === 'folder') deleteFolder(deleteTarget.collectionId, deleteTarget.id)
    if (deleteTarget.type === 'request') deleteRequest(deleteTarget.collectionId, deleteTarget.id)
    setDeleteTarget(null)
  }

  async function handleCreateMockServer(collection: ApiCollection) {
    const server = await importCollectionToMock(collection, true)
    if (server) {
      toast.success(`Mock server "${server.name}" created`)
      navigate('/mock-servers', { state: { selectServerId: server.id } })
    } else {
      toast.error('Could not create mock server from collection')
    }
  }

  async function handleCreateMockFromRequest(collectionId: string, request: ApiRequest) {
    const server = await createMockFromRequest(collectionId, request)
    if (server) {
      toast.success('Mock route added')
      navigate('/mock-servers', { state: { selectServerId: server.id } })
    } else {
      toast.error('Could not create mock route')
    }
  }

  async function handleImportClick() {
    if (window.electronAPI?.apiStudio?.pickImportCollection) {
      const res = await window.electronAPI.apiStudio.pickImportCollection()
      if (res.success && res.data) {
        const collectionId = importCollection(res.data)
        if (collectionId) expandCollection(collectionId)
        return
      }
      if (res.error === 'Import cancelled') return
    }
    setImportOpen(true)
  }

  function handleImported(collectionId: string) {
    expandCollection(collectionId)
  }

  function isRequestOpen(collectionId: string, requestId: string): boolean {
    return tabs.some((t) => t.id === activeTabId && t.collectionId === collectionId && t.request.id === requestId)
  }

  function handleDragStart(e: DragEvent, payload: DragPayload) {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  }

  function handleDragOver(e: DragEvent, target: DropTarget) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const key = targetKey(target)
    if (dragOverKey !== key) setDragOverKey(key)
  }

  function handleDragLeave(target: DropTarget) {
    setDragOverKey((prev) => (prev === targetKey(target) ? null : prev))
  }

  function handleDrop(e: DragEvent, target: DropTarget) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverKey(null)
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    let payload: DragPayload
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }

    if (payload.kind === 'collection' && target.kind === 'collection') {
      reorderCollections(payload.id, target.id)
      return
    }

    if (payload.kind === 'folder' && target.kind === 'folder') {
      if (payload.collectionId !== target.collectionId) {
        toast.error('Folders can only be moved within the same collection')
        return
      }
      if (payload.id === target.id) return
      // Drop onto another folder → nest under it (or reorder if same parent via Alt? keep nest)
      moveFolder({
        collectionId: payload.collectionId,
        folderId: payload.id,
        toParentId: target.id
      })
      expandFolder(target.id)
      return
    }

    if (payload.kind === 'folder' && target.kind === 'collection') {
      if (payload.collectionId !== target.id) {
        toast.error('Folders can only be moved within the same collection')
        return
      }
      moveFolder({
        collectionId: payload.collectionId,
        folderId: payload.id,
        toParentId: null
      })
      return
    }

    if (payload.kind === 'folder' && target.kind === 'request') {
      // Dropping a folder onto a request nests it under that request's folder (or root)
      if (payload.collectionId !== target.collectionId) {
        toast.error('Folders can only be moved within the same collection')
        return
      }
      moveFolder({
        collectionId: payload.collectionId,
        folderId: payload.id,
        toParentId: target.folderId
      })
      return
    }

    if (payload.kind === 'request') {
      if (target.kind === 'request') {
        if (payload.id === target.id) return
        moveRequest({
          requestId: payload.id,
          fromCollectionId: payload.collectionId,
          toCollectionId: target.collectionId,
          toFolderId: target.folderId,
          beforeRequestId: target.id
        })
      } else if (target.kind === 'folder') {
        moveRequest({
          requestId: payload.id,
          fromCollectionId: payload.collectionId,
          toCollectionId: target.collectionId,
          toFolderId: target.id
        })
      } else if (target.kind === 'collection') {
        moveRequest({
          requestId: payload.id,
          fromCollectionId: payload.collectionId,
          toCollectionId: target.id,
          toFolderId: null
        })
        setExpandedCollections((prev) => new Set(prev).add(target.id))
      }
    }
  }

  const visibleCollections = collections.filter((c) => matchesSearch(c, search))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-7 border-0 bg-muted/40 pl-7 text-xs shadow-none focus-visible:ring-1"
          />
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="New collection" onClick={() => setPrompt({ type: 'new-collection' })}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Import collection or cURL" onClick={() => void handleImportClick()}>
          <Upload className="h-3.5 w-3.5" />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => openScratchTab()}
        className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        New request
      </button>

      <ScrollArea className="min-h-0 flex-1">
        {visibleCollections.length === 0 ? (
          <EmptyState
            icon={<FolderIcon className="h-5 w-5" />}
            title="No collections yet"
            description="Create a collection to start organizing your API requests."
            action={
              <Button size="sm" onClick={() => setPrompt({ type: 'new-collection' })}>
                <Plus className="h-3.5 w-3.5" /> New Collection
              </Button>
            }
          />
        ) : (
          <div className="py-0.5">
            {visibleCollections.map((collection) => {
              const expanded = expandedCollections.has(collection.id)
              const rootRequests = collection.requests.filter((r) => !r.folderId)
              const collectionTarget: DropTarget = { kind: 'collection', id: collection.id }
              return (
                <div key={collection.id}>
                  <TreeRow
                    depth={0}
                    draggable
                    isDragOver={dragOverKey === targetKey(collectionTarget)}
                    onDragStart={(e) => handleDragStart(e, { kind: 'collection', id: collection.id })}
                    onDragOver={(e) => handleDragOver(e, collectionTarget)}
                    onDragLeave={() => handleDragLeave(collectionTarget)}
                    onDrop={(e) => handleDrop(e, collectionTarget)}
                    menu={
                      <SidebarRowMenu
                        items={[
                          { icon: <Play className="h-3 w-3" />, label: 'Run collection', onSelect: () => setRunnerTarget({ collectionId: collection.id, collectionName: collection.name }) },
                          { icon: <Plus className="h-3 w-3" />, label: 'New Request', onSelect: () => createRequest(collection.id) },
                          { icon: <Braces className="h-3 w-3" />, label: 'New GraphQL request', onSelect: () => createRequest(collection.id, null, 'graphql') },
                          { icon: <FolderPlus className="h-3 w-3" />, label: 'New Folder', onSelect: () => setPrompt({ type: 'new-folder', collectionId: collection.id }) },
                          { icon: <Shield className="h-3 w-3" />, label: 'Authorization', onSelect: () => setSettingsTarget({ kind: 'collection', collectionId: collection.id }) },
                          { icon: <Pencil className="h-3 w-3" />, label: 'Rename', onSelect: () => setPrompt({ type: 'rename-collection', collectionId: collection.id, name: collection.name }) },
                          { icon: <Download className="h-3 w-3" />, label: 'Export…', onSelect: () => setExportCollectionTarget(collection) },
                          {
                            icon: <Server className="h-3 w-3" />,
                            label: 'Create Mock Server',
                            onSelect: () => void handleCreateMockServer(collection)
                          },
                          { icon: <Trash2 className="h-3 w-3" />, label: 'Delete', destructive: true, onSelect: () => setDeleteTarget({ type: 'collection', id: collection.id, name: collection.name }) }
                        ]}
                      />
                    }
                    contextMenu={
                      <ContextMenuContent className="min-w-[160px]">
                        <ContextMenuItem onSelect={() => setRunnerTarget({ collectionId: collection.id, collectionName: collection.name })}>
                          <Play className="h-3.5 w-3.5" /> Run collection
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => createRequest(collection.id)}>
                          <Plus className="h-3.5 w-3.5" /> New Request
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => createRequest(collection.id, null, 'graphql')}>
                          <Braces className="h-3.5 w-3.5" /> New GraphQL request
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => setPrompt({ type: 'new-folder', collectionId: collection.id })}>
                          <FolderPlus className="h-3.5 w-3.5" /> New Folder
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => setSettingsTarget({ kind: 'collection', collectionId: collection.id })}>
                          <Shield className="h-3.5 w-3.5" /> Authorization
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => setPrompt({ type: 'rename-collection', collectionId: collection.id, name: collection.name })}>
                          <Pencil className="h-3.5 w-3.5" /> Rename
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => setExportCollectionTarget(collection)}>
                          <Download className="h-3.5 w-3.5" /> Export…
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => void handleCreateMockServer(collection)}>
                          <Server className="h-3.5 w-3.5" /> Create Mock Server
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget({ type: 'collection', id: collection.id, name: collection.name })}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleCollection(collection.id)}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                      title={collection.name}
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <Library className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 truncate text-xs font-medium">{collection.name}</span>
                      {collectionHasOwnSettings(collection) && (
                        <Shield className="h-3 w-3 shrink-0 text-primary" aria-label="Has collection authorization" />
                      )}
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">({collection.requests.length})</span>
                    </button>
                  </TreeRow>

                  {expanded && (
                    <>
                      {getChildFolders(collection.folders, null).map((folder) => (
                        <FolderNode
                          key={folder.id}
                          collection={collection}
                          folder={folder}
                          depth={1}
                          expandedFolders={expandedFolders}
                          dragOverKey={dragOverKey}
                          onToggleFolder={toggleFolder}
                          onExpandFolder={expandFolder}
                          isRequestOpen={isRequestOpen}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onOpenRequest={(requestId) => openRequestTab(collection.id, requestId)}
                          onPrompt={setPrompt}
                          onDelete={setDeleteTarget}
                          onRunner={setRunnerTarget}
                          onSettings={setSettingsTarget}
                          onCreateRequest={createRequest}
                          onDuplicateRequest={duplicateRequest}
                          onCreateMock={(request) => void handleCreateMockFromRequest(collection.id, request)}
                        />
                      ))}

                      {rootRequests.map((request) => {
                        const requestTarget: DropTarget = {
                          kind: 'request',
                          id: request.id,
                          collectionId: collection.id,
                          folderId: null
                        }
                        return (
                          <RequestRow
                            key={request.id}
                            depth={1}
                            request={request}
                            active={isRequestOpen(collection.id, request.id)}
                            isDragOver={dragOverKey === targetKey(requestTarget)}
                            onDragStart={(e) =>
                              handleDragStart(e, {
                                kind: 'request',
                                id: request.id,
                                collectionId: collection.id,
                                folderId: null
                              })
                            }
                            onDragOver={(e) => handleDragOver(e, requestTarget)}
                            onDragLeave={() => handleDragLeave(requestTarget)}
                            onDrop={(e) => handleDrop(e, requestTarget)}
                            onOpen={() => openRequestTab(collection.id, request.id)}
                            onRename={() =>
                              setPrompt({
                                type: 'rename-request',
                                collectionId: collection.id,
                                requestId: request.id,
                                name: request.name
                              })
                            }
                            onDuplicate={() => duplicateRequest(collection.id, request.id)}
                            onDelete={() =>
                              setDeleteTarget({
                                type: 'request',
                                collectionId: collection.id,
                                id: request.id,
                                name: request.name
                              })
                            }
                            onCreateMock={() => void handleCreateMockFromRequest(collection.id, request)}
                          />
                        )
                      })}

                      {collection.folders.length === 0 && rootRequests.length === 0 && (
                        <p className="px-3 py-1 text-[11px] text-muted-foreground">No requests yet</p>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>

      <NamePromptDialog
        open={prompt !== null}
        onOpenChange={(open) => !open && setPrompt(null)}
        title={
          prompt?.type === 'new-collection'
            ? 'New Collection'
            : prompt?.type === 'rename-collection'
              ? 'Rename Collection'
              : prompt?.type === 'new-folder'
                ? 'New Folder'
                : prompt?.type === 'rename-folder'
                  ? 'Rename Folder'
                  : 'Rename Request'
        }
        initialValue={prompt && 'name' in prompt ? prompt.name : ''}
        confirmLabel={prompt?.type.startsWith('rename') ? 'Rename' : 'Create'}
        onSubmit={handlePromptSubmit}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description={
          deleteTarget?.type === 'folder'
            ? 'This deletes the folder and all nested subfolders. Requests inside will move to the collection root.'
            : 'This cannot be undone.'
        }
        onConfirm={handleDeleteConfirm}
      />

      <ImportCollectionDialog open={importOpen} onOpenChange={setImportOpen} onImported={handleImported} />
      <CollectionExportDialog
        open={exportCollectionTarget !== null}
        onOpenChange={(open) => !open && setExportCollectionTarget(null)}
        collection={exportCollectionTarget}
      />
      <ParentSettingsDialog
        target={settingsTarget}
        onOpenChange={(open) => !open && setSettingsTarget(null)}
      />
      {runnerTarget && (
        <CollectionRunnerDialog
          open={Boolean(runnerTarget)}
          onOpenChange={(open) => !open && setRunnerTarget(null)}
          collectionId={runnerTarget.collectionId}
          folderId={runnerTarget.folderId ?? null}
          collectionName={runnerTarget.collectionName}
          scopeLabel={runnerTarget.folderId ? runnerTarget.folderName : 'Entire collection'}
        />
      )}
    </div>
  )
}

function FolderNode({
  collection,
  folder,
  depth,
  expandedFolders,
  dragOverKey,
  onToggleFolder,
  onExpandFolder,
  isRequestOpen,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenRequest,
  onPrompt,
  onDelete,
  onRunner,
  onSettings,
  onCreateRequest,
  onDuplicateRequest,
  onCreateMock
}: {
  collection: ApiCollection
  folder: ApiFolder
  depth: number
  expandedFolders: Set<string>
  dragOverKey: string | null
  onToggleFolder: (id: string) => void
  onExpandFolder: (id: string) => void
  isRequestOpen: (collectionId: string, requestId: string) => boolean
  onDragStart: (e: DragEvent, payload: DragPayload) => void
  onDragOver: (e: DragEvent, target: DropTarget) => void
  onDragLeave: (target: DropTarget) => void
  onDrop: (e: DragEvent, target: DropTarget) => void
  onOpenRequest: (requestId: string) => void
  onPrompt: (action: PromptAction) => void
  onDelete: (action: DeleteAction) => void
  onRunner: (action: RunnerAction) => void
  onSettings: (target: ParentSettingsTarget) => void
  onCreateRequest: (collectionId: string, folderId?: string | null, requestType?: ApiRequest['requestType']) => void
  onDuplicateRequest: (collectionId: string, requestId: string) => void
  onCreateMock: (request: ApiRequest) => void
}) {
  const folderExpanded = expandedFolders.has(folder.id)
  const childFolders = getChildFolders(collection.folders, folder.id)
  const folderRequests = collection.requests.filter((r) => r.folderId === folder.id)
  const folderTarget: DropTarget = { kind: 'folder', id: folder.id, collectionId: collection.id }
  const childCount = childFolders.length + folderRequests.length

  return (
    <div>
      <TreeRow
        depth={depth}
        draggable
        isDragOver={dragOverKey === targetKey(folderTarget)}
        onDragStart={(e) =>
          onDragStart(e, { kind: 'folder', id: folder.id, collectionId: collection.id })
        }
        onDragOver={(e) => onDragOver(e, folderTarget)}
        onDragLeave={() => onDragLeave(folderTarget)}
        onDrop={(e) => onDrop(e, folderTarget)}
        menu={
          <SidebarRowMenu
            items={[
              {
                icon: <Play className="h-3 w-3" />,
                label: 'Run folder',
                onSelect: () =>
                  onRunner({
                    collectionId: collection.id,
                    collectionName: collection.name,
                    folderId: folder.id,
                    folderName: folder.name
                  })
              },
              {
                icon: <Plus className="h-3 w-3" />,
                label: 'New Request',
                onSelect: () => {
                  onCreateRequest(collection.id, folder.id)
                  onExpandFolder(folder.id)
                }
              },
              {
                icon: <Braces className="h-3 w-3" />,
                label: 'New GraphQL request',
                onSelect: () => {
                  onCreateRequest(collection.id, folder.id, 'graphql')
                  onExpandFolder(folder.id)
                }
              },
              {
                icon: <FolderPlus className="h-3 w-3" />,
                label: 'New Folder',
                onSelect: () =>
                  onPrompt({ type: 'new-folder', collectionId: collection.id, parentId: folder.id })
              },
              {
                icon: <Shield className="h-3 w-3" />,
                label: 'Authorization',
                onSelect: () =>
                  onSettings({ kind: 'folder', collectionId: collection.id, folderId: folder.id })
              },
              {
                icon: <Pencil className="h-3 w-3" />,
                label: 'Rename',
                onSelect: () =>
                  onPrompt({
                    type: 'rename-folder',
                    collectionId: collection.id,
                    folderId: folder.id,
                    name: folder.name
                  })
              },
              {
                icon: <Trash2 className="h-3 w-3" />,
                label: 'Delete',
                destructive: true,
                onSelect: () =>
                  onDelete({
                    type: 'folder',
                    collectionId: collection.id,
                    id: folder.id,
                    name: folder.name
                  })
              }
            ]}
          />
        }
        contextMenu={
          <ContextMenuContent className="min-w-[160px]">
            <ContextMenuItem
              onSelect={() =>
                onRunner({
                  collectionId: collection.id,
                  collectionName: collection.name,
                  folderId: folder.id,
                  folderName: folder.name
                })
              }
            >
              <Play className="h-3.5 w-3.5" /> Run folder
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                onCreateRequest(collection.id, folder.id)
                onExpandFolder(folder.id)
              }}
            >
              <Plus className="h-3.5 w-3.5" /> New Request
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                onPrompt({ type: 'new-folder', collectionId: collection.id, parentId: folder.id })
              }
            >
              <FolderPlus className="h-3.5 w-3.5" /> New Folder
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                onSettings({ kind: 'folder', collectionId: collection.id, folderId: folder.id })
              }
            >
              <Shield className="h-3.5 w-3.5" /> Authorization
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() =>
                onPrompt({
                  type: 'rename-folder',
                  collectionId: collection.id,
                  folderId: folder.id,
                  name: folder.name
                })
              }
            >
              <Pencil className="h-3.5 w-3.5" /> Rename
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() =>
                onDelete({
                  type: 'folder',
                  collectionId: collection.id,
                  id: folder.id,
                  name: folder.name
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        }
      >
        <button
          type="button"
          onClick={() => onToggleFolder(folder.id)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          title={folder.name}
        >
          {folderExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 truncate text-xs">{folder.name}</span>
          {folderHasOwnSettings(folder) && (
            <Shield className="h-3 w-3 shrink-0 text-primary" aria-label="Has folder authorization" />
          )}
          {childCount > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">({childCount})</span>
          )}
        </button>
      </TreeRow>

      {folderExpanded && (
        <>
          {childFolders.map((child) => (
            <FolderNode
              key={child.id}
              collection={collection}
              folder={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              dragOverKey={dragOverKey}
              onToggleFolder={onToggleFolder}
              onExpandFolder={onExpandFolder}
              isRequestOpen={isRequestOpen}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onOpenRequest={onOpenRequest}
              onPrompt={onPrompt}
              onDelete={onDelete}
              onRunner={onRunner}
              onSettings={onSettings}
              onCreateRequest={onCreateRequest}
              onDuplicateRequest={onDuplicateRequest}
              onCreateMock={onCreateMock}
            />
          ))}
          {folderRequests.map((request) => {
            const requestTarget: DropTarget = {
              kind: 'request',
              id: request.id,
              collectionId: collection.id,
              folderId: folder.id
            }
            return (
              <RequestRow
                key={request.id}
                depth={depth + 1}
                request={request}
                active={isRequestOpen(collection.id, request.id)}
                isDragOver={dragOverKey === targetKey(requestTarget)}
                onDragStart={(e) =>
                  onDragStart(e, {
                    kind: 'request',
                    id: request.id,
                    collectionId: collection.id,
                    folderId: folder.id
                  })
                }
                onDragOver={(e) => onDragOver(e, requestTarget)}
                onDragLeave={() => onDragLeave(requestTarget)}
                onDrop={(e) => onDrop(e, requestTarget)}
                onOpen={() => onOpenRequest(request.id)}
                onRename={() =>
                  onPrompt({
                    type: 'rename-request',
                    collectionId: collection.id,
                    requestId: request.id,
                    name: request.name
                  })
                }
                onDuplicate={() => onDuplicateRequest(collection.id, request.id)}
                onDelete={() =>
                  onDelete({
                    type: 'request',
                    collectionId: collection.id,
                    id: request.id,
                    name: request.name
                  })
                }
                onCreateMock={() => onCreateMock(request)}
              />
            )
          })}
        </>
      )}
    </div>
  )
}

function TreeRow({
  depth,
  active,
  isDragOver,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  menu,
  contextMenu,
  children
}: {
  depth: number
  active?: boolean
  isDragOver?: boolean
  draggable?: boolean
  onDragStart?: (e: DragEvent) => void
  onDragOver?: (e: DragEvent) => void
  onDragLeave?: () => void
  onDrop?: (e: DragEvent) => void
  menu: ReactNode
  contextMenu?: ReactNode
  children: ReactNode
}) {
  const row = (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'tree-row group flex h-7 w-full min-w-0 items-center',
        'hover:bg-accent/60',
        active && 'bg-accent',
        isDragOver && 'bg-primary/10 ring-1 ring-inset ring-primary/30'
      )}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden pr-1"
        style={{ paddingLeft: `${6 + depth * TREE_DEPTH_PX}px` }}
      >
        {children}
      </div>
      <div className="flex h-7 w-6 shrink-0 items-center justify-center">{menu}</div>
    </div>
  )

  if (!contextMenu) return row

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      {contextMenu}
    </ContextMenu>
  )
}

function RequestRow({
  depth,
  request,
  active,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onCreateMock
}: {
  depth: number
  request: ApiRequest
  active: boolean
  isDragOver: boolean
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
  onOpen: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  onCreateMock?: () => void
}) {
  const method = requestProtocolLabel(request)
  return (
    <TreeRow
      depth={depth}
      active={active}
      isDragOver={isDragOver}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      menu={
        <SidebarRowMenu
          items={[
            { icon: <Pencil className="h-3 w-3" />, label: 'Rename', onSelect: onRename },
            { icon: <Copy className="h-3 w-3" />, label: 'Duplicate', onSelect: onDuplicate },
            ...(onCreateMock
              ? [{ icon: <Server className="h-3 w-3" />, label: 'Create Mock', onSelect: onCreateMock }]
              : []),
            { icon: <Trash2 className="h-3 w-3" />, label: 'Delete', destructive: true, onSelect: onDelete }
          ]}
        />
      }
      contextMenu={
        <ContextMenuContent className="min-w-[140px]">
          <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
          {onCreateMock && (
            <ContextMenuItem onSelect={onCreateMock}>
              <Server className="h-3.5 w-3.5" /> Create Mock
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onRename}>
            <Pencil className="h-3.5 w-3.5" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onSelect={onDuplicate}>
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      }
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={request.name}
      >
        <span className={cn('w-9 shrink-0 font-mono text-[10px] font-semibold', METHOD_COLORS[method])}>{method}</span>
        <span className="min-w-0 truncate text-xs">{request.name}</span>
      </button>
    </TreeRow>
  )
}

function SidebarRowMenu({
  items
}: {
  items: { icon: React.ReactNode; label: string; destructive?: boolean; onSelect: () => void }[]
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground',
            'opacity-0 transition-opacity hover:bg-background/80 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100'
          )}
          title="More actions"
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="right"
        sideOffset={6}
        collisionPadding={12}
        className="min-w-[150px]"
      >
        {items.map((item, i) => (
          <DropdownMenuItem
            key={i}
            onSelect={item.onSelect}
            className={cn('gap-2 text-xs', item.destructive && 'text-destructive focus:text-destructive')}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
