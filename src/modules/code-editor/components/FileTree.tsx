import { memo, useEffect, useState, type DragEvent } from 'react'
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Scissors,
  Search,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { fileIconFor } from '../lib/file-icons'
import { relativeTo } from '../lib/paths'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/shared/components/ui/context-menu'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import type { FileSystemEntry, FileSystemEntryKind } from '@shared/types/code-editor'
import { NamePromptDialog } from './NamePromptDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { encodeWorkbenchPath, parseWorkbenchPath, WORKBENCH_PATH_MIME } from '@shared/lib/workbench-dnd'
import { refsFromDropEvent } from '../lib/agent-drop'
import { useAgentStore } from '../stores/agent.store'
import type { AgentFileRef } from '@shared/types/agent'

type DialogState =
  | { type: 'create'; kind: FileSystemEntryKind; parentPath: string }
  | { type: 'rename'; entry: FileSystemEntry }
  | null

interface FileTreeProps {
  rootPath: string
  rootName: string
}

export function FileTree({ rootPath, rootName }: FileTreeProps) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileSystemEntry | null>(null)
  const [customDraft, setCustomDraft] = useState<string | null>(null)
  const createEntry = useCodeEditorStore((s) => s.createEntry)
  const renameEntry = useCodeEditorStore((s) => s.renameEntry)
  const deleteEntry = useCodeEditorStore((s) => s.deleteEntry)
  const dirCache = useCodeEditorStore((s) => s.dirCache)
  const expandedPaths = useCodeEditorStore((s) => s.expandedPaths)
  const toggleExpand = useCodeEditorStore((s) => s.toggleExpand)
  const showIgnored = useCodeEditorStore((s) => s.showIgnored)
  const setShowIgnored = useCodeEditorStore((s) => s.setShowIgnored)
  const ignoreRules = useCodeEditorStore((s) => s.ignoreRules)
  const setCustomIgnoreNames = useCodeEditorStore((s) => s.setCustomIgnoreNames)
  const fileSearchQuery = useCodeEditorStore((s) => s.fileSearchQuery)
  const fileSearchHits = useCodeEditorStore((s) => s.fileSearchHits)
  const setFileSearchQuery = useCodeEditorStore((s) => s.setFileSearchQuery)
  const openFileByPath = useCodeEditorStore((s) => s.openFileByPath)
  const importDroppedPaths = useCodeEditorStore((s) => s.importDroppedPaths)
  const attachFiles = useAgentStore((s) => s.attachFiles)
  const pasteExplorer = useCodeEditorStore((s) => s.pasteExplorer)
  const moveDropped = useCodeEditorStore((s) => s.moveDropped)
  const explorerClip = useCodeEditorStore((s) => s.explorerClip)
  const revealInTreePath = useCodeEditorStore((s) => s.revealInTreePath)
  const revealInTreeNonce = useCodeEditorStore((s) => s.revealInTreeNonce)

  useEffect(() => {
    if (!revealInTreePath) return
    const escaped = CSS.escape(revealInTreePath)
    const element = document.querySelector<HTMLElement>(`[data-tree-path="${escaped}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [revealInTreePath, revealInTreeNonce])

  const rootNode = dirCache[rootPath]
  const rootExpanded = expandedPaths.has(rootPath)

  return (
    <div className="flex h-full flex-col text-[12px]">
      <div className="flex items-center gap-1 border-b border-[var(--wb-border)] px-1.5 py-0.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={fileSearchQuery}
          onChange={(e) => setFileSearchQuery(e.target.value)}
          placeholder="Search files"
          className="h-6 border-0 bg-transparent px-1 text-[12px] shadow-none focus-visible:ring-0"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={showIgnored ? 'Hide excluded folders' : 'Show excluded folders'}
          onClick={() => void setShowIgnored(!showIgnored)}
        >
          {showIgnored ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {customDraft === null ? (
        <button
          type="button"
          className="px-3 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setCustomDraft((ignoreRules?.custom ?? []).join(', '))}
        >
          Ignore: {(ignoreRules?.names ?? []).slice(0, 4).join(', ')}
          {(ignoreRules?.names.length ?? 0) > 4 ? '…' : ''}
        </button>
      ) : (
        <form
          className="px-2 pb-1"
          onSubmit={(e) => {
            e.preventDefault()
            const names = customDraft
              .split(/[, \n]+/)
              .map((name) => name.trim())
              .filter(Boolean)
            void setCustomIgnoreNames(names)
            setCustomDraft(null)
          }}
        >
          <Input
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            placeholder="Extra ignore names, comma separated"
            className="h-6 text-[12px]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCustomDraft(null)
            }}
          />
        </form>
      )}

      {fileSearchQuery.trim() ? (
        <div className="flex-1 overflow-y-auto pb-4">
          {fileSearchHits.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matching files</p>
          )}
          {fileSearchHits.map((hit) => (
            <button
              key={hit.path}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  WORKBENCH_PATH_MIME,
                  encodeWorkbenchPath({ path: hit.path, name: hit.relativePath, isDirectory: false })
                )
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => void openFileByPath(hit.path)}
              className="flex h-[22px] w-full items-center gap-1.5 px-3 text-left text-[12px] hover:bg-[var(--wb-hover)]"
              title={hit.path}
            >
              <HitIcon path={hit.path} />
              <span className="truncate">{hit.relativePath}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                onClick={() => void toggleExpand(rootPath)}
                className="flex h-6 w-full items-center gap-1.5 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--wb-fg)] hover:bg-[var(--wb-hover)]"
                title={rootPath}
              >
                <ChevronRight
                  className={cn('h-3.5 w-3.5 shrink-0 transition-transform', rootExpanded && 'rotate-90')}
                />
                <span className="truncate">{rootName}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => setDialog({ type: 'create', kind: 'file', parentPath: rootPath })}>
                <FilePlus className="h-3.5 w-3.5" /> New File
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => setDialog({ type: 'create', kind: 'folder', parentPath: rootPath })}>
                <FolderPlus className="h-3.5 w-3.5" /> New Folder
              </ContextMenuItem>
              <ContextMenuItem disabled={!explorerClip} onSelect={() => void pasteExplorer(rootPath)}>
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          {rootExpanded && (
            <div
              className="flex-1 overflow-y-auto pb-4"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                void handleTreeDrop(e, rootPath, importDroppedPaths, attachFiles, moveDropped)
              }}
            >
              {rootNode?.loading && <p className="px-3 py-1 text-xs text-muted-foreground">Loading…</p>}
              {rootNode?.loaded && rootNode.entries.length === 0 && (
                <p className="px-3 py-1 text-xs text-muted-foreground">Empty folder</p>
              )}
              {rootNode?.entries.map((entry) => (
                <FileTreeNode
                  key={entry.path}
                  entry={entry}
                  depth={1}
                  onCreate={(kind, parentPath) => setDialog({ type: 'create', kind, parentPath })}
                  onRename={(target) => setDialog({ type: 'rename', entry: target })}
                  onDelete={(target) => setDeleteTarget(target)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <NamePromptDialog
        open={dialog?.type === 'create'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.type === 'create' && dialog.kind === 'folder' ? 'New Folder' : 'New File'}
        confirmLabel="Create"
        onSubmit={(name) => {
          if (dialog?.type === 'create') void createEntry(dialog.parentPath, name, dialog.kind)
        }}
      />

      <NamePromptDialog
        open={dialog?.type === 'rename'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Rename"
        confirmLabel="Rename"
        initialValue={dialog?.type === 'rename' ? dialog.entry.name : ''}
        onSubmit={(name) => {
          if (dialog?.type === 'rename') void renameEntry(dialog.entry.path, name)
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description={
          deleteTarget?.isDirectory
            ? 'This will permanently delete the folder and everything inside it.'
            : 'This will permanently delete the file.'
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) void deleteEntry(deleteTarget.path)
        }}
      />
    </div>
  )
}

interface FileTreeNodeProps {
  entry: FileSystemEntry
  depth: number
  onCreate: (kind: FileSystemEntryKind, parentPath: string) => void
  onRename: (entry: FileSystemEntry) => void
  onDelete: (entry: FileSystemEntry) => void
}

function FileTreeNodeInner({ entry, depth, onCreate, onRename, onDelete }: FileTreeNodeProps) {
  const expanded = useCodeEditorStore((s) => (entry.isDirectory ? s.expandedPaths.has(entry.path) : false))
  const node = useCodeEditorStore((s) => s.dirCache[entry.path])
  const isActive = useCodeEditorStore((s) => s.activeTabPath === entry.path)
  const toggleExpand = useCodeEditorStore((s) => s.toggleExpand)
  const openFile = useCodeEditorStore((s) => s.openFile)
  const importDroppedPaths = useCodeEditorStore((s) => s.importDroppedPaths)
  const attachFiles = useAgentStore((s) => s.attachFiles)
  const moveDropped = useCodeEditorStore((s) => s.moveDropped)
  const copyExplorerPaths = useCodeEditorStore((s) => s.copyExplorerPaths)
  const cutExplorerPaths = useCodeEditorStore((s) => s.cutExplorerPaths)
  const pasteExplorer = useCodeEditorStore((s) => s.pasteExplorer)
  const duplicateEntry = useCodeEditorStore((s) => s.duplicateEntry)
  const revealInOs = useCodeEditorStore((s) => s.revealInOs)
  const explorerClip = useCodeEditorStore((s) => s.explorerClip)
  const revealInTreePath = useCodeEditorStore((s) => s.revealInTreePath)
  const rootPath = useCodeEditorStore((s) => s.rootPath)

  const handleClick = () => {
    if (entry.isDirectory) void toggleExpand(entry.path)
    else void openFile(entry)
  }

  const copyPath = async (relative: boolean) => {
    const text = relative ? relativeTo(rootPath, entry.path) : entry.path
    await navigator.clipboard.writeText(text)
    toast.success(relative ? 'Relative path copied' : 'Path copied')
  }

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            onClick={handleClick}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                WORKBENCH_PATH_MIME,
                encodeWorkbenchPath({
                  path: entry.path,
                  name: entry.name,
                  isDirectory: entry.isDirectory
                })
              )
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onDragOver={(e) => {
              if (!entry.isDirectory) return
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(e) => {
              if (!entry.isDirectory) return
              e.preventDefault()
              e.stopPropagation()
              void handleTreeDrop(e, entry.path, importDroppedPaths, attachFiles, moveDropped)
            }}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            data-tree-path={entry.path}
            className={cn(
              'flex h-[22px] w-full items-center gap-1 py-0 pr-2 text-left text-[12px] hover:bg-[var(--wb-hover)]',
              isActive && 'bg-[var(--wb-active)] font-medium text-[var(--wb-fg)]',
              entry.ignored && 'opacity-50',
              revealInTreePath === entry.path && 'bg-primary/10 ring-1 ring-inset ring-primary/40'
            )}
            title={entry.ignored ? `${entry.name} (excluded)` : entry.name}
          >
            {entry.isDirectory ? (
              <>
                <ChevronRight
                  className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
                />
                {expanded ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5 shrink-0" />
                <FileGlyph path={entry.path} />
              </>
            )}
            <span className="truncate">{entry.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {entry.isDirectory && (
            <>
              <ContextMenuItem onSelect={() => onCreate('file', entry.path)}>
                <FilePlus className="h-3.5 w-3.5" /> New File
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onCreate('folder', entry.path)}>
                <FolderPlus className="h-3.5 w-3.5" /> New Folder
              </ContextMenuItem>
              <ContextMenuItem disabled={!explorerClip} onSelect={() => void pasteExplorer(entry.path)}>
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            onSelect={() =>
              attachFiles([
                {
                  path: entry.path,
                  name: entry.name,
                  kind: entry.isDirectory ? 'folder' : 'file'
                }
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add to Agent
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => copyExplorerPaths([entry.path])}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => cutExplorerPaths([entry.path])}>
            <Scissors className="h-3.5 w-3.5" /> Cut
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void duplicateEntry(entry.path)}>
            <Files className="h-3.5 w-3.5" /> Duplicate
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void revealInOs(entry.path)}>
            <ExternalLink className="h-3.5 w-3.5" /> Reveal in Explorer
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void copyPath(false)}>
            <Copy className="h-3.5 w-3.5" /> Copy Path
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void copyPath(true)}>
            <Copy className="h-3.5 w-3.5" /> Copy Relative Path
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onRename(entry)}>
            <Pencil className="h-3.5 w-3.5" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onDelete(entry)} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {expanded && (
        <div>
          {node?.loading && (
            <p style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }} className="py-1 text-xs text-muted-foreground">
              Loading…
            </p>
          )}
          {node?.loaded && node.entries.length === 0 && (
            <p style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }} className="py-1 text-xs text-muted-foreground">
              Empty
            </p>
          )}
          {node?.entries.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const FileTreeNode = memo(FileTreeNodeInner)

async function handleTreeDrop(
  event: DragEvent,
  destDir: string,
  importDroppedPaths: (sourcePaths: string[], destDir: string) => Promise<string[]>,
  attachFiles: (files: AgentFileRef[]) => void,
  moveDropped: (sourcePath: string, destDir: string) => Promise<string | null>
): Promise<void> {
  const internal = parseWorkbenchPath(event.dataTransfer.getData(WORKBENCH_PATH_MIME))
  if (internal) {
    if (internal.path !== destDir) await moveDropped(internal.path, destDir)
    return
  }

  const refs = await refsFromDropEvent(event)
  const osPaths = refs.map((ref) => ref.path).filter((path) => path !== destDir)
  if (osPaths.length === 0) {
    if (refs.length > 0) attachFiles(refs)
    return
  }

  const copied = await importDroppedPaths(osPaths, destDir)
  if (copied.length > 0) {
    attachFiles(
      copied.map((path) => {
        const name = path.split(/[\\/]/).pop() || path
        const original = refs.find((ref) => ref.name === name)
        return { path, name, kind: original?.kind ?? 'file' }
      })
    )
    return
  }
  if (refs.length > 0) attachFiles(refs)
}

function FileGlyph({ path }: { path: string }) {
  const spec = fileIconFor(path)
  const Icon = spec.icon
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', spec.className)} />
}

function HitIcon({ path }: { path: string }) {
  return <FileGlyph path={path} />
}

