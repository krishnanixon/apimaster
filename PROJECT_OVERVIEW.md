# Tessarok — Project Overview

> High-level guide to application flow, current capabilities, and future possibilities.  
> **Product name:** Tessarok (`ai-requirement-studio` npm package)  
> **Type:** Electron desktop application (Windows, macOS, Linux)

---

## 1. What Is This Application?

Tessarok is a **local-first AI-powered developer workbench** for software engineers, architects, DevOps engineers, and development teams who need an all-in-one desktop workspace.

It combines:

- A **structured Knowledge Base** (modules, features, requirements, APIs, risks, etc.)
- An **AI chat** for brainstorming and refining ideas
- A **document generation wizard** that turns project context into deliverables
- A **rich text editor** for editing and polishing output
- A **flow designer** for process and system diagrams
- **Export** to DOCX and PDF for sharing with stakeholders

All project data is stored **locally** in SQLite. The OpenAI API is used only when the user configures an API key.

---

## 2. Technology Stack (Summary)

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron (secure: context isolation, no node in renderer) |
| UI | React 19, TypeScript, TailwindCSS |
| Build | Vite + electron-vite |
| State | Zustand |
| Database | SQLite + Prisma ORM |
| Editor | Tiptap (rich text) |
| Diagrams | React Flow (XYFlow) + Dagre layout |
| AI | OpenAI API (streaming) |
| Export | docx, pdf-lib |

---

## 3. Application Flow

### 3.1 High-Level User Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LAUNCH APPLICATION                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  HOME / DASHBOARD                                                        │
│  • View recent projects                                                  │
│  • Create new project                                                    │
│  • Configure AI provider (App Settings → AI) if not set                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  OPEN / CREATE PROJECT                                                   │
│  • Project stores all conversations, documents, knowledge, flows          │
│  • Per-project context, requirements, and branding in Knowledge Base       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
   ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
   │  AI CHAT     │        │ KNOWLEDGE    │        │  DOCUMENTS   │
   │  Brainstorm  │───────▶│ BASE         │───────▶│  & GENERATE  │
   │  & refine    │ extract│ Structure    │  feed   │  Deliverables│
   └──────────────┘        │ project data │        └──────────────┘
                           └──────────────┘                 │
                                    │                       ▼
                                    │              ┌──────────────┐
                                    └─────────────▶│ RICH TEXT    │
                                                   │ EDITOR       │
                                                   └──────────────┘
                                                            │
                           ┌──────────────┐                 │
                           │ FLOW         │                 ▼
                           │ DESIGNER     │          ┌──────────────┐
                           │ Visual flows │          │ EXPORT       │
                           └──────────────┘          │ DOCX / PDF   │
                                                     └──────────────┘
```

### 3.2 Main Navigation Areas

| Area | Route (within project) | Purpose |
|------|------------------------|---------|
| **Home** | `/` | Dashboard, quick start, recent projects |
| **Projects** | `/projects` | List, archive, duplicate, manage all projects |
| **Chat** | `/project/:id/chat` | AI conversations tied to the project |
| **Knowledge** | `/project/:id/knowledge` | Structured project intelligence |
| **Documents** | `/project/:id/documents` | View and manage all documents |
| **Generate** | `/project/:id/generate` | Step-by-step AI document wizard |
| **Flows** | `/project/:id/flows` | Process/system flow diagrams |
| **Templates** | `/project/:id/templates` | Saved document templates |
| **Exports** | `/project/:id/exports` | Export history and options |
| **Editor** | `/project/:id/editor/:docId` | Full document editing experience |
| **Settings** | `/settings` | Global app settings — General, AI, Usage, Appearance, Export |

### 3.3 Typical Workflow (Recommended)

1. **Create a project** — Name it, add description and company branding.
2. **Set up AI** — One-time in App Settings → AI: OpenAI API key (encrypted locally) or Ollama URL.
3. **Build context** — Use Chat to explore ideas, then fill the Knowledge Base (overview, modules, features, requirements).
4. **Optional: Extract knowledge** — AI can pull structured data from conversations into the Knowledge Base.
5. **Generate documents** — Run the 9-step wizard (project → business → modules → roles → features → integrations → technology → output style → review).
6. **Edit & refine** — Open documents in the rich text editor; use inline AI to rewrite sections.
7. **Design flows** — Create visual process diagrams; AI can generate flows or convert flows to requirements.
8. **Export** — Produce DOCX/PDF with cover page, table of contents, and page numbers.
9. **Search** — Global full-text search across documents, conversations, and knowledge items.

### 3.4 Data Flow (Architecture)

```
┌──────────────────┐     IPC (secure bridge)     ┌──────────────────┐
│  React UI        │ ◀────────────────────────▶ │  Electron Main   │
│  (Renderer)      │                             │  Process         │
└──────────────────┘                             └────────┬─────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        ▼                               ▼                               ▼
                 ┌─────────────┐                ┌─────────────┐                ┌─────────────┐
                 │ SQLite DB   │                │ OpenAI API  │                │ File System │
                 │ (Prisma)    │                │ (streaming) │                │ (exports)   │
                 └─────────────┘                └─────────────┘                └─────────────┘
