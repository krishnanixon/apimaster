import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { basename, dirname, join, relative, resolve, sep } from 'path'
import { BrowserWindow, dialog, shell } from 'electron'
import type {
  CreateEntryInput,
  EditorContextSnapshot,
  FileSearchHit,
  FileSystemEntry,
  IgnoreRulesState,
  OpenedWorkspace,
  ReadDirectoryOptions,
  ReadDirectoryResult,
  RenameEntryInput
} from '@shared/types/code-editor'
import { DEFAULT_IGNORE_NAMES, mergeIgnoreNames, isIgnoredName, isIgnoredPath } from '@shared/lib/ignore-rules'
import { UnsafePathError } from '@shared/lib/voice-path-safety'
import { mainEventBus } from '../events/bus'
import { workspaceSession } from '../security/workspace-session'
import { workspaceStateService } from './workspace-state.service'
import { uniqueCopyName } from '@shared/lib/text-replace'

function ignoreRules(): ReturnType<typeof mergeIgnoreNames> {
  return mergeIgnoreNames(workspaceStateService.get().customIgnoreNames)
}

async function listDirectory(dirPath: string, includeIgnored: boolean): Promise<FileSystemEntry[]> {
  const dirents = await fs.readdir(dirPath, { withFileTypes: true })
  const rules = ignoreRules()
  const entries: FileSystemEntry[] = []

  for (const entry of dirents) {
    const ignored = isIgnoredName(entry.name, rules)
    if (ignored && !includeIgnored) continue
    entries.push({
      path: join(dirPath, entry.name),
      name: entry.name,
      isDirectory: entry.isDirectory(),
      ignored
    })
  }

  return entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

class CodeEditorService {
  private editorContext: EditorContextSnapshot | null = null
  private fileNameIndex: FileSearchHit[] | null = null
  private fileIndexRoot: string | null = null
  private fileIndexListening = false

  private ensureFileIndexListeners(): void {
    if (this.fileIndexListening) return
    this.fileIndexListening = true
    mainEventBus.on('PROJECT_OPENED', () => this.invalidateFileNameIndex())
    mainEventBus.on('PROJECT_CLOSED', () => this.invalidateFileNameIndex())
    mainEventBus.on('FILE_CHANGED', () => this.invalidateFileNameIndex())
    mainEventBus.on('IGNORE_RULES_CHANGED', () => this.invalidateFileNameIndex())
  }

  private invalidateFileNameIndex(): void {
    this.fileNameIndex = null
    this.fileIndexRoot = null
  }

  private async ensureFileNameIndex(root: string): Promise<FileSearchHit[]> {
    this.ensureFileIndexListeners()
    if (this.fileNameIndex && this.fileIndexRoot === root) return this.fileNameIndex
    const rules = ignoreRules()
    const hits: FileSearchHit[] = []
    let scanned = 0
    const maxScan = 8000

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (scanned >= maxScan || depth > 18) return
      let dirents
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of dirents) {
        if (scanned >= maxScan) return
        if (isIgnoredName(entry.name, rules)) continue
        const full = join(dir, entry.name)
        if (isIgnoredPath(root, full, rules)) continue
        scanned += 1
        if (entry.isDirectory()) {
          await walk(full, depth + 1)
          continue
        }
        const relativePath = relative(root, full).replace(/\\/g, '/')
        hits.push({ path: full, name: entry.name, relativePath })
      }
    }

    await walk(root, 0)
    this.fileNameIndex = hits
    this.fileIndexRoot = root
    return hits
  }

  async openFolder(win: BrowserWindow | null): Promise<OpenedWorkspace | null> {
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })

    if (result.canceled || result.filePaths.length === 0) return null
    return this.openFolderAtPath(result.filePaths[0]!)
  }

  async openFolderAtPath(rootPath: string): Promise<OpenedWorkspace | null> {
    const resolved = resolve(rootPath)
    if (!existsSync(resolved)) return null
    const stat = await fs.stat(resolved)
    if (!stat.isDirectory()) return null

    workspaceSession.setRoot(resolved)
    const { hydratePendingPatches } = await import('../agent/patch-engine')
    hydratePendingPatches(resolved)
    const includeIgnored = workspaceStateService.get().showIgnored
    const entries = await listDirectory(resolved, includeIgnored)
    mainEventBus.emit('PROJECT_OPENED', { rootPath: resolved, rootName: basename(resolved) || resolved })
    return { rootPath: resolved, rootName: basename(resolved) || resolved, entries }
  }

  closeWorkspace(): void {
    const previous = workspaceSession.getRoot()
    void import('../agent/patch-engine').then(({ clearPatchEngine }) => clearPatchEngine()).catch(() => undefined)
    workspaceSession.clear()
    this.editorContext = null
    mainEventBus.emit('PROJECT_CLOSED', { rootPath: previous })
  }

  async readDirectory(dirPath: string, options?: ReadDirectoryOptions): Promise<ReadDirectoryResult> {
    const safePath = workspaceSession.resolve(dirPath, { mustExist: true })
    const includeIgnored = options?.includeIgnored ?? workspaceStateService.get().showIgnored
    const entries = await listDirectory(safePath, includeIgnored)
    return { path: safePath, entries }
  }

  async readFile(filePath: string): Promise<string> {
    const safePath = workspaceSession.resolve(filePath, { mustExist: true })
    const stat = await fs.stat(safePath)
    if (stat.isDirectory()) throw new Error('Cannot open a folder as a file')
    if (stat.size > 5 * 1024 * 1024) throw new Error('File is too large to open (>5MB)')
    return fs.readFile(safePath, 'utf-8')
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const safePath = workspaceSession.resolve(filePath)
    await fs.writeFile(safePath, content, 'utf-8')
    mainEventBus.emit('FILE_CHANGED', { path: safePath, kind: 'write' })
  }

  async createEntry(input: CreateEntryInput): Promise<FileSystemEntry> {
    const parentPath = workspaceSession.resolve(input.parentPath, { mustExist: true })
    const name = input.name.trim()
    if (!name || /[\\/]/.test(name)) throw new Error('Invalid file or folder name')

    const targetPath = join(parentPath, name)
    workspaceSession.resolve(targetPath)

    try {
      await fs.access(targetPath)
      throw new Error(`"${name}" already exists`)
    } catch (e) {
      if (e instanceof Error && e.message.includes('already exists')) throw e
    }

    if (input.kind === 'folder') {
      await fs.mkdir(targetPath, { recursive: false })
    } else {
      await fs.writeFile(targetPath, '', { flag: 'wx' })
    }

    mainEventBus.emit('FILE_CHANGED', { path: targetPath, kind: 'create' })
    return { path: targetPath, name, isDirectory: input.kind === 'folder', ignored: false }
  }

  async renameEntry(input: RenameEntryInput): Promise<FileSystemEntry> {
    const oldPath = workspaceSession.resolve(input.path, { mustExist: true })
    const newName = input.newName.trim()
    if (!newName || /[\\/]/.test(newName)) throw new Error('Invalid name')

    const newPath = join(dirname(oldPath), newName)
    workspaceSession.resolve(newPath)
    await fs.rename(oldPath, newPath)
    const stat = await fs.stat(newPath)
    mainEventBus.emit('FILE_CHANGED', { path: newPath, kind: 'rename', previousPath: oldPath })
    return { path: newPath, name: newName, isDirectory: stat.isDirectory(), ignored: false }
  }

  async deleteEntry(entryPath: string): Promise<void> {
    const safePath = workspaceSession.resolve(entryPath, { mustExist: true })
    if (safePath === workspaceSession.requireRoot()) {
      throw new UnsafePathError('Refusing to delete the workspace root')
    }
    await fs.rm(safePath, { recursive: true, force: false })
    mainEventBus.emit('FILE_CHANGED', { path: safePath, kind: 'delete' })
  }

  async searchFiles(query: string, limit = 80): Promise<FileSearchHit[]> {
    const root = workspaceSession.requireRoot()
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    const index = await this.ensureFileNameIndex(root)
    const hits: FileSearchHit[] = []
    for (const entry of index) {
      if (hits.length >= limit) break
      const name = entry.name.toLowerCase()
      const rel = entry.relativePath.toLowerCase()
      if (!name.includes(needle) && !rel.includes(needle)) continue
      hits.push(entry)
    }
    return hits
  }

  getIgnoreRules(): IgnoreRulesState {
    const state = workspaceStateService.get()
    const merged = mergeIgnoreNames(state.customIgnoreNames)
    return {
      defaults: [...DEFAULT_IGNORE_NAMES],
      custom: state.customIgnoreNames ?? [],
      names: merged.names,
      showIgnored: state.showIgnored
    }
  }

  setIgnoreRules(patch: { customIgnoreNames?: string[]; showIgnored?: boolean }): IgnoreRulesState {
    const current = workspaceStateService.get()
    const customIgnoreNames = patch.customIgnoreNames ?? current.customIgnoreNames
    workspaceStateService.save({
      ...current,
      customIgnoreNames,
      showIgnored: patch.showIgnored ?? current.showIgnored
    })
    if (patch.customIgnoreNames) {
      mainEventBus.emit('IGNORE_RULES_CHANGED', { customIgnoreNames: customIgnoreNames ?? [] })
    }
    return this.getIgnoreRules()
  }

  setEditorContext(snapshot: EditorContextSnapshot | null): void {
    this.editorContext = snapshot
  }

  getEditorContext(): EditorContextSnapshot | null {
    return this.editorContext
  }

  async inspectPath(filePath: string): Promise<{ path: string; name: string; isDirectory: boolean }> {
    const abs = resolve(filePath)
    const stat = await fs.stat(abs)
    return { path: abs, name: basename(abs) || abs, isDirectory: stat.isDirectory() }
  }

  async importPaths(sourcePaths: string[], destDir: string): Promise<{ copied: string[] }> {
    const dest = workspaceSession.resolve(destDir, { mustExist: true })
    const copied: string[] = []
    for (const source of sourcePaths.slice(0, 40)) {
      const abs = resolve(source)
      if (!existsSync(abs)) continue
      const name = basename(abs)
      if (!name || name === '.' || name === '..') continue
      const target = join(dest, name)
      workspaceSession.resolve(target)
      if (existsSync(target)) continue
      await fs.cp(abs, target, { recursive: true })
      copied.push(target)
      mainEventBus.emit('FILE_CHANGED', { path: target, kind: 'create' })
    }
    return { copied }
  }

  async copyEntry(sourcePath: string, destDir: string): Promise<FileSystemEntry> {
    const source = workspaceSession.resolve(sourcePath, { mustExist: true })
    const destParent = workspaceSession.resolve(destDir, { mustExist: true })
    const names = await fs.readdir(destParent)
    const name = uniqueCopyName(basename(source), names)
    const target = join(destParent, name)
    workspaceSession.resolve(target)
    await fs.cp(source, target, { recursive: true })
    const stat = await fs.stat(target)
    mainEventBus.emit('FILE_CHANGED', { path: target, kind: 'create' })
    return { path: target, name, isDirectory: stat.isDirectory(), ignored: false }
  }

  async moveEntry(sourcePath: string, destDir: string): Promise<FileSystemEntry> {
    const source = workspaceSession.resolve(sourcePath, { mustExist: true })
    const destParent = workspaceSession.resolve(destDir, { mustExist: true })
    if (source === destParent) throw new Error('Cannot move a folder into itself')
    const prefix = source.endsWith(sep) ? source : source + sep
    if ((destParent + sep).startsWith(prefix)) throw new Error('Cannot move a folder into itself')

    const names = await fs.readdir(destParent)
    const currentName = basename(source)
    const sameParent = dirname(source) === destParent
    if (sameParent) {
      const stat = await fs.stat(source)
      return { path: source, name: currentName, isDirectory: stat.isDirectory(), ignored: false }
    }
    const name = names.includes(currentName) ? uniqueCopyName(currentName, names) : currentName
    const target = join(destParent, name)
    workspaceSession.resolve(target)
    await fs.rename(source, target)
    const stat = await fs.stat(target)
    mainEventBus.emit('FILE_CHANGED', { path: target, kind: 'rename', previousPath: source })
    return { path: target, name, isDirectory: stat.isDirectory(), ignored: false }
  }

  async revealInOs(filePath: string): Promise<void> {
    const abs = workspaceSession.resolve(filePath, { mustExist: true })
    shell.showItemInFolder(abs)
  }
}

export const codeEditorService = new CodeEditorService()
