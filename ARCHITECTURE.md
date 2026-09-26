# Tessarok — Architecture & Implementation Plan

> Pivot from **AI Requirement Studio** to **Tessarok**: an all-in-one AI-powered developer workbench without removing existing features.

---

## 1. Product Vision

Tessarok is a local-first desktop workspace combining capabilities inspired by IDEs, API clients, database tools, credential managers, terminal clients, note apps, and AI assistants — organized around three scopes.

| Scope | Meaning | Examples |
|-------|---------|----------|
| **GLOBAL** | Available without an open project | Dashboard, AI Assistant, Vault, VPS, Terminal |
| **PROJECT** | Isolated per project | Knowledge, Documents, Flows, Validation |
| **HYBRID** | Global or project-scoped (`scope` + nullable `projectId`) | API Studio, Notes, Database connections |

---

## 2. Current State (Baseline)

The codebase is already a multi-module Electron workbench:

- **Stack:** Electron 37, React 19, Zustand, Prisma/SQLite, HashRouter
- **Global modules:** Code Editor, API Studio, VPS Manager, Vault, Notepad, Clipboard
- **Project modules:** Chat, Knowledge, Documents, Flows, Design, Validation, Traceability, Estimation, Exports
- **IPC:** ~281 channels across 7 handler modules (`shared/ipc/channels.ts`)
- **Storage:** SQLite primary; some modules use localStorage, IndexedDB, JSON files

### Gaps vs Target Architecture

| Area | Current | Target |
|------|---------|--------|
| Product naming | Mixed "Requirement Studio" / "AI Requirement Studio" | **Tessarok** everywhere |
| Sidebar | Global OR project mode (mutually exclusive) | Workspace + Developer Tools always; Current Project when open |
| Scope model | Implicit (route prefix) | Explicit `scope` + `projectId` on hybrid entities |
| Global AI | None | `/assistant` route |
| Project overview | Default → chat | `/project/:id/overview` hub |
| Search | Project-only when in project | Global search with scope badges |
| Folder structure | `features/` + `modules/` + `core/` + domain main services | Keep conventions: `components`/`stores`/`lib`; domain folders under `electron/main` |

---

## 3. Folder Organization (current)

```
src/
  app/                    # App shell, routing (App.tsx)
  core/                   # Cross-cutting domain
    scope/                # useScopeContext + scope helpers
    product/              # re-exports from @shared/constants/product
  shared/                 # Reusable UI, hooks, app-level stores, lib
    components/
    hooks/
    stores/               # ui, project, settings, modules, nav-history, window-open
    lib/
  features/               # PROJECT-scoped functionality
    projects/
    chat/                 # + stores/chat.store
    knowledge/            # + stores/knowledge.store, lib/
    documents/            # + stores/document.store
    editor/
    flow-designer/
    architecture-designer/
    presentation-designer/
    export/
    settings/
    documentation/
    ai/                   # cross-cutting AI settings UI + ai.store
    apps/
    diagnostics/
    onboarding/
  modules/                # GLOBAL / HYBRID tools
    assistant/
    api-studio/           # components, hooks, pages, services, stores, theme, types
    code-editor/
    database-studio/
    terminal/
    notepad/              # components (not ui/), core, services, stores
    vps-manager/
    clipboard-manager/
    password-vault/       # GLOBAL — under modules
    vector-studio/
    rag-studio/
    voice-assistant/

electron/
  main/
    core/scope/           # Scope helpers
    infra/                # logger, api-key, usage-tracker, onboarding, bug-report
    ai/                   # providers + ai.service
    knowledge/            # knowledge + project bootstrap/context services
    documents/
    export/
    presentation/
    flows/
    architecture/
    vault/
    rag/
    api-studio/
    repositories/
    ipc/
    …domain folders (clipboard-manager, git, terminal, voice-assistant, …)

shared/                   # Process-shared (main + renderer)
  types/
  ipc/
  constants/
  lib/
  settings/
```

**Convention for modules:** `pages/`, `components/`, `stores/` (plural), `lib/` or `services/`, optional `types/`, `theme/`, `hooks/`.

---

## 4. Navigation Architecture

### Sidebar (always visible sections)

```
Workspace
  Dashboard          → /
  Projects           → /projects
  AI Assistant       → /assistant

Developer Tools
  API Studio         → /api-studio
  Database Studio    → /database-studio
  Terminal           → /code-editor
  VPS Manager        → /vps
  Git                → /git
  Vault              → /vault
  Clipboard          → /clipboard
  Notes              → /notepad

Current Project      (only when projectId in URL)
  Overview           → /project/:id/overview
  Knowledge          → /project/:id/knowledge
  Documents          → /project/:id/documents
  Flows              → /project/:id/flows
  Architecture       → /project/:id/flows
  Design             → /project/:id/design
  Database           → /project/:id/knowledge
  Validation         → /project/:id/validation
  Exports            → /project/:id/exports
```

