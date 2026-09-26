import { describe, expect, it } from 'vitest'
import { detectLanguage, isIndexableSourceFile, isJsFamily } from '../shared/lib/language-detect'

describe('language-detect', () => {
  it('maps common extensions to languages', () => {
    expect(detectLanguage('src/app.ts')).toBe('typescript')
    expect(detectLanguage('src/app.tsx')).toBe('tsx')
    expect(detectLanguage('src/index.js')).toBe('javascript')
    expect(detectLanguage('src/Widget.jsx')).toBe('jsx')
    expect(detectLanguage('main.py')).toBe('python')
    expect(detectLanguage('pkg.go')).toBe('go')
    expect(detectLanguage('lib.rs')).toBe('rust')
    expect(detectLanguage('App.java')).toBe('java')
    expect(detectLanguage('styles.css')).toBe('css')
    expect(detectLanguage('page.html')).toBe('html')
    expect(detectLanguage('data.json')).toBe('json')
    expect(detectLanguage('README.md')).toBe('unknown')
  })

  it('skips binary and unknown files from the index', () => {
    expect(isIndexableSourceFile('logo.png')).toBe(false)
    expect(isIndexableSourceFile('app.wasm')).toBe(false)
    expect(isIndexableSourceFile('notes.md')).toBe(false)
    expect(isIndexableSourceFile('src/main.ts')).toBe(true)
  })

  it('identifies JS-family languages', () => {
    expect(isJsFamily('typescript')).toBe(true)
    expect(isJsFamily('tsx')).toBe(true)
    expect(isJsFamily('python')).toBe(false)
  })
})
