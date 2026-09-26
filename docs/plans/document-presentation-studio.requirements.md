# Document & Presentation Studio — Finalized Product Requirements

Status: Proposed baseline for implementation  
Scope: Document editor, presentation editor, shared editor UX, persistence, export  
Primary outcome: Make both editors approachable for first-time users while enabling professional, deeply customizable output.

## 1. Product decisions

1. Keep documents and presentations as separate authoring modes backed by shared assets, themes, comments, history, autosave, and AI services.
2. Evolve presentations from the current ordered block/card model into a hybrid editor:
   - **Design mode:** Canva-style free-positioned elements on one slide canvas.
   - **Flow mode:** Current structured block editing for fast, accessible, AI-friendly authoring.
   - A user can switch modes without losing content. Structured blocks become positioned elements; unsupported freeform compositions remain editable in Design mode.
3. Support both slide navigator positions:
   - Left rail (default for desktop and large decks).
   - Bottom filmstrip (recommended for wide canvas focus and smaller screens).
   - Remember the preference per user; add collapse and resize controls.
4. Use an optimistic, local-first interaction model. User actions update immediately, autosave in the background, and failures expose retry/rollback without blocking continued editing.
5. Preserve the existing typed presentation model through a versioned migration rather than replacing saved decks in place.

## 2. Current capability baseline

### Presentation Studio already has

- Presentation list, create, duplicate, delete, pin, and workspace routes.
- Typed slides/cards and blocks: heading, text, bullets, columns, image, callout, divider, and metric.
- Ten layout variants, theme presets, custom theme colors/fonts/density, aspect ratios, and branding toggle.
- Inline content editing, block reordering, slide drag reorder, multi-slide selection, copy/paste, undo/redo, and autosave.
- AI generation and AI-assisted proposed changes grounded by linked project documents and Knowledge.
- Presenter/audience modes, speaker notes, manual checkpoints, PDF export, PPTX export, and export preview.

### Document Studio already has

- Rich text styles, headings, lists, links, images, tables, callouts, page breaks, TOC, reusable requirement snippets, find/replace, and keyboard shortcuts.
- Page size, margins, orientation, document themes, read/card views, outline, comments, analytics/quality tools, AI editing with diff review, version history, templates, import, and PDF/DOCX/Markdown/HTML/JSON export paths.
- Background autosave and generation progress UI.

## 3. Confirmed gaps

### Presentation gaps

- No free-positioned scene graph: elements have no x/y position, width/height, rotation, z-index, opacity, lock, or visibility.
- No resize/rotate handles, snap guides, rulers, grid controls, alignment/distribution, grouping, or layers panel.
- No independent element typography, fill, border, shadow, corner, spacing, crop, mask, or image-fit controls.
- No shapes, icons, lines/arrows, charts, tables, video/audio, embeds, frames, or reusable components.
- No master slides/layout builder, brand kit, saved styles, user templates, or apply-to-all editing.
- No transitions, element animations, timing, or animation ordering.
- Slide navigation is fixed to the left; canvas shows every slide vertically instead of focusing one editable stage.
- Clipboard/history does not cover every setting; undo snapshots omit several deck properties.
- Accessibility checks and export-fidelity validation are absent.

### Document gaps

- Theme controls are primarily preset/page-level; users cannot fully define reusable paragraph, heading, list, table, caption, header, and footer styles.
- No section-level page settings, multi-column sections, headers/footers, footnotes/endnotes, citations/bibliography, cross-references, fields, or advanced pagination controls.
- Limited object layout: images are resizable but do not provide complete wrapping, anchoring, layering, crop, caption numbering, alignment, and position controls.
- Tables lack a complete visual designer for cell styles, repeated headers, merge/split ergonomics, formulas, and pagination behavior.
- No tracked changes/suggesting workflow, granular permissions, or real-time co-author presence.
- Template customization is content-oriented; no complete visual template builder with reusable style tokens and locked regions.
- Import/export fidelity needs explicit round-trip tests for complex Word content.

### Shared UX and optimistic-state gaps

- No mutation queue, revision token, stale-response protection, conflict UI, offline queue, or persistent crash-recovery draft.
- Save state is too coarse (`dirty` / `saving`); users need Saved, Saving, Offline, Retry required, and Conflict states.
- Destructive list operations are mostly server-first, so actions feel delayed and lack an Undo affordance.
- Long-running generation/export can block context or provide insufficiently actionable recovery.
- Dense toolbars and inspector sections need progressive disclosure, command search, clearer empty states, and responsive layouts.

