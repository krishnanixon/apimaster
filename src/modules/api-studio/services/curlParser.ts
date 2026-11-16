import { v4 as uuidv4 } from 'uuid'
import type { ApiRequest, FormDataField, HttpMethod, KeyValuePair, RequestAuth, RequestBody } from '../types/api.types'
import { HTTP_METHODS } from '../types/api.types'
import { createDefaultAuth, createDefaultBody, createEmptyKeyValue, syncPathParams } from './requestBuilder'

/** True when the text starts like a cURL command (also `$ curl …` copied from docs). */
export function looksLikeCurl(text: string): boolean {
  return /^\s*(?:\$\s*)?curl(?:\.exe)?\s/i.test(text)
}

/**
 * Splits a shell command line into words. Handles bash quoting ('…', "…", $'…'),
 * backslash escapes and line continuations, plus Windows cmd style (`^` continuations
 * and `^"` escapes) as produced by Chrome's "Copy as cURL (cmd)".
 */
export function tokenizeCommand(input: string): string[] {
  let text = input.trim().replace(/^\$\s*/, '')
  const windows = /\^\r?\n/.test(text) || /\^"/.test(text)
  if (windows) {
    text = text.replace(/\^\r?\n/g, ' ').replace(/\^(.)/g, '$1')
  }
  text = text.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ')

  const tokens: string[] = []
  let current = ''
  let inToken = false
  let i = 0

  const ANSI: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0' }

  while (i < text.length) {
    const ch = text[i]
    if (ch === '$' && text[i + 1] === "'") {
      // ANSI-C quoting: $'line\nbreak'
      i += 2
      inToken = true
      while (i < text.length && text[i] !== "'") {
        if (text[i] === '\\' && i + 1 < text.length) {
          const next = text[i + 1]
          if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
            current += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16))
            i += 6
            continue
          }
          if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 2, i + 4))) {
            current += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16))
            i += 4
            continue
          }
          current += ANSI[next] ?? `\\${next}`
          i += 2
          continue
        }
        current += text[i++]
      }
      i++
      continue
    }
    if (ch === "'") {
      inToken = true
      const end = text.indexOf("'", i + 1)
      if (end === -1) throw new Error('Unclosed single quote')
      current += text.slice(i + 1, end)
      i = end + 1
      continue
    }
    if (ch === '"') {
      inToken = true
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length && '"\\$`\n'.includes(text[i + 1])) {
          current += text[i + 1]
          i += 2
          continue
        }
        current += text[i++]
      }
      if (i >= text.length) throw new Error('Unclosed double quote')
      i++
      continue
    }
    if (ch === '\\' && !windows && i + 1 < text.length) {
      inToken = true
      current += text[i + 1]
      i += 2
      continue
    }
    if (/\s/.test(ch)) {
      if (inToken) tokens.push(current)
      current = ''
      inToken = false
      i++
      continue
    }
    inToken = true
    current += ch
    i++
  }
  if (inToken) tokens.push(current)
  return tokens
}

/** Flags whose value is the next word; we read or skip them so the value is never taken as the URL. */
const FLAGS_WITH_VALUE = new Set([
  '-X', '--request', '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '--data-ascii',
  '--data-urlencode', '--json', '-F', '--form', '--form-string', '-u', '--user', '-b', '--cookie',
  '-A', '--user-agent', '-e', '--referer', '--url', '-o', '--output', '-m', '--max-time',
  '--connect-timeout', '-x', '--proxy', '-U', '--proxy-user', '--cacert', '--cert', '-E', '--key',
  '--resolve', '--retry', '--retry-delay', '--retry-max-time', '-w', '--write-out', '-c', '--cookie-jar',
  '--oauth2-bearer', '-T', '--upload-file', '-r', '--range', '-y', '--speed-time', '-Y', '--speed-limit',
  '--limit-rate', '--max-redirs', '-K', '--config', '--interface', '--dns-servers', '--aws-sigv4',
  '--trace', '--trace-ascii', '-D', '--dump-header', '--stderr', '--capath', '--ciphers', '--tls-max',
  '--noproxy', '--unix-socket', '--abstract-unix-socket', '-z', '--time-cond', '--variable', '--expand-url',
  '--expand-data', '--expand-header'
])

