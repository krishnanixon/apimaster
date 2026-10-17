/**
 * Small, dependency-free JSONPath evaluator for the response inspector.
 *
 * Supported syntax:
 *   $                      root
 *   .key  ['key']  ["key"] child member
 *   [0]  [-1]              array index (negative counts from the end)
 *   [*]  .*                wildcard
 *   ..key  ..*  ..[0]      recursive descent
 *   [0,2]  ['a','b']       unions
 *   [1:3]  [::2]  [-2:]    array slices
 *   [?(@.price < 10)]      filters: == != < <= > >= =~ /regex/, && ||, !, existence
 */

export type JsonPathSegment = string | number

export interface JsonPathMatch {
  /** Normalized path, e.g. `$.data[0].id`. */
  path: string
  segments: JsonPathSegment[]
  value: unknown
}

type Selector =
  | { kind: 'child'; names: string[] }
  | { kind: 'index'; indices: number[] }
  | { kind: 'wildcard' }
  | { kind: 'slice'; start?: number; end?: number; step?: number }
  | { kind: 'filter'; expr: FilterExpr }

interface Step {
  descendant: boolean
  selector: Selector
}

type FilterExpr =
  | { kind: 'or'; left: FilterExpr; right: FilterExpr }
  | { kind: 'and'; left: FilterExpr; right: FilterExpr }
  | { kind: 'not'; expr: FilterExpr }
  | { kind: 'cmp'; op: string; left: Operand; right: Operand }
  | { kind: 'exists'; operand: Operand }

type Operand = { kind: 'path'; root: '@' | '$'; steps: Step[] } | { kind: 'literal'; value: unknown }

export class JsonPathError extends Error {}

const IDENT = /[A-Za-z0-9_$-]/

class Parser {
  pos = 0
  constructor(private readonly src: string) {}

  peek(offset = 0): string {
    return this.src[this.pos + offset] ?? ''
  }

  eof(): boolean {
    return this.pos >= this.src.length
  }

  skipWs(): void {
    while (!this.eof() && /\s/.test(this.peek())) this.pos++
  }

  expect(ch: string): void {
    this.skipWs()
    if (this.peek() !== ch) {
      throw new JsonPathError(`Expected "${ch}" at position ${this.pos + 1}`)
    }
    this.pos++
  }

  parsePath(allowRelative: boolean): { root: '@' | '$'; steps: Step[] } {
    this.skipWs()
    let root: '@' | '$' = '$'
    if (this.peek() === '$') {
      this.pos++
    } else if (allowRelative && this.peek() === '@') {
      root = '@'
      this.pos++
    } else if (!allowRelative) {
      // Be lenient: `data.items` and `.data` are treated as `$.data.items`.
      if (this.peek() !== '.' && this.peek() !== '[') return { root, steps: this.parseSteps(true) }
    } else {
      throw new JsonPathError(`Expected "@" or "$" at position ${this.pos + 1}`)
    }
    return { root, steps: this.parseSteps(false) }
  }

  private parseSteps(leadingBareName: boolean): Step[] {
    const steps: Step[] = []
    if (leadingBareName) {
      steps.push({ descendant: false, selector: { kind: 'child', names: [this.readIdent()] } })
    }
    for (;;) {
      if (this.eof()) break
      const ch = this.peek()
      if (ch === '.' && this.peek(1) === '.') {
        this.pos += 2
        if (this.peek() === '[') {
          steps.push({ descendant: true, selector: this.parseBracket() })
        } else if (this.peek() === '*') {
          this.pos++
          steps.push({ descendant: true, selector: { kind: 'wildcard' } })
        } else {
          steps.push({ descendant: true, selector: { kind: 'child', names: [this.readIdent()] } })
        }
      } else if (ch === '.') {
        this.pos++
        if (this.peek() === '*') {
          this.pos++
          steps.push({ descendant: false, selector: { kind: 'wildcard' } })
        } else {
          steps.push({ descendant: false, selector: { kind: 'child', names: [this.readIdent()] } })
        }
      } else if (ch === '[') {
        steps.push({ descendant: false, selector: this.parseBracket() })
      } else {
        break
      }
    }
    return steps
  }

