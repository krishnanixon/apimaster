import { spawn } from 'child_process'
import type {
  GitCheckoutInput,
  GitCommitInput,
  GitCommandResult,
  GitDiffResult,
  GitLogEntry,
  GitRemoteAction,
  GitRevertInput,
  GitSnapshot,
  GitStashEntry
} from '@shared/types/git'
import { parseBranchList, parseGitLog, parseGitStashList, parsePorcelainStatus } from '@shared/lib/git-status'
import { workspaceSession } from '../security/workspace-session'
import { logger } from '../infra/logger.service'

interface GitRunResult {
  code: number
  stdout: string
  stderr: string
}

function runGit(args: string[], cwd: string, timeoutMs = 30_000): Promise<GitRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`git ${args.join(' ')} timed out`))
    }, timeoutMs)

    child.stdout?.on('data', (buf: Buffer) => {
      stdout += buf.toString('utf8')
    })
    child.stderr?.on('data', (buf: Buffer) => {
      stderr += buf.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

class GitService {
  async initialize(): Promise<void> {
    const rootPath = workspaceSession.requireRoot()
    const result = await runGit(['init'], rootPath)
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git init failed')
  }

  async snapshot(): Promise<GitSnapshot> {
    const rootPath = workspaceSession.requireRoot()
    try {
      const inside = await runGit(['rev-parse', '--is-inside-work-tree'], rootPath)
      if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
        return {
          rootPath,
          available: false,
          branch: null,
          branches: [],
          ahead: 0,
          behind: 0,
          entries: [],
          error: 'This folder is not a Git repository'
        }
      }

      const [status, branchOut, aheadBehind] = await Promise.all([
        runGit(['status', '--porcelain=v1', '-uall'], rootPath),
        runGit(['branch', '--list'], rootPath),
        runGit(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], rootPath).catch(
          () => ({ code: 1, stdout: '0\t0', stderr: '' })
        )
      ])

      const { current, branches } = parseBranchList(branchOut.stdout)
      let ahead = 0
      let behind = 0
      if (aheadBehind.code === 0) {
        const [left, right] = aheadBehind.stdout.trim().split(/\s+/)
        behind = Number(left) || 0
        ahead = Number(right) || 0
      }

      return {
        rootPath,
        available: true,
        branch: current,
        branches,
        ahead,
        behind,
        entries: parsePorcelainStatus(status.stdout)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`Git snapshot failed: ${message}`, 'Git')
      const missing = /ENOENT|not recognized|not found/i.test(message)
      return {
        rootPath,
        available: false,
        branch: null,
        branches: [],
        ahead: 0,
        behind: 0,
        entries: [],
        error: missing ? 'Git is not installed or not on PATH' : message
      }
    }
  }

  async diff(path: string, staged: boolean): Promise<GitDiffResult> {
    const rootPath = workspaceSession.requireRoot()
    const safePath = workspaceSession.resolve(path)
    const args = staged ? ['diff', '--cached', '--', safePath] : ['diff', '--', safePath]
    const result = await runGit(args, rootPath)
    if (result.code !== 0 && !result.stdout) {
      throw new Error(result.stderr.trim() || 'git diff failed')
    }
    return { path: safePath, staged, diff: result.stdout }
  }

  /** Contents of a file as committed at HEAD, or null when the file is untracked. */
  async fileAtHead(path: string): Promise<string | null> {
    const rootPath = workspaceSession.requireRoot()
    const safePath = workspaceSession.resolve(path)
    const relative = await runGit(['ls-files', '--full-name', '--', safePath], rootPath)
    const tracked = relative.stdout.split('\n')[0]?.trim()
    if (!tracked) return null
    const result = await runGit(['show', `HEAD:${tracked}`], rootPath)
    if (result.code !== 0) return null
    return result.stdout
  }

  async log(limit = 30): Promise<GitLogEntry[]> {
    const rootPath = workspaceSession.requireRoot()
    const result = await runGit(
      ['log', `-n${Math.min(Math.max(limit, 1), 100)}`, '--pretty=format:%H\t%an\t%ad\t%s', '--date=iso'],
      rootPath
    )
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'git log failed')
    }
    return parseGitLog(result.stdout)
  }

  async stage(path: string): Promise<void> {
    const rootPath = workspaceSession.requireRoot()
    const safePath = workspaceSession.resolve(path)
    const result = await runGit(['add', '--', safePath], rootPath)
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git add failed')
  }

  async unstage(path: string): Promise<void> {
    const rootPath = workspaceSession.requireRoot()
    const safePath = workspaceSession.resolve(path)
    const result = await runGit(['restore', '--staged', '--', safePath], rootPath)
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git unstage failed')
  }

  async commit(input: GitCommitInput): Promise<void> {
    const rootPath = workspaceSession.requireRoot()
    const message = input.message.trim()
    if (!message) throw new Error('Commit message is required')
    const result = await runGit(['commit', '-m', message], rootPath)
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git commit failed')
  }

  async checkout(input: GitCheckoutInput): Promise<void> {
    const rootPath = workspaceSession.requireRoot()
    const branch = input.branch.trim()
    if (!branch || /[\s.]{2}|[\0\\]/.test(branch)) throw new Error('Invalid branch name')
    const args = input.create ? ['checkout', '-b', branch] : ['checkout', branch]
    const result = await runGit(args, rootPath)
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git checkout failed')
  }

  async revert(input: GitRevertInput): Promise<void> {
    const rootPath = workspaceSession.requireRoot()
    if (input.mode === 'revert-head') {
      const result = await runGit(['revert', '--no-edit', 'HEAD'], rootPath)
      if (result.code !== 0) throw new Error(result.stderr.trim() || 'git revert failed')
      return
    }
    if (!input.path) throw new Error('Path is required to discard changes')
    const safePath = workspaceSession.resolve(input.path)
    const restore = await runGit(['restore', '--staged', '--worktree', '--', safePath], rootPath)
    if (restore.code === 0) return
    const checkout = await runGit(['checkout', '--', safePath], rootPath)
    if (checkout.code !== 0) {
      throw new Error(
        restore.stderr.trim() ||
          checkout.stderr.trim() ||
          'Could not discard changes (untracked files must be deleted from the explorer)'
      )
    }
  }

  async fetch(): Promise<GitCommandResult> {
    return this.remote('fetch', ['fetch', '--all', '--prune'])
  }

  async pull(): Promise<GitCommandResult> {
    return this.remote('pull', ['pull'])
  }

  async push(): Promise<GitCommandResult> {
    return this.remote('push', ['push'])
  }

  async stash(message?: string): Promise<GitCommandResult> {
    const trimmed = message?.trim()
    const args = trimmed ? ['stash', 'push', '-u', '-m', trimmed] : ['stash', 'push', '-u']
    return this.remote('stash', args)
  }

  async stashPop(): Promise<GitCommandResult> {
    return this.remote('stash-pop', ['stash', 'pop'])
  }

  async stashes(): Promise<GitStashEntry[]> {
    const rootPath = workspaceSession.requireRoot()
    const result = await runGit(
      ['stash', 'list', '--format=%gd%x09%H%x09%cr%x09%gs'],
      rootPath
    )
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git stash list failed')
    return parseGitStashList(result.stdout)
  }

  async applyStash(ref: string, pop = false): Promise<GitCommandResult> {
    if (!/^stash@\{\d+\}$/.test(ref)) throw new Error('Invalid stash reference')
    return this.remote(pop ? 'stash-pop' : 'stash', ['stash', pop ? 'pop' : 'apply', ref])
  }

  async dropStash(ref: string): Promise<void> {
    if (!/^stash@\{\d+\}$/.test(ref)) throw new Error('Invalid stash reference')
    const rootPath = workspaceSession.requireRoot()
    const result = await runGit(['stash', 'drop', ref], rootPath)
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git stash drop failed')
  }

  private async remote(action: GitRemoteAction, args: string[]): Promise<GitCommandResult> {
    const rootPath = workspaceSession.requireRoot()
    const result = await runGit(args, rootPath, 120_000)
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${action} failed`)
    }
    return { action, code: result.code, stdout: result.stdout, stderr: result.stderr }
  }
}

export const gitService = new GitService()
