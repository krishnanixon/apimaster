import { randomUUID } from 'crypto'
import { formatDiagnostics, parseDiagnostics } from '@shared/lib/diagnostics-parse'
import { agentToolRegistry, type AgentTool } from './registry'
import { applyAgentPatch, writeAgentFile, readWithOverlay } from './patch-engine'
import { agentMemory } from './memory.service'
import { listMcpServers, mcpCallTool, mcpListTools } from './mcp-client'
import { codeEditorService } from '../code-editor/code-editor.service'
import { indexerService } from '../code-intel/indexer.service'
import { gitService } from '../git/git.service'
import { commandExecService } from '../terminal/command-exec.service'
import { workspaceSession } from '../security/workspace-session'

function str(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

function cap(text: string, max = 12_000): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text
}

async function runCommand(command: string, timeoutMs = 90_000, acceptRisk = false) {
  const cwd = workspaceSession.requireRoot()
  return commandExecService.exec({
    id: randomUUID(),
    command,
    cwd,
    timeoutMs,
    acceptRisk
  })
}

function tool(def: AgentTool): void {
  agentToolRegistry.register(def)
}

export function registerAgentTools(): void {
  if (agentToolRegistry.list().length > 0) return

  tool({
    name: 'read_file',
    description: 'Read a workspace file. Use a relative path.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative file path' } },
      required: ['path']
    },
    execute: async (input) => {
      const content = await readWithOverlay(str(input, 'path'))
      return { ok: true, output: cap(content, 40_000) }
    }
  })

  tool({
    name: 'write_file',
    description: 'Replace the entire contents of a workspace file.',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    },
    execute: async (input) => {
      const record = await writeAgentFile(str(input, 'path'), str(input, 'content'))
      return { ok: true, output: `Staged write to ${record.path} (${record.next.length} chars). Review it in Changes.` }
    }
  })

  tool({
    name: 'create_file',
    description: 'Create a new workspace file.',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path']
    },
    execute: async (input) => {
      const rel = str(input, 'path')
      const record = await writeAgentFile(rel, str(input, 'content') || '')
      return { ok: true, output: `Staged create ${record.path}. Review it in Changes.` }
    }
  })

  tool({
    name: 'delete_file',
    description: 'Stage deletion of a workspace file. Review it in Changes before it is removed from disk.',
    riskLevel: 'destructive',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    },
    execute: async (input) => {
      const { stageAgentDelete } = await import('./patch-engine')
      const record = await stageAgentDelete(str(input, 'path'))
      return { ok: true, output: `Staged delete ${record.path}. Review it in Changes.` }
    }
  })

  tool({
    name: 'apply_patch',
    description: 'Apply a unified diff to a workspace file. Prefer this over write_file.',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional if the diff headers include the path' },
        diff: { type: 'string', description: 'Unified diff' }
      },
      required: ['diff']
    },
    execute: async (input) => {
      const record = await applyAgentPatch({ path: str(input, 'path') || undefined, diff: str(input, 'diff') })
      return { ok: true, output: `Staged patch for ${record.path}. Review it in Changes.` }
    }
  })

  tool({
    name: 'search_code',
    description: 'Full-text search over the workspace code index.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' }
      },
      required: ['query']
    },
    execute: async (input) => {
      const limit = typeof input.limit === 'number' ? input.limit : 20
      const hits = indexerService.search({ mode: 'text', query: str(input, 'query'), limit })
      if (hits.length === 0) return { ok: true, output: 'No text matches.' }
      return {
        ok: true,
        output: hits
          .map((hit) => `${hit.relativePath}:${hit.startLine} ${hit.snippet}`)
          .join('\n')
      }
    }
  })

  tool({
    name: 'find_symbol',
    description: 'Search indexed symbols (functions, classes, components).',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    },
    execute: async (input) => {
      const hits = indexerService.search({ mode: 'symbol', query: str(input, 'query'), limit: 20 })
      if (hits.length === 0) return { ok: true, output: 'No symbols found.' }
      return {
        ok: true,
        output: hits
          .map((hit) => `${hit.kind ?? 'symbol'} ${hit.name ?? ''} ${hit.relativePath}:${hit.startLine}`)
          .join('\n')
      }
    }
  })

  tool({
    name: 'find_reference',
    description: 'Search indexed references to a symbol.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    },
    execute: async (input) => {
      const hits = indexerService.search({ mode: 'reference', query: str(input, 'query'), limit: 20 })
      if (hits.length === 0) return { ok: true, output: 'No references found.' }
      return {
        ok: true,
        output: hits.map((hit) => `${hit.relativePath}:${hit.startLine} ${hit.snippet}`).join('\n')
      }
    }
  })

  tool({
    name: 'find_definition',
    description: 'Find the definition of a symbol (uses TypeScript language service when path/line/column are provided).',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string', description: 'Optional file to resolve from' },
        line: { type: 'number' },
        column: { type: 'number' }
      },
      required: ['query']
    },
    execute: async (input) => {
      const query = str(input, 'query')
      const path = str(input, 'path')
      const line = typeof input.line === 'number' ? input.line : undefined
      const column = typeof input.column === 'number' ? input.column : undefined
      if (path && line && column) {
        try {
          const { tsLanguageService } = await import('../code-intel/ts-language.service')
          let content = ''
          try {
            content = await readWithOverlay(path)
          } catch {
            content = ''
          }
          const locs = tsLanguageService.definition({ path, line, column, content })
          if (locs.length > 0) {
            return {
              ok: true,
              output: locs
                .map((loc) => `${loc.path}:${loc.line}:${loc.column}`)
                .join('\n')
            }
          }
        } catch {
          // fall through to index
        }
      }
      const hits = indexerService.search({ mode: 'symbol', query, limit: 8 })
      const def = hits[0]
      if (!def) return { ok: true, output: 'No definition found.' }
      return {
        ok: true,
        output: `${def.name ?? query} defined in ${def.relativePath}:${def.startLine}\n${def.snippet}`
      }
    }
  })

  tool({
    name: 'rename_symbol',
    description:
      'Rename a TypeScript/JavaScript symbol across the workspace using the language service. Stages file patches.',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        line: { type: 'number' },
        column: { type: 'number' },
        newName: { type: 'string' }
      },
      required: ['path', 'line', 'column', 'newName']
    },
    execute: async (input) => {
      const path = str(input, 'path')
      const newName = str(input, 'newName')
      const line = Number(input.line)
      const column = Number(input.column)
      if (!newName || !/^[A-Za-z_$][\w$]*$/.test(newName)) {
        return { ok: false, output: 'newName must be a valid identifier.' }
      }
      const { tsLanguageService } = await import('../code-intel/ts-language.service')
      let content = ''
      try {
        content = await readWithOverlay(path)
      } catch {
        content = ''
      }
      const edits = tsLanguageService.rename({ path, line, column, content, newName })
      if (!edits.length) return { ok: false, output: 'No rename locations found for this symbol.' }
      const staged: string[] = []
      for (const edit of edits) {
        const record = await writeAgentFile(edit.path, edit.content)
        staged.push(record.path)
      }
      return {
        ok: true,
        output: `Staged rename to "${newName}" in ${staged.length} file(s):\n${staged.map((p) => `- ${p}`).join('\n')}`
      }
    }
  })

  tool({
    name: 'run_terminal',
    description: 'Run a shell command in the workspace. Blocked/dangerous commands are rejected.',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command']
    },
    execute: async (input) => {
      const result = await runCommand(str(input, 'command'), 90_000, true)
      if (result.blocked) return { ok: false, output: result.stderr || 'Command blocked' }
      return {
        ok: result.exitCode === 0,
        output: cap(
          `exit ${result.exitCode}\n${result.stdout}\n${result.stderr}`.trim(),
          16_000
        )
      }
    }
  })

  tool({
    name: 'run_test',
    description: 'Run the project test suite (default: npx vitest run).',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' } }
    },
    execute: async (input) => {
      const command = str(input, 'command') || 'npx vitest run'
      const result = await runCommand(command, 120_000, true)
      const combined = `${result.stdout}\n${result.stderr}`
      const diagnostics = parseDiagnostics(combined)
      return {
        ok: result.exitCode === 0 && !result.blocked,
        output: cap(
          result.blocked
            ? result.stderr
            : `exit ${result.exitCode}\n${formatDiagnostics(diagnostics)}\n${combined}`,
          16_000
        )
      }
    }
  })

  tool({
    name: 'run_linter',
    description: 'Run the TypeScript checker (npx tsc --noEmit).',
    riskLevel: 'write',
    inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
    execute: async (input) => {
      const command = str(input, 'command') || 'npx tsc --noEmit'
      const result = await runCommand(command, 120_000, true)
      const combined = `${result.stdout}\n${result.stderr}`
      return {
        ok: result.exitCode === 0 && !result.blocked,
        output: cap(result.blocked ? result.stderr : formatDiagnostics(parseDiagnostics(combined)) + `\n${combined}`, 16_000)
      }
    }
  })

  tool({
    name: 'get_diagnostics',
    description: 'Collect compiler/test diagnostics from tsc output.',
    riskLevel: 'read',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const result = await runCommand('npx tsc --noEmit', 120_000, true)
      const combined = `${result.stdout}\n${result.stderr}`
      return { ok: true, output: cap(formatDiagnostics(parseDiagnostics(combined)), 12_000) }
    }
  })

  tool({
    name: 'git_status',
    description: 'Show git status for the workspace.',
    riskLevel: 'read',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const snap = await gitService.snapshot()
      if (!snap.available) return { ok: false, output: snap.error || 'Not a git repository' }
      const files = snap.entries.map((e) => `${e.status} ${e.path}`).join('\n') || '(clean)'
      return { ok: true, output: `branch ${snap.branch ?? '?'}\n${files}` }
    }
  })

  tool({
    name: 'git_diff',
    description: 'Show the git diff for a path (default: whole workspace).',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, staged: { type: 'boolean' } }
    },
    execute: async (input) => {
      const path = str(input, 'path') || '.'
      const staged = input.staged === true
      const result = await gitService.diff(path, staged)
      return { ok: true, output: cap(result.diff || '(no diff)', 16_000) }
    }
  })

  tool({
    name: 'git_log',
    description: 'Show recent git commits.',
    riskLevel: 'read',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    execute: async (input) => {
      const limit = typeof input.limit === 'number' ? input.limit : 12
      const entries = await gitService.log(limit)
      return {
        ok: true,
        output: entries.map((e) => `${e.hash.slice(0, 8)} ${e.subject}`).join('\n') || '(no commits)'
      }
    }
  })

  tool({
    name: 'git_commit',
    description: 'Stage all listed paths and create a git commit.',
    riskLevel: 'destructive',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        path: { type: 'string', description: 'Optional path to stage first' }
      },
      required: ['message']
    },
    execute: async (input) => {
      if (str(input, 'path')) await gitService.stage(str(input, 'path'))
      await gitService.commit({ message: str(input, 'message') })
      return { ok: true, output: `Committed: ${str(input, 'message')}` }
    }
  })

  tool({
    name: 'remember_memory',
    description: 'Store a durable project fact for later agent turns.',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        topic: { type: 'string' }
      },
      required: ['content']
    },
    execute: async (input) => {
      const fact = agentMemory.remember({
        content: str(input, 'content'),
        topic: str(input, 'topic') || undefined,
        projectId: agentMemory.getActiveProjectId()
      })
      return { ok: true, output: `Remembered ${fact.id}` }
    }
  })

  tool({
    name: 'recall_memory',
    description: 'Search stored project memory.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    },
    execute: async (input) => {
      const facts = agentMemory.recall(str(input, 'query'), agentMemory.getActiveProjectId())
      if (facts.length === 0) return { ok: true, output: 'No memories matched.' }
      return { ok: true, output: facts.map((f) => `- ${f.topic ? `${f.topic}: ` : ''}${f.content}`).join('\n') }
    }
  })

  tool({
    name: 'browser_fetch',
    description: 'Fetch a public http(s) URL and return extracted text. Requires confirmation.',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url']
    },
    execute: async (input) => {
      const url = str(input, 'url')
      try {
        const { assertSafeHttpUrl } = await import('@shared/lib/seo-crawl-url')
        assertSafeHttpUrl(url)
      } catch (error) {
        return { ok: false, output: error instanceof Error ? error.message : 'URL blocked' }
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
        // Re-check the final URL after redirects.
        try {
          const { assertSafeHttpUrl } = await import('@shared/lib/seo-crawl-url')
          assertSafeHttpUrl(res.url || url)
        } catch (error) {
          return { ok: false, output: error instanceof Error ? error.message : 'Redirect blocked' }
        }
        const raw = await res.text()
        const text = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        return { ok: res.ok, output: cap(`${res.status} ${url}\n${text}`, 12_000) }
      } catch (error) {
        return { ok: false, output: error instanceof Error ? error.message : 'Fetch failed' }
      } finally {
        clearTimeout(timer)
      }
    }
  })

  tool({
    name: 'mcp_list_servers',
    description: 'List configured MCP servers (userData/data/mcp-servers.json).',
    riskLevel: 'read',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const servers = listMcpServers()
      if (servers.length === 0) {
        return { ok: true, output: 'No MCP servers configured. Add { "servers": [{ "id", "command", "args" }] } to mcp-servers.json.' }
      }
      return { ok: true, output: servers.map((s) => `${s.id}: ${s.command} ${(s.args ?? []).join(' ')}`).join('\n') }
    }
  })

  tool({
    name: 'mcp_list_tools',
    description: 'List tools exposed by an MCP server.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      properties: { serverId: { type: 'string' } },
      required: ['serverId']
    },
    execute: async (input) => ({ ok: true, output: await mcpListTools(str(input, 'serverId')) })
  })

  tool({
    name: 'mcp_call',
    description: 'Call a tool on an MCP server.',
    riskLevel: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        serverId: { type: 'string' },
        name: { type: 'string' },
        arguments: { type: 'string', description: 'JSON object string' }
      },
      required: ['serverId', 'name']
    },
    execute: async (input) => {
      let args: Record<string, unknown> = {}
      const raw = str(input, 'arguments')
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>
        } catch {
          return { ok: false, output: 'arguments must be a JSON object string' }
        }
      }
      return { ok: true, output: await mcpCallTool(str(input, 'serverId'), str(input, 'name'), args) }
    }
  })
}
