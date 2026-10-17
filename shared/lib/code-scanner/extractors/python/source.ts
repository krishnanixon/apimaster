/**
 * A small, dependency-free reader for the parts of Python the route extractors need:
 * logical lines (joined across brackets/continuations, comments stripped), decorators,
 * `def`s, `class`es, module-level assignments and imports. It is not a full parser; it
 * relies on standard formatting (indentation, balanced brackets), which real projects have.
 */

export interface LogicalLine {
  text: string
  /** 1-based line where the statement starts. */
  line: number
  indent: number
}

export interface PyDecorator {
  /** Everything after `@`, e.g. `router.get("/items", response_model=Item)`. */
  text: string
  line: number
}

export interface PyDef {
  name: string
  line: number
  indent: number
  /** Raw text between the parentheses of the signature. */
  params: string
  decorators: PyDecorator[]
  /** Statements in the function body. */
  body: LogicalLine[]
  /** Enclosing class, for methods. */
  className?: string
}

export interface PyClass {
  name: string
  line: number
  indent: number
  bases: string[]
  decorators: PyDecorator[]
  body: LogicalLine[]
  /** Enclosing class, for nested classes such as DRF `Meta`. */
  parent?: string
}

export interface PyAssignment {
  name: string
  value: string
  line: number
  indent: number
  /** `+=` rather than `=`. */
  augmented: boolean
}

export interface PyImport {
  /** Dotted module path without leading dots. */
  module: string
  /** Number of leading dots (relative import level). */
  level: number
  /** `from m import a as b` → [{ name: 'a', alias: 'b' }]; null for `import m [as x]`. */
  names: Array<{ name: string; alias: string }> | null
  /** Local name for `import a.b as x` (or `a` for `import a.b`). */
  alias?: string
}

export interface PyModule {
  lines: LogicalLine[]
  defs: PyDef[]
  classes: PyClass[]
  assignments: PyAssignment[]
  imports: PyImport[]
}

const OPENERS = new Set(['(', '[', '{'])
const CLOSERS = new Set([')', ']', '}'])

/** Joins physical lines into statements; comments dropped, strings kept verbatim. */
export function logicalLines(source: string): LogicalLine[] {
  const out: LogicalLine[] = []
  let current = ''
  let startLine = 1
  let indent = 0
  let depth = 0
  let quote: string | null = null
  let line = 1
  let atLineStart = true
  let continuation = false

  const flush = () => {
    const text = current.trim()
    if (text) out.push({ text, line: startLine, indent })
    current = ''
  }

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (atLineStart && !quote && depth === 0 && !continuation) {
      // Measure indentation of a new statement.
      let j = i
      let width = 0
      while (source[j] === ' ' || source[j] === '\t') {
        width += source[j] === '\t' ? 4 : 1
        j++
      }
      if (source[j] === '\n' || source[j] === '\r' || source[j] === '#' || j >= source.length) {
        // Blank or comment-only line.
        while (j < source.length && source[j] !== '\n') j++
        i = j
        line++
        continue
      }
      indent = width
      startLine = line
      i = j - 1
      atLineStart = false
      continue
    }
    atLineStart = false

    if (quote) {
      current += ch
      if (ch === '\\') {
        current += source[i + 1] ?? ''
        if (source[i + 1] === '\n') line++
        i++
      } else if (source.startsWith(quote, i)) {
        current += quote.slice(1)
        i += quote.length - 1
        quote = null
      } else if (ch === '\n') {
        line++
      }
      continue
    }

    if (ch === '#') {
      while (i + 1 < source.length && source[i + 1] !== '\n') i++
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = source.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch
      current += quote
      i += quote.length - 1
      continue
    }
    if (ch === '\\' && source[i + 1] === '\n') {
      continuation = true
      current += ' '
      line++
      i++
      atLineStart = true
      continue
    }
    if (OPENERS.has(ch)) depth++
    if (CLOSERS.has(ch)) depth = Math.max(0, depth - 1)
    if (ch === '\n') {
      line++
      if (depth > 0) {
        current += ' '
        continue
      }
      continuation = false
      flush()
      atLineStart = true
      continue
    }
    if (ch === '\r') continue
    // `a; b` → two statements on one line.
    if (ch === ';' && depth === 0) {
      flush()
      startLine = line
      continue
    }
    current += ch
  }
  flush()
  return out
}

