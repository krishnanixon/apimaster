import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  List,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  GitBranchPlus,
  Trash2
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import type { GitFileStatus, GitStatusEntry } from '@shared/types/git'
import { useGitStore } from '../stores/git.store'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { fileIconFor } from '../lib/file-icons'
import { dirNameOf, fileNameOf } from '../lib/paths'
import { ConfirmDialog } from './ConfirmDialog'
import { NamePromptDialog } from './NamePromptDialog'

function statusLetter(status: GitFileStatus): string {
  if (status === 'untracked') return 'U'
  if (status === 'deleted') return 'D'
  if (status === 'added') return 'A'
  if (status === 'renamed') return 'R'
  if (status === 'conflicted') return 'C'
  return 'M'
}

function statusClass(status: GitFileStatus): string {
  if (status === 'untracked' || status === 'added') return 'text-emerald-400'
  if (status === 'deleted') return 'text-red-400'
  if (status === 'conflicted') return 'text-orange-400'
  if (status === 'renamed') return 'text-sky-400'
  return 'text-amber-400'
}

function IconButton({
  title,
  disabled,
  onClick,
  children
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)] disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function GitPanel() {
  const snapshot = useGitStore((s) => s.snapshot)
  const log = useGitStore((s) => s.log)
  const stashes = useGitStore((s) => s.stashes)
  const selectedPath = useGitStore((s) => s.selectedPath)
  const commitMessage = useGitStore((s) => s.commitMessage)
  const loading = useGitStore((s) => s.loading)
  const mutating = useGitStore((s) => s.mutating)
  const refresh = useGitStore((s) => s.refresh)
  const initialize = useGitStore((s) => s.initialize)
  const selectFile = useGitStore((s) => s.selectFile)
  const setCommitMessage = useGitStore((s) => s.setCommitMessage)
  const stage = useGitStore((s) => s.stage)
  const unstage = useGitStore((s) => s.unstage)
  const stageAll = useGitStore((s) => s.stageAll)
  const unstageAll = useGitStore((s) => s.unstageAll)
  const discardAll = useGitStore((s) => s.discardAll)
  const commit = useGitStore((s) => s.commit)
  const commitAndPush = useGitStore((s) => s.commitAndPush)
  const checkout = useGitStore((s) => s.checkout)
  const createBranch = useGitStore((s) => s.createBranch)
  const discard = useGitStore((s) => s.discard)
  const fetchRemote = useGitStore((s) => s.fetch)
  const pull = useGitStore((s) => s.pull)
  const push = useGitStore((s) => s.push)
  const stash = useGitStore((s) => s.stash)
  const stashPop = useGitStore((s) => s.stashPop)
  const applyStash = useGitStore((s) => s.applyStash)
  const dropStash = useGitStore((s) => s.dropStash)
  const openDiff = useCodeEditorStore((s) => s.openDiff)

  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
  const [commitsOpen, setCommitsOpen] = useState(false)
  const [stashesOpen, setStashesOpen] = useState(false)
  const [discardConfirm, setDiscardConfirm] = useState(false)
  const [createBranchOpen, setCreateBranchOpen] = useState(false)
  const [dropStashRef, setDropStashRef] = useState<string | null>(null)

  const staged = useMemo(() => snapshot?.entries.filter((e) => e.staged) ?? [], [snapshot])
  const changes = useMemo(() => {
    if (!snapshot) return []
    const unstaged = snapshot.entries.filter((e) => e.unstaged && !e.staged)
    const both = snapshot.entries.filter((e) => e.unstaged && e.staged)
    const untracked = snapshot.entries.filter((e) => e.status === 'untracked')
    const seen = new Set(unstaged.map((e) => e.path))
    const extra = [
      ...both.filter((e) => !seen.has(e.path)),
      ...untracked.filter((e) => !seen.has(e.path) && !e.staged)
    ]
    return [...unstaged, ...extra]
  }, [snapshot])

  const canCommit = Boolean(commitMessage.trim()) && staged.length > 0 && !mutating

  const openCompare = async (entry: GitStatusEntry, stagedEntry: boolean) => {
    await selectFile(entry, stagedEntry)
    await openDiff(entry.path)
  }

  const onCommitKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (canCommit) void commit()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px] text-[var(--wb-fg)]">
      <div className="flex h-8 shrink-0 items-center justify-between gap-1 border-b border-[var(--wb-border)] px-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wb-muted)]">
          Changes
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton title="Refresh" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </IconButton>
          <IconButton
            title="Stage all changes"
            disabled={mutating || changes.length === 0}
            onClick={() => void stageAll()}
          >
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            title="Discard all changes"
            disabled={mutating || changes.length === 0}
            onClick={() => setDiscardConfirm(true)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="More actions"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
              >
                <Ellipsis className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled={mutating} onSelect={() => void fetchRemote()}>
                <Download className="h-3.5 w-3.5" /> Fetch
              </DropdownMenuItem>
              <DropdownMenuItem disabled={mutating} onSelect={() => void pull()}>
                <ArrowDownToLine className="h-3.5 w-3.5" /> Pull
              </DropdownMenuItem>
              <DropdownMenuItem disabled={mutating} onSelect={() => void push()}>
                <ArrowUpFromLine className="h-3.5 w-3.5" /> Push
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={mutating} onSelect={() => void stash()}>
                <Archive className="h-3.5 w-3.5" /> Stash
              </DropdownMenuItem>
              <DropdownMenuItem disabled={mutating} onSelect={() => void stashPop()}>
                Pop stash
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={mutating || staged.length === 0} onSelect={() => void unstageAll()}>
                <Minus className="h-3.5 w-3.5" /> Unstage all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading && !snapshot ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--wb-muted)]">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading repository…
        </div>
      ) : !snapshot?.available ? (
        <div className="space-y-3 px-3 py-4 text-xs text-[var(--wb-muted)]">
          <p>{snapshot?.error ?? 'Open a Git repository to see changes.'}</p>
          {snapshot?.error?.includes('not a Git repository') ? (
            <Button size="sm" variant="outline" className="h-7" disabled={mutating} onClick={() => void initialize()}>
              <GitBranchPlus className="mr-1.5 h-3.5 w-3.5" /> Initialize Repository
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-2 border-b border-[var(--wb-border)] px-2 py-2">
            <div className="flex items-center gap-1.5">
              <List className="h-3.5 w-3.5 shrink-0 text-[var(--wb-muted)]" />
              <select
                className="h-7 min-w-0 flex-1 truncate rounded border border-[var(--wb-border)] bg-[var(--wb-editor)] px-2 text-[12px]"
                value={snapshot.branch ?? ''}
                disabled={mutating}
                onChange={(e) => void checkout(e.target.value)}
                title="Current branch"
              >
                {snapshot.branches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                    {snapshot.ahead > 0 || snapshot.behind > 0
                      ? branch === snapshot.branch
                        ? ` (${snapshot.behind > 0 ? `↓${snapshot.behind}` : ''}${snapshot.ahead > 0 ? `↑${snapshot.ahead}` : ''})`
                        : ''
                      : ''}
                  </option>
                ))}
              </select>
              <IconButton title="Create branch" disabled={mutating} onClick={() => setCreateBranchOpen(true)}>
                <GitBranchPlus className="h-3.5 w-3.5" />
              </IconButton>
            </div>

            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={onCommitKeyDown}
              placeholder="Message (Ctrl+Enter to commit)"
              rows={3}
              className="w-full resize-none rounded border border-[var(--wb-border)] bg-[var(--wb-editor)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--wb-accent)]"
            />

            <div className="flex gap-0">
              <Button
                size="sm"
                className="h-7 flex-1 rounded-r-none"
                disabled={!canCommit}
                onClick={() => void commit()}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Commit
                {staged.length > 0 ? ` (${staged.length})` : ''}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="h-7 w-7 shrink-0 rounded-l-none border-l border-primary/30 px-0"
                    disabled={!canCommit}
                    title="Commit options"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem disabled={!canCommit} onSelect={() => void commit()}>
                    Commit
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!canCommit} onSelect={() => void commitAndPush()}>
                    Commit & Push
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {staged.length > 0 ? (
              <Section
                title="Staged Changes"
                count={staged.length}
                open={stagedOpen}
                onToggle={() => setStagedOpen((v) => !v)}
                actions={
                  <IconButton title="Unstage all" disabled={mutating} onClick={() => void unstageAll()}>
                    <Minus className="h-3.5 w-3.5" />
                  </IconButton>
                }
              >
                {staged.map((entry) => (
                  <GitRow
                    key={`s-${entry.path}`}
                    entry={entry}
                    active={selectedPath === entry.path}
                    onSelect={() => void openCompare(entry, true)}
                    actionLabel="Unstage"
                    actionIcon={<Minus className="h-3 w-3" />}
                    onAction={() => void unstage(entry.path)}
                  />
                ))}
              </Section>
            ) : null}

            <Section
              title="Changes"
              count={changes.length}
              open={changesOpen}
              onToggle={() => setChangesOpen((v) => !v)}
              actions={
                <>
                  <IconButton
                    title="Stage all changes"
                    disabled={mutating || changes.length === 0}
                    onClick={() => void stageAll()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    title="Discard all changes"
                    disabled={mutating || changes.length === 0}
                    onClick={() => setDiscardConfirm(true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </IconButton>
                </>
              }
            >
              {changes.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-[var(--wb-muted)]">No changes</p>
              ) : (
                changes.map((entry) => (
                  <GitRow
                    key={`c-${entry.path}`}
                    entry={entry}
                    active={selectedPath === entry.path}
                    onSelect={() => void openCompare(entry, false)}
                    actionLabel="Stage"
                    actionIcon={<Plus className="h-3 w-3" />}
                    onAction={() => void stage(entry.path)}
                    secondaryLabel={entry.status === 'untracked' ? undefined : 'Discard'}
                    onSecondary={
                      entry.status === 'untracked' ? undefined : () => void discard(entry.path)
                    }
                  />
                ))
              )}
            </Section>

            {stashes.length > 0 ? (
              <Section
                title="Stashes"
                count={stashes.length}
                open={stashesOpen}
                onToggle={() => setStashesOpen((value) => !value)}
              >
                {stashes.map((stash) => (
                  <div
                    key={stash.ref}
                    className="group flex min-h-9 items-center gap-1 px-2 py-1 hover:bg-[var(--wb-hover)]"
                  >
                    <Archive className="h-3.5 w-3.5 shrink-0 text-[var(--wb-muted)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px]" title={stash.message}>
                        {stash.message || stash.ref}
                      </p>
                      <p className="truncate text-[10px] text-[var(--wb-muted)]">
                        {stash.ref} · {stash.relativeDate}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded px-1 py-0.5 text-[10px] text-[var(--wb-muted)] opacity-60 hover:bg-[var(--wb-editor)] hover:text-[var(--wb-fg)] focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                      disabled={mutating}
                      onClick={() => void applyStash(stash.ref)}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="rounded px-1 py-0.5 text-[10px] text-[var(--wb-muted)] opacity-60 hover:bg-[var(--wb-editor)] hover:text-[var(--wb-fg)] focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                      disabled={mutating}
                      onClick={() => void applyStash(stash.ref, true)}
                    >
                      Pop
                    </button>
                    <button
                      type="button"
                      title="Drop stash"
                      className="rounded p-0.5 text-[var(--wb-muted)] opacity-60 hover:bg-[var(--wb-editor)] hover:text-red-400 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                      disabled={mutating}
                      onClick={() => setDropStashRef(stash.ref)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </Section>
            ) : null}

            <Section
              title="Commits"
              count={log.length}
              open={commitsOpen}
              onToggle={() => setCommitsOpen((v) => !v)}
            >
              {log.slice(0, 12).map((entry) => (
                <div key={entry.hash} className="px-3 py-1.5 hover:bg-[var(--wb-hover)]">
                  <p className="truncate text-[12px]">{entry.subject}</p>
                  <p className="truncate text-[11px] text-[var(--wb-muted)]">
                    {entry.author} · {entry.hash.slice(0, 7)}
                  </p>
                </div>
              ))}
            </Section>
          </div>
        </>
      )}

      <ConfirmDialog
        open={discardConfirm}
        onOpenChange={setDiscardConfirm}
        title="Discard all changes?"
        description="This will discard unstaged modifications to tracked files. Untracked files are not deleted."
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={() => {
          setDiscardConfirm(false)
          void discardAll()
        }}
      />
      <ConfirmDialog
        open={Boolean(dropStashRef)}
        onOpenChange={(open) => !open && setDropStashRef(null)}
        title="Drop stash?"
        description={`${dropStashRef ?? 'This stash'} will be permanently removed.`}
        confirmLabel="Drop"
        variant="destructive"
        onConfirm={() => {
          const ref = dropStashRef
          setDropStashRef(null)
          if (ref) void dropStash(ref)
        }}
      />
      <NamePromptDialog
        open={createBranchOpen}
        onOpenChange={setCreateBranchOpen}
        title="Create branch"
        description="Create a new branch from the current HEAD and check it out."
        confirmLabel="Create Branch"
        onSubmit={(name) => void createBranch(name)}
      />
    </div>
  )
}

function Section({
  title,
  count,
  open,
  onToggle,
  actions,
  children
}: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="border-b border-[var(--wb-border)]/70">
      <div className="group flex h-7 items-center gap-0.5 px-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--wb-hover)]"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--wb-muted)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--wb-muted)]" />
          )}
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--wb-muted)]">
            {title}
          </span>
          <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--wb-badge)] px-1 text-[10px] leading-none text-white">
            {count}
          </span>
        </button>
        {actions ? (
          <div className="flex shrink-0 items-center opacity-70 group-hover:opacity-100 group-focus-within:opacity-100">
            {actions}
          </div>
        ) : null}
      </div>
      {open ? children : null}
    </div>
  )
}

