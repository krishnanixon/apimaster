import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type {
  CodeSearchHit,
  IndexedFileRecord,
  IndexedImport,
  IndexedReference,
  IndexedSymbol,
  SourceLanguage
} from '@shared/types/code-intel'
import {
  buildFtsQuery,
  hitFromContent,
  regexSearchContent,
  scoreSymbolHit
} from '@shared/lib/code-index'

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  relative_path TEXT NOT NULL,
  language TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  hash TEXT NOT NULL,
  parser TEXT NOT NULL,
  indexed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  container TEXT,
  FOREIGN KEY(file_path) REFERENCES files(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS symbols_name_idx ON symbols(name);
CREATE INDEX IF NOT EXISTS symbols_file_idx ON symbols(file_path);
CREATE INDEX IF NOT EXISTS symbols_kind_idx ON symbols(kind);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  specifier TEXT NOT NULL,
  resolved_path TEXT,
  start_line INTEGER NOT NULL,
  FOREIGN KEY(file_path) REFERENCES files(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS imports_file_idx ON imports(file_path);
CREATE INDEX IF NOT EXISTS imports_spec_idx ON imports(specifier);

CREATE TABLE IF NOT EXISTS refs (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  FOREIGN KEY(file_path) REFERENCES files(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS refs_name_idx ON refs(name);

CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
  relative_path,
  content,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export interface FileIndexPayload {
  file: IndexedFileRecord
  content: string
  symbols: IndexedSymbol[]
  imports: IndexedImport[]
  references: IndexedReference[]
}

export class CodeIndexDatabase {
  private db: Database.Database

  constructor(dbPath: string) {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(dbPath)
    this.db.exec(SCHEMA)
  }

  close(): void {
    this.db.close()
  }

  getFile(path: string): { hash: string; mtimeMs: number; size: number } | null {
    const row = this.db
      .prepare('SELECT hash, mtime_ms as mtimeMs, size FROM files WHERE path = ?')
      .get(path) as { hash: string; mtimeMs: number; size: number } | undefined
    return row ?? null
  }

  listPaths(): string[] {
    return this.db.prepare('SELECT path FROM files').all().map((row) => (row as { path: string }).path)
  }

  upsertFile(payload: FileIndexPayload): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM files WHERE path = ?').run(payload.file.path)
      this.db.prepare('DELETE FROM file_fts WHERE relative_path = ?').run(payload.file.relativePath)
      this.db
        .prepare(
          `INSERT INTO files (path, relative_path, language, size, mtime_ms, hash, parser, indexed_at)
           VALUES (@path, @relativePath, @language, @size, @mtimeMs, @hash, @parser, @indexedAt)`
        )
        .run({
          path: payload.file.path,
          relativePath: payload.file.relativePath,
          language: payload.file.language,
          size: payload.file.size,
          mtimeMs: payload.file.mtimeMs,
          hash: payload.file.hash,
          parser: payload.file.parser,
          indexedAt: Date.now()
        })

      const insertSymbol = this.db.prepare(
        `INSERT INTO symbols (file_path, name, kind, start_line, end_line, container)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const symbol of payload.symbols) {
        insertSymbol.run(
          payload.file.path,
          symbol.name,
          symbol.kind,
          symbol.startLine,
          symbol.endLine,
          symbol.container ?? null
        )
      }

      const insertImport = this.db.prepare(
        `INSERT INTO imports (file_path, specifier, resolved_path, start_line) VALUES (?, ?, ?, ?)`
      )
      for (const item of payload.imports) {
        insertImport.run(payload.file.path, item.specifier, item.resolvedPath ?? null, item.startLine)
      }

      const insertRef = this.db.prepare(
        `INSERT INTO refs (file_path, name, kind, start_line) VALUES (?, ?, ?, ?)`
      )
      for (const ref of payload.references) {
        insertRef.run(payload.file.path, ref.name, ref.kind, ref.startLine)
      }

      this.db
        .prepare('INSERT INTO file_fts (relative_path, content) VALUES (?, ?)')
        .run(payload.file.relativePath, payload.content.slice(0, 200_000))
    })
    tx()
  }

  removeFile(path: string, relativePath?: string): void {
    const rel =
      relativePath ??
      (this.db.prepare('SELECT relative_path FROM files WHERE path = ?').get(path) as
        | { relative_path: string }
        | undefined)?.relative_path
    this.db.prepare('DELETE FROM files WHERE path = ?').run(path)
    if (rel) this.db.prepare('DELETE FROM file_fts WHERE relative_path = ?').run(rel)
  }

  removeMissing(livePaths: Set<string>): number {
    const existing = this.listPaths()
    let removed = 0
    for (const path of existing) {
      if (livePaths.has(path)) continue
      this.removeFile(path)
      removed += 1
    }
    return removed
  }

  counts(): { files: number; symbols: number } {
    const files = (this.db.prepare('SELECT COUNT(*) as n FROM files').get() as { n: number }).n
    const symbols = (this.db.prepare('SELECT COUNT(*) as n FROM symbols').get() as { n: number }).n
    return { files, symbols }
  }

  symbolsForFile(path: string): IndexedSymbol[] {
    const rows = this.db
      .prepare(
        `SELECT name, kind, start_line as startLine, end_line as endLine, container
         FROM symbols WHERE file_path = ? ORDER BY start_line ASC`
      )
      .all(path) as Array<{
      name: string
      kind: IndexedSymbol['kind']
      startLine: number
      endLine: number
      container: string | null
    }>
    return rows.map((row) => ({
      name: row.name,
      kind: row.kind,
      startLine: row.startLine,
      endLine: row.endLine,
      container: row.container ?? undefined
    }))
  }

  searchText(query: string, limit: number): CodeSearchHit[] {
    const ftsQuery = buildFtsQuery(query)
    if (!ftsQuery) return []
    try {
      const rows = this.db
        .prepare(
          `SELECT f.path, f.relative_path as relativePath, f.language, file_fts.content as content,
                  bm25(file_fts) as rank
           FROM file_fts
           JOIN files f ON f.relative_path = file_fts.relative_path
           WHERE file_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(ftsQuery, limit) as Array<{
        path: string
        relativePath: string
        language: SourceLanguage
        content: string
        rank: number
      }>
      return rows.map((row) => hitFromContent(row, query, Number(row.rank) || 0))
    } catch {
      const like = `%${query.replace(/["']/g, ' ').trim()}%`
      const rows = this.db
        .prepare(
          `SELECT f.path, f.relative_path as relativePath, f.language, file_fts.content as content
           FROM file_fts
           JOIN files f ON f.relative_path = file_fts.relative_path
           WHERE file_fts.content LIKE ? OR f.relative_path LIKE ?
           LIMIT ?`
        )
        .all(like, like, limit) as Array<{
        path: string
        relativePath: string
        language: SourceLanguage
        content: string
      }>
      return rows.map((row) => hitFromContent(row, query, 0))
    }
  }

  searchRegex(pattern: string, limit: number): CodeSearchHit[] {
    const rows = this.db
      .prepare(
        'SELECT f.path, f.relative_path as relativePath, f.language, file_fts.content as content FROM file_fts JOIN files f ON f.relative_path = file_fts.relative_path'
      )
      .all() as Array<{ path: string; relativePath: string; language: SourceLanguage; content: string }>
    return regexSearchContent(rows, pattern, limit)
  }

  searchSymbols(query: string, limit: number): CodeSearchHit[] {
    const like = `%${query}%`
    const rows = this.db
      .prepare(
        `SELECT s.name, s.kind, s.start_line as startLine, s.end_line as endLine,
                f.path, f.relative_path as relativePath, f.language
         FROM symbols s
         JOIN files f ON f.path = s.file_path
         WHERE s.name LIKE ? COLLATE NOCASE
         ORDER BY length(s.name) ASC
         LIMIT ?`
      )
      .all(like, limit) as Array<{
      name: string
      kind: string
      startLine: number
      endLine: number
      path: string
      relativePath: string
      language: SourceLanguage
    }>
    return rows.map((row) => ({
      path: row.path,
      relativePath: row.relativePath,
      language: row.language,
      startLine: row.startLine,
      endLine: row.endLine,
      name: row.name,
      kind: row.kind,
      snippet: `${row.kind} ${row.name}`,
      score: scoreSymbolHit(row.name, query)
    }))
  }

  searchReferences(query: string, limit: number): CodeSearchHit[] {
    const like = `%${query}%`
    const rows = this.db
      .prepare(
        `SELECT r.name, r.kind, r.start_line as startLine, f.path, f.relative_path as relativePath, f.language
         FROM refs r
         JOIN files f ON f.path = r.file_path
         WHERE r.name LIKE ? COLLATE NOCASE
         LIMIT ?`
      )
      .all(like, limit) as Array<{
      name: string
      kind: string
      startLine: number
      path: string
      relativePath: string
      language: SourceLanguage
    }>
    return rows.map((row) => ({
      path: row.path,
      relativePath: row.relativePath,
      language: row.language,
      startLine: row.startLine,
      name: row.name,
      kind: row.kind,
      snippet: `${row.kind} ${row.name}`,
      score: 1
    }))
  }
}
