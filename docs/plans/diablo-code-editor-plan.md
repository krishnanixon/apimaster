# Diablo Code Editor — Audit and Delivery Plan

## Outcome

Diablo already has a functional desktop code workbench. The next releases should harden and connect the existing systems instead of replacing them or starting a second editor stack.

## Current implementation

| Capability | Status | Evidence / notes |
|---|---|---|
| Workspace, explorer, tabs, save, search | Built | Workspace-scoped Electron file service and Zustand editor state |
| Code editor | Built | CodeMirror 6 workbench with language extensions, formatting, splits, breadcrumbs and outline |
| Terminal | Built | xterm.js and PTY-backed sessions with workspace persistence |
| Git | Built | Status, diff, log, staging, commit, gutter and conflict UI |
| AI chat and model routing | Built | Ask, Edit, Agent, Debug, Plan and Review modes; cloud and Ollama routing |
| Safe AI edits | Built | Unified diffs, pending Changes panel, accept/reject/revert and snapshots |
| Repository intelligence | Built, harden | Tree-sitter index, text/symbol search, ignore rules and incremental file events |
| Context engine | Built, harden | Selection, current file, tabs, dependencies, pinned files, rules, knowledge and Git diffs |
| Language intelligence | Built, harden | TypeScript language client, diagnostics, hover and navigation hooks |
| Inline AI and completion | Built | Inline ask/edit and debounced ghost-text completion |
| Agent tools and permissions | Built | Files, patches, search, diagnostics, terminal, tests, Git, knowledge and MCP registry |
| Cross-studio integrations | Partial | Native tool hooks exist; product workflows need end-to-end UX and tests |

## Delivery roadmap

### Release 1 — Reliability and context clarity

1. Make explicit context references deterministic: `@codebase`, `@git`, `@selection`, `@rules`, files and folders.
2. Show the sources and token budget used for every AI request. **Implemented:** every agent run now records an expandable context card with per-source tokens, files, budget utilization, trimming, model and estimated input cost; the summary persists with chat history.
3. Add integration tests covering open folder → edit → diff → accept → test → revert.
4. Persist conversations and pending changes per workspace. **In progress:** conversations, attachments and compact tool traces now restore per workspace; durable pending patches are next.
5. Add clear empty/error states for missing model, index failure, unavailable Git and stopped terminals.

Acceptance: a user can safely complete a multi-file change, see exactly what context was sent, validate it, and revert it after restart.

### Release 2 — Code intelligence quality

1. Measure index freshness and incrementally re-index create, rename, save and delete events.
2. Add reference/dependency ranking to the existing text and symbol fusion.
3. Finish LSP lifecycle management for TypeScript, Python, Go and Rust.
4. Add definition, references and rename workflows shared by the editor and AI context engine.
5. Add large-repository benchmarks and cancellation.

Acceptance: search and context remain fresh after edits and return relevant definitions/references in medium and large repositories.

### Release 3 — Agent planning and review

1. Introduce structured task steps with pending, active, complete and failed states. **Started:** a local, mode-aware execution plan now reports live tool progress without spending another model request.
2. Require validation criteria in Edit, Debug and Agent modes. **Started:** Agent and Debug cannot finish after a successful edit until a validation tool has been attempted.
3. Add run-level checkpoints. **Started:** completed, failed and cancelled runs can restore all staged or applied file changes, including deleting files created by the run.
3. Add a dedicated AI review result model with severity, category, file and line.
4. Add run history, resumable tasks and a final changed-files/test summary. **Started:** workspace-scoped multi-chat history now restores chat titles, drafts, attachments and compact tool traces; active background runs stay routed to their originating chat.
5. Keep all destructive operations behind explicit permission checks.

Acceptance: complex work exposes its plan, tool activity, patches, validation and remaining risks without hiding autonomous actions.

### Release 4 — Diablo Studio workflows

1. API Studio: generate and validate clients/controllers from saved API definitions.
2. Database Studio: provide schema-only context by default and gate write queries.
3. Requirements: link requirement IDs to plans, patches, tests and completion evidence.
4. MCP: add connection health, per-server tool permissions and audit logs.
5. Browser testing: add an opt-in test loop with screenshots, console and network evidence.

Acceptance: a requirement can flow through plan, implementation, validation and traceability using real API/database context.

## Architectural guardrails

- Keep filesystem, shell, Git, indexing and AI execution in the Electron main process.
- Treat the renderer as untrusted; validate IPC inputs and enforce the active workspace boundary.
- Stage AI edits as patches. Never silently overwrite files.
- Use hybrid retrieval and bounded context; never send an entire repository.
- Keep native, MCP and future plugin tools behind one registry and permission model.
- Add multi-agent execution only after structured single-agent plans are reliable and observable.

## Immediate implementation in this change

- Expanded the context menu with `@git`, `@selection` and `@rules` alongside `@codebase`.
- Added directive parsing that does not mistake email/host text for context references.
- Made `@codebase` force repository search and `@git` force Git-diff retrieval instead of relying on fuzzy query heuristics.
- Added unit coverage for directive discovery and filtering.
- Promoted the context engine's structured summary into agent events instead of reducing it to a filename string.
- Added an expandable, Cursor-style context usage card with token budget progress, source breakdown, clickable files, trimming state, model and estimated input cost.
- Persisted the compact context summary with workspace chat history so token usage remains auditable after restart.

## Token-efficiency optimization

The context pipeline now uses an 8,000-token cloud ceiling and a 2,500-token local-model ceiling. These are maximums, not targets; retrieval should normally stay below them.

- Strip `@codebase`, `@git`, `@selection` and `@rules` before text/symbol search so control words do not reduce retrieval quality.
- Deduplicate identical content when the same file is current, pinned and open in a tab.
- Limit passive open-tab context to four tabs and cap each excerpt at 5,000 characters.
- Return at most eight hybrid text/symbol results per request.
- Cap current files at 8,000 characters and pinned/rules/knowledge chunks at 6,000 characters.
- Preserve selection and pinned-file priority; the agent can use `read_file` when more context is genuinely required.

Efficiency targets:

| Request | Target input context |
|---|---:|
| Inline completion | Under 1,000 tokens |
| Explain selection/current code | Under 3,000 tokens |
| Normal agent task | Under 6,000 tokens |
| Explicit multi-file/codebase task | Hard ceiling 8,000 tokens |
| Local-model request | Hard ceiling 2,500 tokens |

Track `promptTokens`, selected source counts and trimming for every request. If quality falls, improve ranking before increasing the global ceiling.
