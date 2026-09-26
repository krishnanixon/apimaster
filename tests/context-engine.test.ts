import { describe, expect, it } from 'vitest'
import {
  allocateTokenBudget,
  applyTokenBudget,
  assembleContextPack,
  compressText,
  contextDirectives,
  contextSearchQuery,
  dedupeChunks,
  estimateTokens,
  extractRelativeImports,
  looksLikeCodeQuery,
  modelContextLimit,
  rankChunks,
  reciprocalRankFusion
} from '../shared/lib/context-engine'
import type { ContextChunk } from '../shared/types/context-engine'

function chunk(
  partial: Partial<ContextChunk> & Pick<ContextChunk, 'id' | 'source' | 'content'>
): ContextChunk {
  return {
    title: partial.title ?? partial.id,
    score: partial.score ?? 0.5,
    path: partial.path,
    startLine: partial.startLine,
    ...partial
  }
}

describe('token budget', () => {
  it('estimates tokens from character length', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })

  it('uses a smaller pack cap for local models', () => {
    const cloud = allocateTokenBudget({
      model: 'gpt-4o-mini',
      conversationTokens: 500,
      systemTokens: 200
    })
    const local = allocateTokenBudget({
      model: 'llama3.2',
      conversationTokens: 500,
      systemTokens: 200,
      localModel: true
    })
    expect(modelContextLimit('llama3.2')).toBe(8192)
    expect(local.availableForContext).toBeLessThan(cloud.availableForContext)
    expect(local.packCap).toBe(2500)
    expect(cloud.packCap).toBe(8000)
  })

  it('keeps higher-priority chunks when the budget is tight', () => {
    const selection = chunk({
      id: 'sel',
      source: 'selection',
      path: 'a.ts',
      content: 'A'.repeat(80),
      score: 1
    })
    const knowledge = chunk({
      id: 'kb',
      source: 'knowledge',
      content: 'K'.repeat(400),
      score: 0.9
    })
    const { kept, dropped } = applyTokenBudget([knowledge, selection], 30)
    expect(kept[0]?.source).toBe('selection')
    expect(dropped).toBeGreaterThan(0)
  })
})

describe('hybrid ranking', () => {
  it('fuses ranked lists with reciprocal rank fusion', () => {
    const fused = reciprocalRankFusion([
      [{ id: 'file-a' }, { id: 'file-b' }],
      [{ id: 'file-b' }, { id: 'file-c' }]
    ])
    expect(fused.get('file-b') ?? 0).toBeGreaterThan(fused.get('file-a') ?? 0)
    expect(fused.get('file-b') ?? 0).toBeGreaterThan(fused.get('file-c') ?? 0)
  })

  it('ranks selection above knowledge and dedupes identical hits', () => {
    const ranked = rankChunks([
      chunk({ id: 'k', source: 'knowledge', content: 'kb' }),
      chunk({ id: 's', source: 'selection', path: 'a.ts', content: 'sel' }),
      chunk({ id: 'r', source: 'project_rules', path: '.ai-workbench/rules/style.md', content: 'Use TypeScript' })
    ])
    expect(ranked[0]?.source).toBe('selection')
    expect(ranked.map((row) => row.source)).toContain('project_rules')
    const unique = dedupeChunks([
      chunk({ id: '1', source: 'file', path: 'a.ts', startLine: 1, content: 'x', score: 0.2 }),
      chunk({ id: '2', source: 'file', path: 'a.ts', startLine: 1, content: 'y', score: 0.9 })
    ])
    expect(unique).toHaveLength(1)
    expect(unique[0]?.content).toBe('y')
  })

  it('dedupes identical file content received from multiple context sources', () => {
    const unique = dedupeChunks([
      chunk({ id: 'current', source: 'current_file', path: 'src/app.ts', content: 'export const x = 1' }),
      chunk({ id: 'pinned', source: 'pinned', path: 'src/app.ts', content: 'export const x = 1' }),
      chunk({ id: 'tab', source: 'open_tab', path: 'src/app.ts', content: 'export const x = 1' })
    ])
    expect(unique).toHaveLength(1)
    expect(unique[0]?.source).toBe('pinned')
  })
})

describe('compression and prompt builder', () => {
  it('keeps head and tail when compressing', () => {
    const { text, compressed } = compressText('HEAD' + 'm'.repeat(200) + 'TAIL', 40)
    expect(compressed).toBe(true)
    expect(text.startsWith('HEAD')).toBe(true)
    expect(text.endsWith('TAIL')).toBe(true)
    expect(text).toContain('[compressed]')
  })

  it('builds a bounded prompt that never includes dropped sources', () => {
    const pack = assembleContextPack(
      [
        chunk({
          id: 'sel',
          source: 'selection',
          path: 'src/auth.ts',
          startLine: 10,
          content: 'function login() {}',
          score: 1
        }),
        chunk({
          id: 'kb',
          source: 'knowledge',
          content: 'Users sign in with email.',
          score: 0.4
        })
      ],
      allocateTokenBudget({ model: 'gpt-4o-mini', conversationTokens: 0, systemTokens: 0 }),
      'gpt-4o-mini'
    )
    expect(pack.formatted).toContain('Current selection')
    expect(pack.formatted).toContain('src/auth.ts:10')
    expect(pack.formatted).not.toMatch(/entire repository/i)
    expect(pack.summary.chunkCount).toBe(2)
    expect(pack.summary.promptTokens).toBeGreaterThan(0)
    expect(pack.summary.budgetTokens).toBe(8_000)
    expect(pack.summary.promptTokens).toBeLessThanOrEqual(pack.summary.budgetTokens)
  })
})

describe('query and import helpers', () => {
  it('parses explicit context directives without matching email addresses', () => {
    expect([...contextDirectives('@codebase find auth and @git review changes')]).toEqual([
      'codebase',
      'git'
    ])
    expect([...contextDirectives('email user@git.example.com')]).toEqual([])
    expect([...contextDirectives('Use @RULES and @selection')]).toEqual(['rules', 'selection'])
    expect([...contextDirectives('Fix @problems and @selection')]).toEqual(['problems', 'selection'])
  })

  it('removes context directives before repository search', () => {
    expect(contextSearchQuery('@codebase find refresh token @git')).toBe('find refresh token')
    expect(contextSearchQuery('@problems fix type errors')).toBe('fix type errors')
    expect(contextSearchQuery('email user@git.example.com')).toBe('email user@git.example.com')
  })

  it('detects code-like queries and skips plain planning questions', () => {
    expect(looksLikeCodeQuery('Fix login() in auth.ts')).toBe(true)
    expect(looksLikeCodeQuery('What are the key requirements for this project?')).toBe(false)
  })

  it('extracts relative imports', () => {
    expect(
      extractRelativeImports(`
        import { foo } from './foo'
        const bar = require('../bar')
        import x from 'react'
      `)
    ).toEqual(['./foo', '../bar'])
  })
})
