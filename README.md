# APIMaster

A local-first desktop API client with built-in AI. No accounts, no cloud.

> Status: early. The full README, license, and contribution guide come with the
> open-source release.

## Features

- **Requests**: REST, GraphQL, and WebSocket, with params, headers, body (JSON, form, raw, binary), and auth (Bearer, Basic, API key, OAuth 2.0)
- **Collections**: folders, inherited auth and settings, request history, tabs
- **Environments**: `{{variables}}` with per-environment values
- **Scripts & tests**: pre-request scripts, assertions, and a collection runner with reports
- **Import / export**: import Postman and cURL; export Postman, OpenAPI, cURL, and Markdown/HTML API docs
- **Mock Server**: local HTTP mock APIs from collections (`127.0.0.1` by default), parameterized routes, templates, delays, CORS, and request logs
- **AI Engineer (Phase 1)**: analyze collections/OpenAPI, generate baseline (+ optional AI) tests, run via the existing request engine, failure analysis with evidence
- **AI**: generate requests from plain English, explain responses, write tests, fix failing requests, and document collections (OpenAI, Anthropic, Gemini, OpenAI-compatible, or local Ollama)
- **MCP**: a local server so Claude, Cursor, and other agents can list, edit, and send the requests in your live workspace
- **Bug reports**: built-in diagnostics page with recent logs

## Tech stack

Electron, React 19, TypeScript, Vite (electron-vite), TailwindCSS, Zustand, CodeMirror.

All HTTP traffic runs in the main process; the renderer talks to it over typed IPC
(`shared/ipc/api.ts`). Settings and AI usage are stored as JSON in the app's data folder;
API keys are encrypted with Electron `safeStorage`.

## Project layout

```
electron/
  main/
    api-studio/   HTTP client, auth, OAuth 2.0, scripts/tests, AI helpers
    ai/           AI providers, routing, metrics
    infra/        logger, API keys, onboarding, bug reports, JSON store
    ipc/          IPC handlers
    mock-server/  local HTTP mock server runtime
    mcp/          local MCP server for Claude, Cursor, and other agents
    windows/      main window
  preload/        contextBridge API
src/
  modules/api-studio/   the API client UI
  features/             settings, AI settings, onboarding, diagnostics
  shared/               UI components, stores, utilities
shared/                 cross-process types and IPC contract
tests/                  vitest
```

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev
```

```bash
npm run verify   # typecheck + tests + build
npm run dist:mac # or dist:win / dist:linux
```
