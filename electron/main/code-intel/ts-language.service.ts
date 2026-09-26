import { existsSync, readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import ts from 'typescript'
import { detectLanguage, isJsFamily } from '@shared/lib/language-detect'
import type { DiagnosticHit } from '@shared/types/agent'
import type {
  LanguageCompletionResult,
  LanguageHover,
  LanguageLocation,
  LanguageQuery
} from '@shared/types/code-intel'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { mainEventBus } from '../events/bus'
import { workspaceSession } from '../security/workspace-session'
import { logger } from '../infra/logger.service'
import { broadcastToWorkbench } from '../windows/window-manager'

const TS_LIKE = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])

function extOf(filePath: string): string {
  const index = filePath.lastIndexOf('.')
  return index >= 0 ? filePath.slice(index).toLowerCase() : ''
}

export function isLanguageServicePath(filePath: string): boolean {
  return TS_LIKE.has(extOf(filePath)) || isJsFamily(detectLanguage(filePath))
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  switch (extOf(filePath)) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.TS
  }
}

function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split(/\r?\n/)
  const index = Math.max(0, Math.min(line - 1, lines.length - 1))
  let offset = 0
  for (let i = 0; i < index; i++) offset += (lines[i]?.length ?? 0) + 1
  return offset + Math.max(0, column - 1)
}

function lineColOf(text: string, offset: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(offset, text.length))
  const before = text.slice(0, safe)
  const lines = before.split(/\r?\n/)
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 }
}

function displayParts(parts: ts.SymbolDisplayPart[] | undefined): string {
  return ts.displayPartsToString(parts).trim()
}

class TsLanguageService {
  private rootPath: string | null = null
  private service: ts.LanguageService | null = null
  private versions = new Map<string, number>()
  private overlays = new Map<string, string>()
  private snapshots = new Map<string, { version: number; snapshot: ts.IScriptSnapshot }>()
  private fileNames: string[] = []
  private compilerOptions: ts.CompilerOptions = {}
  private diagnosticsTimer: ReturnType<typeof setTimeout> | null = null
  private pendingDiagPath: string | null = null

  constructor() {
    mainEventBus.on('PROJECT_OPENED', ({ rootPath }) => {
      this.open(rootPath)
    })
    mainEventBus.on('PROJECT_CLOSED', () => {
      this.close()
    })
    mainEventBus.on('FILE_CHANGED', ({ path, kind, previousPath }) => {
      if (kind === 'rename' && previousPath) this.forgetFile(previousPath)
      if (kind === 'delete') this.forgetFile(path)
      else if (isLanguageServicePath(path)) {
        this.overlays.delete(path)
        this.bumpVersion(path)
        this.scheduleDiagnostics(path)
      }
    })
  }

  open(rootPath: string): void {
    this.close()
    this.rootPath = rootPath
    const parsed = this.readProject(rootPath)
    this.compilerOptions = parsed.options
    this.fileNames = parsed.fileNames.filter((name) => isLanguageServicePath(name))
    const host = this.createHost()
    this.service = ts.createLanguageService(host, ts.createDocumentRegistry())
    logger.info(`TypeScript language service ready (${this.fileNames.length} files)`, 'TsLang')
  }

  close(): void {
    if (this.diagnosticsTimer) clearTimeout(this.diagnosticsTimer)
    this.diagnosticsTimer = null
    this.service?.dispose()
    this.service = null
    this.rootPath = null
    this.versions.clear()
    this.overlays.clear()
    this.snapshots.clear()
    this.fileNames = []
    this.compilerOptions = {}
  }

  updateBuffer(path: string, content: string): void {
    const safe = this.safePath(path)
    if (!safe || !isLanguageServicePath(safe)) return
    this.overlays.set(safe, content)
    this.ensureListed(safe)
    this.bumpVersion(safe)
    this.scheduleDiagnostics(safe)
  }

  hover(query: LanguageQuery): LanguageHover | null {
    const resolved = this.prepareQuery(query)
    if (!resolved || !this.service) return null
    const info = this.service.getQuickInfoAtPosition(resolved.path, resolved.offset)
    if (!info) return null
    const title = displayParts(info.displayParts) || resolved.word
    const documentation = [
      displayParts(info.documentation),
      ...(info.tags ?? []).map((tag) => `@${tag.name} ${displayParts(tag.text)}`.trim())
    ]
      .filter(Boolean)
      .join('\n')
    return { title, documentation: documentation || undefined, source: 'typescript' }
  }

