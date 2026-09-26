import type { GitFileStatus, GitStashEntry, GitStatusEntry } from '../types/git'

function parseStatusCode(index: string, worktree: string): GitFileStatus {
  if (index === '?' && worktree === '?') return 'untracked'
  if (index === 'A' || worktree === 'A') return 'added'
  if (index === 'D' && worktree === 'D') return 'deleted'
  if (index === 'D' || worktree === 'D') return 'deleted'
  if (index === 'R' || worktree === 'R') return 'renamed'
  if (index === 'U' || worktree === 'U') return 'conflicted'
  if (index === 'M' || worktree === 'M') return 'modified'
  if (index !== ' ' && index !== '?' && index !== '.') return 'modified'
  if (worktree !== ' ' && worktree !== '?' && worktree !== '.') return 'modified'
  return 'unmodified'
}

/** Parse `git status --porcelain=v1 -uall` output. */
export function parsePorcelainStatus(stdout: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = []
  for (const rawLine of stdout.split(/\r?\n/)) {
    if (rawLine.length < 3) continue
    const index = rawLine[0] ?? ' '
    const worktree = rawLine[1] ?? ' '
    let rest = rawLine.slice(3)
    let originalPath: string | undefined
    let path = rest

    if (rest.includes(' -> ')) {
      const [from, to] = rest.split(' -> ')
      originalPath = from?.replace(/^"|"$/g, '')
      path = (to ?? rest).replace(/^"|"$/g, '')
    } else {
      path = rest.replace(/^"|"$/g, '')
    }

    const staged = index !== ' ' && index !== '?' && index !== '.'
    const unstaged = worktree !== ' ' && worktree !== '.'
    entries.push({
      path,
      originalPath,
      status: parseStatusCode(index, worktree),
      staged,
      unstaged: unstaged || (index === '?' && worktree === '?')
    })
  }
  return entries
}

export function parseBranchList(stdout: string): { current: string | null; branches: string[] } {
  const branches: string[] = []
  let current: string | null = null
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const name = line.replace(/^\*\s+/, '').replace(/^remotes\//, '')
    if (line.startsWith('* ')) current = name
    if (!name.startsWith('origin/') && name !== 'HEAD') {
      if (!branches.includes(name)) branches.push(name)
    } else if (name.startsWith('origin/') && !branches.includes(name)) {
      branches.push(name)
    }
  }
  return { current, branches }
}

export interface ParsedGitLogEntry {
  hash: string
  author: string
  date: string
  subject: string
}

export function parseGitLog(stdout: string): ParsedGitLogEntry[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...subjectParts] = line.split('\t')
      return {
        hash: hash ?? '',
        author: author ?? '',
        date: date ?? '',
        subject: subjectParts.join('\t')
      }
    })
    .filter((entry) => entry.hash.length > 0)
}

export function parseGitStashList(stdout: string): GitStashEntry[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref, hash, relativeDate, ...messageParts] = line.split('\t')
      return {
        ref: ref ?? '',
        hash: hash ?? '',
        relativeDate: relativeDate ?? '',
        message: messageParts.join('\t').replace(/^On [^:]+:\s*/, '')
      }
    })
    .filter((entry) => /^stash@\{\d+\}$/.test(entry.ref))
}
