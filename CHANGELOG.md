# Changelog

All notable product changes and behavior changes are recorded here.

## Unreleased

- Collections can live as files in a folder you choose, for example inside your git repo.
  **Save to folder…** converts an existing collection; **Open folder as collection** opens
  one. Each request is a `<name>.request.yaml` file, folders are subfolders, settings are in
  `shurikly.collection.yaml`, and the collection's environments are in `environments/`.
  Output is stable (fixed key order, 2-space indent, block text for bodies and scripts, no
  timestamps), so diffs stay small. Format described in `docs/COLLECTION_FILES.md`.
- Linked collections are saved to their folder as you edit (debounced, atomic writes) and
  reloaded when the files change on disk. Open tabs with unsaved edits keep them; if the
  collection itself has changes not yet saved, you choose which version to keep. A file that
  fails to parse is reported and skipped, and is never overwritten.
- Secret values are never written to collection folders: variables marked secret (new lock
  toggle in the environment editor), credential-looking variables, headers and form fields
  (`Authorization`, `X-Api-Key`, `password`, `…token`), and auth tokens and passwords.
  Their keys are written; values stay in the encrypted local workspace. `{{variable}}`
  references are written as is.
- Collections not linked to a folder are stored exactly as before. Tabs, history, and UI
  state stay in the local workspace.
- Deleting a folder-linked collection removes it from Shurikly and leaves its files on disk.

- Security: pre-request and test scripts now run in a QuickJS (WebAssembly) sandbox on a
  worker thread instead of `node:vm`. A script from an imported collection could previously
  reach the main process through `pm.test.constructor('return process')()` and run arbitrary
  code. Scripts still time out after 2 seconds (a stuck worker is killed) and are now capped
  at 32 MB of memory. Scripts no longer block the main process while they run.
- Scripts support more of the Postman `pm` API: `pm.response.to.have.status/header/body`,
  `pm.response.to.be.ok` and other status checks, `pm.response.headers.get/has`,
  chai-style `pm.expect` chains (`to.eql`, `to.include`, `to.have.property`, `to.be.a`,
  `to.be.above/below`, `not`, `deep`, and more), `pm.collectionVariables`, `pm.globals`,
  `pm.variables.get` resolving across scopes, and the legacy `tests[...]` object.
  `pm.response.status` stays numeric for existing scripts; `pm.sendRequest` is not available.
- Script `console.log/info/warn/error` output is captured and returned with the results
  (`logs`) instead of being discarded.
- Open-source project setup: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, issue and pull request templates, Dependabot, and CI on macOS,
  Windows, and Linux. Tagged releases build installers for all three platforms.
- Help menu links to the source repository and the issue tracker.
- Rebranded the app to Shurikly and switched the desktop/UI logo to `public/shurikly.png`.
- New data folder: `shurikly` (collections from previous app names are not migrated).
- Split into a standalone API client. All other modules (chat, documents, knowledge,
  flows, architecture, presentations, code editor, terminal, database/vector/RAG studios,
  VPS, vault, notepad, clipboard, voice) were removed.
- Replaced the Prisma/SQLite database with JSON files for settings and AI usage.
- Single main window with a slim title bar (Requests, Bug Reports, Settings).

## 1.0.0 - 2026-08-24

### Added

- Diagnostics center with searchable application logs.
- Local bug reports with severity, category, reproduction steps, and optional diagnostics.
- Global renderer error and unhandled-promise logging.
- Credential redaction for diagnostic attachments.

### Behavior notes

- Reports remain on the device and are not submitted to an external service automatically.
