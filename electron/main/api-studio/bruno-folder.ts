import fs from 'node:fs/promises'
import path from 'node:path'

export interface BrunoFolderContents {
  /** Folder name, used when bruno.json has no name. */
  name: string
  files: Array<{ path: string; content: string }>
}

const MAX_FILES = 5_000
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 50 * 1024 * 1024
const MAX_DEPTH = 16
const SKIPPED_DIRS = new Set(['node_modules', '.git'])

/**
 * Reads `bruno.json` and every `.bru` file under a picked Bruno collection folder. Hidden folders,
 * `node_modules` and symlinks are skipped, and size limits keep a wrong pick (e.g. a home folder) cheap.
 */
export async function readBrunoFolder(root: string): Promise<BrunoFolderContents> {
  try {
    await fs.access(path.join(root, 'bruno.json'))
  } catch {
    throw new Error('No bruno.json in that folder — pick the folder that contains your Bruno collection')
  }
  const files: BrunoFolderContents['files'] = []
  let total = 0

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) continue
        await walk(full, depth + 1)
        continue
      }
      const relative = path.relative(root, full).split(path.sep).join('/')
      if (!entry.isFile() || !(relative === 'bruno.json' || entry.name.endsWith('.bru'))) continue
      const stat = await fs.stat(full)
      if (stat.size > MAX_FILE_BYTES) continue
      total += stat.size
      if (files.length >= MAX_FILES || total > MAX_TOTAL_BYTES) throw new Error('That folder is too large to be a Bruno collection')
      files.push({ path: relative, content: await fs.readFile(full, 'utf-8') })
    }
  }

  await walk(root, 0)
  return { name: path.basename(root), files }
}
