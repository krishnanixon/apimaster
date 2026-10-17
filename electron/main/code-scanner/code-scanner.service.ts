import { promises as fs, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { app } from 'electron'
import type { CodeScanInput, CodeScanProgress, CodeScanResult, DetectedEndpoint } from '@shared/types/code-scanner'
import { ProjectAnalyzer, isCandidateFile } from '@shared/lib/code-scanner/analyzer'
import { SKIPPED_DIRS, walkProject } from './project-walker'
import { readFilesAtRef } from './git-ref'
import { logger } from '../infra/logger.service'

const MAX_FILES = 5000
const MAX_FILE_BYTES = 1024 * 1024
/** Files parsed between yields to the event loop, so IPC stays responsive during a scan. */
const YIELD_EVERY = 20
const PROGRESS_INTERVAL_MS = 100
/** Editors save in bursts (format on save, several files); wait for the burst to end. */
const WATCH_DEBOUNCE_MS = 1500

const yieldToEventLoop = () => new Promise<void>((done) => setImmediate(done))
/** Folders remembered across restarts, so scanned collections can re-scan and open their sources. */
const MAX_REMEMBERED_ROOTS = 50

function rootsFile(): string {
  return join(app.getPath('userData'), 'data', 'code-scanner-roots.json')
}

class CodeScannerService {
  /**
   * Only folders the user chose in the native picker may be scanned or read. Kept in the main
   * process (and its own file), so the renderer can't add one.
   */
  private approvedRoots: Set<string> | null = null
  private readonly running = new Map<string, AbortController>()

  private roots(): Set<string> {
    if (!this.approvedRoots) {
      this.approvedRoots = new Set()
      try {
        const saved = JSON.parse(readFileSync(rootsFile(), 'utf8')) as unknown
        if (Array.isArray(saved)) for (const root of saved) if (typeof root === 'string') this.approvedRoots.add(resolve(root))
      } catch {
        // First run, or an unreadable file: start with none.
      }
    }
    return this.approvedRoots
  }

  approveRoot(path: string): string {
    const root = resolve(path)
    const roots = this.roots()
    roots.delete(root)
    roots.add(root)
    try {
      mkdirSync(dirname(rootsFile()), { recursive: true })
      writeFileSync(rootsFile(), JSON.stringify([...roots].slice(-MAX_REMEMBERED_ROOTS)))
    } catch (error) {
      logger.warn(`Could not remember the scanned folder: ${error instanceof Error ? error.message : String(error)}`, 'CodeScanner')
    }
    return root
  }

  /** The resolved folder, if the user picked it in the folder picker; files are read only from there. */
  approvedRoot(path: string): string | null {
    const root = resolve(path)
    return this.roots().has(root) ? root : null
  }

  cancel(scanId: string): void {
    this.running.get(scanId)?.abort()
  }

  async scan(input: CodeScanInput, onProgress: (progress: CodeScanProgress) => void): Promise<CodeScanResult> {
    const root = resolve(input.rootPath)
    if (!this.roots().has(root)) throw new Error('Choose the project folder with the folder picker first')
    if (this.running.has(input.scanId)) throw new Error('This scan is already running')

    const controller = new AbortController()
    this.running.set(input.scanId, controller)
    const started = Date.now()
    try {
      onProgress({ scanId: input.scanId, phase: 'walking', filesDone: 0, filesTotal: 0 })
      const walk = await walkProject(root, { maxFiles: MAX_FILES, signal: controller.signal, include: isCandidateFile })

      const analyzer = new ProjectAnalyzer(walk.files)
      let skipped = 0
      let lastProgress = 0
      for (let i = 0; i < walk.files.length; i++) {
        if (controller.signal.aborted) throw new Error('Scan cancelled')
        const file = walk.files[i]
        try {
          const absolute = join(root, file)
          const stat = await fs.stat(absolute)
          if (stat.size > MAX_FILE_BYTES) skipped++
          else analyzer.addFile(file, await fs.readFile(absolute, 'utf8'))
        } catch {
          skipped++
        }
        if (Date.now() - lastProgress > PROGRESS_INTERVAL_MS) {
          lastProgress = Date.now()
          onProgress({ scanId: input.scanId, phase: 'parsing', filesDone: i + 1, filesTotal: walk.files.length, currentFile: file })
        }
        if (i % YIELD_EVERY === 0) await yieldToEventLoop()
      }

      const analysis = analyzer.finish()
      const result: CodeScanResult = {
        scanId: input.scanId,
        rootPath: root,
        projectName: await this.projectName(root),
        ...analysis,
        stats: {
          filesScanned: walk.files.length - skipped,
          filesSkipped: skipped,
          durationMs: Date.now() - started,
          truncated: walk.truncated
        },
        scannedAt: new Date().toISOString()
      }
      onProgress({ scanId: input.scanId, phase: 'done', filesDone: walk.files.length, filesTotal: walk.files.length })
      logger.info(
        `Scanned ${result.stats.filesScanned} files, found ${result.endpoints.length} endpoints in ${result.stats.durationMs}ms`,
        'CodeScanner'
      )
      return result
    } finally {
      this.running.delete(input.scanId)
    }
  }

  /** API as it is at a git ref, for comparing branches. Read from git objects; the working tree is untouched. */
  async scanAtRef(rootPath: string, ref: string): Promise<{ commit: string; endpoints: DetectedEndpoint[]; truncated: boolean }> {
    const root = this.approvedRoot(rootPath)
    if (!root) throw new Error('Choose the project folder with the folder picker first')
    const { commit, files, truncated } = await readFilesAtRef(root, ref, { include: isCandidateFile, maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES })
    const analyzer = new ProjectAnalyzer(files.keys())
    let i = 0
    for (const [file, content] of files) {
      analyzer.addFile(file, content)
      if (++i % YIELD_EVERY === 0) await yieldToEventLoop()
    }
    return { commit, endpoints: analyzer.finish().endpoints, truncated }
  }

  private watcher: { root: string; close: () => void } | null = null

  /**
   * Calls `onChange` (debounced) when a file the scanner reads changes under `rootPath`.
   * One folder at a time; `null` stops watching.
   */
  watch(rootPath: string | null, onChange: (root: string) => void): void {
    this.watcher?.close()
    this.watcher = null
    if (!rootPath) return
    const root = this.approvedRoot(rootPath)
    if (!root) throw new Error('Choose the project folder with the folder picker first')
    let timer: NodeJS.Timeout | null = null
    let fsWatcher: FSWatcher
    try {
      fsWatcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const path = filename.toString().split(/[\\/]/).join('/')
        if (path.split('/').some((part) => SKIPPED_DIRS.has(part)) || !isCandidateFile(path)) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => onChange(root), WATCH_DEBOUNCE_MS)
      })
    } catch (error) {
      throw new Error(`Can't watch this folder: ${error instanceof Error ? error.message : String(error)}`)
    }
    fsWatcher.on('error', (error) => logger.warn(`Stopped watching ${root}: ${error.message}`, 'CodeScanner'))
    this.watcher = {
      root,
      close: () => {
        if (timer) clearTimeout(timer)
        fsWatcher.close()
      }
    }
  }

  private async projectName(root: string): Promise<string> {
    try {
      const pkg = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf8')) as { name?: unknown }
      if (typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim()
    } catch {
      // Not a Node project, or no readable package.json.
    }
    return basename(root)
  }
}

export const codeScannerService = new CodeScannerService()
