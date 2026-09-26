import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { mergeIgnoreNames } from '../shared/lib/ignore-rules'
import {
  buildFtsQuery,
  hitFromContent,
  isIndexedFileUnchanged,
  regexSearchContent,
  scoreSymbolHit
} from '../shared/lib/code-index'
import { hashContent, scanWorkspaceFiles } from '../electron/main/code-intel/file-scanner'

const dirs: string[] = []

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('workspace scanner ignore', () => {
  it('skips default ignored directories while indexing source files', async () => {
    const root = await tempDir('code-intel-scan-')
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
    await mkdir(join(root, 'dist'), { recursive: true })
    await writeFile(join(root, 'src', 'app.ts'), 'export function app() {}')
    await writeFile(join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1')
    await writeFile(join(root, 'dist', 'out.js'), 'console.log(1)')
    await writeFile(join(root, 'src', 'logo.png'), 'not-an-image')

    const scanned = await scanWorkspaceFiles(root, mergeIgnoreNames([]))
    expect(scanned.map((file) => file.relativePath)).toEqual(['src/app.ts'])
  })
})

describe('incremental index skip', () => {
  it('skips when mtime and size match, otherwise compares content hash', () => {
    const first = 'export function alpha() { return "one" }\n'
    const second = 'export function beta() { return "two" }\n'
    const existing = { hash: hashContent(first), mtimeMs: 1000, size: first.length }

    expect(isIndexedFileUnchanged(existing, { mtimeMs: 1000, size: first.length }, hashContent(second))).toBe(true)
    expect(isIndexedFileUnchanged(existing, { mtimeMs: 2000, size: second.length }, hashContent(first))).toBe(true)
    expect(isIndexedFileUnchanged(existing, { mtimeMs: 2000, size: second.length }, hashContent(second))).toBe(false)
    expect(isIndexedFileUnchanged(null, { mtimeMs: 1000, size: first.length }, hashContent(first))).toBe(false)
  })
})

describe('code search helpers', () => {
  it('builds a quoted FTS query and locates a text hit', () => {
    expect(buildFtsQuery('  foo "bar"  ')).toBe('"foo" AND "bar"')
    expect(buildFtsQuery('   ')).toBeNull()

    const hit = hitFromContent(
      {
        path: '/proj/src/util.ts',
        relativePath: 'src/util.ts',
        language: 'typescript',
        content: 'export function alpha() {\n  return "one"\n}\n'
      },
      'one',
      1
    )
    expect(hit.startLine).toBe(2)
    expect(hit.snippet).toContain('one')
    expect(scoreSymbolHit('alpha', 'alpha')).toBe(2)
    expect(scoreSymbolHit('alphabet', 'alpha')).toBe(1)
  })

  it('finds regex matches and ignores invalid patterns', () => {
    const rows = [
      {
        path: '/proj/src/util.ts',
        relativePath: 'src/util.ts',
        language: 'typescript' as const,
        content: 'export function beta() { return "two" }\n'
      }
    ]
    expect(regexSearchContent(rows, 'function\\s+beta', 10)).toHaveLength(1)
    expect(regexSearchContent(rows, 'function\\s+alpha', 10)).toHaveLength(0)
    expect(regexSearchContent(rows, '(unterminated', 10)).toHaveLength(0)
  })
})