function GitRow({
  entry,
  active,
  onSelect,
  actionLabel,
  actionIcon,
  onAction,
  secondaryLabel,
  onSecondary
}: {
  entry: GitStatusEntry
  active: boolean
  onSelect: () => void
  actionLabel: string
  actionIcon: ReactNode
  onAction: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}) {
  const name = fileNameOf(entry.path)
  const dir = dirNameOf(entry.path)
  const icon = fileIconFor(entry.path)
  const Icon = icon.icon
  const letter = statusLetter(entry.status)

  return (
    <div
      className={cn(
        'group flex h-6 items-center gap-0.5 px-1 hover:bg-[var(--wb-hover)]',
        active && 'bg-[var(--wb-active)]'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-left"
        title={`Compare ${entry.path}`}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', icon.className)} strokeWidth={1.75} />
        <span className="min-w-0 truncate text-[12px]">{name}</span>
        {dir ? (
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--wb-muted)]">{dir}</span>
        ) : (
          <span className="flex-1" />
        )}
        <span className={cn('w-3 shrink-0 text-right font-mono text-[11px] font-medium', statusClass(entry.status))}>
          {letter}
        </span>
      </button>
      <button
        type="button"
        title={actionLabel}
        onClick={(e) => {
          e.stopPropagation()
          onAction()
        }}
        className="rounded p-0.5 text-[var(--wb-muted)] opacity-0 hover:bg-[var(--wb-editor)] hover:text-[var(--wb-fg)] focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {actionIcon}
      </button>
      {onSecondary ? (
        <button
          type="button"
          title={secondaryLabel}
          onClick={(e) => {
            e.stopPropagation()
            onSecondary()
          }}
          className="rounded p-0.5 text-[var(--wb-muted)] opacity-0 hover:bg-[var(--wb-editor)] hover:text-red-400 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  )
}