  private readIdent(): string {
    const start = this.pos
    while (!this.eof() && IDENT.test(this.peek())) this.pos++
    if (start === this.pos) throw new JsonPathError(`Expected a property name at position ${this.pos + 1}`)
    return this.src.slice(start, this.pos)
  }

  private readString(): string {
    const quote = this.peek()
    this.pos++
    let out = ''
    while (!this.eof() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.pos++
        const esc = this.peek()
        out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc
      } else {
        out += this.peek()
      }
      this.pos++
    }
    if (this.eof()) throw new JsonPathError('Unterminated string')
    this.pos++
    return out
  }

  private readNumber(): number {
    const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.src.slice(this.pos))
    if (!match) throw new JsonPathError(`Expected a number at position ${this.pos + 1}`)
    this.pos += match[0].length
    return Number(match[0])
  }

  private parseBracket(): Selector {
    this.expect('[')
    this.skipWs()
    let selector: Selector
    const ch = this.peek()
    if (ch === '*') {
      this.pos++
      selector = { kind: 'wildcard' }
    } else if (ch === '?') {
      this.pos++
      this.skipWs()
      const paren = this.peek() === '('
      if (paren) this.pos++
      const expr = this.parseOr()
      if (paren) this.expect(')')
      selector = { kind: 'filter', expr }
    } else if (ch === "'" || ch === '"') {
      const names = [this.readString()]
      this.skipWs()
      while (this.peek() === ',') {
        this.pos++
        this.skipWs()
        if (this.peek() !== "'" && this.peek() !== '"') throw new JsonPathError('Expected a quoted name in union')
        names.push(this.readString())
        this.skipWs()
      }
      selector = { kind: 'child', names }
    } else {
      selector = this.parseIndexOrSlice()
    }
    this.expect(']')
    return selector
  }

  private parseIndexOrSlice(): Selector {
    const parts: (number | undefined)[] = []
    let current: number | undefined
    let sawColon = false
    const indices: number[] = []
    for (;;) {
      this.skipWs()
      const ch = this.peek()
      if (ch === ':') {
        sawColon = true
        parts.push(current)
        current = undefined
        this.pos++
      } else if (ch === ',') {
        if (sawColon || current === undefined) throw new JsonPathError('Invalid index union')
        indices.push(current)
        current = undefined
        this.pos++
      } else if (ch === ']') {
        break
      } else if (ch === '-' || /\d/.test(ch)) {
        current = this.readNumber()
        if (!Number.isInteger(current)) throw new JsonPathError('Array indices must be integers')
      } else {
        throw new JsonPathError(`Unexpected "${ch || 'end of input'}" at position ${this.pos + 1}`)
      }
    }
    if (sawColon) {
      parts.push(current)
      if (parts.length > 3) throw new JsonPathError('Invalid slice')
      return { kind: 'slice', start: parts[0], end: parts[1], step: parts[2] }
    }
    if (current === undefined) throw new JsonPathError('Empty brackets')
    indices.push(current)
    return { kind: 'index', indices }
  }

  // ── Filter expressions ────────────────────────────────────────────────

  private parseOr(): FilterExpr {
    let left = this.parseAnd()
    for (;;) {
      this.skipWs()
      if (this.peek() === '|' && this.peek(1) === '|') {
        this.pos += 2
        left = { kind: 'or', left, right: this.parseAnd() }
      } else return left
    }
  }

  private parseAnd(): FilterExpr {
    let left = this.parseUnary()
    for (;;) {
      this.skipWs()
      if (this.peek() === '&' && this.peek(1) === '&') {
        this.pos += 2
        left = { kind: 'and', left, right: this.parseUnary() }
      } else return left
    }
  }

  private parseUnary(): FilterExpr {
    this.skipWs()
    if (this.peek() === '!' && this.peek(1) !== '=') {
      this.pos++
      return { kind: 'not', expr: this.parseUnary() }
    }
    if (this.peek() === '(') {
      this.pos++
      const inner = this.parseOr()
      this.expect(')')
      return inner
    }
    const left = this.parseOperand()
    this.skipWs()
    const op = /^(==|!=|<=|>=|=~|<|>)/.exec(this.src.slice(this.pos))?.[0]
    if (!op) {
      if (left.kind !== 'path') throw new JsonPathError('A filter needs a comparison or a path')
      return { kind: 'exists', operand: left }
    }
    this.pos += op.length
    return { kind: 'cmp', op, left, right: this.parseOperand() }
  }

  private parseOperand(): Operand {
    this.skipWs()
    const ch = this.peek()
    if (ch === '@' || ch === '$') {
      const { root, steps } = this.parsePath(true)
      return { kind: 'path', root, steps }
    }
    if (ch === "'" || ch === '"') return { kind: 'literal', value: this.readString() }
    if (ch === '/') {
      this.pos++
      let pattern = ''
      while (!this.eof() && this.peek() !== '/') {
        if (this.peek() === '\\') {
          pattern += this.peek()
          this.pos++
        }
        pattern += this.peek()
        this.pos++
      }
      if (this.eof()) throw new JsonPathError('Unterminated regular expression')
      this.pos++
      let flags = ''
      while (/[a-z]/.test(this.peek())) flags += this.src[this.pos++]
      try {
        return { kind: 'literal', value: new RegExp(pattern, flags) }
      } catch (e) {
        throw new JsonPathError(e instanceof Error ? e.message : 'Invalid regular expression')
      }
    }
    if (ch === '-' || /\d/.test(ch)) return { kind: 'literal', value: this.readNumber() }
    for (const [word, value] of [
      ['true', true],
      ['false', false],
      ['null', null]
    ] as const) {
      if (this.src.startsWith(word, this.pos)) {
        this.pos += word.length
        return { kind: 'literal', value }
      }
    }
    throw new JsonPathError(`Unexpected "${ch || 'end of input'}" in filter at position ${this.pos + 1}`)
  }
}

