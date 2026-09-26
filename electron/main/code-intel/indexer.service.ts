import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { app } from 'electron'
import { isIgnoredPath, mergeIgnoreNames } from '@shared/lib/ignore-rules'
import { detectLanguage, isIndexableSourceFile } from '@shared/lib/language-detect'
import { extractWithFallback } from '@shared/lib/symbol-extract-fallback'
import type {
  CodeSearchHit,
  CodeSearchRequest,
  FileParseResult,
  IndexedSymbol,
  IndexerStatus,
  SourceLanguage
} from '@shared/types/code-intel'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { mainEventBus } from '../events/bus'
import { workspaceStateService } from '../code-editor/workspace-state.service'
import { logger } from '../infra/logger.service'
import { broadcastToWorkbench } from '../windows/window-manager'
import { hashContent, scanWorkspaceFiles, type ScannedFile } from './file-scanner'
import { isIndexedFileUnchanged } from '@shared/lib/code-index'
import { CodeIndexDatabase } from './index-db'
import { treeSitterEngine } from './tree-sitter-parser'
import { WorkspaceWatcher } from './watcher'

const BATCH_SIZE = 10
const MAX_SEARCH_HITS = 200

function yieldMain(): Promise<void> {
  return new Promise((resolveYield) => setImmediate(resolveYield))
}

function indexDbPath(rootPath: string): string {
  const id = createHash('sha1').update(rootPath).digest('hex').slice(0, 16)
  return join(app.getPath('userData'), 'code-index', `${id}.db`)
}