```

- **Renderer** never touches the database or API key directly.
- **Main process** handles persistence, AI calls, encryption, and file exports.
- **Search index** is maintained locally for fast global search.

---

## 4. What the Application Can Do Today

### 4.1 Project Management

- Create, open, update, delete, duplicate, and archive projects
- Track recently opened projects
- Per-project branding (company name, logo, colors)
- Per-project AI configuration (model, temperature, tokens, system prompt)
- Document style presets: Basic, Professional, Enterprise

### 4.2 AI Chat

- Multiple conversations per project (pin, rename, duplicate, delete)
- Streaming OpenAI responses
- Regenerate, edit messages, clear conversation
- Generate requirements from chat context
- AI-assisted document editing (full document or selected text)

### 4.3 Knowledge Base

Structured storage for everything a requirements project needs:

| Category | What it stores |
|----------|----------------|
| **Overview** | Summary, business type, industry, users, goals, scope, vision |
| **Stakeholders** | Names, roles, responsibilities |
| **Modules** | System areas with priority and status |
| **Features** | Capabilities linked to modules |
| **Requirements** | Functional & non-functional, acceptance criteria, dependencies |
| **Business Rules** | Domain rules and constraints |
| **Workflows** | Process definitions |
| **Database / Entities** | Data models, fields, relationships |
| **API Endpoints** | REST-style specs (method, path, request/response) |
| **Roles & Permissions** | User roles and access |
| **Integrations** | External systems |
| **Reports** | Reporting needs |
| **Risks** | Severity, likelihood, mitigation |
| **Assumptions & Decisions** | Project governance records |
| **Knowledge Links** | Relationships between entities |

Additional knowledge features:

- Dashboard with completion stats
- AI extraction from conversations
- Sample data seeding for demos
- Full-text search across knowledge items

### 4.4 Document Generation

**10 document types:**

| Type | Output |
|------|--------|
| Requirements | Full SRS (Software Requirements Specification) |
| Functional | Functional specifications |
| Non-functional | Quality attributes (performance, security, etc.) |
| User Stories | Agile user stories |
| Database Schema | Data model documentation |
| API Spec | API documentation |
| Timeline | Project schedule |
| Risks | Risk register |
| Architecture | System architecture |
| Testing | Test strategy |

**Generation options:**

- 3 writing styles: Basic, Professional, Enterprise (+ ChatGPT style)
- Length control: Concise → Comprehensive (or custom)
- 5 page themes: Professional, Modern, Soft UI, Corporate, Classic
- Layout presets: Normal, Narrow, Wide, Compact, Comfortable, Manuscript, Custom
- Module/feature selection to scope generation
- Knowledge preview before generating

### 4.5 Rich Text Editor

- Headings, lists, tables, images, checklists, code blocks
- Text formatting (bold, italic, underline, color, highlight, align)
- Slash commands and floating toolbars
- Document outline sidebar
- Inline “Ask AI” on selections
- Auto-save with configurable interval
- Full version history (restore any version)

### 4.6 Flow Designer

- Visual canvas with nodes and edges (React Flow)
- Categories: process, system, user journey, data flow, architecture, requirements
- Auto-layout (Dagre)
- Node library and properties panel
- AI actions: generate flows, reverse-engineer from text, produce requirements/user stories/API specs from diagrams
- Export flow as image
- Pin and organize multiple flows per project

### 4.7 Export

- **DOCX** — Professional Word documents with cover page, TOC, page numbers, headers/footers
- **PDF** — Print-ready PDF output with live preview before export
- **Default options** — Saved in App Settings → Export and pre-filled in every export dialog
- **Editor exports** — Markdown, HTML, and JSON from the document toolbar
- **Flow exports** — PNG, SVG, Mermaid, and JSON from the flow designer toolbar
- Company branding on PDF/DOCX exports

### 4.8 Search & Discovery

- Global search across documents, conversations, messages, and knowledge entities
- Command palette for quick navigation
- Reindex capability

### 4.9 Settings & Security

- **General** — Document auto-save interval (Off through 10s presets)
- **AI** — Unified provider setup: defaults, routing, OpenAI key, Ollama connection
- **Usage** — Token and cost tracking dashboard
- **Appearance** — Dark / Light / System color mode, visual themes, layout density
- **Export** — Default PDF/DOCX format and formatting toggles (cover, TOC, page numbers, headers)
- Encrypted API key storage (Electron safeStorage)
- Content Security Policy
- Sandbox and context isolation

---

## 5. Data Model (Conceptual)

At the center is the **Project**, which owns:

```
Project
├── Conversations → Messages
├── Documents → DocumentVersions
├── ProjectSettings
├── RequirementKnowledge (overview)
├── Stakeholders, Modules, Features, Requirements
├── BusinessRules, Workflows, Entities, APIEndpoints
├── Roles, Integrations, Reports, Risks
├── Assumptions, Decisions, KnowledgeLinks
├── FlowDiagrams
└── SearchIndex (denormalized for search)
```

Global **AppSettings** stores theme, AI defaults, auto-save interval, export defaults, and recent project IDs.

---

## 6. Future Possibilities & Extensions

Below are realistic enhancements grouped by impact. The existing architecture (Electron + SQLite + IPC + Knowledge Base + AI) supports most of these without a full rewrite.

### 6.1 AI & Intelligence

| Idea | Description |
|------|-------------|
| **Multi-provider AI** | OpenAI and Ollama are supported today; additional providers (Anthropic, Gemini, etc.) planned |
| **RAG over project data** | Retrieval-augmented generation using the Knowledge Base and documents for more accurate answers |
| **Requirement traceability matrix** | Auto-generate links: requirement ↔ feature ↔ test case ↔ API |
| **Conflict detection** | AI flags contradictory or duplicate requirements |
| **Estimation assistant** | Story points, effort, or timeline suggestions from scope |
| **Meeting notes → knowledge** | Paste transcripts; AI extracts stakeholders, decisions, action items |
| **Compliance templates** | ISO 29148, IEEE 830, GDPR, HIPAA-aligned document structures |

### 6.2 Collaboration & Team

| Idea | Description |
|------|-------------|
| **Cloud sync** | Optional sync via Firebase, Supabase, or custom backend |
| **Real-time co-editing** | Multiple users on the same document (CRDT/Yjs) |
| **Comments & review workflow** | Stakeholder review, approve/reject requirements |
| **Role-based access** | Viewer, editor, admin per project |
| **Activity audit log** | Who changed what and when |
| **Share read-only links** | Publish snapshots of documents or knowledge |

### 6.3 Integrations

| Idea | Description |
|------|-------------|
| **Jira / Linear / Azure DevOps** | Push user stories and requirements to issue trackers |
| **Confluence / Notion export** | Sync documents to wiki platforms |
| **GitHub / GitLab** | Link requirements to PRs and commits |
| **Figma** | Import user flows or link designs to features |
| **Slack / Teams notifications** | Alerts on document updates or AI completions |
| **Import from existing docs** | Parse Word, PDF, or Markdown into Knowledge Base |

### 6.4 Document & Export

| Idea | Description |
|------|-------------|
| **More export formats** | HTML, Markdown, Confluence XML, LaTeX |
| **Batch export** | Export all project documents as a zip package |
| **Custom templates marketplace** | Community or org-specific document templates |
| **Diff between versions** | Visual compare of document revisions |
| **Digital signatures** | Sign-off workflow on final SRS |
| **Multi-language documents** | Generate or translate requirements in other languages |

### 6.5 Knowledge Base

| Idea | Description |
|------|-------------|
| **Visual requirement board** | Kanban by status (draft, approved, implemented) |
| **Dependency graph** | Interactive graph of requirement dependencies |
| **Impact analysis** | “If I change X, what is affected?” |
| **Reuse library** | Cross-project requirement patterns and modules |
| **Validation rules** | Enforce IDs (e.g. REQ-001), mandatory fields, status transitions |
| **Glossary / taxonomy** | Controlled vocabulary for consistent terminology |

### 6.6 Flow Designer

| Idea | Description |
|------|-------------|
| **BPMN / UML support** | Standard notation import/export |
| **Swimlanes** | Role-based process lanes |
| **Simulation** | Walk through flows step-by-step |
| **Embed flows in documents** | Live or static diagram inside exported DOCX/PDF |
| **Sequence diagrams** | API interaction visualization from endpoint definitions |

### 6.7 Testing & Quality

| Idea | Description |
|------|-------------|
| **Test case generation** | From requirements → Gherkin or test scripts |
| **Coverage report** | Which requirements have tests / APIs / flows |
| **Quality scoring** | Rate completeness and clarity of requirements |
| **Ambiguity checker** | Flag vague language (“fast”, “user-friendly”) |

### 6.8 Platform & Deployment

| Idea | Description |
|------|-------------|
| **Web version** | Browser-based SaaS with same feature set |
| **Enterprise deployment** | MSI/group policy, centralized API key management |
| **Offline-first PWA** | Lighter web client with local storage |
| **Plugin system** | Third-party extensions for custom generators or exporters |
| **Backup & restore** | One-click project backup to file; import on another machine |
| **Multi-workspace** | Organize projects by client, team, or department |

### 6.9 UX & Productivity

| Idea | Description |
|------|-------------|
| **Onboarding wizard** | Guided first-project setup |
| **Keyboard-first workflow** | Power-user shortcuts everywhere |
| **Dashboard analytics** | Charts: requirements by status, risk heat map, doc completion |
| **Notifications** | Desktop notifications when long AI jobs finish |
| **Voice input** | Dictate requirements in chat |
| **Mobile companion** | Read-only app for reviewing documents on the go |

---

## 7. Strengths of the Current Foundation

What makes this application well-positioned for growth:

1. **Rich domain model** — The Prisma schema already models a full requirements engineering domain, not just documents.
2. **Knowledge ↔ AI ↔ Documents loop** — Structured data feeds generation; chat can extract back into knowledge.
3. **Secure desktop architecture** — API keys and data stay local; suitable for sensitive enterprise requirements.
4. **Modular feature areas** — Chat, knowledge, documents, editor, flows, and export are separable concerns.
5. **Professional output** — DOCX/PDF export with branding is a differentiator vs. pure chat tools.
6. **Visual + textual** — Flow designer complements written specifications.

---

## 8. Suggested Roadmap Phases (Optional)

| Phase | Focus | Example deliverables |
|-------|--------|----------------------|
| **Phase 1 — Polish** | Stability, onboarding, backup/restore | Better empty states, project export/import |
| **Phase 2 — Traceability** | Links and matrices | Requirement ↔ feature ↔ test traceability |
| **Phase 3 — Integrations** | External tools | Jira export, Markdown/HTML export |
| **Phase 4 — Collaboration** | Multi-user | Cloud sync, comments, review workflow |
| **Phase 5 — Enterprise** | Compliance & scale | Audit log, SSO, compliance templates |

---

## 9. Summary

**Tessarok** is an end-to-end **developer workbench**: capture ideas in chat, structure them in a knowledge base, generate professional documents with AI, refine in a rich editor, visualize with flow diagrams, and export for stakeholders—all running locally on the desktop.

The application is already capable of supporting a full project lifecycle from discovery to deliverable documentation. The largest opportunities for growth are **traceability**, **team collaboration**, **external tool integrations**, and **multi-provider AI**—building on the solid local-first foundation that exists today.

---

*Document generated from project analysis. For setup and development commands, see [README.md](./README.md).*
