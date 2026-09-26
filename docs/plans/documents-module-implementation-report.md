# Documents Module — Architecture and Implementation Report

Status: Repository analysis completed; P0 persistence hardening started  
Editor: Tiptap 2 on React 19, Electron IPC, Zustand, Prisma/SQLite

## 1. Current architecture

### Routes and screens

- `/documents` and `/document-library` provide cross-project browsing.
- `/project/:projectId/documents` provides the project document workspace.
- `/project/:projectId/editor/:documentId` opens `EditorPage`.
- Creation, generation, templates, imports, preview, and export are separate feature components under `src/features/documents`.

### Editor composition

- `EditorPage` owns artifact hydration, local title/HTML/JSON state, dirty state, modes, dialogs, page appearance, comments, AI proposals, and version UI.
- `RichTextEditor` creates Tiptap, emits JSON and HTML, exposes imperative navigation/comment helpers, and composes toolbar/floating controls.
- `EditorToolbar` is a Word-style ribbon with Home, Insert, Layout, Review, and contextual Table modes.
- `EditorSidebar` is a collapsible contextual panel for details, outline, AI, appearance, comments, quality, and export-related actions.
- Document state and Electron calls are centralized in `src/shared/stores/document.store.ts`.

### Persistence

- Prisma/SQLite `Document` stores project relationship, title, type, style, page theme/layout/padding, page settings JSON, comments JSON, Tiptap JSON content, HTML, pin, status, tags, review timestamp, and timestamps.
- `DocumentVersion` stores numbered JSON/HTML snapshots and labels.
- Electron repository updates create/coalesce autosave versions on a five-minute window.
- The editor uses a configurable debounced autosave hook and exposes manual saves/snapshots.

## 2. Existing feature inventory

### Formatting and blocks

- Font family/size, bold, italic, underline, strike, color, multicolor highlight, subscript, superscript, clear formatting.
- H1–H6, paragraph alignment, indentation, line height, bullet/number/task lists, blockquote, code block, horizontal rule, callout, page break, TOC node, comments, and embedded flow blocks.
- Active toolbar states, slash commands, floating selection formatting, keyboard commands, paste-as-plain-text, and requirement-oriented snippets.

### Page experience

- A4, Letter, and Legal; portrait/landscape; visual page canvas; padding presets/custom margins; headers, footers, page-number display; page breaks; page themes; zoom; print/export page settings.
- Current canvas is a visual continuous page, not true automatic pagination.

### Tables

- Insert/resizable table, add/delete row and column, merge/split, header row, cell background, vertical alignment, text alignment, and contextual Table ribbon/menu.
- Requirement-specific table snippets exist for risks, assumptions, decisions, traceability, approvals, and NFRs.

### Images

- URL/file insertion, paste, drag/drop, base64 acceptance, selection, drag repositioning in document flow, resize handle/presets, left/center/right alignment, replacement/removal paths, and export image handling.

### Navigation and search

- Auto-generated outline from headings, duplicate-heading warning, click-to-navigate, TOC insertion, find next/previous, replace/replace all, case sensitivity, whole word, regex, and Ctrl/Cmd+F interception.

### Versions, metadata, and safety

- Initial, periodic autosave, manual, pre-restore, and restored snapshots; version list/compare/restore UI.
- Type, status, tags, pin, created/updated timestamp, review state, comments, page design metadata.
- Full-document and section AI edits use proposal/diff review.

### Templates/import/export/AI

- Built-in document templates and locally saved custom templates.
- Imports include DOCX/DOCM, PDF, Markdown, HTML, TXT, and JSON through a shared read/convert path.
- Exports include DOCX/PDF through Electron and Markdown/HTML/JSON client-side. Export handles headings, lists, tables, images, page breaks, cover/TOC/header/footer, branding, and flow rendering.
- AI supports full/section/selection editing, quality analysis, requirement-aware generation, linked project documents, and Knowledge extraction.

## 3. Partial implementations

- Page headers/footers and page numbers are visual single-page representations; automatic physical pagination and per-section running content are not implemented.
- Tables have core structural commands but not explicit numeric column width, row height, cell padding/border designer, table alignment, or a dedicated floating cell toolbar.
- Images are capable in-editor but still use large data URLs. Caption, crop, wrap/anchor, replace from the floating toolbar, and managed asset storage are incomplete.
- Outline navigation is text-based; duplicate headings make stable navigation ambiguous. Stable heading IDs, bookmarks, and cross-references are not complete.
- Metadata lacks author, owner, semantic document version, archived status, configurable type registry, and workflow permissions.
- DOCX/PDF conversion is substantial but not a lossless round-trip model; import compatibility reporting is absent.
- Selected-text AI currently applies returned text directly; a preview with Replace/Insert below/Copy is still required.
- Toolbar commands are feature-rich but concentrated in one large component and should be split by ribbon/command domain.

## 4. Missing capabilities

### P0 gaps

- Managed image asset abstraction instead of data URLs.
- Remaining advanced table attributes and a reusable floating table toolbar/command hook.
- Stable outline anchors/bookmarks.
- Automated persistence tests for failed, overlapping, and retried saves.

### P1/P2 gaps

- Paragraph spacing extension and style manager.
- True pagination/section breaks, multi-column sections, footnotes/endnotes, citations, references, captions, and tracked changes.
- Author/owner/version metadata, configurable types/status workflows.
- AI selection preview workflow and developer action registry.
- Stable `@project`/`@file` references.
- Asset-backed attachments, collaboration, permissions, and review links.

## 5. Technical debt and limitations

