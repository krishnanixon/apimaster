import { describe, expect, it } from 'vitest'
import {
  agentConversationTitle,
  deriveChecklist,
  deriveExecutionPlan,
  compactAgentConversationItems,
  needsValidationBeforeFinish,
  classifyTool,
  formatToolActivity,
  formatToolDone
} from '../shared/lib/agent-activity'

describe('agent activity', () => {
  it('summarizes tool calls without dumping JSON', () => {
    expect(formatToolActivity('read_file', { path: 'src/auth.ts' })).toBe('Reading src/auth.ts')
    expect(formatToolActivity('search_code', { query: 'login' })).toBe('Searching login')
    expect(formatToolActivity('apply_patch', { path: 'a.ts' })).toBe('Editing a.ts')
  })

  it('labels completed tools and unknown MCP tools', () => {
    expect(formatToolDone('read_file', { path: 'src/auth.ts' })).toBe('Read src/auth.ts')
    expect(formatToolDone('mcp_call', { name: 'browser_snapshot' })).toBe('Called MCP browser_snapshot')
    expect(classifyTool('mcp_custom_tool')).toBe('mcp')
    expect(formatToolActivity('some_plugin_tool', { path: 'a.ts' })).toBe('Some Plugin Tool a.ts')
  })

  it('tracks the Analyze → Find → Read → Modify checklist', () => {
    const idle = deriveChecklist([], true)
    expect(idle[0]).toMatchObject({ id: 'analyze', state: 'active' })

    const reading = deriveChecklist(['search_code', 'read_file'], true, 'read_file')
    expect(reading.find((step) => step.id === 'find')?.state).toBe('done')
    expect(reading.find((step) => step.id === 'read')?.state).toBe('active')
    expect(reading.find((step) => step.id === 'modify')?.state).toBe('pending')

    const done = deriveChecklist(['search_code', 'read_file', 'apply_patch', 'run_test'], false)
    expect(done.filter((step) => step.state === 'done').map((step) => step.id)).toEqual(
      expect.arrayContaining(['analyze', 'find', 'read', 'modify', 'test'])
    )
  })

  it('builds a mode-aware execution plan without another model request', () => {
    const active = deriveExecutionPlan({
      mode: 'agent',
      toolsUsed: ['search_code', 'read_file', 'apply_patch'],
      currentTool: 'run_test',
      status: 'running'
    })
    expect(active.find((step) => step.id === 'modify')?.state).toBe('done')
    expect(active.find((step) => step.id === 'test')?.state).toBe('active')

    const ask = deriveExecutionPlan({ mode: 'ask', toolsUsed: ['read_file'], status: 'done' })
    expect(ask.some((step) => step.id === 'modify')).toBe(false)
    expect(ask.some((step) => step.id === 'test')).toBe(false)
  })

  it('requires validation after successful agent edits', () => {
    expect(needsValidationBeforeFinish('agent', ['read_file', 'apply_patch'])).toBe(true)
    expect(needsValidationBeforeFinish('agent', ['apply_patch', 'run_test'])).toBe(false)
    expect(needsValidationBeforeFinish('edit', ['apply_patch'])).toBe(false)
    expect(needsValidationBeforeFinish('debug', ['write_file', 'get_diagnostics'])).toBe(false)
  })

  it('persists a bounded conversation without patch bodies or live tool states', () => {
    const compact = compactAgentConversationItems([
      { id: 'u', kind: 'user', text: 'Fix auth' },
      { id: 'p', kind: 'patch' },
      {
        id: 't',
        kind: 'tool',
        name: 'run_test',
        input: {},
        label: 'Running tests',
        status: 'running',
        output: 'x'.repeat(3_000)
      }
    ])
    expect(compact.map((item) => item.kind)).toEqual(['user', 'tool'])
    expect(compact[1]).toMatchObject({ kind: 'tool', status: 'failed' })
    expect(compact[1]?.kind === 'tool' ? compact[1].output?.length : 0).toBe(2_000)
  })

  it('creates compact chat titles locally', () => {
    expect(agentConversationTitle('  Fix   terminal\n theme  ')).toBe('Fix terminal theme')
    expect(agentConversationTitle('x'.repeat(60))).toBe(`${'x'.repeat(47)}…`)
    expect(agentConversationTitle('   ')).toBe('New chat')
  })
})