## 4. Functional requirements

Priority definitions: P0 = foundation/release blocker, P1 = complete professional editor, P2 = advanced ecosystem.

### A. Shared editor shell and UX

- **UX-01 (P0):** Use a consistent shell: top command bar, optional left/bottom navigator, central stage/page, contextual right inspector, bottom status/zoom bar.
- **UX-02 (P0):** Navigator position can be Left or Bottom, can be collapsed/resized, and is persisted per user. Switching must preserve selection and scroll position.
- **UX-03 (P0):** Focus the presentation workspace on one active slide. Provide fit, fill, 25–400% zoom, pan, and “zoom to selection.”
- **UX-04 (P0):** Inspector content changes with selection; deck/page settings appear when nothing is selected. Frequently used controls remain visible; advanced controls are collapsible.
- **UX-05 (P0):** Add command palette and searchable insert panel with keyboard-first actions and recent items.
- **UX-06 (P0):** Every destructive editor action has Undo; list deletion uses optimistic removal plus a time-limited Undo toast before permanent cleanup.
- **UX-07 (P0):** Provide polished loading skeletons, actionable empty states, inline validation, non-blocking progress, and clear success/failure feedback.
- **UX-08 (P1):** Responsive behavior: bottom filmstrip under constrained width; drawers replace fixed sidebars; touch-sized controls and trackpad gestures.
- **UX-09 (P1):** Context menus and right-click actions for slide/page/element operations.
- **UX-10 (P1):** WCAG 2.2 AA keyboard navigation, visible focus, screen-reader labels, contrast checking, reduced motion, and logical reading order.

### B. Optimistic persistence and recovery

- **OPT-01 (P0):** Apply local mutations synchronously and enqueue persistence with a unique mutation ID and base revision.
- **OPT-02 (P0):** Coalesce high-frequency typing/dragging mutations; persist after 750–1200 ms idle and flush on navigation/window close.
- **OPT-03 (P0):** Ignore stale save responses. A successful older request must never overwrite newer local state or clear its dirty flag.
- **OPT-04 (P0):** Expose status: Saved, Saving, Offline—saved locally, Save failed—Retry, and Conflict—Review.
- **OPT-05 (P0):** Retry transient failures with bounded exponential backoff; keep editing enabled. Provide manual Retry and Copy recovery data.
- **OPT-06 (P0):** Persist recovery snapshots locally after meaningful mutations and restore after crash/restart.
- **OPT-07 (P1):** Support offline edit queues with ordered replay when connectivity/API availability returns.
- **OPT-08 (P1):** Use revision-based conflict detection. Auto-merge non-overlapping operations; show a local-versus-remote review for overlapping edits.
- **OPT-09 (P1):** Create named versions at explicit milestones and lightweight autosave revisions for recovery. History identifies author/source and change summary.

### C. Canva-style Presentation Design mode

- **PRES-01 (P0):** Introduce a versioned scene model per slide with element ID, type, x, y, width, height, rotation, z-index, opacity, lock, visibility, style, and content.
- **PRES-02 (P0):** Support select, multi-select, marquee, move, resize, rotate, duplicate, delete, nudge, and direct text editing.
- **PRES-03 (P0):** Add snap-to-grid, smart guides, safe margins, rulers, alignment, equal spacing, and distribute controls.
- **PRES-04 (P0):** Add layers panel with reorder, rename, lock, hide, group/ungroup, and nested group selection.
- **PRES-05 (P0):** Provide text, image, shape, line/arrow, icon, and group elements. Keep existing typed blocks available through Flow mode.
- **PRES-06 (P0):** Text controls include font, weight, size, line/letter spacing, alignment, lists, color, highlight, link, auto-fit, and text-box padding.
- **PRES-07 (P0):** Image controls include upload/replace, crop, fit/fill, focal point, flip, transparency, border, radius, shadow, alt text, and reset.
- **PRES-08 (P0):** Element styles include fill, gradient, border, radius, shadow, opacity, and copy/paste style.
- **PRES-09 (P1):** Add tables, charts, diagrams, frames/masks, equations, code blocks, video/audio, and URL embeds.
- **PRES-10 (P1):** Add reusable slide templates, duplicate slide, sections, hide slide, slide numbers, search, and bulk slide actions.
- **PRES-11 (P1):** Add master layouts and brand kit: logos, color tokens, font pairs, default element styles, and locked brand regions.
- **PRES-12 (P1):** Add presenter-safe transitions and element animations with timing/order controls and reduced-motion behavior.
- **PRES-13 (P1):** Presenter mode includes notes, timer, next-slide preview, jump-to-slide, blackout, pointer, and audience-window health.
- **PRES-14 (P1):** PDF/PPTX export preserves geometry, fonts (or substitutes with warning), crop, opacity, layering, notes, links, and aspect ratio.
- **PRES-15 (P1):** Accessibility checker flags missing alt text, low contrast, too-small text, reading-order issues, and inaccessible media.
- **PRES-16 (P2):** Asset library supports project uploads, folders/tags, recent assets, stock integrations, background removal, and reusable components.
- **PRES-17 (P2):** Real-time collaboration supports cursors, presence, comments, mentions, permissions, and presentation review links.