  definition(query: LanguageQuery): LanguageLocation[] {
    const resolved = this.prepareQuery(query)
    if (!resolved || !this.service) return []
    const defs = this.service.getDefinitionAtPosition(resolved.path, resolved.offset) ?? []
    return defs
      .map((item) => this.locationFrom(item.fileName, item.textSpan))
      .filter((item): item is LanguageLocation => Boolean(item))
  }

  references(query: LanguageQuery): LanguageLocation[] {
    const resolved = this.prepareQuery(query)
    if (!resolved || !this.service) return []
    const refs = this.service.getReferencesAtPosition(resolved.path, resolved.offset) ?? []
    const locations: LanguageLocation[] = []
    for (const group of refs) {
      for (const ref of group.references) {
        const loc = this.locationFrom(ref.fileName, ref.textSpan)
        if (loc) locations.push(loc)
      }
    }
    return locations.slice(0, 80)
  }

  completions(query: LanguageQuery): LanguageCompletionResult | null {
    const resolved = this.prepareQuery(query)
    if (!resolved || !this.service) return null
    const result = this.service.getCompletionsAtPosition(resolved.path, resolved.offset, {
      includeCompletionsForModuleExports: false,
      includeCompletionsWithInsertText: true
    })
    if (!result) return null
    const items = result.entries.slice(0, 60).map((entry) => ({
      label: entry.name,
      kind: String(entry.kind),
      detail: entry.kind,
      insertText: entry.insertText
    }))
    const identStart = resolved.word ? resolved.column - resolved.word.length : resolved.column
    return { items, fromColumn: Math.max(1, identStart) }
  }

  /** Rename a symbol; returns full rewritten file contents for each touched path. */
  rename(
    query: LanguageQuery & { newName: string }
  ): Array<{ path: string; content: string }> {
    const resolved = this.prepareQuery(query)
    if (!resolved || !this.service) return []
    const info = this.service.findRenameLocations(resolved.path, resolved.offset, false, false, true)
    if (!info?.length) return []
    const byFile = new Map<string, Array<{ start: number; end: number }>>()
    for (const loc of info) {
      const list = byFile.get(loc.fileName) ?? []
      list.push({ start: loc.textSpan.start, end: loc.textSpan.start + loc.textSpan.length })
      byFile.set(loc.fileName, list)
    }
    const edits: Array<{ path: string; content: string }> = []
    for (const [fileName, spans] of byFile) {
      const text = this.overlays.get(fileName) ?? this.readDisk(fileName)
      if (text === null) continue
      const ordered = [...spans].sort((a, b) => b.start - a.start)
      let next = text
      for (const span of ordered) {
        next = `${next.slice(0, span.start)}${query.newName}${next.slice(span.end)}`
      }
      edits.push({ path: fileName, content: next })
    }
    return edits
  }

  diagnosticsFor(path: string, content?: string): DiagnosticHit[] {
    const safe = this.safePath(path)
    if (!safe || !this.service || !isLanguageServicePath(safe)) return []
    if (content !== undefined) {
      this.overlays.set(safe, content)
      this.ensureListed(safe)
      this.bumpVersion(safe)
    }
    const syntactic = this.service.getSyntacticDiagnostics(safe)
    const semantic = this.service.getSemanticDiagnostics(safe)
    return [...syntactic, ...semantic].map((diag) => this.toHit(safe, diag))
  }

