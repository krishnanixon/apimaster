# Tessarok

A production-ready Electron desktop application — an all-in-one AI-powered developer workbench.

## Features

- **AI Chat Interface** — Streaming responses with OpenAI or local Ollama; switch providers from the header
- **Secure API Key Storage** — Encrypted local storage via Electron safeStorage
- **Project Management** — Create, open, archive, duplicate, and track recent projects
- **AI Document Generation** — Generate 10 types of requirement documents in 3 styles
- **Rich Text Editor** — Tiptap editor with headings, tables, images, checklists, code blocks
- **Export** — PDF and DOCX with cover page, TOC, and page numbers; configurable defaults in Settings
- **Auto-save & Versioning** — Configurable auto-save interval with full version history
- **Full-text Search** — Local indexing across documents and conversations
- **Themes** — System-aware color mode, visual themes, and layout density
- **Voice Assistant** — Push-to-talk voice conversations with STT, AI, TTS, tools, and local history

## Tech Stack

- **Electron** — Secure desktop shell (contextIsolation, no nodeIntegration)
- **React 19 + TypeScript** — Modern UI with strict typing
- **Vite + electron-vite** — Fast development and build
- **TailwindCSS** — Utility-first styling with dark mode
- **Zustand** — Lightweight state management
- **SQLite + Prisma** — Local database with ORM
- **Tiptap** — Extensible rich text editor
- **OpenAI API** — Cloud AI chat and document generation
- **Ollama** — Optional local AI for offline use

## Architecture

```
├── electron/
│   ├── main/           # Main process (services, repositories, IPC)
│   └── preload/        # contextBridge API exposure
├── src/
│   ├── app/            # App shell and routing
│   ├── features/       # Feature modules (chat, documents, editor, projects, settings)
│   └── shared/         # Shared components, hooks, stores, utilities
├── shared/             # Cross-process types and IPC contracts
└── prisma/             # Database schema
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Installation

```bash
npm install
npm run db:push
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
npm run dist
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run dist` | Package for distribution |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run typecheck` | TypeScript type checking |

## Configuration

1. Launch the application
2. Open **App Settings** from the sidebar
3. Under **AI**, add your OpenAI API key or connect Ollama for local models
4. Adjust **General** auto-save, **Appearance** theme, and **Export** defaults as needed
5. Per-project context is managed in **Knowledge Base → Overview** inside each project

## Voice Assistant

Enable the **Voice Assistant** module from Apps, then open it from the sidebar.

1. Configure an AI provider under **Settings → AI** (OpenAI key is stored with OS encryption; Ollama is local).
2. Open **Voice Assistant**. Allow microphone access when prompted.
3. Hold the microphone (or **Ctrl/⌘ + Space**), speak, and release.
4. Browser STT keeps audio on-device. Switch to OpenAI Whisper in **Settings → Voice** if you want cloud transcription.
5. System TTS speaks locally. OpenAI TTS is optional.
6. Conversations, notes created by tools, and voice settings live under the app user-data folder. **Delete all local voice data** clears them.

See `src/modules/voice-assistant/ARCHITECTURE.md` for providers, tools, and the future Workbench integration boundary.

## Security

- `contextIsolation: true` — Renderer isolated from Node.js
- `nodeIntegration: false` — No direct Node access in renderer
- `sandbox: true` — Preload script sandboxed
- API keys encrypted via Electron `safeStorage`
- Content Security Policy enforced

## License

MIT
