import { describe, expect, it } from 'vitest'
import { looksLikeCurl, parseCurlDetailed, tokenizeCommand, validateCurl } from '../src/modules/api-studio/services/curlParser'
import { importRequestsFromText } from '../src/modules/api-studio/services/collectionImport'
import { exportRequest, REQUEST_EXPORT_FORMATS } from '../src/modules/api-studio/services/requestExport'
import { generateSnippet } from '../src/modules/api-studio/services/codeGenerator'
import type { ApiRequest } from '../shared/types/api-studio'

const keys = (pairs: { key: string; value: string }[]) =>
  Object.fromEntries(pairs.filter((p) => p.key).map((p) => [p.key, p.value]))

describe('tokenizeCommand', () => {
  it('handles quotes, escapes, ANSI-C strings and continuations', () => {
    expect(tokenizeCommand(`curl 'a b' "c \\"d\\"" $'e\\nf' g\\ h \\\n -X`)).toEqual(['curl', 'a b', 'c "d"', 'e\nf', 'g h', '-X'])
  })

  it('reads Windows cmd style from Chrome', () => {
    const cmd = 'curl ^"https://api.test/x?a=1^" ^\n  -H ^"accept: */*^" ^\n  --data-raw ^"^{^\\^"a^\\^":1^}^"'
    expect(tokenizeCommand(cmd)).toEqual(['curl', 'https://api.test/x?a=1', '-H', 'accept: */*', '--data-raw', '{"a":1}'])
  })
})

describe('parseCurl', () => {
  it('parses a typical Postman export', () => {
    const { request } = parseCurlDetailed(`curl --location 'https://api.test/users?page=2&q=a%20b' \\
      --header 'Content-Type: application/json' \\
      --header 'Authorization: Bearer abc.def' \\
      --data '{"name":"x"}'`)
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://api.test/users')
    expect(keys(request.queryParams)).toEqual({ page: '2', q: 'a b' })
    expect(keys(request.headers)).toEqual({ 'Content-Type': 'application/json' })
    expect(request.auth).toEqual({ type: 'bearer', bearerToken: 'abc.def' })
    expect(request.body.type).toBe('json')
    expect(JSON.parse(request.body.content)).toEqual({ name: 'x' })
    expect(request.name).toBe('POST /users')
  })

  it('keeps OData-style query values with quotes and env variables', () => {
    const { request } = parseCurlDetailed(
      `curl "{{sap_base_url}}/DeliveryNotes?\\$select=DocEntry,DocNum&\\$filter=(U_BIO_Transp eq '{{transporter_code}}')"`
    )
    expect(request.url).toBe('{{sap_base_url}}/DeliveryNotes')
    expect(keys(request.queryParams)).toEqual({ $select: 'DocEntry,DocNum', $filter: "(U_BIO_Transp eq '{{transporter_code}}')" })
  })

  it('supports glued flags, -u, -G, -I, -k, --json, cookies and form data', () => {
    expect(parseCurlDetailed('curl -XDELETE https://a.test/1').request.method).toBe('DELETE')
    expect(parseCurlDetailed('curl -I https://a.test').request.method).toBe('HEAD')

    const basic = parseCurlDetailed('curl -u admin:s3:cret https://a.test').request
    expect(basic.auth).toEqual({ type: 'basic', basicUsername: 'admin', basicPassword: 's3:cret' })

    const get = parseCurlDetailed('curl -G https://a.test/search -d q=hello --data-urlencode "t=a b"').request
    expect(get.method).toBe('GET')
    expect(keys(get.queryParams)).toEqual({ q: 'hello', t: 'a b' })
    expect(get.body.type).toBe('none')

    const misc = parseCurlDetailed(`curl -sSk -b 'sid=1; x=2' --json '{"a":1}' https://a.test`).request
    expect(misc.network).toEqual({ verifySsl: false })
    expect(keys(misc.headers)).toMatchObject({ Cookie: 'sid=1; x=2', 'Content-Type': 'application/json' })
    expect(misc.method).toBe('POST')

    const form = parseCurlDetailed(`curl https://a.test/up -F name=joe -F 'file=@/tmp/a.png;type=image/png'`)
    expect(form.request.body.type).toBe('form-data')
    expect(form.request.body.formData?.map((f) => [f.key, f.type])).toEqual([['name', 'text'], ['file', 'file']])
    expect(form.warnings[0]).toMatch(/file/)
  })

  it('reads url-encoded bodies one pair per line', () => {
    const { request } = parseCurlDetailed(`curl https://a.test/token -d 'grant_type=client_credentials&scope=a%20b'`)
    expect(request.body).toEqual({ type: 'x-www-form-urlencoded', content: 'grant_type=client_credentials\nscope=a b' })
  })

  it('lifts Basic Authorization headers into the auth tab', () => {
    const { request } = parseCurlDetailed(`curl https://a.test -H 'Authorization: Basic ${btoa('u:p')}'`)
    expect(request.auth).toEqual({ type: 'basic', basicUsername: 'u', basicPassword: 'p' })
  })

  it('reports invalid commands', () => {
    expect(looksLikeCurl('$ curl https://a.test')).toBe(true)
    expect(looksLikeCurl('https://a.test')).toBe(false)
    expect(validateCurl('curl -H "x: y"')).toEqual({ ok: false, error: 'No URL found in the cURL command' })
    expect(validateCurl(`curl 'https://a.test`)).toEqual({ ok: false, error: 'Unclosed single quote' })
    expect(validateCurl('curl ftp://a.test').ok).toBe(false)
  })
})

describe('single request export and import', () => {
  const request = parseCurlDetailed(`curl -X PUT 'https://api.test/items/:id?x=1' \\
    -H 'Accept: application/json' -H 'Authorization: Bearer tok' \\
    --data '{"a":1}'`).request
  const withId: ApiRequest = { ...request, name: 'Update item', pathParams: [{ id: 'p', key: 'id', value: '7', enabled: true }] }

  it('exports every format without throwing', () => {
    for (const f of REQUEST_EXPORT_FORMATS) {
      expect(exportRequest(withId, f.id).length, f.id).toBeGreaterThan(10)
    }
  })

  it('round-trips through cURL, Postman, HAR and Shurikly JSON', () => {
    for (const format of ['curl', 'postman', 'har', 'native'] as const) {
      const text = exportRequest(withId, format)
      const imported = importRequestsFromText(text)
      expect(imported.requests, format).toHaveLength(1)
      const r = imported.requests[0]
      expect(r.method, format).toBe('PUT')
      expect(r.url, format).toMatch(/^https:\/\/api\.test\/items\/(7|:id)$/)
      expect(JSON.parse(r.body.content), format).toEqual({ a: 1 })
    }
  })

  it('imports a single Postman item', () => {
    const item = { name: 'Ping', request: { method: 'GET', url: { raw: 'https://a.test/ping' }, header: [] } }
    const imported = importRequestsFromText(JSON.stringify(item))
    expect(imported.formatLabel).toBe('Postman request')
    expect(imported.requests[0]).toMatchObject({ name: 'Ping', method: 'GET' })
  })

  it('hides secrets when asked', () => {
    const text = exportRequest(withId, 'curl', null, { redactSecrets: true })
    expect(text).not.toContain('Bearer tok')
  })

  it('sends url-encoded bodies as a=1&b=2', () => {
    const form = parseCurlDetailed(`curl https://a.test -d 'a=1&b=x y'`).request
    expect(generateSnippet(form, 'curl')).toContain(`--data 'a=1&b=x%20y'`)
  })
})