  private readProject(rootPath: string): { options: ts.CompilerOptions; fileNames: string[] } {
    const configPath = ts.findConfigFile(rootPath, ts.sys.fileExists, 'tsconfig.json')
    const defaults: ts.CompilerOptions = {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      esModuleInterop: true,
      isolatedModules: true,
      noEmit: true
    }
    if (!configPath) return { options: defaults, fileNames: [] }
    const read = ts.readConfigFile(configPath, ts.sys.readFile)
    if (read.error) {
      logger.warn('Failed to read tsconfig.json', 'TsLang')
      return { options: defaults, fileNames: [] }
    }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath), defaults, configPath)
    return {
      options: { ...defaults, ...parsed.options, noEmit: true, skipLibCheck: true },
      fileNames: parsed.fileNames
    }
  }

  private createHost(): ts.LanguageServiceHost {
    return {
      getCompilationSettings: () => this.compilerOptions,
      getScriptFileNames: () => {
        const extras = [...this.overlays.keys()].filter((path) => !this.fileNames.includes(path))
        return extras.length > 0 ? [...this.fileNames, ...extras] : this.fileNames
      },
      getScriptVersion: (fileName) => String(this.versions.get(fileName) ?? 1),
      getScriptSnapshot: (fileName) => this.snapshotFor(fileName),
      getScriptKind: (fileName) => scriptKindFor(fileName),
      getCurrentDirectory: () => this.rootPath ?? process.cwd(),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath
    }
  }

  private snapshotFor(fileName: string): ts.IScriptSnapshot | undefined {
    const overlay = this.overlays.get(fileName)
    if (overlay !== undefined) {
      return ts.ScriptSnapshot.fromString(overlay)
    }
    const version = this.versions.get(fileName) ?? 1
    const cached = this.snapshots.get(fileName)
    if (cached && cached.version === version) return cached.snapshot
    if (!existsSync(fileName)) return undefined
    try {
      const text = readFileSync(fileName, 'utf8')
      const snapshot = ts.ScriptSnapshot.fromString(text)
      this.snapshots.set(fileName, { version, snapshot })
      return snapshot
    } catch {
      return undefined
    }
  }

  private prepareQuery(query: LanguageQuery): {
    path: string
    offset: number
    column: number
    word: string
  } | null {
    const safe = this.safePath(query.path)
    if (!safe || !this.service || !isLanguageServicePath(safe)) return null
    if (query.content !== undefined) {
      this.overlays.set(safe, query.content)
      this.ensureListed(safe)
      this.bumpVersion(safe)
    }
    const text = this.overlays.get(safe) ?? this.readDisk(safe)
    if (text === null) return null
    const offset = offsetOf(text, query.line, query.column)
    let start = offset
    let end = offset
    while (start > 0 && /[\w$]/.test(text[start - 1]!)) start -= 1
    while (end < text.length && /[\w$]/.test(text[end]!)) end += 1
    return { path: safe, offset, column: query.column, word: text.slice(start, end) }
  }

  private locationFrom(fileName: string, span: ts.TextSpan): LanguageLocation | null {
    const text = this.overlays.get(fileName) ?? this.readDisk(fileName)
    if (text === null) return null
    const start = lineColOf(text, span.start)
    const end = lineColOf(text, span.start + span.length)
    return {
      path: fileName,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column
    }
  }

  private toHit(fileName: string, diag: ts.Diagnostic): DiagnosticHit {
    const text = this.overlays.get(fileName) ?? this.readDisk(fileName) ?? ''
    const start = typeof diag.start === 'number' ? lineColOf(text, diag.start) : { line: 1, column: 1 }
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
    const severity: DiagnosticHit['severity'] =
      diag.category === ts.DiagnosticCategory.Error
        ? 'error'
        : diag.category === ts.DiagnosticCategory.Warning
          ? 'warning'
          : 'info'
    return {
      file: fileName,
      line: start.line,
      column: start.column,
      code: diag.code ? `TS${diag.code}` : undefined,
      message,
      severity,
      source: 'typescript'
    }
  }

  private scheduleDiagnostics(path: string): void {
    this.pendingDiagPath = path
    if (this.diagnosticsTimer) clearTimeout(this.diagnosticsTimer)
    this.diagnosticsTimer = setTimeout(() => {
      const target = this.pendingDiagPath
      this.diagnosticsTimer = null
      this.pendingDiagPath = null
      if (!target) return
      try {
        const items = this.diagnosticsFor(target)
        broadcastToWorkbench(IPC_CHANNELS.LANG_DIAGNOSTICS, { path: target, items })
      } catch (error) {
        logger.warn(error instanceof Error ? error.message : 'diagnostics failed', 'TsLang')
      }
    }, 280)
  }

  private bumpVersion(path: string): void {
    this.versions.set(path, (this.versions.get(path) ?? 1) + 1)
    this.snapshots.delete(path)
  }

  private ensureListed(path: string): void {
    if (!this.fileNames.includes(path)) this.fileNames.push(path)
  }

  private forgetFile(path: string): void {
    const safe = this.safePath(path, false)
    if (!safe) return
    this.overlays.delete(safe)
    this.snapshots.delete(safe)
    this.versions.delete(safe)
    this.fileNames = this.fileNames.filter((name) => name !== safe)
  }

  private readDisk(path: string): string | null {
    try {
      if (!existsSync(path) || statSync(path).isDirectory()) return null
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  }

  private safePath(candidate: string, mustExist = false): string | null {
    try {
      if (!workspaceSession.getRoot() && this.rootPath) {
        const joined = candidate.includes(':') || candidate.startsWith(this.rootPath) ? candidate : join(this.rootPath, candidate)
        return joined
      }
      return workspaceSession.resolve(candidate, mustExist ? { mustExist: true } : undefined)
    } catch {
      return null
    }
  }
}

export const tsLanguageService = new TsLanguageService()
