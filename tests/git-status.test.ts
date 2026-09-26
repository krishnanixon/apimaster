import { describe, expect, it } from 'vitest'
import {
  parseBranchList,
  parseGitLog,
  parseGitStashList,
  parsePorcelainStatus
} from '../shared/lib/git-status'

describe('parsePorcelainStatus', () => {
  it('parses staged, unstaged, and untracked files', () => {
    const entries = parsePorcelainStatus(['M  src/a.ts', ' M src/b.ts', '?? src/c.ts', 'R  old.ts -> new.ts'].join('\n'))
    expect(entries).toHaveLength(4)
    expect(entries[0]).toMatchObject({ path: 'src/a.ts', staged: true, status: 'modified' })
    expect(entries[1]).toMatchObject({ path: 'src/b.ts', unstaged: true, status: 'modified' })
    expect(entries[2]).toMatchObject({ path: 'src/c.ts', status: 'untracked', unstaged: true })
    expect(entries[3]).toMatchObject({ path: 'new.ts', originalPath: 'old.ts', status: 'renamed', staged: true })
  })
})

describe('parseBranchList', () => {
  it('detects the current branch', () => {
    const parsed = parseBranchList('* main\n  feature/login\n  remotes/origin/main\n')
    expect(parsed.current).toBe('main')
    expect(parsed.branches).toContain('main')
    expect(parsed.branches).toContain('feature/login')
  })
})

describe('parseGitLog', () => {
  it('parses tab-separated log lines', () => {
    const log = parseGitLog('abc123\tAda\t2026-08-16\tInitial commit\n')
    expect(log[0]).toEqual({
      hash: 'abc123',
      author: 'Ada',
      date: '2026-08-16',
      subject: 'Initial commit'
    })
  })
})

describe('parseGitStashList', () => {
  it('parses stash metadata and removes the generated branch prefix', () => {
    const stashes = parseGitStashList(
      [
        'stash@{0}\tabc123\t2 hours ago\tOn main: editor work',
        'stash@{1}\tdef456\t3 days ago\tWIP on feature: 1234567 Add Git panel'
      ].join('\n')
    )

    expect(stashes).toEqual([
      {
        ref: 'stash@{0}',
        hash: 'abc123',
        relativeDate: '2 hours ago',
        message: 'editor work'
      },
      {
        ref: 'stash@{1}',
        hash: 'def456',
        relativeDate: '3 days ago',
        message: 'WIP on feature: 1234567 Add Git panel'
      }
    ])
  })

  it('ignores malformed stash references', () => {
    expect(parseGitStashList('refs/stash\tabc123\tnow\tmessage')).toEqual([])
  })
})