### D. Fully customizable Document mode

- **DOC-01 (P0):** Create a style manager for Normal, Title, Subtitle, Heading 1–6, quote, code, caption, list, and table styles with inheritance and update-all.
- **DOC-02 (P0):** Add document-wide design tokens for fonts, type scale, colors, spacing, borders, tables, and callouts; save them as reusable themes/templates.
- **DOC-03 (P0):** Add headers/footers with page number, total pages, document metadata, logo, first-page difference, and odd/even variants.
- **DOC-04 (P0):** Add section breaks with section-specific size, orientation, margins, columns, header/footer linkage, and numbering.
- **DOC-05 (P0):** Complete image/object layout: crop, wrap modes, anchor, position, alignment, layer order, caption, alt text, and lock aspect ratio.
- **DOC-06 (P0):** Add a visual table designer: styles, cell fill/border/padding/alignment, merge/split, repeat header, row break rules, sorting, and accessible headers.
- **DOC-07 (P1):** Add footnotes/endnotes, citations, bibliography, cross-references, bookmarks, captions, and automatic figure/table numbering.
- **DOC-08 (P1):** Add tracked changes/suggesting mode with accept/reject per change or all changes and filter by author/type.
- **DOC-09 (P1):** Add reusable blocks, locked template regions, content controls/placeholders, and a full visual template builder.
- **DOC-10 (P1):** Improve outline/navigation with drag-to-reorder sections, collapse, document map, page thumbnails, and search results.
- **DOC-11 (P1):** Add preflight checks for broken links, missing alt text, empty placeholders, heading hierarchy, table overflow, widows/orphans, and unresolved comments.
- **DOC-12 (P1):** Provide high-fidelity DOCX/PDF import/export with a compatibility report for unsupported content and visual regression fixtures.
- **DOC-13 (P2):** Add real-time collaboration, granular permissions, approval workflows, e-signature handoff, and published read-only links.

### E. AI assistance

- **AI-01 (P0):** AI changes remain proposals with preview/diff and explicit Apply, except opt-in low-risk commands such as spelling fixes.
- **AI-02 (P0):** AI actions operate on explicit scope: selection, element/block, slide/page, section, or entire artifact.
- **AI-03 (P0):** Generated claims retain source references to linked documents/Knowledge and expose source status when source content changes.
- **AI-04 (P1):** Presentation AI can generate/rewrite layouts without destroying manually positioned elements; offer “preserve design” and “reflow design.”
- **AI-05 (P1):** Document AI can apply a style guide, shorten/expand to a target, create missing sections, and resolve quality warnings through reviewable changes.
- **AI-06 (P1):** Add design suggestions for overflow, alignment, density, contrast, and slide consistency, with one-click preview and revert.

## 5. Data and architecture requirements

- Add `schemaVersion` to presentations, documents, view state, and recovery snapshots.
- Represent presentation Design mode as a normalized scene graph. Keep slide ordering separate from element data to reduce mutation size.
- Preserve Flow-mode blocks and provide deterministic block-to-scene conversion. Never silently discard unsupported scene properties when returning to Flow mode.
- Store binary media as managed assets referenced by stable asset IDs; do not embed large data URLs in the deck JSON.
- Introduce an operation/mutation envelope: `mutationId`, `artifactId`, `baseRevision`, `clientTimestamp`, `operation`, and `payload`.
- Persistence APIs return `revision`, `acceptedMutationIds`, and conflict details. Saves must be idempotent.
- History snapshots include all user-visible state: content, geometry, theme, aspect ratio, branding, notes, and relevant document page/style settings.
- Export services consume the same normalized model as the editor and run a preflight report before generating output.
- Migrate existing presentation cards automatically on first open, preserve the original payload until the migrated deck is saved successfully, and allow rollback.

