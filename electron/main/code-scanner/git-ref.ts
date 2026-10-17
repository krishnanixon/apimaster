/**
 * Reads a project's files as they are at a git ref (branch, tag, commit) without touching the
 * working tree: `git ls-tree` lists them, one `git cat-file --batch` process streams their contents.
 */
import { execFile, spawn } from 'child_process'
import { realpathSync } from 'fs'
import { relative, sep } from 'path'
import { promisify } from 'util'
import { SKIPPED_DIRS } from './project-walker'

const run = promisify(execFile)
const MAX_BUFFER = 64 * 1024 * 1024

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run('git', args, { cwd, maxBuffer: MAX_BUFFER })
    return stdout
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string }
    if (err.code === 'ENOENT') throw new Error('Git is not installed or not on PATH')
    throw new Error(err.stderr?.trim().split('\n')[0] || err.message)
  }
}

export interface FilesAtRef {
  commit: string
  /** Project-relative path → contents, for files `include` accepts. */
  files: Map<string, string>
  truncated: boolean
}

/** Contents of `paths` (repo-relative) at `commit`, from one `git cat-file --batch` process. */
function catFiles(top: string, commit: string, paths: string[], maxBytes: number): Promise<Map<string, string>> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd: top })
    const out = new Map<string, string>()
    let buffer = Buffer.alloc(0)
    let index = 0
    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      for (;;) {
        const newline = buffer.indexOf(10)
        if (newline === -1) return
        const header = buffer.subarray(0, newline).toString()
        if (header.endsWith(' missing')) {
          buffer = buffer.subarray(newline + 1)
          index++
          continue
        }
        const size = Number(header.split(' ')[2])
        if (buffer.length < newline + 1 + size + 1) return
        if (size <= maxBytes) out.set(paths[index], buffer.subarray(newline + 1, newline + 1 + size).toString('utf8'))
        buffer = buffer.subarray(newline + 1 + size + 1)
        index++
      }
    })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolvePromise(out) : reject(new Error(`git cat-file exited with ${code}`))))
    child.stdin.end(paths.map((p) => `${commit}:${p}`).join('\n') + '\n')
  })
}

export async function readFilesAtRef(
  root: string,
  ref: string,
  options: { include: (path: string) => boolean; maxFiles: number; maxFileBytes: number }
): Promise<FilesAtRef> {
  // Refs never start with `-`; refusing them keeps the value from being read as a git option.
  if (!ref.trim() || ref.startsWith('-') || /[\s\0]/.test(ref)) throw new Error('Enter a branch, tag or commit')
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim()
  const commit = (await git(top, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]).catch(() => '')).trim()
  if (!commit) throw new Error(`"${ref}" is not a branch, tag or commit in this repository`)

  const prefix = relative(realpathSync(top), realpathSync(root)).split(sep).join('/')
  const listed = (await git(top, ['ls-tree', '-r', '-z', '--name-only', commit, '--', prefix || '.'])).split('\0').filter(Boolean)
  const wanted: Array<{ repoPath: string; path: string }> = []
  let truncated = false
  for (const repoPath of listed) {
    const path = prefix ? repoPath.slice(prefix.length + 1) : repoPath
    if (path.split('/').some((part) => SKIPPED_DIRS.has(part)) || !options.include(path)) continue
    if (wanted.length >= options.maxFiles) {
      truncated = true
      break
    }
    wanted.push({ repoPath, path })
  }
  const contents = await catFiles(top, commit, wanted.map((w) => w.repoPath), options.maxFileBytes)
  const files = new Map<string, string>()
  for (const { repoPath, path } of wanted) {
    const text = contents.get(repoPath)
    if (text !== undefined) files.set(path, text)
  }
  return { commit, files, truncated }
}
