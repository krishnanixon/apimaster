import { useEffect, useMemo, useState } from 'react'
import { FolderGit2, Globe, Pencil, Plus, Trash2, Copy } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { KeyValueTable } from './KeyValueTable'
import { NamePromptDialog } from './NamePromptDialog'
import { ConfirmDialog } from './ConfirmDialog'

interface EnvironmentManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSelectedId?: string | null
}

export function EnvironmentManagerDialog({ open, onOpenChange, initialSelectedId }: EnvironmentManagerDialogProps) {
  const environments = useApiStudioStore((s) => s.environments)
  const createEnvironment = useApiStudioStore((s) => s.createEnvironment)
  const renameEnvironment = useApiStudioStore((s) => s.renameEnvironment)
  const deleteEnvironment = useApiStudioStore((s) => s.deleteEnvironment)
  const duplicateEnvironment = useApiStudioStore((s) => s.duplicateEnvironment)
  const updateEnvironmentVariables = useApiStudioStore((s) => s.updateEnvironmentVariables)
  const activeEnvironmentId = useApiStudioStore((s) => s.activeEnvironmentId)
  const setActiveEnvironment = useApiStudioStore((s) => s.setActiveEnvironment)
  const setEnvironmentCollection = useApiStudioStore((s) => s.setEnvironmentCollection)
  const collections = useApiStudioStore((s) => s.collections)
  const folderCollections = useMemo(() => collections.filter((c) => c.folder?.path), [collections])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (open) setSelectedId(initialSelectedId ?? environments[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selected = environments.find((e) => e.id === selectedId) ?? null
  const selectedHome = selected?.collectionId ? folderCollections.find((c) => c.id === selected.collectionId) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Environments</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[200px_1fr] gap-4" style={{ height: 380 }}>
          <div className="flex min-h-0 flex-col rounded-lg border border-border">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">Environments</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="New environment" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {environments.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No environments yet.</p>
              ) : (
                <div className="space-y-0.5 p-1.5">
                  {environments.map((env) => (
                    <div
                      key={env.id}
                      className={cn(
                        'group flex items-center gap-1 rounded-md px-1.5 py-1.5 text-xs hover:bg-accent',
                        selectedId === env.id && 'bg-accent'
                      )}
                    >
                      <button onClick={() => setSelectedId(env.id)} className="flex flex-1 items-center gap-1.5 overflow-hidden text-left">
                        {activeEnvironmentId === env.id && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Active" />}
                        <span className="truncate">{env.name}</span>
                        {env.collectionId && (
                          <FolderGit2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Saved in a collection folder" />
                        )}
                      </button>
                      <button
                        onClick={() => setRenameTarget({ id: env.id, name: env.name })}
                        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background group-hover:flex"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => duplicateEnvironment(env.id)}
                        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background group-hover:flex"
                        title="Duplicate"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: env.id, name: env.name })}
                        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-destructive hover:bg-background group-hover:flex"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-col">
            {selected ? (
              <>
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{selected.name}</span>
                  {(folderCollections.length > 0 || selected.collectionId) && (
                    <select
                      className="ml-auto h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-xs"
                      value={selected.collectionId ?? ''}
                      onChange={(e) => setEnvironmentCollection(selected.id, e.target.value || null)}
                      title="Where this environment is stored"
                    >
                      <option value="">This machine only</option>
                      {folderCollections.map((c) => (
                        <option key={c.id} value={c.id}>
                          Folder of “{c.name}”
                        </option>
                      ))}
                      {selected.collectionId && !selectedHome && <option value={selected.collectionId}>Unlinked collection</option>}
                    </select>
                  )}
                  <Button
                    size="sm"
                    variant={activeEnvironmentId === selected.id ? 'secondary' : 'outline'}
                    onClick={() => setActiveEnvironment(activeEnvironmentId === selected.id ? null : selected.id)}
                  >
                    {activeEnvironmentId === selected.id ? 'Active' : 'Set as Active'}
                  </Button>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <KeyValueTable
                    pairs={selected.variables}
                    onChange={(variables) => updateEnvironmentVariables(selected.id, variables)}
                    keyPlaceholder="Variable"
                    valuePlaceholder="Value"
                    secretToggle
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Reference these anywhere in a request as <code className="rounded bg-muted px-1 py-0.5">{'{{variableName}}'}</code>.
                    {selectedHome
                      ? ` Saved to ${selectedHome.folder!.path}/environments. Locked values stay on this machine; only their names are written.`
                      : ' Locked values are never written to a collection folder.'}
                  </p>
                </ScrollArea>
              </>
            ) : (
              <EmptyState
                icon={<Globe className="h-5 w-5" />}
                title="No environment selected"
                description="Create an environment to define reusable variables like base URLs and tokens."
                action={
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <Plus className="h-3.5 w-3.5" /> New Environment
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </DialogContent>

      <NamePromptDialog
        open={creating}
        onOpenChange={setCreating}
        title="New Environment"
        confirmLabel="Create"
        onSubmit={(name) => setSelectedId(createEnvironment(name).id)}
      />

      <NamePromptDialog
        open={renameTarget !== null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        title="Rename Environment"
        initialValue={renameTarget?.name ?? ''}
        confirmLabel="Rename"
        onSubmit={(name) => {
          if (renameTarget) renameEnvironment(renameTarget.id, name)
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone."
        onConfirm={() => {
          if (!deleteTarget) return
          deleteEnvironment(deleteTarget.id)
          if (selectedId === deleteTarget.id) setSelectedId(null)
        }}
      />
    </Dialog>
  )
}
