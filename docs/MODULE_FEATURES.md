# Tessarok — Module Features

Catalog of **currently available** modules and what each one can do today. Enable or disable most tools from **Apps**. Required modules (Dashboard, Projects, Apps, Settings) cannot be turned off.

Modules are grouped the same way as the sidebar: Workspace, Project, Tools, and Utility.

---

## How modules work

| Concept | What it means |
| --- | --- |
| **Workspace (global)** | Available without opening a project. |
| **Project-scoped** | Shown after a project is open. |
| **Hybrid** | Works globally and also under `/project/:id/…` (API Studio, Database, Vector, RAG, Documents). |
| **Apps hub** | Discover, enable, and open tools; review connection status for AI, SQL, Vector, and VPS. |
| **Pop-out windows** | Most tools can open in a dedicated window (⌘/Ctrl-click, Apps → Window, or the window menu). |
| **Command palette** | `⌘K` / `Ctrl+K` jumps to any enabled module and searches the workspace. |

Enable tools from **Apps → Discover**. Configuration lives in **Settings**. Connection health for AI, databases, vectors, and VPS is on **Apps → Connections**.

---

## Workspace

### Dashboard

Workbench home and quick actions.

- Product overview and recent projects
- Open a project in the current window or a new project window
- Create a project from Home

### Projects

Create and manage project workspaces.

- Create a project (name + description)
- Search and filter: All / Active / Archived
- Grid or list layout
- Open, duplicate, archive, and delete
- Open a project in its own window
- Edit metadata from Overview: name, description, company, logo, document style

### Document Library

Browse documents from every project without opening each one first.

- Search by title, project, content, or tags
- Filter by project, type, and status
- Grid or list view
- View, pin, change status, duplicate, delete, and export
- Open a document in that project’s editor

Authoring and AI generation stay inside a project. This library is for browsing and export.

### Apps

Choose studio tools and review connected services.

- **Discover** — browse and enable built-in apps
- **My Apps** — tools currently on the sidebar
- **Connections** — AI, SQL databases, Vector DB, and VPS/SSH status
- Search and category filters
- Open, configure in Settings, or pop out a window
- Add / remove from the sidebar (except required modules)

### AI Assistant (global)

Workspace-wide chat for coding, research, and planning. Same chat UI as Project AI, without requiring a project.

- Conversations: create, pin, rename, duplicate, delete, search
- Streaming replies, stop, regenerate, edit & resend, copy
- Model picker (cloud catalog or local Ollama)
- Optionally **link a project** for grounded context
- Uses RAG Studio training corpus and model profile when RAG is enabled

---

## Project

These appear after a project is open.

### Overview

Project hub.

- Status, company, document style, last opened
- Health / completeness percentage
- Counts for documents, requirements, and flows
- Knowledge breakdown and suggested next steps
- Recent documents and flows
- Shortcuts to Chat, Knowledge, Documents, Flows, and Generate

### Project AI

Context-aware assistant for the current project.

- Same conversation tools as the global Assistant
- Grounded in the Knowledge Base (and RAG chunks when indexed)
- Attach documents, modules, and other context
- Suggested prompts and jumps to Knowledge, Documents, and Flows
- Export a conversation to the clipboard

### Knowledge

Structured project context that powers chat, generation, and documents.

**Sidebar today**

| Section | What you capture |
| --- | --- |
| Basics | Summary, industry, goals, scope, vision, objectives |
| Modules | System areas with nested features (priority, complexity, status) |
| Requirements | Functional requirements |
| Documents | Link into project documents / generate |

**Also available**

- Search knowledge and jump to a section
- Extract knowledge from pasted text (AI)
- Load sample data
- **Index for RAG / Re-index** — embeds the knowledge base (and project training docs) into LiteChroma
- Completeness percentage and suggestions

The data model also supports stakeholders, roles, NFRs, business rules, workflows, entities, APIs, integrations, reports, risks, assumptions, and decisions. Those CRUD lists exist; the simplified sidebar currently shows the four sections above.

### Documents

Specs and deliverables for the selected project.

- Library: search, type/status filters, sort, pin, multi-select, bulk delete
- Create blank or from a template
- AI generate (length controls) and **Quick Generate**
- Full **Generate wizard** (context → type → options → review); wizard state is saved locally
- Select modules/features in scope from the Knowledge Base
- Document styles: Basic, Professional, Enterprise, ChatGPT
- Statuses: draft, review, approved, superseded
- Import `.md`, `.html`, `.json`, `.txt`
- Lifecycle tab: stage health, generate missing docs / starter pack
- Sync suggestions vs knowledge (propose / apply with diff)
- Duplicate, pin, preview, open in the editor, export

