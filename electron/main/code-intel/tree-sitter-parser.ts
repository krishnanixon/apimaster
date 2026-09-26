import { existsSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { Parser, Language } from 'web-tree-sitter'
import type { SourceLanguage } from '@shared/types/code-intel'
import type { FileParseResult } from '@shared/types/code-intel'
import { extractWithFallback } from '@shared/lib/symbol-extract-fallback'
import { extractFromTree } from './extract'
import { logger } from '../infra/logger.service'

const require = createRequire(__filename)

const GRAMMAR_FILES: Partial<Record<SourceLanguage, string>> = {
  javascript: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  jsx: 'tree-sitter-javascript.wasm',
  json: 'tree-sitter-json.wasm',
  css: 'tree-sitter-css.wasm',
  html: 'tree-sitter-html.wasm',
  python: 'tree-sitter-python.wasm',
  java: 'tree-sitter-java.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm'
}

function packageRoot(pkg: string): string {
  const unpacked = join(process.resourcesPath ?? '', 'app.asar.unpacked', 'node_modules', pkg)
  if (unpacked && existsSync(unpacked)) return unpacked
  try {
    return dirname(require.resolve(`${pkg}/package.json`))
  } catch {
    return join(process.cwd(), 'node_modules', pkg)
  }
}

class TreeSitterEngine {
  private ready: Promise<void> | null = null
  private languages = new Map<string, Language>()
  private parser: Parser | null = null
  private available = false

  private async init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const runtimeDir = packageRoot('web-tree-sitter')
      await Parser.init({
        locateFile: (scriptName: string) => join(runtimeDir, scriptName)
      })
      this.parser = new Parser()
      this.available = true
    })()
    try {
      await this.ready
    } catch (error) {
      this.available = false
      logger.warn(
        `Tree-sitter init failed (${error instanceof Error ? error.message : error}); using fallback extractors`,
        'CodeIntel'
      )
    }
  }

  private async loadLanguage(language: SourceLanguage): Promise<Language | null> {
    const file = GRAMMAR_FILES[language]
    if (!file) return null
    const cached = this.languages.get(file)
    if (cached) return cached
    const wasmPath = join(packageRoot('@cursorless/tree-sitter-wasms'), 'out', file)
    if (!existsSync(wasmPath)) return null
    try {
      const loaded = await Language.load(wasmPath)
      this.languages.set(file, loaded)
      return loaded
    } catch (error) {
      logger.warn(
        `Failed to load grammar ${file}: ${error instanceof Error ? error.message : error}`,
        'CodeIntel'
      )
      return null
    }
  }

  async parse(source: string, language: SourceLanguage): Promise<FileParseResult> {
    await this.init()
    if (!this.available || !this.parser || language === 'unknown') {
      return extractWithFallback(source, language)
    }
    const grammar = await this.loadLanguage(language)
    if (!grammar) return extractWithFallback(source, language)
    try {
      this.parser.setLanguage(grammar)
      const tree = this.parser.parse(source)
      if (!tree) return extractWithFallback(source, language)
      try {
        return extractFromTree(tree.rootNode, language)
      } finally {
        tree.delete()
      }
    } catch {
      return extractWithFallback(source, language)
    }
  }
}

export const treeSitterEngine = new TreeSitterEngine()