function resolveImport(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.json`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js')
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

class IndexerService {
  private db: CodeIndexDatabase | null = null
  private rootPath: string | null = null
  private generation = 0
  private watcher = new WorkspaceWatcher()
  private status: IndexerStatus = {
    state: 'idle',
    rootPath: null,
    total: 0,
    processed: 0,
    skipped: 0,
    files: 0,
    symbols: 0
  }

  constructor() {
    mainEventBus.on('PROJECT_OPENED', ({ rootPath }) => {
      void this.open(rootPath)
    })
    mainEventBus.on('PROJECT_CLOSED', () => {
      this.close()
    })
    mainEventBus.on('FILE_CHANGED', ({ path, kind, previousPath }) => {
      if (kind === 'rename' && previousPath) this.removePath(previousPath)
      if (kind === 'delete') this.removePath(path)
      else void this.indexPath(path)
    })
    mainEventBus.on('IGNORE_RULES_CHANGED', () => {
      if (!this.rootPath || !this.db) return
      this.startWatcher()
      void this.reindex()
    })
  }

  getStatus(): IndexerStatus {
    return { ...this.status }
  }

  async start(): Promise<IndexerStatus> {
    if (!this.rootPath || !this.db) {
      throw new Error('No workspace open')
    }
    void this.reindex()
    return this.getStatus()
  }

  cancel(): IndexerStatus {
    if (this.status.state === 'scanning' || this.status.state === 'indexing') {
      this.generation += 1
      this.setStatus({ state: this.db ? 'watching' : 'idle' })
    }
    return this.getStatus()
  }

  search(request: CodeSearchRequest): CodeSearchHit[] {
    if (!this.db) return []
    const query = request.query.trim()
    if (!query) return []
    const limit = Math.min(Math.max(request.limit ?? 80, 1), MAX_SEARCH_HITS)
    let hits: CodeSearchHit[]
    switch (request.mode) {
      case 'regex':
        hits = this.db.searchRegex(query, limit)
        break
      case 'symbol':
        hits = this.db.searchSymbols(query, limit)
        break
      case 'reference':
        hits = this.db.searchReferences(query, limit)
        break
      default:
        hits = this.db.searchText(query, limit)
    }
    if (request.language) {
      hits = hits.filter((hit) => hit.language === request.language)
    }
    return hits
  }

  async open(rootPath: string): Promise<void> {
    this.close()
    this.rootPath = rootPath
    this.db = new CodeIndexDatabase(indexDbPath(rootPath))
    this.setStatus({
      state: 'scanning',
      rootPath,
      total: 0,
      processed: 0,
      skipped: 0,
      files: 0,
      symbols: 0,
      error: undefined
    })
    await this.reindex()
    this.startWatcher()
  }

  close(): void {
    this.generation += 1
    this.watcher.stop()
    this.db?.close()
    this.db = null
    this.rootPath = null
    this.setStatus({
      state: 'idle',
      rootPath: null,
      total: 0,
      processed: 0,
      skipped: 0,
      files: 0,
      symbols: 0,
      error: undefined
    })
  }

  async reindex(): Promise<void> {
    if (!this.db || !this.rootPath) return
    this.generation += 1
    const gen = this.generation
    const rootPath = this.rootPath
    const rules = mergeIgnoreNames(workspaceStateService.get().customIgnoreNames)
    this.setStatus({ state: 'scanning', error: undefined, processed: 0, skipped: 0 })
    mainEventBus.emit('PROJECT_INDEX_STARTED', { rootPath })

    try {
      const scanned = await scanWorkspaceFiles(rootPath, rules)
      if (gen !== this.generation) return
      this.setStatus({ state: 'indexing', total: scanned.length, processed: 0, skipped: 0 })

      for (let i = 0; i < scanned.length; i += BATCH_SIZE) {
        if (gen !== this.generation) return
        const batch = scanned.slice(i, i + BATCH_SIZE)
        await Promise.all(batch.map((file) => this.indexScannedFile(file, gen)))
        this.setStatus({ processed: Math.min(i + batch.length, scanned.length) })
        await yieldMain()
      }

      if (gen !== this.generation || !this.db) return
      this.db.removeMissing(new Set(scanned.map((file) => file.path)))
      const counts = this.db.counts()
      this.setStatus({
        state: 'watching',
        processed: scanned.length,
        files: counts.files,
        symbols: counts.symbols
      })
      mainEventBus.emit('PROJECT_INDEX_COMPLETED', {
        rootPath,
        files: counts.files,
        symbols: counts.symbols
      })
    } catch (error) {
      if (gen !== this.generation) return
      const message = error instanceof Error ? error.message : 'Indexing failed'
      logger.error(message, 'CodeIntel')
      this.setStatus({ state: 'error', error: message })
    }
  }

  async indexPath(filePath: string): Promise<void> {
    if (!this.db || !this.rootPath) return
    if (!isIndexableSourceFile(filePath)) return
    const rules = mergeIgnoreNames(workspaceStateService.get().customIgnoreNames)
    if (isIgnoredPath(this.rootPath, filePath, rules)) return
    try {
      const stat = await fs.stat(filePath)
      await this.indexScannedFile(
        {
          path: filePath,
          relativePath: relative(this.rootPath, filePath).replace(/\\/g, '/'),
          language: detectLanguage(filePath),
          size: stat.size,
          mtimeMs: Math.floor(stat.mtimeMs)
        },
        this.generation
      )
      if (!this.db) return
      const counts = this.db.counts()
      this.setStatus({ files: counts.files, symbols: counts.symbols, state: 'watching' })
    } catch {
      this.removePath(filePath)
    }
  }

  getDb(): CodeIndexDatabase | null {
    return this.db
  }

  fileSymbols(filePath: string): IndexedSymbol[] {
    return this.db?.symbolsForFile(filePath) ?? []
  }

  private removePath(filePath: string): void {
    this.db?.removeFile(filePath)
    if (this.db) {
      const counts = this.db.counts()
      this.setStatus({ files: counts.files, symbols: counts.symbols })
    }
  }

  private startWatcher(): void {
    if (!this.rootPath) return
    const rules = mergeIgnoreNames(workspaceStateService.get().customIgnoreNames)
    this.watcher.start(this.rootPath, rules, (path, kind) => {
      if (kind === 'rename' && !existsSync(path)) this.removePath(path)
      else void this.indexPath(path)
    })
  }

  private async indexScannedFile(file: ScannedFile, gen: number): Promise<void> {
    if (!this.db || gen !== this.generation) return
    const existing = this.db.getFile(file.path)
    if (existing && existing.mtimeMs === file.mtimeMs && existing.size === file.size) {
      this.status.skipped += 1
      return
    }
    let content: string
    try {
      content = await fs.readFile(file.path, 'utf8')
    } catch {
      this.status.skipped += 1
      return
    }
    const hash = hashContent(content)
    if (isIndexedFileUnchanged(existing, file, hash)) {
      this.status.skipped += 1
      return
    }
    const parsed = await this.parse(content, file.language)
    if (!this.db || gen !== this.generation) return
    const imports = parsed.imports.map((item) => ({
      ...item,
      resolvedPath: resolveImport(file.path, item.specifier)
    }))
    try {
      this.db.upsertFile({
        file: {
          path: file.path,
          relativePath: file.relativePath,
          language: file.language,
          size: file.size,
          mtimeMs: file.mtimeMs,
          hash,
          parser: parsed.parser
        },
        content,
        symbols: parsed.symbols,
        imports,
        references: parsed.references
      })
    } catch {
      // closed while indexing
    }
  }

  private async parse(source: string, language: SourceLanguage): Promise<FileParseResult> {
    try {
      return await treeSitterEngine.parse(source, language)
    } catch (error) {
      logger.warn(`Parse failed: ${error instanceof Error ? error.message : error}`, 'CodeIntel')
      return extractWithFallback(source, language)
    }
  }

  private setStatus(patch: Partial<IndexerStatus>): void {
    this.status = { ...this.status, ...patch }
    mainEventBus.emit('PROJECT_INDEX_PROGRESS', { status: this.status })
    broadcastToWorkbench(IPC_CHANNELS.INDEX_PROGRESS, this.status)
  }
}

export const indexerService = new IndexerService()