/** Splits on `sep` at bracket depth 0, outside strings. */
export function splitTopLevel(text: string, sep = ','): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (text.startsWith(quote, i)) {
        i += quote.length - 1
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = text.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch
      i += quote.length - 1
    } else if (OPENERS.has(ch)) depth++
    else if (CLOSERS.has(ch)) depth--
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(start, i).trim())
      start = i + sep.length
      i += sep.length - 1
    }
  }
  const last = text.slice(start).trim()
  if (last) parts.push(last)
  return parts
}

/** Index of the bracket closing the one at `open`, or -1. */
export function matchingBracket(text: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (text.startsWith(quote, i)) {
        i += quote.length - 1
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = text.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch
      i += quote.length - 1
    } else if (OPENERS.has(ch)) depth++
    else if (CLOSERS.has(ch)) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export interface PyCall {
  /** Dotted callee, e.g. `router.get`, `APIRouter`, `path`. */
  callee: string
  positional: string[]
  keywords: Map<string, string>
  /** Text after the closing parenthesis (e.g. `.as_view()` chains). */
  rest: string
}

/** Parses `callee(args…)` at the start of `text`. */
export function parseCall(text: string): PyCall | null {
  const match = text.match(/^\s*([A-Za-z_][\w.]*)\s*\(/)
  if (!match) return null
  const open = text.indexOf('(', match[0].length - 1)
  const close = matchingBracket(text, open)
  if (close === -1) return null
  const positional: string[] = []
  const keywords = new Map<string, string>()
  for (const arg of splitTopLevel(text.slice(open + 1, close))) {
    const kw = arg.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]*)$/)
    if (kw) keywords.set(kw[1], kw[2].trim())
    else positional.push(arg)
  }
  return { callee: match[1], positional, keywords, rest: text.slice(close + 1).trim() }
}

/**
 * String value of a Python string expression: `'x'`, `"x"`, `r'x'`, `f'x'` (without `{}`),
 * implicit concatenation `'a' 'b'`, `+`, and module constants.
 */