## 6. Non-functional requirements

- Pointer manipulation should render at 60 fps for a typical slide and remain usable with at least 200 elements.
- Local edit feedback under 50 ms; navigation switch under 100 ms; save-status transition shown within 150 ms.
- Open a 50-slide deck or 100-page document in under 2 seconds on the target desktop baseline by virtualizing thumbnails/pages.
- Autosave must not lose acknowledged local edits during crash, restart, or temporary API failure.
- Undo/redo covers content and visual operations with at least 100 local steps or a memory-bounded equivalent.
- Export output must pass golden-file visual comparison for supported features and clearly warn before substituting unsupported fonts/media.
- All editing commands must be keyboard reachable; common commands must have discoverable shortcuts.

## 7. Delivery plan

### Phase 0 — Stabilize the existing editors (1 sprint)

- Add save revisions, stale-response protection, richer save status, retry, crash snapshot, and safe navigation flush.
- Expand undo snapshots to every persisted deck setting.
- Add navigator Left/Bottom/Collapsed preference and single-slide focus without changing the stored card model.
- Add telemetry/error instrumentation for saves, exports, recovery, and editor latency.

Exit criteria: rapid edits cannot be overwritten by an older save response; forced save failure is recoverable; navigator switches without selection loss.

### Phase 1 — Usable customization foundation (2–3 sprints)

- Ship shared editor shell, zoom/pan, insert search, responsive inspector, and accessibility foundation.
- Ship presentation scene model, migration, core element manipulation, guides, layers, text/image/shape/line elements, and core styles.
- Ship document style manager, design tokens, headers/footers, sections, object layout, and improved table designer.

Exit criteria: users can create a branded presentation without a preset layout and a branded multi-section document without editing raw HTML/CSS.

### Phase 2 — Professional authoring and fidelity (2–3 sprints)

- Ship master layouts/brand kit, charts/tables/media, advanced presenter tools, animations/transitions, and accessibility preflight.
- Ship citations/references, tracked changes, reusable blocks, template builder, document preflight, and round-trip compatibility reporting.
- Rebuild PDF/PPTX/DOCX export coverage around normalized models and golden fixtures.

Exit criteria: representative customer artifacts export with approved visual fidelity and no silent feature loss.

### Phase 3 — Collaboration and ecosystem (future)

- Shared asset library, stock/media integrations, reusable components, real-time collaboration, review links, permissions, approvals, and publishing.

## 8. Release acceptance scenarios

1. A user moves and resizes multiple slide elements, loses the API connection, keeps editing, restarts the app, recovers the exact local state, reconnects, and saves without duplicate operations.
2. A user switches the slide navigator from left to bottom, collapses it, changes zoom, reopens the deck, and sees those workspace preferences restored.
3. A legacy card deck migrates to the new model, remains visually equivalent, exports to PDF/PPTX, and can be rolled back if migration save fails.
4. A user creates a brand kit, applies it to an entire deck, overrides one slide, and later updates the kit without destroying the override.
5. A user creates a document with cover, different first-page header, landscape table section, captions, references, and page numbering; DOCX/PDF output matches preview within agreed tolerances.
6. A stale autosave response arrives after a newer edit; the UI remains dirty until the newer revision is acknowledged and content never reverts.
7. Keyboard-only users can create/select/reorder slides, edit elements, open the inspector, run commands, and export.

## 9. Explicitly out of the first release

- Full parity with every Canva, PowerPoint, or Microsoft Word feature.
- Mobile-first authoring; responsive desktop/tablet support is included, but phone editing is view/light-edit only.
- Marketplace, paid stock licensing, public website publishing, video rendering, and simultaneous real-time collaboration.
- Arbitrary third-party plugins inside the editor runtime.

## 10. Success measures

- At least 90% of editing actions feel immediate and complete without a blocking spinner.
- Save-retry recovery succeeds for at least 99.9% of simulated transient failures with no lost local edits.
- New users create and export a customized 5-slide deck without help in under 10 minutes.
- New users create a branded multi-section document in under 15 minutes.
- Export fidelity defects and abandoned exports decrease release over release; exact baselines are captured before Phase 1.
- Accessibility preflight completion and missing-alt-text resolution are measurable per artifact.

