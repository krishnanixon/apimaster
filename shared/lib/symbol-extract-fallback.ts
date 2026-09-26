import type {
  FileParseResult,
  IndexedImport,
  IndexedReference,
  IndexedSymbol,
  SourceLanguage,
  SymbolKind
} from '../types/code-intel'
import { isJsFamily } from './language-detect'

const MAX_SYMBOLS = 400

function pushSymbol(
  symbols: IndexedSymbol[],
  name: string,
  kind: SymbolKind,
  startLine: number,
  endLine = startLine,
  container?: string
): void {
  const trimmed = name.trim()
  if (!trimmed || symbols.length >= MAX_SYMBOLS) return
  symbols.push({ name: trimmed, kind, startLine, endLine, container })
}

function lineOf(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line += 1
  }
  return line
}

function extractJsFamily(source: string, language: SourceLanguage): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  const references: IndexedReference[] = []

  const importRe = /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+from\s+)?['"]([^'"]+)['"]/g
  for (const match of source.matchAll(importRe)) {
    const specifier = match[1]
    if (!specifier) continue
    const startLine = lineOf(source, match.index ?? 0)
    imports.push({ specifier, startLine })
    references.push({ name: specifier, kind: 'import', startLine })
  }

  const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const match of source.matchAll(requireRe)) {
    const specifier = match[1]
    if (!specifier) continue
    imports.push({ specifier, startLine: lineOf(source, match.index ?? 0) })
  }

  const functionRe =
    /(?:export\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/g
  for (const match of source.matchAll(functionRe)) {
    const name = match[1] ?? ''
    const startLine = lineOf(source, match.index ?? 0)
    const kind: SymbolKind =
      language === 'tsx' || language === 'jsx'
        ? /^[A-Z]/.test(name)
          ? 'component'
          : 'function'
        : 'function'
    pushSymbol(symbols, name, kind, startLine)
  }

  const classRe = /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g
  for (const match of source.matchAll(classRe)) {
    pushSymbol(symbols, match[1] ?? '', 'class', lineOf(source, match.index ?? 0))
  }

  const interfaceRe = /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g
  for (const match of source.matchAll(interfaceRe)) {
    pushSymbol(symbols, match[1] ?? '', 'interface', lineOf(source, match.index ?? 0))
  }

  const typeRe = /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g
  for (const match of source.matchAll(typeRe)) {
    pushSymbol(symbols, match[1] ?? '', 'type', lineOf(source, match.index ?? 0))
  }

  const enumRe = /(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g
  for (const match of source.matchAll(enumRe)) {
    pushSymbol(symbols, match[1] ?? '', 'enum', lineOf(source, match.index ?? 0))
  }

  const methodRe = /^\s+(?:async\s+)?(?:static\s+)?([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*[:{]/gm
  for (const match of source.matchAll(methodRe)) {
    const name = match[1] ?? ''
    if (name === 'if' || name === 'for' || name === 'while' || name === 'switch') continue
    pushSymbol(symbols, name, 'method', lineOf(source, match.index ?? 0))
  }

  const constFnRe =
    /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g
  for (const match of source.matchAll(constFnRe)) {
    const name = match[1] ?? ''
    const kind: SymbolKind =
      (language === 'tsx' || language === 'jsx') && /^[A-Z]/.test(name) ? 'component' : 'function'
    pushSymbol(symbols, name, kind, lineOf(source, match.index ?? 0))
  }

  const hookRe = /\b(use[A-Z][A-Za-z0-9]*)\s*\(/g
  for (const match of source.matchAll(hookRe)) {
    pushSymbol(symbols, match[1] ?? '', 'hook', lineOf(source, match.index ?? 0))
  }

  const routeRe =
    /\b(?:app|router|route)\.(get|post|put|patch|delete|options|head)\(\s*['"`]([^'"`]+)['"`]/gi
  for (const match of source.matchAll(routeRe)) {
    const method = (match[1] ?? 'GET').toUpperCase()
    const path = match[2] ?? ''
    pushSymbol(symbols, `${method} ${path}`, 'endpoint', lineOf(source, match.index ?? 0))
    pushSymbol(symbols, path, 'route', lineOf(source, match.index ?? 0))
  }

  const jsxPathRe = /\b(?:path|to|href)\s*=\s*\{?\s*['"`](\/[^'"`]*)['"`]/g
  for (const match of source.matchAll(jsxPathRe)) {
    pushSymbol(symbols, match[1] ?? '', 'route', lineOf(source, match.index ?? 0))
  }

  return { language, parser: 'fallback', symbols, imports, references }
}

function extractPython(source: string): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  const references: IndexedReference[] = []
  for (const match of source.matchAll(/^def\s+([A-Za-z_][\w]*)\s*\(/gm)) {
    pushSymbol(symbols, match[1] ?? '', 'function', lineOf(source, match.index ?? 0))
  }
  for (const match of source.matchAll(/^class\s+([A-Za-z_][\w]*)/gm)) {
    pushSymbol(symbols, match[1] ?? '', 'class', lineOf(source, match.index ?? 0))
  }
  for (const match of source.matchAll(/^(?:from\s+(\S+)\s+)?import\s+([A-Za-z0-9_.,\s*]+)/gm)) {
    const specifier = (match[1] ?? match[2] ?? '').trim()
    imports.push({ specifier, startLine: lineOf(source, match.index ?? 0) })
  }
  return { language: 'python', parser: 'fallback', symbols, imports, references }
}

function extractJava(source: string): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  for (const match of source.matchAll(/\b(?:class|interface|enum)\s+([A-Za-z_][\w]*)/g)) {
    const kind: SymbolKind = match[0]?.includes('interface')
      ? 'interface'
      : match[0]?.includes('enum')
        ? 'enum'
        : 'class'
    pushSymbol(symbols, match[1] ?? '', kind, lineOf(source, match.index ?? 0))
  }
  for (const match of source.matchAll(
    /(?:public|private|protected)\s+(?:static\s+)?[\w.<>,\[\]]+\s+([A-Za-z_][\w]*)\s*\(/g
  )) {
    const name = match[1] ?? ''
    if (name !== 'if') pushSymbol(symbols, name, 'method', lineOf(source, match.index ?? 0))
  }
  for (const match of source.matchAll(/^import\s+([^;]+);/gm)) {
    imports.push({ specifier: (match[1] ?? '').trim(), startLine: lineOf(source, match.index ?? 0) })
  }
  return { language: 'java', parser: 'fallback', symbols, imports, references: [] }
}

function extractGo(source: string): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  for (const match of source.matchAll(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][\w]*)\s*\(/gm)) {
    pushSymbol(symbols, match[1] ?? '', 'function', lineOf(source, match.index ?? 0))
  }
  for (const match of source.matchAll(/^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/gm)) {
    pushSymbol(symbols, match[1] ?? '', 'type', lineOf(source, match.index ?? 0))
  }
  for (const match of source.matchAll(/"([^"]+)"/g)) {
    if (source.slice(Math.max(0, (match.index ?? 0) - 30), match.index).includes('import')) {
      imports.push({ specifier: match[1] ?? '', startLine: lineOf(source, match.index ?? 0) })
    }
  }
  return { language: 'go', parser: 'fallback', symbols, imports, references: [] }
}

function extractRust(source: string): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  for (const match of source.matchAll(/^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)\s*[<(]/gm)) {
    pushSymbol(symbols, match[1] ?? '', 'function', lineOf(source, match.index ?? 0))
  }
  for (const match of source.matchAll(/^(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][\w]*)/gm)) {
    const kind: SymbolKind = match[0]?.includes('enum')
      ? 'enum'
      : match[0]?.includes('trait')
        ? 'interface'
        : 'class'
    pushSymbol(symbols, match[1] ?? '', kind, lineOf(source, match.index ?? 0))
  }
  for (const match of source.matchAll(/^use\s+([^;]+);/gm)) {
    imports.push({ specifier: (match[1] ?? '').trim(), startLine: lineOf(source, match.index ?? 0) })
  }
  return { language: 'rust', parser: 'fallback', symbols, imports, references: [] }
}

/** Regex-based extraction used when Tree-sitter WASM is unavailable, and in unit tests. */
export function extractWithFallback(source: string, language: SourceLanguage): FileParseResult {
  if (isJsFamily(language)) return extractJsFamily(source, language)
  if (language === 'python') return extractPython(source)
  if (language === 'java') return extractJava(source)
  if (language === 'go') return extractGo(source)
  if (language === 'rust') return extractRust(source)
  if (language === 'json') {
    const symbols: IndexedSymbol[] = []
    for (const match of source.matchAll(/^ {0,2}"([^"]+)"\s*:/gm)) {
      pushSymbol(symbols, match[1] ?? '', 'variable', lineOf(source, match.index ?? 0))
    }
    return { language, parser: 'fallback', symbols, imports: [], references: [] }
  }
  if (language === 'css') {
    const symbols: IndexedSymbol[] = []
    for (const match of source.matchAll(/\.([A-Za-z_-][\w-]*)/g)) {
      pushSymbol(symbols, `.${match[1]}`, 'variable', lineOf(source, match.index ?? 0))
    }
    return { language, parser: 'fallback', symbols, imports: [], references: [] }
  }
  if (language === 'html') {
    const symbols: IndexedSymbol[] = []
    for (const match of source.matchAll(/<([A-Za-z][\w-]*)/g)) {
      const tag = match[1] ?? ''
      if (tag.includes('-') || /^[A-Z]/.test(tag)) {
        pushSymbol(symbols, tag, 'component', lineOf(source, match.index ?? 0))
      }
    }
    return { language, parser: 'fallback', symbols, imports: [], references: [] }
  }
  return { language, parser: 'fallback', symbols: [], imports: [], references: [] }
}
