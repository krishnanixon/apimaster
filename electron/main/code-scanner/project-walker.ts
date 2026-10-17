import { promises as fs } from 'fs'
import { join, relative, sep } from 'path'
import ignore, { type Ignore } from 'ignore'

/** Folders that never hold the project's own route definitions. */
export const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  '.vercel',
  '.turbo',
  '.cache',
  'coverage',
  'vendor',
  'target',
  'bin',
  'obj',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode'
])

export interface WalkOptions {
  maxFiles: number
  signal: AbortSignal
  /** Whether a (relative, `/`-separated) file is worth reading. */
  include: (relativePath: string) => boolean
}

export interface WalkResult {
  files: string[]
  truncated: boolean
}

async function loadGitignore(root: string): Promise<Ignore> {
  const ig = ignore()
  try {
    ig.add(await fs.readFile(join(root, '.gitignore'), 'utf8'))
  } catch {
    // No .gitignore — only the built-in skip list applies.
  }
  return ig
}

function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/')
}

/**
 * Lists candidate files under `root` breadth-first. Symlinks are not followed, so the scan
 * cannot leave the folder the user picked.
 */
export async function walkProject(root: string, options: WalkOptions): Promise<WalkResult> {
  const ig = await loadGitignore(root)
  const files: string[] = []
  const queue: string[] = [root]

  while (queue.length > 0) {
    if (options.signal.aborted) throw new Error('Scan cancelled')
    const dir = queue.shift()!
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolute = join(dir, entry.name)
      const rel = toPosix(relative(root, absolute))
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name) || ig.ignores(`${rel}/`)) continue
        queue.push(absolute)
      } else if (entry.isFile() && !ig.ignores(rel) && options.include(rel)) {
        if (files.length >= options.maxFiles) return { files, truncated: true }
        files.push(rel)
      }
    }
  }
  return { files, truncated: false }
}
