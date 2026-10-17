import { describe, expect, it } from 'vitest'
import { formatJsonPath, queryJsonPath, tryQueryJsonPath } from '@shared/lib/json-path'
import {
  compareRequests,
  compareResponses,
  diffJson,
  diffLines,
  diffRecords,
  formatSignedDelta
} from '@shared/lib/response-diff'
import {
  classifyResponse,
  countMatches,
  extensionForContentType,
  hexDump
} from '@shared/lib/response-content'
import type { ApiExecutionResult, ApiRequest } from '@shared/types/api-studio'

const store = {
  store: {
    book: [
      { category: 'reference', author: 'Rees', title: 'Sayings', price: 8.95 },
      { category: 'fiction', author: 'Waugh', title: 'Sword', price: 12.99 },
      { category: 'fiction', author: 'Melville', title: 'Moby', isbn: '0-553', price: 8.99 },
      { category: 'fiction', author: 'Tolkien', title: 'LOTR', isbn: '0-395', price: 22.99 }
    ],
    bicycle: { color: 'red', price: 19.95 },
    'odd key': 1
  }
}

const values = (expr: string, data: unknown = store) => queryJsonPath(data, expr).map((m) => m.value)

describe('JSONPath', () => {
  it('selects children, indices, and negative indices', () => {
    expect(values('$.store.bicycle.color')).toEqual(['red'])
    expect(values("$['store']['bicycle']['price']")).toEqual([19.95])
    expect(values('$.store.book[0].author')).toEqual(['Rees'])
    expect(values('$.store.book[-1].title')).toEqual(['LOTR'])
    expect(values("$.store['odd key']")).toEqual([1])
  })

  it('supports wildcards, unions, and slices', () => {
    expect(values('$.store.book[*].author')).toEqual(['Rees', 'Waugh', 'Melville', 'Tolkien'])
    expect(values('$.store.book[0,2].title')).toEqual(['Sayings', 'Moby'])
    expect(values('$.store.book[1:3].title')).toEqual(['Sword', 'Moby'])
    expect(values('$.store.book[::2].title')).toEqual(['Sayings', 'Moby'])
    expect(values('$.store.book[-2:].title')).toEqual(['Moby', 'LOTR'])
    expect(values("$.store.bicycle['color','price']")).toEqual(['red', 19.95])
    expect(values('$.store.*').length).toBe(3)
  })

  it('supports recursive descent', () => {
    expect(values('$..author')).toEqual(['Rees', 'Waugh', 'Melville', 'Tolkien'])
    expect(values('$..price').length).toBe(5)
    expect(values('$..book[2].title')).toEqual(['Moby'])
  })

  it('supports filters', () => {
    expect(values('$.store.book[?(@.price < 10)].title')).toEqual(['Sayings', 'Moby'])
    expect(values('$..book[?(@.isbn)].title')).toEqual(['Moby', 'LOTR'])
    expect(values("$..book[?(@.category == 'fiction' && @.price > 20)].title")).toEqual(['LOTR'])
    expect(values("$..book[?(@.author =~ /^m/i)].title")).toEqual(['Moby'])
    expect(values('$..book[?(!@.isbn)].title')).toEqual(['Sayings', 'Sword'])
    expect(values('$..book[?(@.price > $.store.bicycle.price)].title')).toEqual(['LOTR'])
  })

  it('is lenient about a missing $ prefix', () => {
    expect(values('store.bicycle.color')).toEqual(['red'])
    expect(values('.store.bicycle.color')).toEqual(['red'])
  })

  it('returns normalized paths for matches', () => {
    const [first] = queryJsonPath(store, '$..book[?(@.isbn)]')
    expect(first.path).toBe('$.store.book[2]')
    expect(formatJsonPath(['a', 0, 'b c', "it's"])).toBe("$.a[0]['b c']['it\\'s']")
    // A formatted path round-trips through the evaluator.
    const odd = queryJsonPath(store, formatJsonPath(['store', 'odd key']))
    expect(odd[0].value).toBe(1)
  })

  it('reports readable errors instead of throwing in try mode', () => {
    const bad = tryQueryJsonPath(store, '$.store.book[')
    expect(bad.ok).toBe(false)
    expect(tryQueryJsonPath(store, '').ok).toBe(false)
    expect(tryQueryJsonPath(store, '$.missing').ok).toBe(true)
  })
})

function exec(partial: Partial<ApiExecutionResult>): ApiExecutionResult {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: '',
    isBinary: false,
    contentType: 'application/json',
    timeMs: 100,
    sizeBytes: 10,
    ...partial
  }
}

function req(partial: Partial<ApiRequest>): ApiRequest {
  return {
    id: 'r',
    name: 'r',
    method: 'GET',
    url: 'https://api.test/users',
    headers: [],
    queryParams: [],
    body: { type: 'none', content: '' },
    auth: { type: 'none' },
    updatedAt: '',
    ...partial
  }
}

