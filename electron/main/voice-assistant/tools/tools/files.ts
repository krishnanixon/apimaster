import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'
import { app } from 'electron'
import { assertSafePath } from '@shared/lib/voice-path-safety'
import type { AssistantTool } from '../types'
import { voiceNotesRoot } from './create-note'

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.csv', '.log'])
const MAX_HITS = 20
const MAX_FILE_BYTES = 64_000

function allowedRoots(): string[] {
  return [voiceNotesRoot(), join(app.getPath('userData'), 'voice-assistant')]
}

function walk(dir: string, query: string, hits: string[], depth: number): void {
  if (hits.length >= MAX_HITS || depth > 6) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walk(full, query, hits, depth + 1)
      continue
    }
    if (!TEXT_EXTENSIONS.has(extname(entry).toLowerCase())) continue
    const haystack = `${entry}\n${readSnippet(full)}`.toLowerCase()
    if (haystack.includes(query)) {
      hits.push(relative(voiceNotesRoot(), full) || entry)
    }
    if (hits.length >= MAX_HITS) return
  }
}

function readSnippet(path: string): string {
  try {
    return readFileSync(path, 'utf-8').slice(0, 2000)
  } catch {
    return ''
  }
}

export const searchLocalFilesTool: AssistantTool = {
  name: 'search_local_files',
  description: 'Search Voice Assistant notes for a query. Does not search the whole disk.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text' }
    },
    required: ['query'],
    additionalProperties: false
  },
  async execute(input) {
    const query = String((input as { query: string }).query).trim().toLowerCase()
    if (!query) return { ok: false, output: 'Query is required.' }
    const root = voiceNotesRoot()
    if (!existsSync(root)) return { ok: true, output: 'No notes found.' }
    const hits: string[] = []
    walk(root, query, hits, 0)
    if (hits.length === 0) return { ok: true, output: 'No matching files.' }
    return { ok: true, output: hits.map((h) => `- ${h}`).join('\n') }
  }
}

export const readFileTool: AssistantTool = {
  name: 'read_file',
  description: 'Read a text note from the Voice Assistant notes folder.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path inside the notes folder' }
    },
    required: ['path'],
    additionalProperties: false
  },
  async execute(input) {
    const requested = String((input as { path: string }).path)
    try {
      const resolved = assertSafePath(requested, allowedRoots())
      if (!existsSync(resolved)) return { ok: false, output: 'File not found.' }
      const stat = statSync(resolved)
      if (!stat.isFile()) return { ok: false, output: 'Not a file.' }
      if (stat.size > MAX_FILE_BYTES) return { ok: false, output: 'File is too large to read.' }
      if (!TEXT_EXTENSIONS.has(extname(resolved).toLowerCase())) {
        return { ok: false, output: 'Only text notes can be read.' }
      }
      const content = readFileSync(resolved, 'utf-8')
      return { ok: true, output: content.slice(0, MAX_FILE_BYTES) }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not read file.' }
    }
  }
}
