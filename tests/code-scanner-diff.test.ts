import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { ProjectAnalyzer, isCandidateFile } from '../shared/lib/code-scanner/analyzer'
import { diffScans, diffToMarkdown } from '../shared/lib/code-scanner/scan-diff'
import { readFilesAtRef } from '../electron/main/code-scanner/git-ref'

function scan(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish().endpoints
}

const BEFORE = `
  import express from 'express'
  import { z } from 'zod'
  const app = express()
  app.get('/users', (req, res) => {})
  app.post('/users', validate(z.object({ email: z.string().email(), nickname: z.string().optional() })), (req, res) => {})
  app.delete('/users/:id', (req, res) => {})
`
const AFTER = `
  import express from 'express'
  import { z } from 'zod'
  const app = express()
  app.get('/users', requireAuth, (req, res) => {})
  app.post('/users', validate(z.object({ email: z.string().email(), nickname: z.string(), password: z.string() })), (req, res) => {})
  app.get('/users/:id', (req, res) => {})
`

describe('scan diff', () => {
  const diff = diffScans(scan({ 'app.ts': BEFORE }), scan({ 'app.ts': AFTER }))

  it('finds added, removed and changed endpoints and flags breaking changes', () => {
    expect(diff.added.map((e) => `${e.method} ${e.path}`)).toEqual(['GET /users/:id'])
    expect(diff.removed.map((e) => `${e.method} ${e.path}`)).toEqual(['DELETE /users/:id'])
    const changes = Object.fromEntries(diff.changed.map((c) => [`${c.endpoint.method} ${c.endpoint.path}`, c.changes]))
    expect(changes['GET /users']).toEqual([{ text: 'now requires authentication', breaking: true }])
    expect(changes['POST /users']).toEqual([
      { text: 'body field `password` added (required)', breaking: true },
      { text: 'body field `nickname` is now required', breaking: true }
    ])
    expect(diff.breakingCount).toBe(4)
  })

  it('writes a Markdown changelog', () => {
    const md = diffToMarkdown(diff, 'API changes')
    expect(md).toContain('**4 breaking changes**')
    expect(md).toContain('### Removed (breaking)\n- `DELETE /users/:id`')
    expect(md).toContain('  - **Breaking:** now requires authentication')
  })
})

describe('reading a git ref', () => {
  const repo = mkdtempSync(join(tmpdir(), 'scan-ref-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString()
  afterAll(() => rmSync(repo, { recursive: true, force: true }))

  it('scans files as committed on another branch, inside a subfolder, without checking it out', async () => {
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    mkdirSync(join(repo, 'api', 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(repo, 'api', 'app.ts'), BEFORE)
    writeFileSync(join(repo, 'api', 'node_modules', 'x', 'index.js'), `app.get('/vendored', () => {})`)
    writeFileSync(join(repo, 'README.md'), 'hi')
    git('add', '-A')
    git('commit', '-q', '-m', 'v1')
    writeFileSync(join(repo, 'api', 'app.ts'), AFTER)

    const { files, commit } = await readFilesAtRef(join(repo, 'api'), 'main', { include: isCandidateFile, maxFiles: 100, maxFileBytes: 1_000_000 })
    expect(commit).toMatch(/^[0-9a-f]{40}$/)
    expect([...files.keys()]).toEqual(['app.ts'])
    expect(files.get('app.ts')).toBe(BEFORE)
  })

  it('rejects refs that look like options or do not exist', async () => {
    const opts = { include: isCandidateFile, maxFiles: 10, maxFileBytes: 1000 }
    await expect(readFilesAtRef(repo, '--output=/tmp/x', opts)).rejects.toThrow('Enter a branch')
    await expect(readFilesAtRef(repo, 'no-such-branch', opts)).rejects.toThrow('is not a branch')
  })
})
