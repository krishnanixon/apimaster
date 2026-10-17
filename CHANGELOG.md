# Changelog

All notable product changes and behavior changes are recorded here.

## Unreleased

- Import from Insomnia, Bruno and HAR. Insomnia v4 exports (JSON or YAML) and v5 YAML
  collections bring workspaces, request groups as folders, requests, auth and environments
  (each sub-environment merged over the base one). A Bruno collection folder (`bruno.json`,
  nested `.bru` files, `folder.bru`/`collection.bru` settings, `environments/*.bru`) can be
  picked or dropped; `bru.*`/`res.*` script basics and `assert` blocks become `pm` scripts,
  and calls with no equivalent are kept under a comment. HAR 1.2 files become one request per
  entry, grouped by host, with an option to skip images, CSS, JS and fonts.
- The Import dialog detects the format of a dropped or pasted file (Postman, Insomnia, HAR,
  OpenAPI, cURL, Shurikly backup) and shows what was imported and what was skipped, such as
  unsupported auth types or WebSocket/gRPC requests. OpenAPI documents can now be imported
  from the dialog too.
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
