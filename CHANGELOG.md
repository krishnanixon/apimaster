# Changelog

All notable product changes and behavior changes are recorded here.

## Unreleased

- Auto-update: the app checks GitHub releases on launch and every 6 hours. On Windows and
  Linux (AppImage) it downloads updates in the background and offers **Restart and update**.
  On macOS it shows a notice with a download link. **Settings → About** shows the installed
  version (it was hard-coded as v1.0.0), a **Check for updates** button, and a toggle for
  automatic checks. With the toggle off, the app makes no update requests unless you click
  the button.
- macOS builds are ad-hoc signed, so Apple silicon Macs no longer report the app as
  "damaged". Developer ID signing and notarization turn on through CI secrets
  (see CONTRIBUTING.md → Releases). Mac releases now include a `.zip` as well as the `.dmg`.
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