export function pyString(expr: string | undefined, consts?: Map<string, string>, depth = 0): string | null {
  if (expr === undefined) return null
  const text = expr.trim()
  if (!text || depth > 6) return null
  const plus = splitTopLevel(text, '+')
  if (plus.length > 1) {
    const values = plus.map((p) => pyString(p, consts, depth + 1))
    return values.every((v): v is string => v !== null) ? values.join('') : null
  }
  if (/^[A-Za-z_][\w.]*$/.test(text)) {
    const value = consts?.get(text)
    return value !== undefined ? pyString(value, consts, depth + 1) : null
  }
  let out = ''
  let rest = text
  while (rest) {
    const m = rest.match(/^([rRuUbBfF]{0,2})("""|'''|"|')/)
    if (!m) return null
    const prefix = m[1].toLowerCase()
    const quote = m[2]
    const start = m[0].length
    let end = start
    while (end < rest.length && !rest.startsWith(quote, end)) end += rest[end] === '\\' && !prefix.includes('r') ? 2 : 1
    if (end >= rest.length) return null
    const body = rest.slice(start, end)
    if (prefix.includes('f') && /\{[^{]/.test(body)) return null
    out += prefix.includes('r') ? body : body.replace(/\\(.)/g, '$1')
    rest = rest.slice(end + quote.length).trim()
  }
  return out
}

/** `['GET', 'POST']` / `('GET',)` / `{'GET'}` / `'GET'` → strings; null when not all literal. */
export function pyStringList(expr: string | undefined, consts?: Map<string, string>): string[] | null {
  if (expr === undefined) return null
  const text = expr.trim()
  if (/^[[({]/.test(text) && matchingBracket(text, 0) === text.length - 1) {
    const values = splitTopLevel(text.slice(1, -1)).map((p) => pyString(p, consts))
    return values.every((v): v is string => v !== null) ? values : null
  }
  const single = pyString(text, consts)
  return single === null ? null : [single]
}

const DEF_RE = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/
const CLASS_RE = /^class\s+([A-Za-z_]\w*)\s*(?:\(([\s\S]*)\))?\s*:/
const ASSIGN_RE = /^([A-Za-z_][\w.]*)\s*(?::\s*[^=]+?)?\s*(\+?=)(?!=)\s*([\s\S]+)$/

function blockAfter(lines: LogicalLine[], index: number): LogicalLine[] {
  const own = lines[index]
  const body: LogicalLine[] = []
  // A one-line body: `def f(): return 1`
  for (let i = index + 1; i < lines.length && lines[i].indent > own.indent; i++) body.push(lines[i])
  return body
}

function parseImport(text: string): PyImport[] {
  const from = text.match(/^from\s+(\.*)([\w.]*)\s+import\s+(.+)$/)
  if (from) {
    const list = from[3].replace(/^\(|\)$/g, '')
    const names = splitTopLevel(list).flatMap((part) => {
      const m = part.match(/^([\w*]+)(?:\s+as\s+(\w+))?$/)
      return m ? [{ name: m[1], alias: m[2] ?? m[1] }] : []
    })
    return [{ module: from[2], level: from[1].length, names }]
  }
  const plain = text.match(/^import\s+(.+)$/)
  if (!plain) return []
  return splitTopLevel(plain[1]).flatMap((part) => {
    const m = part.match(/^([\w.]+)(?:\s+as\s+(\w+))?$/)
    return m ? [{ module: m[1], level: 0, names: null, alias: m[2] ?? m[1].split('.')[0] }] : []
  })
}

export function scanPython(source: string): PyModule {
  const lines = logicalLines(source)
  const defs: PyDef[] = []
  const classes: PyClass[] = []
  const assignments: PyAssignment[] = []
  const imports: PyImport[] = []
  const classStack: PyClass[] = []
  let pending: PyDecorator[] = []

  for (let i = 0; i < lines.length; i++) {
    const { text, line, indent } = lines[i]
    while (classStack.length && indent <= classStack[classStack.length - 1].indent) classStack.pop()
    const enclosing = classStack[classStack.length - 1]

    if (text.startsWith('@')) {
      pending.push({ text: text.slice(1).trim(), line })
      continue
    }
    const def = text.match(DEF_RE)
    if (def) {
      const open = text.indexOf('(', def[0].length - 1)
      const close = matchingBracket(text, open)
      defs.push({
        name: def[1],
        line: pending[0]?.line ?? line,
        indent,
        params: close === -1 ? '' : text.slice(open + 1, close),
        decorators: pending,
        body: blockAfter(lines, i),
        className: enclosing && indent > enclosing.indent ? enclosing.name : undefined
      })
      pending = []
      continue
    }
    const cls = text.match(CLASS_RE)
    if (cls) {
      const klass: PyClass = {
        name: cls[1],
        line,
        indent,
        bases: cls[2] ? splitTopLevel(cls[2]).filter((b) => !b.includes('=')) : [],
        decorators: pending,
        body: blockAfter(lines, i),
        parent: enclosing?.name
      }
      classes.push(klass)
      classStack.push(klass)
      pending = []
      continue
    }
    pending = []
    if (/^(from|import)\s/.test(text)) {
      imports.push(...parseImport(text))
      continue
    }
    const assign = text.match(ASSIGN_RE)
    if (assign) assignments.push({ name: assign[1], value: assign[3].trim(), line, indent, augmented: assign[2] === '+=' })
  }
  return { lines, defs, classes, assignments, imports }
}

/** Module-level string constants (`API_PREFIX = "/api/v1"`). */
export function stringConstants(module: PyModule): Map<string, string> {
  const consts = new Map<string, string>()
  for (const a of module.assignments) {
    if (a.indent === 0 && !a.augmented && !consts.has(a.name)) consts.set(a.name, a.value)
  }
  return consts
}

/** Resolves Python imports to project files. */
export class PythonModuleIndex {
  private readonly files: Set<string>
  private readonly byModuleSuffix = new Map<string, string[]>()

  constructor(paths: Iterable<string>) {
    this.files = new Set([...paths].filter((p) => p.endsWith('.py')))
    for (const file of this.files) {
      const dotted = file.replace(/\/__init__\.py$/, '').replace(/\.py$/, '').split('/')
      // Index every suffix so `app.routers.users` matches `backend/app/routers/users.py`.
      for (let i = 0; i < dotted.length; i++) {
        const key = dotted.slice(i).join('.')
        const list = this.byModuleSuffix.get(key) ?? []
        list.push(file)
        this.byModuleSuffix.set(key, list)
      }
    }
  }

  /** Submodule `name` of a module file: `pkg/__init__.py` + `views` → `pkg/views.py`. */
  childModule(file: string, name: string): string | null {
    const base = file.endsWith('/__init__.py') ? file.slice(0, -'/__init__.py'.length) : file.replace(/\.py$/, '')
    for (const candidate of [`${base}/${name}.py`, `${base}/${name}/__init__.py`]) {
      if (this.files.has(candidate)) return candidate
    }
    return null
  }

  /** File for a module, preferring the candidate closest to the importing file. */
  resolveModule(fromFile: string, module: string, level = 0): string | null {
    if (level > 0) {
      const parts = fromFile.split('/').slice(0, -1)
      for (let i = 1; i < level; i++) parts.pop()
      const base = [...parts, ...module.split('.').filter(Boolean)].join('/')
      for (const candidate of [`${base}.py`, `${base}/__init__.py`]) {
        if (this.files.has(candidate)) return candidate
      }
      return null
    }
    const candidates = this.byModuleSuffix.get(module)
    if (!candidates?.length) return null
    const score = (file: string) => {
      let i = 0
      while (i < file.length && file[i] === fromFile[i]) i++
      return i
    }
    return [...candidates].sort((a, b) => score(b) - score(a) || a.length - b.length)[0]
  }
}

/** What a local name refers to after imports: a module file, or a symbol inside one. */
export type PyBinding = { kind: 'module'; file: string } | { kind: 'symbol'; file: string; name: string }

export function importBindings(file: string, module: PyModule, index: PythonModuleIndex): Map<string, PyBinding> {
  const bindings = new Map<string, PyBinding>()
  for (const imp of module.imports) {
    if (imp.names === null) {
      const target = index.resolveModule(file, imp.module, imp.level)
      if (target && imp.alias) bindings.set(imp.alias, { kind: 'module', file: target })
      continue
    }
    for (const { name, alias } of imp.names) {
      if (name === '*') continue
      // `from pkg import users` may name a submodule or a symbol defined in pkg/__init__.py.
      const submodule = index.resolveModule(file, imp.module ? `${imp.module}.${name}` : name, imp.level)
      if (submodule) {
        bindings.set(alias, { kind: 'module', file: submodule })
        continue
      }
      const target = index.resolveModule(file, imp.module, imp.level)
      if (target) bindings.set(alias, { kind: 'symbol', file: target, name })
    }
  }
  return bindings
}

/** Converts Flask/Django `<int:id>` params to `:id`. */
export function angleParamsToColon(path: string): string {
  return path.replace(/<(?:[^:>]+:)?([A-Za-z_]\w*)>/g, ':$1')
}