interface Node {
  segments: JsonPathSegment[]
  value: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function children(node: Node): Node[] {
  if (Array.isArray(node.value)) {
    return node.value.map((v, i) => ({ segments: [...node.segments, i], value: v }))
  }
  if (isObject(node.value)) {
    return Object.entries(node.value).map(([k, v]) => ({ segments: [...node.segments, k], value: v }))
  }
  return []
}

function descendantsAndSelf(node: Node): Node[] {
  const out: Node[] = [node]
  for (const child of children(node)) out.push(...descendantsAndSelf(child))
  return out
}

function normalizeIndex(index: number, length: number): number {
  return index < 0 ? length + index : index
}

function applySelector(node: Node, selector: Selector, root: unknown): Node[] {
  const value = node.value
  switch (selector.kind) {
    case 'child':
      if (!isObject(value)) return []
      return selector.names
        .filter((name) => Object.prototype.hasOwnProperty.call(value, name))
        .map((name) => ({ segments: [...node.segments, name], value: value[name] }))
    case 'index':
      if (!Array.isArray(value)) return []
      return selector.indices
        .map((raw) => normalizeIndex(raw, value.length))
        .filter((i) => i >= 0 && i < value.length)
        .map((i) => ({ segments: [...node.segments, i], value: value[i] }))
    case 'wildcard':
      return children(node)
    case 'slice': {
      if (!Array.isArray(value)) return []
      const len = value.length
      const step = selector.step ?? 1
      if (step === 0) return []
      const out: Node[] = []
      if (step > 0) {
        const start = Math.max(0, Math.min(len, normalizeIndex(selector.start ?? 0, len)))
        const end = Math.max(0, Math.min(len, normalizeIndex(selector.end ?? len, len)))
        for (let i = start; i < end; i += step) out.push({ segments: [...node.segments, i], value: value[i] })
      } else {
        const start = Math.max(-1, Math.min(len - 1, normalizeIndex(selector.start ?? len - 1, len)))
        const end = selector.end === undefined ? -1 : Math.max(-1, normalizeIndex(selector.end, len))
        for (let i = start; i > end; i += step) out.push({ segments: [...node.segments, i], value: value[i] })
      }
      return out
    }
    case 'filter':
      return children(node).filter((child) => evalFilter(selector.expr, child.value, root))
  }
}

function runSteps(start: Node, steps: Step[], root: unknown): Node[] {
  let current: Node[] = [start]
  for (const step of steps) {
    const next: Node[] = []
    for (const node of current) {
      const targets = step.descendant ? descendantsAndSelf(node) : [node]
      for (const target of targets) next.push(...applySelector(target, step.selector, root))
    }
    current = next
  }
  return current
}

const MISSING = Symbol('missing')

function resolveOperand(operand: Operand, current: unknown, root: unknown): unknown {
  if (operand.kind === 'literal') return operand.value
  const base = operand.root === '@' ? current : root
  const hits = runSteps({ segments: [], value: base }, operand.steps, root)
  return hits.length > 0 ? hits[0].value : MISSING
}

function compare(op: string, left: unknown, right: unknown): boolean {
  if (left === MISSING || right === MISSING) return op === '!=' && left !== right
  switch (op) {
    case '==':
      return deepEqual(left, right)
    case '!=':
      return !deepEqual(left, right)
    case '=~':
      return right instanceof RegExp && typeof left === 'string' && right.test(left)
    default: {
      const bothNumbers = typeof left === 'number' && typeof right === 'number'
      const bothStrings = typeof left === 'string' && typeof right === 'string'
      if (!bothNumbers && !bothStrings) return false
      const a = left as number | string
      const b = right as number | string
      if (op === '<') return a < b
      if (op === '<=') return a <= b
      if (op === '>') return a > b
      return a >= b
    }
  }
}

function evalFilter(expr: FilterExpr, current: unknown, root: unknown): boolean {
  switch (expr.kind) {
    case 'or':
      return evalFilter(expr.left, current, root) || evalFilter(expr.right, current, root)
    case 'and':
      return evalFilter(expr.left, current, root) && evalFilter(expr.right, current, root)
    case 'not':
      return !evalFilter(expr.expr, current, root)
    case 'exists': {
      const v = resolveOperand(expr.operand, current, root)
      return v !== MISSING && v !== false && v !== null
    }
    case 'cmp':
      return compare(expr.op, resolveOperand(expr.left, current, root), resolveOperand(expr.right, current, root))
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bArr = b as unknown[]
    return a.length === bArr.length && a.every((v, i) => deepEqual(v, bArr[i]))
  }
  const aKeys = Object.keys(a as object)
  const bObj = b as Record<string, unknown>
  if (aKeys.length !== Object.keys(bObj).length) return false
  return aKeys.every(
    (k) => Object.prototype.hasOwnProperty.call(bObj, k) && deepEqual((a as Record<string, unknown>)[k], bObj[k])
  )
}

/** Format path segments as a normalized JSONPath string (`$.a[0]['b c']`). */
export function formatJsonPath(segments: readonly JsonPathSegment[]): string {
  let out = '$'
  for (const seg of segments) {
    if (typeof seg === 'number') out += `[${seg}]`
    else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(seg)) out += `.${seg}`
    else out += `['${seg.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`
  }
  return out
}

