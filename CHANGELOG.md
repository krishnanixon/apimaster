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
- Network settings (Settings → Network): no proxy, the system proxy (OS / PAC, resolved
  through Chromium), or a custom HTTP/HTTPS proxy with optional authentication and a
  NO_PROXY-style bypass list (`localhost`, `.corp.example`, `*.internal`, `10.0.0.0/8`,
  `host:port`, `<local>`, `*`). The proxy password is stored with the OS keychain
  (safeStorage), never in the settings file. SOCKS proxies from a PAC file are not
  supported yet (requests go direct and a warning is logged).
- SSL/TLS: a global "Verify SSL certificates" switch (on by default) with a per-request
  override in the request's Settings tab, trust for the operating system's root
  certificates, extra CA certificate files, and client certificates (PEM cert + key, or
  PFX/P12 with an encrypted passphrase) matched by host (`*.example.com`, optional port).
- TLS, proxy, DNS, connection and timeout failures are explained in the response view
  (e.g. "The server uses a self-signed certificate"), with a one-click "Don't verify SSL
  for this request" for certificate errors.
- Cookie jar: cookies from `Set-Cookie` responses — including each hop of a redirect — are
  saved per workspace (`data/cookies/default.json`) and sent with matching requests. The
  request editor, collection runs, AI Engineer runs, MCP tools and WebSockets share the
  jar. A cookie manager (cookie button in the request toolbar) views, edits and deletes
  cookies by domain; a request can opt out with "Don't send cookies".
- Redirects are now followed by the request engine itself (up to 10), so every hop uses
  the right proxy, TLS options and cookies. `Authorization` and a manual `Cookie` header
  are dropped when a redirect leaves the original origin; 303 (and POST on 301/302) switch
  to GET as in browsers.
- WebSockets now run in the main process (`ws`), so they send the request's headers, auth,
  query params and cookies and use the proxy and TLS settings. WebSocket requests gained
  Params, Headers, Auth and Settings sections next to the message log. Close codes and
  connection errors are shown in the log.
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
