import { describe, expect, it } from 'vitest'
import {
  combineGenerationRules,
  formatGenerationRulesForPrompt,
  MAX_GENERATION_RULES_CHARS,
  sanitizeGenerationRules
} from '../shared/lib/document-generation-rules'
import { getTypeSystemPrompt } from '../shared/lib/document-prompts'

describe('document generation rules', () => {
  it('keeps default generation when both rule sets are empty', () => {
    expect(combineGenerationRules('', '')).toBe('')
    expect(combineGenerationRules(null, undefined)).toBe('')
    expect(formatGenerationRulesForPrompt('')).toBe('')
  })

  it('includes workspace rules only when project rules are empty', () => {
    const combined = combineGenerationRules('Use REQ-001 IDs', '   ')
    expect(combined).toContain('Workspace rules')
    expect(combined).toContain('Use REQ-001 IDs')
    expect(combined).not.toContain('Project rules')
  })

  it('includes project rules and gives them precedence over workspace rules', () => {
    const combined = combineGenerationRules('British English', 'Use HIPAA language')
    expect(combined).toContain('Workspace rules')
    expect(combined).toContain('British English')
    expect(combined).toContain('Project rules')
    expect(combined).toContain('HIPAA')
    expect(combined).toContain('follow the project rules')
  })

  it('strips null bytes and caps stored length', () => {
    expect(sanitizeGenerationRules('keep\0this')).toBe('keepthis')
    expect(sanitizeGenerationRules('x'.repeat(MAX_GENERATION_RULES_CHARS + 50))).toHaveLength(
      MAX_GENERATION_RULES_CHARS
    )
    expect(sanitizeGenerationRules(12)).toBe('')
  })

  it('leaves the system prompt unchanged when no custom rules are set', () => {
    const prompt = getTypeSystemPrompt('requirements', 'professional', 'Project: Atlas')
    expect(prompt).toContain('Project: Atlas')
    expect(prompt).not.toContain('Mandatory custom generation rules')
  })

  it('appends mandatory custom rules to the generation system prompt', () => {
    const rules = combineGenerationRules('Number as REQ-001', 'Healthcare tone')
    const prompt = getTypeSystemPrompt('requirements', 'professional', undefined, rules)
    expect(prompt).toContain('Mandatory custom generation rules')
    expect(prompt).toContain('REQ-001')
    expect(prompt).toContain('Healthcare tone')
  })
})
