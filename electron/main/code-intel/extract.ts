import type { Node } from 'web-tree-sitter'
import type {
  FileParseResult,
  IndexedImport,
  IndexedReference,
  IndexedSymbol,
  SourceLanguage,
  SymbolKind
} from '@shared/types/code-intel'
import { isJsFamily } from '@shared/lib/language-detect'

const MAX_SYMBOLS = 500

function pushSymbol(
  symbols: IndexedSymbol[],
  name: string | undefined,
  kind: SymbolKind,
  node: Node,
  container?: string
): void {
  const trimmed = name?.trim()
  if (!trimmed || symbols.length >= MAX_SYMBOLS) return
  symbols.push({
    name: trimmed,
    kind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    container
  })
}

function ident(node: Node | null | undefined): string | undefined {
  if (!node) return undefined
  if (node.type === 'identifier' || node.type === 'property_identifier' || node.type === 'type_identifier') {
    return node.text
  }
  const named = node.childForFieldName('name') ?? node.namedChild(0)
  return named?.text
}

function walkNamed(node: Node, visit: (n: Node) => void): void {
  visit(node)
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i)
    if (child) walkNamed(child, visit)
  }
}

function extractJsFamily(root: Node, language: SourceLanguage): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  const references: IndexedReference[] = []

  walkNamed(root, (node) => {
    switch (node.type) {
      case 'function_declaration':
      case 'generator_function_declaration': {
        const name = ident(node.childForFieldName('name'))
        const kind: SymbolKind =
          (language === 'tsx' || language === 'jsx') && name && /^[A-Z]/.test(name)
            ? 'component'
            : 'function'
        pushSymbol(symbols, name, kind, node)
        break
      }
      case 'class_declaration':
      case 'class':
        pushSymbol(symbols, ident(node.childForFieldName('name')), 'class', node)
        break
      case 'method_definition':
        pushSymbol(symbols, ident(node.childForFieldName('name')), 'method', node)
        break
      case 'interface_declaration':
        pushSymbol(symbols, ident(node.childForFieldName('name')), 'interface', node)
        break
      case 'type_alias_declaration':
        pushSymbol(symbols, ident(node.childForFieldName('name')), 'type', node)
        break
      case 'enum_declaration':
        pushSymbol(symbols, ident(node.childForFieldName('name')), 'enum', node)
        break
      case 'lexical_declaration':
      case 'variable_declaration': {
        for (let i = 0; i < node.namedChildCount; i++) {
          const declarator = node.namedChild(i)
          if (declarator?.type !== 'variable_declarator') continue
          const name = ident(declarator.childForFieldName('name'))
          const value = declarator.childForFieldName('value')
          const isFn = value?.type === 'arrow_function' || value?.type === 'function' || value?.type === 'function_expression'
          if (isFn && name) {
            const kind: SymbolKind =
              (language === 'tsx' || language === 'jsx') && /^[A-Z]/.test(name) ? 'component' : 'function'
            pushSymbol(symbols, name, kind, declarator)
          } else if (name) {
            pushSymbol(symbols, name, 'variable', declarator)
          }
        }
        break
      }
      case 'import_statement': {
        const src = node.childForFieldName('source')
        const specifier = src?.text.replace(/^['"]|['"]$/g, '')
        if (specifier) {
          imports.push({ specifier, startLine: node.startPosition.row + 1 })
          references.push({ name: specifier, kind: 'import', startLine: node.startPosition.row + 1 })
        }
        break
      }
      case 'export_statement':
        pushSymbol(symbols, ident(node.namedChild(0)) ?? 'export', 'export', node)
        break
      case 'call_expression': {
        const fn = node.childForFieldName('function')
        const fnName = !fn
          ? undefined
          : fn.type === 'identifier'
            ? fn.text
            : fn.namedChild(Math.max(0, fn.namedChildCount - 1))?.text
        if (fnName?.startsWith('use') && fnName.length > 3) {
          pushSymbol(symbols, fnName, 'hook', node)
        }
        if (fnName) references.push({ name: fnName, kind: 'call', startLine: node.startPosition.row + 1 })
        if (fn?.type === 'member_expression') {
          const obj = fn.childForFieldName('object')?.text
          const prop = fn.childForFieldName('property')?.text?.toLowerCase()
          const arg = node.childForFieldName('arguments')?.namedChild(0)?.text
          if (
            obj &&
            /^(app|router|route)$/i.test(obj) &&
            prop &&
            /^(get|post|put|patch|delete|options|head)$/.test(prop) &&
            arg
          ) {
            const path = arg.replace(/^['"`]|['"`]$/g, '')
            pushSymbol(symbols, `${prop.toUpperCase()} ${path}`, 'endpoint', node)
            pushSymbol(symbols, path, 'route', node)
          }
        }
        break
      }
      case 'jsx_attribute': {
        const name = node.namedChild(0)?.text
        const value = node.namedChild(1)?.text ?? ''
        if (name && /^(path|to|href)$/.test(name)) {
          const path = value.replace(/^[={'"`\s]+|[}'"`\s]+$/g, '')
          if (path.startsWith('/')) pushSymbol(symbols, path, 'route', node)
        }
        break
      }
      default:
        break
    }
  })

  return { language, parser: 'tree-sitter', symbols, imports, references }
}

function extractPython(root: Node): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  walkNamed(root, (node) => {
    if (node.type === 'function_definition') {
      pushSymbol(symbols, ident(node.childForFieldName('name')), 'function', node)
    } else if (node.type === 'class_definition') {
      pushSymbol(symbols, ident(node.childForFieldName('name')), 'class', node)
    } else if (node.type === 'import_statement' || node.type === 'import_from_statement') {
      imports.push({ specifier: node.text.replace(/\s+/g, ' ').slice(0, 160), startLine: node.startPosition.row + 1 })
    }
  })
  return { language: 'python', parser: 'tree-sitter', symbols, imports, references: [] }
}

function extractJava(root: Node): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  walkNamed(root, (node) => {
    if (node.type === 'class_declaration') pushSymbol(symbols, ident(node.childForFieldName('name')), 'class', node)
    else if (node.type === 'interface_declaration')
      pushSymbol(symbols, ident(node.childForFieldName('name')), 'interface', node)
    else if (node.type === 'enum_declaration') pushSymbol(symbols, ident(node.childForFieldName('name')), 'enum', node)
    else if (node.type === 'method_declaration')
      pushSymbol(symbols, ident(node.childForFieldName('name')), 'method', node)
    else if (node.type === 'import_declaration') {
      imports.push({ specifier: node.text.replace(/;$/, ''), startLine: node.startPosition.row + 1 })
    }
  })
  return { language: 'java', parser: 'tree-sitter', symbols, imports, references: [] }
}

function extractGo(root: Node): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  walkNamed(root, (node) => {
    if (node.type === 'function_declaration' || node.type === 'method_declaration') {
      pushSymbol(symbols, ident(node.childForFieldName('name')), 'function', node)
    } else if (node.type === 'type_declaration' || node.type === 'type_spec') {
      pushSymbol(symbols, ident(node.childForFieldName('name')), 'type', node)
    } else if (node.type === 'import_spec') {
      imports.push({
        specifier: node.text.replace(/^"|"$/g, ''),
        startLine: node.startPosition.row + 1
      })
    }
  })
  return { language: 'go', parser: 'tree-sitter', symbols, imports, references: [] }
}

function extractRust(root: Node): FileParseResult {
  const symbols: IndexedSymbol[] = []
  const imports: IndexedImport[] = []
  walkNamed(root, (node) => {
    if (node.type === 'function_item') pushSymbol(symbols, ident(node.childForFieldName('name')), 'function', node)
    else if (node.type === 'struct_item') pushSymbol(symbols, ident(node.childForFieldName('name')), 'class', node)
    else if (node.type === 'enum_item') pushSymbol(symbols, ident(node.childForFieldName('name')), 'enum', node)
    else if (node.type === 'trait_item') pushSymbol(symbols, ident(node.childForFieldName('name')), 'interface', node)
    else if (node.type === 'use_declaration') {
      imports.push({ specifier: node.text.replace(/^use\s+|;\s*$/g, ''), startLine: node.startPosition.row + 1 })
    }
  })
  return { language: 'rust', parser: 'tree-sitter', symbols, imports, references: [] }
}

export function extractFromTree(root: Node, language: SourceLanguage): FileParseResult {
  if (isJsFamily(language)) return extractJsFamily(root, language)
  if (language === 'python') return extractPython(root)
  if (language === 'java') return extractJava(root)
  if (language === 'go') return extractGo(root)
  if (language === 'rust') return extractRust(root)
  if (language === 'json' || language === 'css' || language === 'html') {
    const symbols: IndexedSymbol[] = []
    walkNamed(root, (node) => {
      if (language === 'json' && node.type === 'pair') {
        pushSymbol(symbols, node.namedChild(0)?.text.replace(/^"|"$/g, ''), 'variable', node)
      }
      if (language === 'css' && (node.type === 'class_selector' || node.type === 'id_selector')) {
        pushSymbol(symbols, node.text, 'variable', node)
      }
      if (language === 'html' && node.type === 'start_tag') {
        const tag = node.namedChild(0)?.text
        if (tag && (tag.includes('-') || /^[A-Z]/.test(tag))) pushSymbol(symbols, tag, 'component', node)
      }
    })
    return { language, parser: 'tree-sitter', symbols, imports: [], references: [] }
  }
  return { language, parser: 'tree-sitter', symbols: [], imports: [], references: [] }
}
