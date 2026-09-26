# Changelog

All notable product changes and behavior changes are recorded here.

## Unreleased

- Rebranded the app to APIMaster and switched the desktop/UI logo to `public/apimaster.png`.
- New data folder: `apimaster` (collections from previous app names are not migrated).
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
