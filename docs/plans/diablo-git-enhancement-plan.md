# Diablo Code Editor — Git Capability and UX Plan

## Goal

Make Git inside Diablo fast and safe for everyday work, while keeping advanced history rewriting explicit. The Git panel should answer three questions immediately: what changed, what will be committed, and what action is currently running.

## Capability audit

| Workflow | Status | UX assessment |
|---|---|---|
| Repository detection and initialization | Built | Non-repository folders now offer an Initialize Repository action instead of a dead end. |
| Working tree status | Built | Staged, unstaged, untracked, renamed, deleted and conflicted files are grouped and badged. |
| File diff | Built | Selecting a change opens the editor diff; per-hunk staging is still missing. |
| Stage, unstage and discard | Built | File and bulk actions exist; destructive discard is confirmed. Bulk commands should become one Git operation. |
| Commit and commit/push | Built | Keyboard commit is supported. Amend, sign-off and AI message generation are missing. |
| Branch checkout and creation | Built | Branch creation is now exposed beside the branch selector. Rename, delete and remote tracking remain missing. |
| Fetch, pull and push | Built | Available from the actions menu with ahead/behind counts. Upstream/remotes and operation progress need clearer presentation. |
| Stash | Built | Create, list, apply, pop and confirmed drop are now available. Named-stash input and stash diff preview remain missing. |
| Commit history | Partial | Recent commit subjects and authors are visible; commit detail, changed files, search and graph are missing. |
| Merge conflicts | Partial | Conflict status and editor support exist; a guided ours/theirs/both resolution workflow is needed. |
| Blame and file history | Missing | Add gutter blame, line attribution and file-scoped history. |
| Merge, rebase and cherry-pick | Missing | Add only after conflict UX and abort/continue state handling are reliable. |
| Worktrees and submodules | Missing | Lower priority; useful for advanced agent and monorepo workflows. |

## Implemented in this enhancement

- Added repository initialization across the typed IPC API, Electron Git service, preload bridge, state store and Git panel.
- Added branch creation from the current HEAD with backend branch-name validation.
- Added a typed stash model and parser plus stash list, apply, pop and drop operations.
- Added loading, unavailable-repository and clean-working-tree states.
- Kept stash deletion and bulk discard behind confirmation.
- Made row and stash actions visible to keyboard focus, not only pointer hover.
- Avoided unnecessary log and stash calls when the selected folder is not a Git repository.

## Prioritized delivery plan

### P0 — Correctness and safety

1. Validate every Git IPC payload at the process boundary with the shared runtime schema helpers.
2. Replace repeated per-file stage/unstage loops with atomic `stageAll` and `unstageAll` service commands.
3. Track operation state by action (`fetching`, `pulling`, `committing`) and prevent conflicting operations.
4. Detect in-progress merge, rebase, cherry-pick and revert states; show Continue and Abort actions.
5. Auto-refresh from filesystem and Git index changes, with debounce and cancellation.

Acceptance: the panel cannot launch overlapping mutating commands, never escapes the workspace, and always converges to the actual repository state.

### P1 — Daily developer workflow

1. Add per-hunk and selected-line stage/unstage in the diff editor.
2. Add a branch manager for local/remote grouping, create, rename, delete, publish and upstream selection.
3. Add commit details: changed files, full message, parent links, copy hash and checkout/create branch from commit.
4. Add stash message input and stash diff preview before apply/pop/drop.
5. Add amend, sign-off and an optional AI commit-message generator based only on the staged diff.
6. Add Git actions to explorer and editor context menus with keyboard shortcuts.

Acceptance: common Git work can be completed without a terminal, and every destructive action previews its exact target.

### P2 — Cursor-class code-agent integration

1. Give each agent run a named Git checkpoint containing base commit, branch and touched paths.
2. Show agent-authored changes separately from pre-existing user changes.
3. Let Review mode inspect staged or branch diffs with file/line findings and one-click navigation.
4. Offer an opt-in task branch for autonomous runs and a final commit only after validation passes.
5. Generate pull-request title and summary from committed diff, validation results and requirement links.
6. Count diff/context tokens before AI calls and summarize large diffs by symbol/file before sending details.

Acceptance: an agent can plan, edit, validate and prepare a reviewable branch without mixing its work with unrelated user changes or sending the whole repository to the model.

### P3 — Advanced Git

1. Visual branch graph with search and pagination.
2. Guided merge, rebase and cherry-pick with conflict resolution.
3. File history, gutter blame and compare-with-commit.
4. Worktree manager for parallel tasks.
5. GitHub/GitLab provider features behind optional provider adapters, not hard-coded into core Git.

## UI and UX principles

- Keep primary actions visible; place infrequent or dangerous actions in menus.
- Always show the target branch, remote, file or stash in confirmations.
- Use progressive disclosure: working tree first, history and advanced operations second.
- Preserve panel scroll, expanded sections and selected change per workspace.
- Announce operations and failures accessibly; tooltips must not be the only labels.
- Show actionable recovery for detached HEAD, missing upstream, conflicts and authentication failure.
- Never send Git diffs to AI implicitly. Show which staged files and estimated tokens will be used.

## Efficiency targets

| Operation | Target |
|---|---:|
| Cached status refresh | under 150 ms for a medium repository |
| Panel interaction response | under 100 ms |
| File diff display | under 300 ms, streamed or truncated for very large diffs |
| Background refresh | one debounced refresh per change burst |
| AI commit context | staged diff only, summarized above the configured token ceiling |

Instrument command duration, exit status, changed-path count and refresh causes. Do not log file contents, commit messages or credentials.
