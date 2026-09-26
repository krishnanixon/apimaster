import { describe, expect, it } from 'vitest'
import { applyUnifiedDiff, createUnifiedDiff, parseUnifiedDiff, pathFromDiff } from '../shared/lib/unified-diff'
import { decideAgentPermission, isToolAllowed } from '../shared/lib/agent-permissions'
import { formatDiagnostics, parseDiagnostics } from '../shared/lib/diagnostics-parse'
import { agentRequestType } from '../shared/lib/agent-routing'
import { parseVoiceModelOutput } from '../shared/lib/voice-model-output'
import { previewStreamingAgentOutput } from '../shared/lib/agent-stream'

describe('patch engine', () => {
  it('applies a unified diff hunk', () => {
    const original = 'function greet() {\n  return "hi"\n}\n'
    const diff = `--- a/src/hi.ts
+++ b/src/hi.ts
@@ -1,3 +1,3 @@
 function greet() {
-  return "hi"
+  return "hello"
 }
`
    const next = applyUnifiedDiff(original, diff)
    expect(next).toContain('return "hello"')
    expect(pathFromDiff(diff)).toBe('src/hi.ts')
    expect(parseUnifiedDiff(diff).hunks).toHaveLength(1)
  })

  it('builds a full-file unified diff for write previews', () => {
    const diff = createUnifiedDiff('src/a.ts', 'a\n', 'b\n')
    expect(diff).toContain('--- a/src/a.ts')
    expect(applyUnifiedDiff('a\n', diff)).toBe('b\n')
  })

  it('rejects a hunk that does not match the file', () => {
    expect(() =>
      applyUnifiedDiff('alpha\n', '@@ -1,1 +1,1 @@\n-beta\n+gamma\n')
    ).toThrow(/does not apply/)
  })
})

describe('agent permissions', () => {
  it('keeps ask/plan/review read-only', () => {
    expect(isToolAllowed('ask', 'read_file')).toBe(true)
    expect(isToolAllowed('ask', 'write_file')).toBe(false)
    expect(isToolAllowed('plan', 'run_terminal')).toBe(false)
    expect(isToolAllowed('review', 'git_diff')).toBe(true)
    expect(isToolAllowed('edit', 'apply_patch')).toBe(true)
    expect(isToolAllowed('debug', 'run_test')).toBe(true)
  })

  it('blocks disallowed tools and blocked shell commands', () => {
    expect(decideAgentPermission({ mode: 'ask', toolName: 'write_file', riskLevel: 'write' }).allow).toBe(
      false
    )
    expect(
      decideAgentPermission({
        mode: 'agent',
        toolName: 'run_terminal',
        riskLevel: 'write',
        command: 'rm -rf /'
      }).allow
    ).toBe(false)
    expect(
      decideAgentPermission({ mode: 'edit', toolName: 'write_file', riskLevel: 'write' }).requireConfirmation
    ).toBe(false)
    expect(
      decideAgentPermission({ mode: 'agent', toolName: 'delete_file', riskLevel: 'destructive' }).requireConfirmation
    ).toBe(true)
    expect(
      decideAgentPermission({ mode: 'debug', toolName: 'run_test', riskLevel: 'write', command: 'npx vitest run' })
        .requireConfirmation
    ).toBe(false)
  })
})

describe('diagnostics and routing', () => {
  it('parses TypeScript compiler errors', () => {
    const hits = parseDiagnostics('src/app.ts(12,5): error TS2322: Type string is not assignable to number.')
    expect(hits[0]).toMatchObject({ file: 'src/app.ts', line: 12, code: 'TS2322', source: 'tsc' })
    expect(formatDiagnostics(hits)).toContain('TS2322')
  })

  it('routes review to CODE_REVIEW and debug to CODE_GENERATION', () => {
    expect(agentRequestType('review')).toBe('CODE_REVIEW')
    expect(agentRequestType('debug')).toBe('CODE_GENERATION')
    expect(agentRequestType('ask')).toBe('CHAT')
  })

  it('parses JSON tool calls from the model', () => {
    const parsed = parseVoiceModelOutput('{"type":"tool_call","name":"read_file","input":{"path":"a.ts"}}')
    expect(parsed.toolName).toBe('read_file')
    expect(parsed.toolInput).toEqual({ path: 'a.ts' })
  })
})

describe('agent stream preview', () => {
  it('hides tool-call JSON and streams response text', () => {
    expect(previewStreamingAgentOutput('{"type":"tool_call","name":"read_file"').mode).toBe('tool')
    const partial = previewStreamingAgentOutput('{"type":"response","text":"Hello \\nwor')
    expect(partial.mode).toBe('text')
    expect(partial.visible).toBe('Hello \nwor')
    const full = previewStreamingAgentOutput('{"type":"response","text":"Done."}')
    expect(full.visible).toBe('Done.')
  })
})
