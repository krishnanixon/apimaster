import { describe, expect, it } from 'vitest'
import { normalizeAgentResponseText } from '../shared/lib/agent-response'

describe('agent response presentation', () => {
  it('unwraps structured provider response envelopes', () => {
    expect(normalizeAgentResponseText('{"type":"response","text":"## Result\\nDone"}')).toBe('## Result\nDone')
  })

  it('preserves markdown and incomplete streams', () => {
    expect(normalizeAgentResponseText('**Readable answer**')).toBe('**Readable answer**')
    expect(normalizeAgentResponseText('{"type":"response","text":"partial')).toContain('partial')
  })
})