/** Parse a JSONPath expression. Throws `JsonPathError` with a readable message on bad syntax. */
function compile(expression: string): { root: '@' | '$'; steps: Step[] } {
  const trimmed = expression.trim()
  if (!trimmed) throw new JsonPathError('Enter a JSONPath expression, e.g. $.data[*].id')
  const parser = new Parser(trimmed)
  const parsed = parser.parsePath(false)
  parser.skipWs()
  if (!parser.eof()) {
    throw new JsonPathError(`Unexpected "${parser.peek()}" at position ${parser.pos + 1}`)
  }
  return parsed
}

/** Evaluate a JSONPath expression against parsed JSON. */
export function queryJsonPath(data: unknown, expression: string): JsonPathMatch[] {
  const { steps } = compile(expression)
  return runSteps({ segments: [], value: data }, steps, data).map((node) => ({
    path: formatJsonPath(node.segments),
    segments: node.segments,
    value: node.value
  }))
}

export type JsonPathResult = { ok: true; matches: JsonPathMatch[] } | { ok: false; error: string }

/** Non-throwing wrapper suitable for live-as-you-type UIs. */
export function tryQueryJsonPath(data: unknown, expression: string): JsonPathResult {
  try {
    return { ok: true, matches: queryJsonPath(data, expression) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSONPath' }
  }
}