**Document types (26)**

| Category | Types |
| --- | --- |
| Requirements | Requirements Specification, Functional, Non-Functional, BRD |
| Agile | User Stories |
| Technical | API Specification, Database Schema, System Architecture, Technical Design |
| Planning | Project Timeline, Scope Document |
| Governance | Risk Assessment, Change Request |
| QA | Testing Checklist, UAT Document |
| Quick Start | PRD, Client Proposal, Estimation Report |
| Legal | Contract Agreement |
| Discovery | Discovery Brief |
| Product | Product Definition |
| Design | UI/UX Specification |
| Delivery | Deployment Guide, Release Notes |
| Documentation | User Guide, Technical Handover |

### Templates

Predefined document templates plus saved custom templates. Open from the Documents area or the project sidebar.

### Generate Document

AI wizard that walks through project context and produces a full draft in one pass. Output opens in Documents for editing.

### Flow Designer

Visual diagrams for processes, architecture, APIs, data, journeys, and requirements.

- Create blank or from templates; pin, duplicate, delete, search, filter
- Drag nodes, connect edges, labels, resize
- Auto-layout; align / distribute; layers (hide / lock)
- Validation score and issues
- Import / export JSON; export PNG / SVG; copy Mermaid
- AI: generate from a description, improve, analyze, explain, requirement coverage, architecture assist, reverse-engineer from a document
- Auto-save

### Architecture Designer

Structured system architecture plus canvases.

**Workspace sections**

Overview · Requirements · AI Architect · Architecture canvas · Components · Services · Data Flow · API Layer · Database · Integrations · Security · Infrastructure · Deployment · Environments

- Create by system type (web, mobile, desktop, SaaS, microservices, monolith, serverless, REST, GraphQL, event-driven, cloud, AI, hybrid) or from a template
- Pin, duplicate, delete, search, pop-out window
- Link requirement documents; generate from docs (+ optional Knowledge Base)
- Refine with an instruction → approve or reject the proposal
- Component CRUD by category (applications, backend, data, infrastructure, integrations, AI)
- Canvases for architecture, data flow, infrastructure, and deployment
- Session undo / redo

**Not shipped yet:** Validation, generated architecture documentation, and version history / diff (placeholders in the nav).

---

## Tools

Enable these from **Apps**. They appear under Tools in the sidebar.

### API Studio

HTTP and WebSocket client with collections (Postman-style).

- Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- HTTP or WebSocket per request
- Builder tabs: Params, Auth, Headers, Body, Notes, Scripts (pre-request), Tests, Settings
- Body: none, JSON, text, form-data, x-www-form-urlencoded
- Auth: none, Bearer, Basic, API Key, OAuth 2.0
- Per-request timeout; multi-tab drafts with dirty state
- Collections and folders: create, rename, delete, reorder, drag-and-drop, search
- Environments with `{{variable}}` substitution
- History (up to 200), filter by method, reopen as a tab
- Send / cancel; collection / folder runner (delay, stop-on-fail, report)
- Import Postman JSON or cURL
- Export Postman, OpenAPI 3.1, native, or bulk cURL (WebSocket skipped on OpenAPI)
- Code snippets: cURL, JS fetch, Node axios, Python requests
- Copy as cURL; save response to file; create a project document from a response
- Import endpoints from project knowledge
- **AI Assist:** generate from description, complete request, fill body/script, explain response, generate tests, fix failed request, extract env vars, write notes, review request
- Horizontal or vertical request/response split; keyboard shortcuts

### Database Workbench

Connect, query, design, and analyze SQL databases with AI.

- Scope: global or project
- Connections: create, update, delete, duplicate, test, connect, disconnect
- Providers: **SQLite, MySQL, MariaDB, PostgreSQL, MSSQL**
- Explorer: databases, schemas, tables; search; open table / query / ER tabs
- Table data grid (paged); insert / update / delete when not read-only
- SQL editor with completion; query history and saved queries
- ER diagram generation and view
- AI panel: natural language plus shortcuts (explain, indexes, security, docs, Prisma, DTOs, and more)
- Workspace settings: timeout, max rows, font size, history limit, default schema

Other database types may appear in types/settings but are not implemented as live providers.

### Vector Studio

LiteChroma collections and similarity search.

- Scope: global or project
- Connection profiles: CRUD, test, connect, disconnect
- Provider: **LiteChroma** (Chroma listed as compat, not implemented)
- Collections: create, delete, rename
- Search: text → embed or raw vector JSON; top-k, where filter, metadata / documents / distances
- Upsert from form (documents + metadata) or JSON (ids + embeddings)
- Delete vectors by id; stats and health
- Settings: default top-k, include flags, RAG score threshold

