# Contributing to Shurikly

Shurikly is a product of **Wansify Ventures**, developed in the open. The Wansify
Ventures team maintains the project, reviews pull requests, and makes releases.

Thanks for helping. This guide covers how to get the app running, how the code is
organized, and what we look for in a pull request.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug** — open an issue with the bug template. Attach the diagnostics
  export from **Bug Reports** in the app if you can (secrets are redacted).
- **Suggest a feature** — open an issue with the feature template and describe the
  problem first, then the solution you have in mind.
- **Send a fix or feature** — for anything larger than a small fix, open an issue
  first so we can agree on the approach before you spend time on it.
- **Improve the docs** — README, `docs/`, and in-app text are all fair game.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Development setup

Requirements:

- Node.js 20 or newer (`.nvmrc` pins the version CI uses)
- npm 10+
- macOS, Windows, or Linux

```bash
git clone https://github.com/shurikly/shurikly.git
cd shurikly
npm install
npm run dev
```

`npm run dev` starts electron-vite with hot reload for the renderer and restarts the
main process on change. No environment variables or accounts are needed. AI features
need a provider key (or a local Ollama), which you add in **Settings → AI** inside the
app; keys are stored encrypted on your machine, never in the repo.

App data (collections, settings, logs) lives in the OS app-data folder under
`shurikly/`. Delete that folder to start from a clean slate.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development mode |
| `npm run typecheck` | Type-check main/preload and renderer |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run verify` | typecheck + tests + build (what CI runs) |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Build an installer into `release/` |

## Project layout

```
electron/main/      Main process: HTTP engine, AI providers, MCP server, mock server, IPC handlers
electron/preload/   contextBridge API exposed to the renderer
src/                Renderer (React): modules/, features/, shared/ UI and stores
shared/             Code used by both processes: types, IPC contract, pure libraries
tests/              Vitest tests
docs/               Feature docs and screenshots
build/              Icons and installer license text
```

Some rules that keep the architecture sane:

- **Network, file system, and secrets stay in the main process.** The renderer talks to
  it only through the typed IPC contract in `shared/ipc/api.ts` and `shared/ipc/channels.ts`.
  When you add a channel, update both files, the handler in `electron/main/ipc/`, and the
  preload bridge.
- **Pure logic goes in `shared/lib/`** so it can be unit-tested without Electron.
- **Product name and IDs** come from `shared/constants/product.ts`; don't hard-code them.

## Pull requests

1. Fork the repo and create a branch from `main` (`fix/…`, `feat/…`, `docs/…`).
2. Keep the change focused. Unrelated refactors belong in their own PR.
3. Add or update tests in `tests/` for behavior changes.
4. Run `npm run verify` and `npm run lint` locally; CI runs the same checks on
   macOS, Windows, and Linux.
5. Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
6. For UI changes, include a screenshot or short clip in the PR description.

### Code style

- TypeScript everywhere; avoid `any` unless there's no reasonable type.
- Prettier formats the code (`npm run format`): no semicolons, single quotes, 100 columns.
- Match the naming and structure of the files around your change.
- Write comments for *why*, not *what*.

### Commit messages

Short imperative subject line (`Fix OAuth refresh when token has no expiry`), optional
body explaining the reason. Reference issues with `Fixes #123` where it applies.

## Releases

Maintainers tag releases as `vX.Y.Z`. The release workflow builds installers for each
platform and attaches them to a draft GitHub release. Bump `version` in `package.json` to
match the tag: the app compares it with the latest release to decide whether to update.

### Auto-update

`electron-builder --publish always` uploads `latest.yml` (Windows), `latest-mac.yml` and
`latest-linux.yml` next to the installers. The app reads them through `electron-updater`
(`electron/main/infra/updater.service.ts`), on launch and every 6 hours, unless the user
turns off **Settings → About → Check for updates automatically**:

- Windows (NSIS) and Linux (AppImage) download the update in the background and offer
  **Restart and update**.
- macOS only shows a notice that links to the release page. Squirrel.Mac can't apply updates
  to an ad-hoc signed app. Once the app is signed with a Developer ID (below), switching
  macOS to `install` in `resolveUpdateMode` (`shared/settings/updates.ts`) turns on in-place
  updates. The release already includes the `.zip` that Squirrel.Mac needs.

Updates only see a release once its draft is published. Publish the release after all three
platform jobs have finished, so every `latest*.yml` is in place.

### macOS signing

There is no Apple Developer account yet, so the Mac app is **ad-hoc signed**
(`build/mac-signing.cjs`). Apple silicon refuses to run unsigned code, and macOS reports an
unsigned download as "damaged". An ad-hoc signature fixes that. Gatekeeper still warns on
first launch because the app isn't notarized: users right-click the app and choose **Open**,
or allow it in System Settings → Privacy & Security.

Check a local build with:

```bash
codesign -dv release/mac/Shurikly.app
```

It should print `Signature=adhoc`.

To switch to Developer ID signing and notarization, add these repository secrets. No code
changes are needed:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded `.p12` export of the *Developer ID Application* certificate |
| `CSC_KEY_PASSWORD` | Password for that `.p12` |
| `APPLE_ID` | Apple ID email of the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | 10-character team ID |

With `CSC_LINK` set, the release workflow enables identity discovery, and
`build/mac-signing.cjs` signs with the hardened runtime and `build/entitlements.mac.plist`.
With the three `APPLE_*` secrets also set, electron-builder notarizes the app.
The local `dist:mac` and `build:mac` scripts keep `CSC_IDENTITY_AUTO_DISCOVERY=false`, so they
always produce an ad-hoc build. To sign locally, set `CSC_NAME` to the certificate name.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
