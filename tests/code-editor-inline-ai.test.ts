import { describe, expect, it } from 'vitest'
import {
  applyMention,
  buildInlineAskMessages,
  buildCompletionMessages,
  buildInlineEditMessages,
  filterSpecialMentions,
  languageFromPath,
  mentionQueryAt,
  shouldTriggerCompletion,
  stripCompletedFences,
  trimCompletionOverlap,
  visibleCodeFromStream,
  windowAround
} from '../shared/lib/editor-ai'

describe('editor AI helpers', () => {
  it('detects language from a file path', () => {
    expect(languageFromPath('src\\app\\main.tsx')).toBe('tsx')
    expect(languageFromPath('/tmp/app.py')).toBe('python')
  })

  it('windows prefix and suffix around a selection', () => {
    const doc = 'aaaaSELECTIONbbbb'
    expect(windowAround(doc, 4, 13, 2, 2)).toEqual({ prefix: 'aa', suffix: 'bb' })
  })

  it('strips complete and partial markdown fences', () => {
    expect(visibleCodeFromStream('```ts\nconst x = 1\n```')).toBe('const x = 1')
    expect(visibleCodeFromStream('```')).toBe('')
    expect(visibleCodeFromStream('```ts\ncon')).toBe('con')
    expect(stripCompletedFences('```\nfoo()\n```\n')).toBe('foo()')
  })

  it('drops completions that restate the suffix', () => {
    expect(trimCompletionOverlap('bar();\n', 'bar();\nnext()')).toBe('')
    expect(trimCompletionOverlap('bar()', '\n')).toBe('bar()')
    expect(trimCompletionOverlap('World', 'World')).toBe('')
  })

  it('gates Tab completion requests', () => {
    expect(
      shouldTriggerCompletion({
        docLength: 100,
        selectionEmpty: true,
        typedChars: 1,
        inlineEditOpen: false,
        completionsEnabled: true
      })
    ).toBe(true)
    expect(
      shouldTriggerCompletion({
        docLength: 100,
        selectionEmpty: false,
        typedChars: 1,
        inlineEditOpen: false,
        completionsEnabled: true
      })
    ).toBe(false)
    expect(
      shouldTriggerCompletion({
        docLength: 100,
        selectionEmpty: true,
        typedChars: 1,
        inlineEditOpen: true,
        completionsEnabled: true
      })
    ).toBe(false)
  })

  it('builds inline ask prompts that keep the question and selection', () => {
    const messages = buildInlineAskMessages({
      instruction: 'What does this do?',
      filePath: 'src/app.ts',
      language: 'typescript',
      prefix: 'const a = 1\n',
      suffix: '\nconst b = 2',
      selection: 'return a'
    })
    expect(messages[0]?.content).toContain('in-editor coding assistant')
    expect(messages[1]?.content).toContain('What does this do?')
    expect(messages[1]?.content).toContain('return a')
  })

  it('parses @ mentions at the cursor', () => {
    expect(mentionQueryAt('see @auth', 9)).toEqual({ start: 4, query: 'auth' })
    expect(mentionQueryAt('see @', 5)).toEqual({ start: 4, query: '' })
    expect(mentionQueryAt('user@host', 9)).toBeNull()
    expect(mentionQueryAt('hello there', 5)).toBeNull()
  })

  it('inserts a mention token and moves the cursor', () => {
    expect(applyMention('see @au', { start: 4, query: 'au' }, '@src/auth.ts', 7)).toEqual({
      text: 'see @src/auth.ts ',
      cursor: 17
    })
  })

  it('filters special mentions', () => {
    expect(filterSpecialMentions('code').map((item) => item.id)).toEqual(['codebase'])
    expect(filterSpecialMentions('git').map((item) => item.id)).toEqual(['git'])
    expect(filterSpecialMentions('').map((item) => item.id)).toEqual([
      'codebase',
      'git',
      'selection',
      'rules'
    ])
    expect(filterSpecialMentions('zzz')).toEqual([])
  })

  it('builds inline-edit and completion prompts', () => {
    const edit = buildInlineEditMessages({
      instruction: 'rename foo to bar',
      filePath: 'a.ts',
      prefix: 'const ',
      suffix: ' = 1',
      selection: 'foo'
    })
    expect(edit[0]?.content).toContain('Rewrite ONLY the selection')
    expect(edit[1]?.content).toContain('<SELECTION>\nfoo</SELECTION>')

    const complete = buildCompletionMessages({
      filePath: 'a.ts',
      prefix: 'const x = ',
      suffix: '\n'
    })
    expect(complete[1]?.content).toContain('<CURSOR>')
  })
})