### Preserved routes (not in primary sidebar)

Accessible via Command Palette (⌘K), Overview quick links, and deep links:

| Route | Feature |
|-------|---------|
| `/project/:id/chat` | Project AI Assistant |
| `/project/:id/traceability` | Traceability matrix |
| `/project/:id/estimation` | Estimation |
| `/project/:id/generate` | Document generation wizard |
| `/docs` | In-app documentation |
| `/settings` | Global settings |

---

## 5. Scope Management System

### TypeScript (`shared/types/scope.ts`)

```typescript
type AppScope = 'GLOBAL' | 'PROJECT'

interface ScopedEntity {
  id: string
  scope: AppScope
  projectId: string | null  // null when scope === 'GLOBAL'
  createdAt: string
  updatedAt: string
  createdBy?: string
  modifiedBy?: string
}
```

### Runtime rules

1. **Route-derived scope:** `/project/:projectId/*` → PROJECT; all other routes → GLOBAL
2. **ProjectProvider** loads project data; leaving project routes clears project context in UI only (Zustand `currentProject` persists until another open)
3. **Hybrid modules** accept optional `projectId` query param: `/api-studio?projectId=xxx`

### Store hook (`useScopeContext`)

```typescript
// Returns { scope, projectId, isProjectScoped }
```

---

## 6. Database Migrations (Phased)

### Phase A — No schema break (current)

Project-scoped tables already have `projectId`. Global modules use separate storage (JSON, IndexedDB).

### Phase B — Hybrid unification (incremental)

Add to hybrid entities as they migrate to SQLite:

```prisma
// Example for future ApiCollection model
model ApiCollection {
  id         String   @id @default(uuid())
  scope      String   @default("GLOBAL") // GLOBAL | PROJECT
  projectId  String?
  // ... entity fields
  project    Project? @relation(...)
  @@index([scope, projectId])
}
```

**Migration targets (priority order):**

| Module | Current storage | Target |
|--------|-----------------|--------|
| Notepad | IndexedDB | SQLite `Note` with scope |
| API Studio | localStorage | SQLite `ApiCollection` |
| Clipboard | JSON file | SQLite (already global) |
| VPS | JSON file | SQLite with scope |
| Prompts | (new) | SQLite `PromptTemplate` |

### Phase C — Audit fields

Add `createdBy` / `modifiedBy` when user account system exists. Default to `"local"` for now.

**Rule:** Use `electron/main/database/client.ts` runtime DDL for backward-compatible migrations (existing pattern).

---

## 7. State Management Changes

| Change | Detail |
|--------|--------|
| `useScopeContext` hook | Derive scope from `useParams` + `useLocation` |
| `useProjectStore` | Add `clearCurrentProject()` for explicit close |
| `useUIStore` | Track `lastGlobalRoute` when entering project |
| Hybrid stores | Accept `projectId?: string` in load/save actions |
| Search store | New `useSearchStore` for global search results |

No Redux migration — continue Zustand pattern.

---

## 8. Search Enhancements (Phase 3)

Extend `search:global` IPC to search without `projectId`:

```typescript
interface SearchResult {
  // existing fields +
  scope: 'GLOBAL' | 'PROJECT'
  module: string  // 'document' | 'vault' | 'note' | ...
}
```

Search domains: Projects, Documents, Knowledge, Notes, API Collections, Vault, Servers, Databases, Prompts, Clipboard.

---

## 9. AI Architecture (Phase 4)

| Assistant | Route | Context |
|-----------|-------|---------|
| Global AI | `/assistant` | General coding, research, planning |
| Project AI | `/project/:id/chat` | Project docs, knowledge, architecture, APIs |

Shared: `electron/main/ai/` router, provider config from settings.

Project chat already injects knowledge context via `knowledge:context` IPC.

---

## 10. IPC Contract Policy

- **Do not rename** existing channels unless required
- Add new channels with `scope:` prefix for hybrid operations
- All responses remain `IpcResult<T>`

New channels (planned):

```
scope:resolve-context
search:global-all
assistant:conversation:*
```

---

## 11. UI / Branding Checklist

- [x] Phase 1: Central product constants (`shared/constants/product.ts`)
- [x] Phase 1: Window title, sidebar, HTML title
- [x] Phase 1: package.json `productName`, description, author
- [ ] Phase 1: README, PROJECT_OVERVIEW, docs
- [ ] Phase 1: About dialog, documentation content
- [ ] Phase 1: Export schema alias (read old, write new)
- [ ] Phase 2: Dashboard welcome copy
- [ ] Phase 2: Empty states
- [ ] Phase 3: Search result scope badges

**Backward compatibility:**

- Keep npm package name `ai-requirement-studio`
- Keep `USER_DATA_DIR_NAME = 'ai-requirement-studio'`
- Keep `appId = com.airequirementstudio.app` (installed app identity)
- Add legacy display name to migration list in `paths.ts`

