export type SourceLanguage =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'json'
  | 'css'
  | 'html'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'unknown'

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'export'
  | 'import'
  | 'component'
  | 'hook'
  | 'route'
  | 'endpoint'

export type ReferenceKind = 'import' | 'call' | 'type' | 'identifier'

export interface IndexedFileRecord {
  path: string
  relativePath: string
  language: SourceLanguage
  size: number
  mtimeMs: number
  hash: string
  parser: 'tree-sitter' | 'fallback'
}

export interface IndexedSymbol {
  name: string
  kind: SymbolKind
  startLine: number
  endLine: number
  container?: string
}

export interface IndexedImport {
  specifier: string
  resolvedPath?: string
  startLine: number
}

export interface IndexedReference {
  name: string
  kind: ReferenceKind
  startLine: number
}

export interface FileParseResult {
  language: SourceLanguage
  parser: 'tree-sitter' | 'fallback'
  symbols: IndexedSymbol[]
  imports: IndexedImport[]
  references: IndexedReference[]
}

export type IndexerState = 'idle' | 'scanning' | 'indexing' | 'watching' | 'error'

export interface IndexerStatus {
  state: IndexerState
  rootPath: string | null
  total: number
  processed: number
  skipped: number
  files: number
  symbols: number
  error?: string
}

export type CodeSearchMode = 'text' | 'regex' | 'symbol' | 'reference'

export interface CodeSearchHit {
  path: string
  relativePath: string
  language: SourceLanguage
  startLine: number
  endLine?: number
  name?: string
  kind?: string
  snippet: string
  score: number
}

export interface CodeSearchRequest {
  query: string
  mode: CodeSearchMode
  language?: SourceLanguage
  limit?: number
}

export interface IndexProgressEvent {
  status: IndexerStatus
}

export interface LanguageQuery {
  path: string
  /** 1-based line number. */
  line: number
  /** 1-based column number. */
  column: number
  /** Unsaved buffer contents, when the file is dirty in the editor. */
  content?: string
}

export interface LanguageHover {
  title: string
  documentation?: string
  source: 'typescript' | 'index'
}

export interface LanguageLocation {
  path: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
}

export interface LanguageCompletionItem {
  label: string
  kind: string
  detail?: string
  insertText?: string
}

export interface LanguageCompletionResult {
  items: LanguageCompletionItem[]
  /** 1-based column where the current identifier starts. */
  fromColumn: number
}
