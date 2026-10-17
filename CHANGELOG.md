# Changelog

All notable product changes and behavior changes are recorded here.

## Unreleased

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