Use this module to inspect collections. Author the training corpus in RAG Studio.

### RAG Studio

Training corpus and model profile for assistants.

- Training documents: title, source, purpose, category, tags, content, enabled
- Categories: guideline, example, domain, style, FAQ, other
- Filter the list; index corpus into LiteChroma
- Index status: empty / needs index / indexed / error
- Model profile: display name, domain, tone, preferred topics, standing instructions
- Settings: include corpus in RAG, training top-k
- Scope: global (`rs-train-global`) or project (`rs-train-{projectId}`)

When RAG is on, Project AI, Global Assistant, Generate, Edit, and Flow AI retrieve matching chunks. Knowledge Base chunks live in `rs-kb-{projectId}`.

### Terminal

Local terminal with folder shortcuts.

- Multi-tab PTY sessions (xterm)
- Remember last working directory and recent folders
- Restore sessions (cwd, not full scrollback)
- Clear screen; stop a running command
- Open the current folder in the Code Editor
- Also embedded in the Code Editor bottom panel

Remote shells are in **VPS**, not this module.

### Code Editor

Local folder workbench (VS Code–like).

- Open / close a workspace folder; restore workspace state
- File tree: create, rename, delete files and folders
- Multi-tab editing, dirty save, split editor, breadcrumbs, status bar
- Search, outline, problems / diagnostics
- Git: status, stage / unstage, commit, checkout, discard, fetch / pull / push, stash / pop, diff, log
- Code index (symbols) with status in the header
- Quick Open: files, commands, symbols, go-to-line
- Integrated terminal, problems, and changes panels
- **Agent modes:** agent, ask, edit, debug, plan, review — start / pause / resume / cancel; attach files; tool confirmation
- **Inline AI** on selection: Ask / Edit presets and freeform
- Empty workspace falls back to the full Terminal page

Filesystem is local only. Remote files are in VPS File Manager.

### VPS

SSH servers, files, env, PM2, and deploys.

- Servers: create, update, delete; PEM / key / PPK; test, connect, disconnect, reconnect
- Metrics polling and audit log when connected
- **Smart Terminal:** remote shell plus intent helpers (restart, logs, deploy, env, PM2) with destructive-command detection
- PM2: list, restart / reload / stop / delete, stream logs
- Deployments: path, repo, install / build commands, PM2 name, run pipeline
- File manager: browse from `/`, open / edit / save remote files
- Env editor: fetch / save remote env files
- Projects per server

Oriented to Linux + npm / PM2. Intents are pattern-based, not a full LLM shell agent.

### Vault

Encrypted password and credential storage (workspace-wide, not per project).

- Master password (≥ 8 characters) + optional hint; unlock / lock; auto-lock
- Nested folders; search
- Item types: password, API key, SSH, database, credit card, license, identity, secure note, server, custom
- Secrets are copy-only (not shown as plaintext in the UI)
- Password generator and strength indicator
- Security report (weak / duplicate)
- Import and export (JSON, encrypted, and other password-manager formats)
- Shortcuts: new item, copy password, lock, search

Encryption: Argon2id master hash, AES-256-GCM for secrets. See `docs/PASSWORD_VAULT.md` for the security model.

### Notes

Notepad with folders and tags.

- Create, select, delete, pin; move to folder; fullscreen
- Formats: plain, Markdown (preview), rich text (bold, italic, underline, lists)
- Folder tree CRUD; tags; filter by tag
- Search; autosave; version history (load / restore)
- **Quick Note** popup window (`Ctrl/⌘+Enter` save, Escape close)
- Voice Assistant (Tess) can create, list, search, and read notes

Note AI (summarize / improve / extract tasks) is **not implemented** yet.

### Clipboard

Clipboard history manager.

- Live history (watcher + sync); types: text, code, URL
- Filters: all / text / code / URL / pinned
- Search, pin, remove, clear unpinned
- Copy an item; **quick picker** pastes into the focused app (`Ctrl+Shift+V` / `⌘⇧V`)
- Sensitive-content detection helper
- Voice tools: get, copy, paste, transform

History is capped (100 items). AI summarize / group-similar are **not enabled** yet.

### Voice Assistant

Hands-free “Tess” conversations: listen, reply out loud, run tools.

- Starts listening automatically; say “Tess” (or hold Space / `Ctrl/⌘+Space`)
- Browser STT (on-device captions) or OpenAI Whisper
- TTS: system voice or optional OpenAI TTS
- Conversations: list, search, rename, delete
- Settings: microphone, VAD / silence timeout, noise reduction, languages, voices, privacy
- **Cloud processing** badge when Whisper, cloud TTS, or a cloud LLM is in the pipeline
- Tool confirmation for writes; destructive tools always confirm
- Delete all local voice data from settings

