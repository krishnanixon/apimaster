import { Check, GitCompare, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { parseUnifiedDiff } from '@shared/lib/unified-diff'
import { Button } from '@/shared/components/ui/button'
import { useAgentStore } from '../stores/agent.store'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { CodeDiffView } from './CodeDiffView'

export function ChangesPanel() {
  const patches = useAgentStore((s) => s.patches)
  const revertPatch = useAgentStore((s) => s.revertPatch)
  const revertLast = useAgentStore((s) => s.revertLast)
  const acceptPatch = useAgentStore((s) => s.acceptPatch)
  const acceptHunk = useAgentStore((s) => s.acceptHunk)
  const rejectHunk = useAgentStore((s) => s.rejectHunk)
  const acceptAllPatches = useAgentStore((s) => s.acceptAllPatches)
  const openFileByPath = useCodeEditorStore((s) => s.openFileByPath)
  const rootPath = useCodeEditorStore((s) => s.rootPath)
  const pending = patches.filter((patch) => patch.status === 'pending')
  const applied = patches.filter((patch) => patch.status === 'applied')
  const pendingCount = pending.length

  if (patches.length === 0) {
    return (
      <div className="wb-empty">
        <GitCompare />
        <div>
          <p className="font-medium text-[var(--wb-fg)]">No staged agent edits</p>
          <p className="mt-1.5 leading-relaxed">
            When the agent patches or deletes files, they land here first. Accept to write them to
            disk, or reject to discard. Pending changes and checkpoints survive restart.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--wb-border)] bg-[var(--wb-sidebar)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--wb-muted)]">
            Changes ({patches.length}
            {pendingCount ? ` · ${pendingCount} pending` : ''})
          </p>
          {pendingCount > 0 ? (
            <p className="mt-0.5 text-[10px] text-[var(--wb-warn)]">
              Staged only — tests and terminal need approval to apply first
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {pendingCount > 0 ? (
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={async () => {
                const count = await acceptAllPatches()
                if (count > 0) toast.success(`Accepted ${count} file${count === 1 ? '' : 's'}`)
                else toast.error('Nothing to accept')
              }}
            >
              <Check className="h-3 w-3" /> Accept all
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={async () => {
              const ok = await revertLast()
              if (ok) toast.success('Last change discarded')
              else toast.error('Nothing to revert')
            }}
          >
            <Undo2 className="h-3 w-3" /> Revert last
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {pendingCount > 0 ? (
          <p className="border-b border-border px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Pending ({pendingCount})
          </p>
        ) : null}
        {pending.map((patch) => (
          <PatchRow
            key={patch.id}
            patch={patch}
            rootPath={rootPath}
            openFileByPath={openFileByPath}
            acceptPatch={acceptPatch}
            acceptHunk={acceptHunk}
            rejectHunk={rejectHunk}
            revertPatch={revertPatch}
          />
        ))}
        {applied.length > 0 ? (
          <p className="border-b border-border px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Applied ({applied.length})
          </p>
        ) : null}
        {applied.map((patch) => (
          <PatchRow
            key={patch.id}
            patch={patch}
            rootPath={rootPath}
            openFileByPath={openFileByPath}
            acceptPatch={acceptPatch}
            acceptHunk={acceptHunk}
            rejectHunk={rejectHunk}
            revertPatch={revertPatch}
          />
        ))}
      </div>
    </div>
  )
}

function PatchRow({
  patch,
  rootPath,
  openFileByPath,
  acceptPatch,
  acceptHunk,
  rejectHunk,
  revertPatch
}: {
  patch: import('@shared/types/agent').AgentPatchRecord
  rootPath: string | null
  openFileByPath: (path: string) => Promise<void> | void
  acceptPatch: (id: string) => Promise<boolean>
  acceptHunk: (id: string, hunkIndex: number) => Promise<boolean>
  rejectHunk: (id: string, hunkIndex: number) => Promise<boolean>
  revertPatch: (id: string) => Promise<boolean>
}) {
  let hunks = 0
  try {
    hunks = patch.deleted ? 0 : parseUnifiedDiff(patch.diff).hunks.length
  } catch {
    hunks = 0
  }

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <button
          type="button"
          className="min-w-0 truncate text-left text-xs hover:underline"
          onClick={() => {
            const abs = rootPath ? `${rootPath}/${patch.path}` : patch.path
            void openFileByPath(abs)
          }}
        >
          {patch.path}
          {patch.created ? <span className="ml-1.5 text-[10px] text-sky-500">New</span> : null}
          {patch.deleted ? <span className="ml-1.5 text-[10px] text-red-400">Delete</span> : null}
          {patch.status === 'pending' ? (
            <span className="ml-1.5 text-[10px] uppercase text-amber-500">Pending</span>
          ) : (
            <span className="ml-1.5 text-[10px] uppercase text-emerald-500">Applied</span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {patch.status === 'pending' ? (
            <Button
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={async () => {
                const ok = await acceptPatch(patch.id)
                if (ok) toast.success(`Accepted ${patch.path}`)
                else toast.error('Could not accept')
              }}
            >
              Accept
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-destructive"
            onClick={async () => {
              const ok = await revertPatch(patch.id)
              if (ok)
                toast.success(
                  patch.status === 'pending' ? `Rejected ${patch.path}` : `Reverted ${patch.path}`
                )
              else toast.error('Could not revert')
            }}
          >
            {patch.status === 'pending' ? 'Reject' : 'Revert'}
          </Button>
        </div>
      </div>
      {patch.status === 'pending' && hunks > 1 ? (
        <div className="flex flex-wrap gap-1 border-b border-[var(--wb-border)] px-3 py-1.5">
          {Array.from({ length: hunks }, (_, index) => (
            <div key={index} className="inline-flex items-center gap-1 rounded border border-[var(--wb-border)] px-1.5 py-0.5">
              <span className="text-[10px] text-[var(--wb-muted)]">Hunk {index + 1}</span>
              <button
                type="button"
                className="text-[10px] text-emerald-400 hover:underline"
                onClick={async () => {
                  const ok = await acceptHunk(patch.id, index)
                  if (ok) toast.success(`Accepted hunk ${index + 1}`)
                  else toast.error('Could not accept hunk')
                }}
              >
                Accept
              </button>
              <button
                type="button"
                className="text-[10px] text-red-400 hover:underline"
                onClick={async () => {
                  const ok = await rejectHunk(patch.id, index)
                  if (ok) toast.success(`Rejected hunk ${index + 1}`)
                  else toast.error('Could not reject hunk')
                }}
              >
                Reject
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <CodeDiffView diff={patch.diff} maxHeightClass="max-h-48" />
    </div>
  )
}