---

## 12. Implementation Phases

### Phase 1 — Foundation (this PR) ✅ in progress

1. Product rename across UI, config, docs
2. `shared/types/scope.ts` + `shared/constants/product.ts`
3. `src/shared/lib/navigation.ts` — single source of nav truth
4. Sidebar redesign (3-section, global tools always visible)
5. Routes: `/assistant`, `/project/:id/overview`, placeholder `/git`, `/database-studio`
6. ARCHITECTURE.md (this document)

### Phase 2 — Scope & Overview

1. `useScopeContext` hook
2. Project Overview page with quick links to all project modules
3. Dashboard redesign for workbench vision
4. Command palette: global search stub, scope labels
5. Update `app-chrome.ts` for new standalone routes

### Phase 3 — Hybrid Storage Migration

1. Notepad → SQLite
2. API Studio → SQLite
3. Prisma models with scope fields
4. Repository pattern for each hybrid module

### Phase 4 — AI & Search

1. Global AI Assistant (conversations table with scope)
2. Global search across all domains
3. Search result UI with Global/Project badges

### Phase 5 — Polish

1. Folder reorganization (`core/`)
2. Project close action
3. Settings split (global vs project preferences)
4. Splash screen (optional)
5. Generated export branding

---

## 13. Refactoring Checklist

### Completed
- [ ] ARCHITECTURE.md created
- [ ] Product constants centralized
- [ ] Scope types defined
- [ ] Navigation config extracted
- [ ] Sidebar reorganized
- [ ] Brand rename (UI)

### Remaining
- [ ] Global AI Assistant (full chat)
- [ ] Database Studio (full feature)
- [ ] Git integration module
- [ ] Hybrid scope on API Studio data
- [ ] Hybrid scope on Notepad data
- [ ] Migrate clipboard JSON → SQLite
- [ ] Migrate VPS JSON → SQLite
- [ ] Global search implementation
- [ ] Search scope badges in UI
- [ ] Project overview dashboard widgets
- [ ] `core/` folder extraction
- [ ] Prompt Library module
- [ ] Model Manager module
- [ ] Account module
- [ ] Extensions module
- [ ] Notifications center
- [ ] Logs viewer module
- [ ] Tasks / Risks / Versions project modules (may map to existing knowledge entities)
- [ ] Export schema v2 with new product name
- [ ] Electron splash screen
- [ ] Unit tests for scope helpers

---

## 14. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing projects | No Prisma breaking changes in Phase 1; keep userData path |
| Lost feature access after nav change | Command palette retains all routes; Overview links to secondary modules |
| IPC breakage | No channel renames in Phase 1 |
| localStorage data loss during migration | Read old keys, write new schema, keep fallback readers |

---

## 15. Route Map (Complete)

### Global routes

| Path | Page | Scope |
|------|------|-------|
| `/` | DashboardPage | GLOBAL |
| `/projects` | ProjectsPage | GLOBAL |
| `/assistant` | AssistantPage | GLOBAL |
| `/api-studio` | ApiStudioPage | HYBRID |
| `/database-studio` | DatabaseStudioPage | HYBRID |
| `/code-editor` | CodeEditorPage | GLOBAL |
| `/git` | GitPage | GLOBAL |
| `/vps` | VPSManagerPage | GLOBAL |
| `/vault` | VaultPage | GLOBAL |
| `/clipboard` | ClipboardManagerPage | GLOBAL |
| `/notepad` | NotepadPage | HYBRID |
| `/docs` | DocumentationPage | GLOBAL |
| `/settings` | GlobalSettingsPage | GLOBAL |

### Project routes

| Path | Page | Scope |
|------|------|-------|
| `/project/:id` | → overview | PROJECT |
| `/project/:id/overview` | ProjectOverviewPage | PROJECT |
| `/project/:id/chat` | ChatPage | PROJECT |
| `/project/:id/knowledge` | KnowledgePage | PROJECT |
| `/project/:id/documents` | DocumentsPage | PROJECT |
| `/project/:id/generate` | GeneratePage | PROJECT |
| `/project/:id/flows` | FlowsPage | PROJECT |
| `/project/:id/flows/:flowId` | FlowEditorPage | PROJECT |
| `/project/:id/design` | DesignStudioPage | PROJECT |
| `/project/:id/design/:designId` | DesignEditorPage | PROJECT |
| `/project/:id/validation` | ValidationPage | PROJECT |
| `/project/:id/traceability` | TraceabilityPage | PROJECT |
| `/project/:id/estimation` | EstimationPage | PROJECT |
| `/project/:id/exports` | ExportsPage | PROJECT |
| `/project/:id/editor/:documentId` | EditorPage | PROJECT |

---

*Last updated: Phase 1 implementation*
