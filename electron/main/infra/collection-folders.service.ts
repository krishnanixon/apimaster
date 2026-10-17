import { promises as fs, watch, type FSWatcher } from 'fs'
import { join, resolve } from 'path'
import { COLLECTION_FILE, isManagedPath, slugify, type CollectionFiles } from '@shared/lib/collection-files'
import {
  readCollectionDirectory,
  writeCollectionDirectory,
  type ReadCollectionDirectoryResult,
  type WriteCollectionDirectoryOptions,
  type WriteCollectionDirectoryResult
} from '@shared/lib/collection-files/node'
import { readJsonFile, writeJsonFile } from './json-store'
import { logger } from './logger.service'

const STORE_FILE = 'collection-folders.json'
const WATCH_DEBOUNCE_MS = 300
const MAX_LINKED_FOLDERS = 200

interface Watched {
  watcher: FSWatcher
  timer: NodeJS.Timeout | null
  /** What we last wrote or reported, so our own writes don't come back as "external" changes. */
  snapshot: string
  /** Writes in progress; a check waits for them so a half-written save is never reported. */
  writing: number
}

function snapshotOf(files: CollectionFiles): string {
  return JSON.stringify(Object.keys(files).sort().map((path) => [path, files[path]]))
}

/**
 * Folders the user linked to collections. Only folders picked in a dialog are approved, and the
 * renderer can read, write, or watch nothing else.
 */
export class CollectionFoldersService {
  private approved: Set<string> | null = null
  private readonly watched = new Map<string, Watched>()

  private roots(): Set<string> {
    if (!this.approved) {
      const stored = readJsonFile<{ folders?: unknown }>(STORE_FILE, {})
      this.approved = new Set(Array.isArray(stored.folders) ? stored.folders.filter((f): f is string => typeof f === 'string') : [])
    }
    return this.approved
  }

  private persist(): void {
    try {
      writeJsonFile(STORE_FILE, { folders: [...this.roots()].slice(-MAX_LINKED_FOLDERS) })
    } catch (error) {
      logger.warn(`Could not remember collection folders: ${error instanceof Error ? error.message : String(error)}`, 'CollectionFolders')
    }
  }

  approve(path: string): string {
    const root = resolve(path)
    const roots = this.roots()
    roots.delete(root)
    roots.add(root)
    this.persist()
    return root
  }

  forget(path: string): void {
    const root = resolve(path)
    this.unwatch(root)
    if (this.roots().delete(root)) this.persist()
  }

  private approvedRoot(path: string): string {
    const root = resolve(path)
    if (!this.roots().has(root)) throw new Error('Choose this folder with the folder picker first')
    return root
  }

  /**
   * Where "Save collection to folder" writes. An empty folder, or one already holding this
   * collection, is used as is; otherwise a subfolder named after the collection is created.
   */
  async resolveSaveTarget(picked: string, collectionName: string, collectionId: string): Promise<string> {
    const root = resolve(picked)
    const entries = (await fs.readdir(root)).filter((name) => !name.startsWith('.'))
    if (entries.length === 0) return root
    if (entries.includes(COLLECTION_FILE)) {
      const text = await fs.readFile(join(root, COLLECTION_FILE), 'utf8')
      if (new RegExp(`^id:\\s*'?${collectionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?\\s*$`, 'm').test(text)) return root
    }
    const base = slugify(collectionName, 'collection')
    for (let n = 1; ; n += 1) {
      const candidate = join(root, n === 1 ? base : `${base}-${n}`)
      try {
        await fs.access(candidate)
      } catch {
        return candidate
      }
    }
  }

  async read(path: string): Promise<ReadCollectionDirectoryResult> {
    const root = this.approvedRoot(path)
    const result = await readCollectionDirectory(root)
    const watched = this.watched.get(root)
    if (watched) watched.snapshot = snapshotOf(result.files)
    return result
  }

  async write(path: string, files: CollectionFiles, options: WriteCollectionDirectoryOptions): Promise<WriteCollectionDirectoryResult> {
    const root = this.approvedRoot(path)
    const watched = this.watched.get(root)
    if (watched) watched.writing += 1
    try {
      const result = await writeCollectionDirectory(root, files, options)
      if (watched) watched.snapshot = snapshotOf((await readCollectionDirectory(root)).files)
      return result
    } finally {
      if (watched) watched.writing -= 1
    }
  }

  /** Calls `onChange` with the folder contents after an edit made outside the app (git pull, an editor). */
  watch(path: string, onChange: (root: string, files: CollectionFiles) => void): void {
    const root = this.approvedRoot(path)
    if (this.watched.has(root)) return
    const entry: Watched = { watcher: null as unknown as FSWatcher, timer: null, snapshot: '', writing: 0 }
    const schedule = (): void => {
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = setTimeout(() => void check(), WATCH_DEBOUNCE_MS)
    }
    const check = async (): Promise<void> => {
      entry.timer = null
      if (entry.writing > 0) return schedule()
      try {
        const { files } = await readCollectionDirectory(root)
        const snapshot = snapshotOf(files)
        if (snapshot === entry.snapshot || entry.writing > 0) return
        entry.snapshot = snapshot
        onChange(root, files)
      } catch (error) {
        logger.warn(`Could not read ${root}: ${error instanceof Error ? error.message : String(error)}`, 'CollectionFolders')
      }
    }
    try {
      entry.watcher = watch(root, { recursive: true }, (_event, filename) => {
        const name = filename ? filename.toString().split(/[\\/]/).join('/') : ''
        // Skip .git churn, node_modules, temp files, and files the format doesn't own. Directory events pass.
        const hidden = name.split('/').some((part) => part.startsWith('.') || part === 'node_modules')
        if (name && (hidden || (/\.[^/]+$/.test(name) && !isManagedPath(name)))) return
        schedule()
      })
    } catch (error) {
      throw new Error(`Can't watch this folder: ${error instanceof Error ? error.message : String(error)}`)
    }
    entry.watcher.on('error', (error) => {
      logger.warn(`Stopped watching ${root}: ${error.message}`, 'CollectionFolders')
      this.unwatch(root)
    })
    this.watched.set(root, entry)
    void readCollectionDirectory(root)
      .then(({ files }) => {
        if (!entry.snapshot) entry.snapshot = snapshotOf(files)
      })
      .catch(() => undefined)
  }

  unwatch(path: string): void {
    const root = resolve(path)
    const entry = this.watched.get(root)
    if (!entry) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.watcher.close()
    this.watched.delete(root)
  }

  dispose(): void {
    for (const root of [...this.watched.keys()]) this.unwatch(root)
  }
}

export const collectionFoldersService = new CollectionFoldersService()
