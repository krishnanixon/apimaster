/**
 * Node file-system adapter for collection folders. No Electron imports: the app's main process and a
 * command-line runner both use it.
 */
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { isManagedPath, type CollectionFiles } from './format'
import { parseCollectionFiles, type ParseOptions, type ParsedCollectionFolder } from './parse'

/** Larger files are reported instead of read (a request file is a few KB). */
export const MAX_COLLECTION_FILE_BYTES = 5 * 1024 * 1024
export const MAX_COLLECTION_FILES = 10_000
const MAX_DEPTH = 32
const SKIPPED_DIRS = new Set(['node_modules'])

export interface ReadCollectionDirectoryResult {
  files: CollectionFiles
  /** Managed files that were skipped (too large, unreadable). */
  skipped: { path: string; message: string }[]
}

/** Reads only the files the format owns; anything else in the folder is ignored. */
export async function readCollectionDirectory(root: string): Promise<ReadCollectionDirectoryResult> {
  const files: CollectionFiles = {}
  const skipped: ReadCollectionDirectoryResult['skipped'] = []
  let count = 0

  const visit = async (relativeDir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return
    const entries = await fs.readdir(join(root, relativeDir), { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) await visit(relativePath, depth + 1)
        continue
      }
      if (!entry.isFile() || !isManagedPath(relativePath)) continue
      if (++count > MAX_COLLECTION_FILES) throw new Error(`More than ${MAX_COLLECTION_FILES} collection files in ${root}`)
      try {
        const stat = await fs.stat(join(root, relativePath))
        if (stat.size > MAX_COLLECTION_FILE_BYTES) {
          skipped.push({ path: relativePath, message: 'File is larger than 5 MB' })
          continue
        }
        files[relativePath] = await fs.readFile(join(root, relativePath), 'utf8')
      } catch (error) {
        skipped.push({ path: relativePath, message: error instanceof Error ? error.message : 'Could not read file' })
      }
    }
  }

  await visit('', 0)
  return { files, skipped }
}

/** Read and parse in one step (what a command-line runner needs). */
export async function loadCollectionDirectory(root: string, options: ParseOptions = {}): Promise<ParsedCollectionFolder> {
  const { files, skipped } = await readCollectionDirectory(root)
  const parsed = parseCollectionFiles(files, { folderPath: root, ...options })
  return { ...parsed, errors: [...skipped, ...parsed.errors] }
}

export function assertSafeRelativePath(path: string): void {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    /^[a-zA-Z]:/.test(path) ||
    path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`Unsafe collection file path: ${path}`)
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`
  try {
    await fs.writeFile(tmp, contents, 'utf8')
    await fs.rename(tmp, path)
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw error
  }
}

async function removeEmptyDirs(root: string, relativeDir: string): Promise<void> {
  for (let dir = relativeDir; dir; dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '') {
    try {
      await fs.rmdir(join(root, dir))
    } catch {
      return
    }
  }
}

export interface WriteCollectionDirectoryOptions {
  /** Files that failed to parse. They are never overwritten or deleted, so a hand edit in progress survives. */
  protectedPaths?: string[]
  /** Written only when the file does not exist yet (e.g. README.md). */
  createIfMissing?: CollectionFiles
}

export interface WriteCollectionDirectoryResult {
  written: string[]
  deleted: string[]
}

/**
 * Make the folder match `files`: write changed files atomically, delete managed files that are no
 * longer part of the collection, and leave everything else alone.
 */
export async function writeCollectionDirectory(
  root: string,
  files: CollectionFiles,
  options: WriteCollectionDirectoryOptions = {}
): Promise<WriteCollectionDirectoryResult> {
  const paths = Object.keys(files)
  for (const path of paths) {
    assertSafeRelativePath(path)
    if (!isManagedPath(path)) throw new Error(`Not a collection file: ${path}`)
  }
  const protectedPaths = new Set(options.protectedPaths ?? [])
  await fs.mkdir(root, { recursive: true })
  const { files: existing } = await readCollectionDirectory(root)

  const written: string[] = []
  for (const path of paths.sort()) {
    if (protectedPaths.has(path) || existing[path] === files[path]) continue
    await atomicWrite(join(root, path), files[path])
    written.push(path)
  }

  const deleted: string[] = []
  for (const path of Object.keys(existing).sort()) {
    if (path in files || protectedPaths.has(path)) continue
    await fs.rm(join(root, path), { force: true })
    deleted.push(path)
    if (path.includes('/')) await removeEmptyDirs(root, path.slice(0, path.lastIndexOf('/')))
  }

  for (const [path, contents] of Object.entries(options.createIfMissing ?? {})) {
    assertSafeRelativePath(path)
    try {
      await fs.writeFile(join(root, path), contents, { encoding: 'utf8', flag: 'wx' })
      written.push(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }

  return { written, deleted }
}