**Built-in tools:** current time; search / read / open local files; clipboard copy / get / paste / transform; notes create / list / search / read; list / search projects; remember / recall facts.

This is not Project Chat or the global AI Assistant. Workbench project tools (create project, generate document, and similar) are reserved and not wired yet.

---

## Utility

### Documentation

In-app product guide (this catalog is the fuller module feature list). Searchable sections for overview, workflow, modules, architecture, shortcuts, and FAQ.

### Settings

| Tab | What you configure |
| --- | --- |
| General | Document auto-save: Off, 1s, 3s, 5s, 10s |
| Apps | Enabled apps and connection status |
| Database | Database Workbench connection defaults |
| Vector DB | LiteChroma profiles, RAG toggles, embedding, score threshold |
| AI | Routing, keys, models, Ollama |
| Voice | Speech, playback, privacy, local data |
| Usage | Token usage and estimated cost by feature / model |
| Appearance | Light / dark / system, visual theme, accent, density, fonts, glass/solid, import/export presets |
| Export | Default PDF / DOCX: cover, TOC, page numbers, headers |
| About | App version and local storage note |

---

## Connections (integrations)

Configured in Settings; status on **Apps → Connections**.

| Integration | Available today |
| --- | --- |
| **AI Providers** | Routing: Cloud, Ollama (local), Hybrid. Cloud keys: OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter. Keys stored with OS encryption (`safeStorage`). Azure OpenAI and Groq are listed, not first-class. |
| **SQL Databases** | PostgreSQL, MySQL, MariaDB, MSSQL, SQLite profiles |
| **Vector Database** | LiteChroma for embeddings and RAG |
| **VPS / SSH** | Servers managed in VPS Manager |

---

## Cross-cutting features

| Feature | Available |
| --- | --- |
| Command palette | `⌘K` / `Ctrl+K` |
| Sidebar tree | Flat, nested, or full collapsible tree (module preferences) |
| Header vs sidebar chrome | Switch navigation style from the sidebar footer |
| New window | Extra workbench window |
| Project windows | Dedicated window for one project |
| Module pop-outs | Dedicated windows for tools listed in Apps |
| Themes | Color mode, visual theme, density, accent |
| Local-first data | SQLite on disk; AI calls leave the machine only when you trigger them |
| Export documents | PDF and DOCX (cover, TOC, page numbers); also Markdown / HTML / JSON from the editor |
| Auto-save | Documents, with interval from Settings |
| Document versioning | Snapshots, history, restore, compare in the editor |
| Rich text editor | Headings, tables, images, checklists, code blocks, links, colors, AI rewrite on selection |

### Editor (inside Documents)

- Ribbons: Home, Insert, Layout, Review (Table when in a table)
- Slash menu, floating selection toolbar, image toolbar, inline Ask AI
- Find / replace, numbered headings, snippets (REQ, user story, NFR/risk tables, TOC)
- Focus / view modes, zoom, print
- Extract knowledge from the document into the Knowledge Base
- Heuristic quality / analytics (not full LLM scoring)

---

## Recommended workflow

1. **Connect AI** — Settings → AI (OpenAI key or Ollama).
2. **Create a project** — Home or Projects.
3. **Fill Knowledge** — Basics, modules, features, requirements. Index for RAG if Vector DB is on.
4. **Optional:** RAG Studio training docs + model profile; index corpus.
5. **Explore** with Project AI or Voice Assistant.
6. **Generate** a document, then refine in the editor.
7. **Model** flows and architecture.
8. **Export** PDF or DOCX.

Tools (API Studio, Database, Code Editor, VPS, Vault, Notes, Clipboard) are independent of that sequence.

---

## Not available yet (honest gaps)

| Area | Gap |
| --- | --- |
| Notes | AI summarize / improve / extract tasks |
| Clipboard | AI summarize and group-similar |
| Architecture Designer | Validation, generated docs, version history UI |
| Knowledge | Full entity set exists; sidebar only shows four sections |
| API Studio | No GraphQL-specific client; OpenAPI is export, not full import |
| Database | Only five SQL providers; MongoDB / Redis / Oracle IDs are not live |
| Vector | Chroma provider not implemented |
| Voice | No Workbench project create / generate tools; wake word is Tess |
| Documents | No DOCX / PDF import |
| AI | Azure OpenAI and Groq not fully wired |
| Sync | No cloud project sync |

---

*Generated from the module registry, Apps catalog, and current UI as of August 2026.*