- `EditorPage` coordinates too many concerns and should be decomposed without moving persistence into Tiptap components.
- `EditorToolbar` is large; commands, availability checks, and ribbon rendering are tightly colocated.
- HTML and Tiptap JSON are dual sources; the contract needs explicit canonical/fallback rules and validation.
- Some UI busy state is shared between saving and AI operations.
- JSON fields for page settings/comments ease compatibility but limit querying and schema validation.
- `allowBase64: true` plus clipboard FileReader can produce very large database rows and version snapshots.
- Current document update API has no server revision token, so multi-window conflict detection is not possible yet.
- Document type/status unions and template catalogs are compile-time registries rather than user/project configuration.

## 6. Recommended architecture

Keep Tiptap. It already covers the required editing model and is deeply integrated with stored HTML/JSON and export.

Incrementally organize the existing feature as:

```text
editor/
  components/
    shell/ toolbar/ table/ image/ outline/ search/ metadata/ history/
  extensions/
  hooks/
    use-document-session.ts
    use-document-autosave.ts
    use-editor-commands.ts
    use-version-history.ts
  services/
    document-assets.ts
    document-conversion.ts
    document-ai-actions.ts
  lib/
    canonical-content.ts
    table-commands.ts
    document-references.ts
```

Rules:

- Tiptap owns transient editor/selection state.
- `EditorPage`/session hook owns artifact-local dirty state and recovery.
- Zustand owns repository/cache state, not every keystroke.
- Electron repositories own persistence, revision checks, and snapshot policy.
- Import/export uses a normalized conversion model and compatibility warnings.
- Media nodes reference stable asset IDs/URLs; storage adapters resolve them for local or remote backends.

## 7. Database/schema recommendations

No migration was required for the persistence hardening implemented in this pass.

Recommended next additive migration:

- `Document.revision Int @default(0)` for compare-and-swap saves and multi-window conflict detection.
- `Document.author String`, `owner String`, `semanticVersion String` as nullable fields.
- Add `archived` while preserving `superseded` during migration.
- `DocumentAsset` with ID, document/project ID, storage provider, URI/path, MIME type, byte size, checksum, width/height, alt text, timestamps.
- `DocumentReference` with source document, target kind/ID, display label, and fallback path.
- Optionally store version metadata/summary separately from large snapshot content for lazy history loading.

All fields should be additive with serializer defaults so existing saved documents remain readable.

## 8. Tiptap extension plan

Existing extensions should be retained. Add only focused extensions:

- `ParagraphSpacing`: paragraph before/after attributes with export mappings.
- Extended table cell/header attributes: padding, border, explicit width, row height, horizontal/vertical alignment.
- Extended image/figure node: asset ID, caption, crop/fit, wrap, and compatibility fallback `src`.
- `HeadingAnchor`: stable ID generation and collision handling.
- `DocumentReference`: inline atom node carrying target kind/stable ID/display text.
- Later: section break, bookmark, footnote/citation, and tracked-change marks/nodes.

## 9. Package assessment

No new package is required for the current P0 work.

- Existing Tiptap packages support the core formatting/table model.
- Existing `docx`, PDF tooling, Electron printing, and import utilities should be improved behind current abstractions.
- An image processing/storage package should not be added until the asset-provider contract is defined. Electron/native APIs can first provide local file copying and metadata.
- A DOCX parsing dependency should only be considered after fidelity fixtures define the unsupported cases in the current importer.

## 10. File-by-file plan

### Completed in this pass

- `src/shared/stores/document.store.ts`: reliable save result, error state, pending save tracking, mutation-only response merge.
- `src/shared/hooks/useAutoSave.ts`: serialized/coalesced saves, acknowledge-after-success, retry, hidden/blur flush.
- `src/features/editor/pages/EditorPage.tsx`: save failure UX and mandatory recovery version before full AI apply.

### Next P0

- `tests/document-autosave.test.ts`: fake-timer tests for debounce, overlapping changes, failure/retry, stale acknowledgment, and document switch.
- `extensions/styled-table.ts`: add normalized table/cell attributes.
- `lib/table-commands.ts` and `components/table/FloatingTableToolbar.tsx`: isolate commands and contextual UI.
- `services/document-assets.ts`, Electron IPC/repository, `extensions/resizable-image.ts`, and clipboard/insert dialogs: managed assets with legacy data URL compatibility.
- `extensions/heading-anchor.ts` and outline utilities/components: stable targets.

### P1

- Split `EditorToolbar.tsx` into ribbon components and a command hook.
- Add selected-text AI proposal preview.
- Add metadata fields and configurable registry adapters.
- Add import/export compatibility report and fixture suite.

## 11. Compatibility and risk controls

- Do not replace Tiptap or change the stored JSON/HTML shape wholesale.
- New extension attributes require defaults and HTML parse fallbacks.
- Existing base64 image documents must continue rendering after managed assets ship.
- Revisions require IPC contract changes and additive database migration; old clients must receive a clear conflict error rather than silently overwrite.
- Table styling must map consistently to HTML, DOCX, and PDF or be marked unsupported in preflight.
- Avoid automatic conversion on open. Migrate lazily only when a user saves, and preserve the last compatible version.

## 12. Implemented P0 persistence behavior

- A save is acknowledged only after IPC success.
- Failed saves keep the editor dirty and expose a retrying status.
- Autosaves are serialized; changes made during an in-flight save are queued and saved next.
- The store merges only fields from the acknowledged mutation, preventing an older full response from reverting unrelated newer local fields.
- Autosave retries transient failures after a short delay.
- Blur and hidden-window events request a save flush.
- Full/section AI replacement cannot apply until the original is saved and a named recovery version is created.