/** Short flags that can be glued to their value (`-XPOST`, `-H'Accept: x'`). */
const GLUED_SHORT = new Set(['-X', '-H', '-d', '-F', '-u', '-b', '-A', '-e', '-o', '-m', '-x', '-T', '-w', '-c', '-D'])

export interface CurlParseResult {
  request: ApiRequest
  /** Things that were understood but could not be carried over exactly. */
  warnings: string[]
}

export type CurlValidation = { ok: true; request: ApiRequest; warnings: string[] } | { ok: false; error: string }

function pair(key: string, value: string): KeyValuePair {
  return { id: uuidv4(), key, value, enabled: true }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

function splitQuery(url: string): { base: string; params: KeyValuePair[] } {
  const hash = url.indexOf('#')
  const noHash = hash === -1 ? url : url.slice(0, hash)
  const q = noHash.indexOf('?')
  if (q === -1) return { base: noHash, params: [] }
  const params = noHash
    .slice(q + 1)
    .split('&')
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=')
      return eq === -1 ? pair(safeDecode(part), '') : pair(safeDecode(part.slice(0, eq)), safeDecode(part.slice(eq + 1)))
    })
  return { base: noHash.slice(0, q), params }
}

function looksLikeJson(text: string): boolean {
  const t = text.trim()
  if (!/^[[{]/.test(t)) return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function decodeBase64(value: string): string | null {
  try {
    return atob(value)
  } catch {
    return null
  }
}

/** "GET /DeliveryNotes" from the method and URL path, for the tab name. */
function nameFromUrl(method: string, url: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/^\{\{[^}]+\}\}/, '') || '/'
  const short = path.length > 60 ? `${path.slice(0, 57)}…` : path
  return `${method} ${short.startsWith('/') ? short : `/${short}`}`
}

/**
 * Parses a `curl` command into an ApiRequest. Covers what Postman, Insomnia, browser
 * DevTools ("Copy as cURL", bash and cmd), Swagger UI and API docs produce.
 * Throws when the command is not a cURL command or has no URL.
 */
export function parseCurlDetailed(curlCommand: string): CurlParseResult {
  if (!looksLikeCurl(curlCommand)) throw new Error('Not a cURL command — it should start with "curl"')
  const tokens = tokenizeCommand(curlCommand)
  if (/^curl(\.exe)?$/i.test(tokens[0] ?? '')) tokens.shift()

  const warnings: string[] = []
  let method: HttpMethod | null = null
  let url = ''
  const headers: [string, string][] = []
  const data: { value: string; urlencode: boolean }[] = []
  const form: FormDataField[] = []
  let user: string | null = null
  let bearer: string | null = null
  let asGet = false
  let head = false
  let jsonFlag = false
  let insecure = false
  let maxTimeMs: number | undefined
  let afterDoubleDash = false

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i]
    let value: string | undefined

    if (!afterDoubleDash && token === '--') {
      afterDoubleDash = true
      continue
    }
    if (afterDoubleDash || !token.startsWith('-') || token === '-') {
      if (!url) url = token
      else warnings.push(`Ignored extra URL: ${token}`)
      continue
    }

    // --flag=value
    if (token.startsWith('--') && token.includes('=')) {
      const eq = token.indexOf('=')
      value = token.slice(eq + 1)
      token = token.slice(0, eq)
    } else if (!token.startsWith('--') && token.length > 2) {
      const short = token.slice(0, 2)
      if (GLUED_SHORT.has(short)) {
        value = token.slice(2)
        token = short
      } else if (/^-[a-zA-Z]+$/.test(token)) {
        // Combined boolean short flags like -sSLk
        for (const c of token.slice(1)) {
          if (c === 'k') insecure = true
          if (c === 'I') head = true
          if (c === 'G') asGet = true
        }
        continue
      }
    }

    const takeValue = (): string => {
      if (value !== undefined) return value
      const next = tokens[i + 1]
      if (next === undefined) throw new Error(`Missing value for ${token}`)
      i++
      return next
    }

    switch (token) {
      case '-X':
      case '--request': {
        const m = takeValue().toUpperCase()
        if ((HTTP_METHODS as readonly string[]).includes(m)) method = m as HttpMethod
        else warnings.push(`Unsupported method ${m}; using ${method ?? 'GET'}`)
        break
      }
      case '--url':
        url = takeValue()
        break
      case '-H':
      case '--header': {
        const raw = takeValue()
        if (raw.startsWith('@')) {
          warnings.push(`Headers from a file (${raw}) were not imported`)
          break
        }
        const idx = raw.indexOf(':')
        if (idx > 0) headers.push([raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()])
        else if (raw.endsWith(';')) headers.push([raw.slice(0, -1).trim(), ''])
        break
      }
      case '-d':
      case '--data':
      case '--data-ascii':
      case '--data-binary':
      case '--data-raw': {
        const v = takeValue()
        if (v.startsWith('@') && token !== '--data-raw') warnings.push(`Body from a file (${v}) was not imported`)
        else data.push({ value: v, urlencode: false })
        break
      }
      case '--data-urlencode':
        data.push({ value: takeValue(), urlencode: true })
        break
      case '--json':
        jsonFlag = true
        data.push({ value: takeValue(), urlencode: false })
        break
      case '-F':
      case '--form':
      case '--form-string': {
        const raw = takeValue()
        const eq = raw.indexOf('=')
        if (eq <= 0) break
        const key = raw.slice(0, eq)
        let v = raw.slice(eq + 1)
        const isFile = token !== '--form-string' && v.startsWith('@')
        if (token !== '--form-string') v = v.replace(/;type=[^;]+$/, '')
        if (isFile) warnings.push(`Form file "${key}" needs the file picked again`)
        form.push({
          id: uuidv4(),
          key,
          value: isFile ? '' : v.replace(/^</, ''),
          enabled: true,
          type: isFile ? 'file' : 'text',
          ...(isFile ? { fileName: v.slice(1).split(/[\\/]/).pop() } : {})
        })
        break
      }
      case '-u':
      case '--user':
        user = takeValue()
        break
      case '--oauth2-bearer':
        bearer = takeValue()
        break
      case '-b':
      case '--cookie': {
        const v = takeValue()
        if (v.includes('=')) headers.push(['Cookie', v])
        else warnings.push(`Cookie file (${v}) was not imported`)
        break
      }
      case '-A':
      case '--user-agent':
        headers.push(['User-Agent', takeValue()])
        break
      case '-e':
      case '--referer':
        headers.push(['Referer', takeValue()])
        break
      case '-m':
      case '--max-time': {
        const seconds = Number(takeValue())
        if (Number.isFinite(seconds) && seconds > 0) maxTimeMs = Math.round(seconds * 1000)
        break
      }
      case '-G':
      case '--get':
        asGet = true
        break
      case '-I':
      case '--head':
        head = true
        break
      case '-k':
      case '--insecure':
        insecure = true
        break
      case '--digest':
      case '--ntlm':
      case '--negotiate':
        warnings.push(`${token} auth is imported as Basic auth`)
        break
      default:
        if (FLAGS_WITH_VALUE.has(token) && value === undefined) i++
      // Boolean flags like --compressed, -L, -s, -v need nothing.
    }
  }

  if (!url) throw new Error('No URL found in the cURL command')
  if (/^[a-z][\w+.-]*:\/\//i.test(url) === false && !url.startsWith('{{')) {
    // curl assumes http:// when the scheme is missing
    url = `http://${url}`
  }
  if (!/^(https?:\/\/|\{\{)/i.test(url)) throw new Error(`Unsupported URL: ${url}`)

  // Body
  let body: RequestBody = createDefaultBody()
  const encodedData = data.map((d) => {
    if (!d.urlencode) return d.value
    const eq = d.value.indexOf('=')
    if (eq === -1) return encodeURIComponent(d.value)
    return `${d.value.slice(0, eq)}=${encodeURIComponent(d.value.slice(eq + 1))}`
  })
  const contentType = headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1].toLowerCase() ?? ''
  const { base, params } = splitQuery(url)

  if (asGet && encodedData.length > 0) {
    // -G: data goes into the query string
    for (const part of encodedData.join('&').split('&').filter(Boolean)) {
      const eq = part.indexOf('=')
      params.push(eq === -1 ? pair(safeDecode(part), '') : pair(safeDecode(part.slice(0, eq)), safeDecode(part.slice(eq + 1))))
    }
  } else if (form.length > 0) {
    body = { type: 'form-data', content: '', formData: form }
    if (contentType.startsWith('multipart/')) {
      // The boundary in a copied header is wrong for a new request; let the client set it.
      const idx = headers.findIndex(([k]) => k.toLowerCase() === 'content-type')
      headers.splice(idx, 1)
    }
  } else if (encodedData.length > 0) {
    const joined = encodedData.join('&')
    if (jsonFlag || contentType.includes('json') || (!contentType && looksLikeJson(joined))) {
      body = { type: 'json', content: prettyJson(encodedData.join('')) }
    } else if (contentType.includes('x-www-form-urlencoded') || (!contentType && /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(joined))) {
      body = {
        type: 'x-www-form-urlencoded',
        content: joined
          .split('&')
          .filter(Boolean)
          .map((part) => {
            const eq = part.indexOf('=')
            return eq === -1 ? safeDecode(part) : `${safeDecode(part.slice(0, eq))}=${safeDecode(part.slice(eq + 1))}`
          })
          .join('\n')
      }
    } else {
      body = { type: 'text', content: joined }
    }
  }

  if (jsonFlag) {
    if (!contentType) headers.push(['Content-Type', 'application/json'])
    if (!headers.some(([k]) => k.toLowerCase() === 'accept')) headers.push(['Accept', 'application/json'])
  }

  const finalMethod: HttpMethod =
    method ?? (head ? 'HEAD' : asGet ? 'GET' : body.type !== 'none' ? 'POST' : 'GET')

  // Auth: lift Authorization into the Auth tab when we understand it.
  let auth: RequestAuth = createDefaultAuth()
  const authIdx = headers.findIndex(([k]) => k.toLowerCase() === 'authorization')
  const authValue = authIdx === -1 ? '' : headers[authIdx][1]
  if (bearer) {
    auth = { type: 'bearer', bearerToken: bearer }
  } else if (/^bearer\s+/i.test(authValue)) {
    auth = { type: 'bearer', bearerToken: authValue.replace(/^bearer\s+/i, '').trim() }
    headers.splice(authIdx, 1)
  } else if (/^basic\s+/i.test(authValue)) {
    const decoded = decodeBase64(authValue.replace(/^basic\s+/i, '').trim())
    if (decoded !== null && decoded.includes(':')) {
      const sep = decoded.indexOf(':')
      auth = { type: 'basic', basicUsername: decoded.slice(0, sep), basicPassword: decoded.slice(sep + 1) }
      headers.splice(authIdx, 1)
    }
  } else if (user !== null) {
    const sep = user.indexOf(':')
    auth = sep === -1
      ? { type: 'basic', basicUsername: user, basicPassword: '' }
      : { type: 'basic', basicUsername: user.slice(0, sep), basicPassword: user.slice(sep + 1) }
  }

  const headerPairs = headers.map(([k, v]) => pair(k, v))

  const request: ApiRequest = {
    id: uuidv4(),
    name: nameFromUrl(finalMethod, base),
    method: finalMethod,
    url: base,
    headers: headerPairs.length > 0 ? headerPairs : [createEmptyKeyValue()],
    queryParams: params.length > 0 ? params : [createEmptyKeyValue()],
    pathParams: syncPathParams(base),
    body,
    auth,
    tests: '',
    preRequestScript: '',
    description: '',
    requestType: 'http',
    folderId: null,
    timeoutMs: maxTimeMs ?? 30_000,
    ...(insecure ? { network: { verifySsl: false } } : {}),
    updatedAt: new Date().toISOString()
  }
  return { request, warnings }
}

/** Backwards-compatible wrapper: just the request. */
export function parseCurl(curlCommand: string): ApiRequest {
  return parseCurlDetailed(curlCommand).request
}

/** Parses without throwing, for paste handlers and the import dialog. */
export function validateCurl(curlCommand: string): CurlValidation {
  try {
    const { request, warnings } = parseCurlDetailed(curlCommand)
    return { ok: true, request, warnings }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read the cURL command' }
  }
}