describe('response diff', () => {
  it('diffs JSON structurally', () => {
    const changes = diffJson(
      { id: 1, name: 'a', tags: ['x', 'y'], meta: { v: 1 } },
      { id: 1, name: 'b', tags: ['x'], meta: { v: 1, w: 2 } }
    )
    expect(changes).toEqual([
      { path: '$.name', kind: 'changed', before: 'a', after: 'b' },
      { path: '$.tags[1]', kind: 'removed', before: 'y' },
      { path: '$.meta.w', kind: 'added', after: 2 }
    ])
    expect(diffJson({ a: [1, 2] }, { a: [1, 2] })).toEqual([])
    expect(diffJson({ a: 1 }, [1])).toEqual([{ path: '$', kind: 'changed', before: { a: 1 }, after: [1] }])
  })

  it('diffs lines with LCS', () => {
    const { lines } = diffLines('a\nb\nc\nd', 'a\nc\nd\ne')
    expect(lines.map((l) => `${l.type[0]}${l.text}`)).toEqual(['ea', 'rb', 'ec', 'ed', 'ae'])
    expect(diffLines('same', 'same').lines).toEqual([{ type: 'equal', text: 'same', leftLine: 1, rightLine: 1 }])
  })

  it('diffs headers case-insensitively and can ignore volatile ones', () => {
    const changes = diffRecords(
      { 'Content-Type': 'a', Date: 'x', 'X-Old': '1' },
      { 'content-type': 'b', date: 'y', 'X-New': '2' },
      { caseInsensitive: true, ignore: new Set(['date']) }
    )
    expect(changes).toEqual([
      { key: 'content-type', kind: 'changed', before: 'a', after: 'b' },
      { key: 'x-new', kind: 'added', after: '2' },
      { key: 'x-old', kind: 'removed', before: '1' }
    ])
  })

  it('compares status, timing, size, headers, and body', () => {
    const cmp = compareResponses(
      exec({ status: 200, timeMs: 120, sizeBytes: 50, headers: { etag: '1' }, data: '{"a":1,"b":2}' }),
      exec({ status: 404, statusText: 'Not Found', timeMs: 80, sizeBytes: 70, headers: { etag: '2' }, data: '{"a":1,"b":3}' }),
      { ignoreVolatileHeaders: true }
    )
    expect(cmp.status.changed).toBe(true)
    expect(cmp.timeMs.delta).toBe(-40)
    expect(cmp.sizeBytes.delta).toBe(20)
    expect(cmp.headers).toEqual([])
    expect(cmp.body.mode).toBe('json')
    expect(cmp.body.jsonChanges).toEqual([{ path: '$.b', kind: 'changed', before: 2, after: 3 }])
    expect(cmp.body.lines?.some((l) => l.type === 'added' && l.text.includes('3'))).toBe(true)
  })

  it('treats reformatted JSON as identical and falls back to text for non-JSON', () => {
    expect(compareResponses(exec({ data: '{"a":1}' }), exec({ data: '{\n  "a": 1\n}' })).body.mode).toBe('identical')
    const text = compareResponses(exec({ data: 'hello\nworld', contentType: 'text/plain' }), exec({ data: 'hello\nthere', contentType: 'text/plain' }))
    expect(text.body.mode).toBe('text')
  })

  it('compares binary bodies by content', () => {
    const a = exec({ isBinary: true, dataBase64: 'AAEC', contentType: 'image/png' })
    expect(compareResponses(a, { ...a }).body.mode).toBe('identical')
    expect(compareResponses(a, { ...a, dataBase64: 'AAED' }).body.mode).toBe('binary')
  })

  it('compares requests without leaking credentials', () => {
    const { changes } = compareRequests(
      req({ auth: { type: 'bearer', bearerToken: 'secret-1' }, queryParams: [{ id: '1', key: 'page', value: '1', enabled: true }] }),
      req({
        method: 'POST',
        auth: { type: 'bearer', bearerToken: 'secret-2' },
        queryParams: [{ id: '1', key: 'page', value: '2', enabled: true }],
        body: { type: 'json', content: '{"a":1}' }
      })
    )
    const keys = changes.map((c) => c.key)
    expect(keys).toEqual(['method', 'query.page', 'auth.credentials', 'body.type', 'body'])
    expect(JSON.stringify(changes)).not.toContain('secret')
  })

  it('formats signed deltas', () => {
    expect(formatSignedDelta(12, 'ms')).toBe('+12ms')
    expect(formatSignedDelta(-3, ' B')).toBe('−3 B')
    expect(formatSignedDelta(0, 'ms')).toBe('±0ms')
  })
})

describe('response content', () => {
  it('classifies content types', () => {
    expect(classifyResponse('application/json; charset=utf-8', false)).toBe('json')
    expect(classifyResponse('application/problem+json', false)).toBe('json')
    expect(classifyResponse('text/html', false)).toBe('html')
    expect(classifyResponse('image/svg+xml', false)).toBe('svg')
    expect(classifyResponse('image/png', true)).toBe('image')
    expect(classifyResponse('application/pdf', true)).toBe('pdf')
    expect(classifyResponse('application/octet-stream', true)).toBe('binary')
    expect(classifyResponse('text/plain', false, '{"a":1}')).toBe('json')
    expect(classifyResponse('text/plain', false, '{not json')).toBe('text')
  })

  it('picks file extensions', () => {
    expect(extensionForContentType('application/json', false)).toBe('json')
    expect(extensionForContentType('application/vnd.api+json', false)).toBe('json')
    expect(extensionForContentType('image/png', true)).toBe('png')
    expect(extensionForContentType('application/x-unknown', true)).toBe('bin')
    expect(extensionForContentType('', false)).toBe('txt')
  })

  it('renders a hex dump', () => {
    const dump = hexDump(new TextEncoder().encode('Hello, Shurikly!\n'))
    expect(dump.split('\n')[0]).toBe('00000000  48 65 6c 6c 6f 2c 20 53  68 75 72 69 6b 6c 79 21  |Hello, Shurikly!|')
    expect(dump.split('\n')[1].startsWith('00000010  0a')).toBe(true)
  })

  it('counts matches case-insensitively', () => {
    expect(countMatches('Foo foo FOO', 'foo')).toBe(3)
    expect(countMatches('aaaa', 'aa')).toBe(2)
    expect(countMatches('abc', '')).toBe(0)
  })
})
