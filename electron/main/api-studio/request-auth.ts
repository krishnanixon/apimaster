import crypto from 'node:crypto'
import type { RequestAuth, RequestBody, ResolvedHttpRequest } from '@shared/types/api-studio'

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function hmac(algorithm: string, key: string | Buffer, data: string | Buffer): Buffer {
  return crypto.createHmac(algorithm, key).update(data).digest()
}

function base64Url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function randomHex(bytes = 8): string {
  return crypto.randomBytes(bytes).toString('hex')
}

function payloadBuffer(body: RequestBody, data: unknown): Buffer | null {
  if (body.type === 'none' || data === undefined || data === null) return Buffer.alloc(0)
  if (body.type === 'form-data') return null
  if (typeof data === 'string' || Buffer.isBuffer(data)) return Buffer.from(data)
  try {
    return Buffer.from(JSON.stringify(data), 'utf8')
  } catch {
    return Buffer.from(String(data), 'utf8')
  }
}

function applyJwt(auth: RequestAuth, headers: Record<string, string>, params: Record<string, string>): void {
  const secret = auth.jwtSecret?.trim()
  if (!secret) return
  const alg = auth.jwtAlgorithm ?? 'HS256'
  const hash = alg === 'HS512' ? 'sha512' : alg === 'HS384' ? 'sha384' : 'sha256'
  let extraHeader: Record<string, unknown> = {}
  if (auth.jwtHeader?.trim()) {
    try {
      extraHeader = JSON.parse(auth.jwtHeader) as Record<string, unknown>
    } catch {
      extraHeader = {}
    }
  }
  let payload: Record<string, unknown> = { iat: Math.floor(Date.now() / 1000) }
  if (auth.jwtPayload?.trim()) {
    try {
      payload = JSON.parse(auth.jwtPayload) as Record<string, unknown>
    } catch {
      payload = { iat: Math.floor(Date.now() / 1000) }
    }
  }
  if (payload.iat === undefined) payload.iat = Math.floor(Date.now() / 1000)
  const headerJson = JSON.stringify({ alg, typ: 'JWT', ...extraHeader })
  const payloadJson = JSON.stringify(payload)
  const unsigned = `${base64Url(headerJson)}.${base64Url(payloadJson)}`
  const signature = base64Url(hmac(hash, secret, unsigned))
  const token = `${unsigned}.${signature}`
  if (auth.jwtAddTo === 'query') {
    params[auth.jwtQueryParam?.trim() || 'token'] = token
  } else {
    headers['Authorization'] = `Bearer ${token}`
  }
}

function applyOAuth1(
  auth: RequestAuth,
  method: string,
  url: string,
  headers: Record<string, string>,
  params: Record<string, string>
): void {
  const consumerKey = auth.oauth1ConsumerKey?.trim()
  const consumerSecret = auth.oauth1ConsumerSecret ?? ''
  if (!consumerKey) return
  const token = auth.oauth1Token?.trim() ?? ''
  const tokenSecret = auth.oauth1TokenSecret ?? ''
  const signatureMethod = auth.oauth1SignatureMethod ?? 'HMAC-SHA1'
  const version = auth.oauth1Version?.trim() || '1.0'
  const nonce = randomHex(8)
  const timestamp = String(Math.floor(Date.now() / 1000))

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: signatureMethod,
    oauth_timestamp: timestamp,
    oauth_version: version
  }
  if (token) oauthParams.oauth_token = token

  const urlObj = new URL(url)
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  const allParams: Record<string, string> = { ...oauthParams }
  urlObj.searchParams.forEach((value, key) => {
    allParams[key] = value
  })
  for (const [key, value] of Object.entries(params)) allParams[key] = value

  const paramString = Object.keys(allParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join('&')
  const baseString = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`

  let signature: string
  if (signatureMethod === 'PLAINTEXT') {
    signature = signingKey
  } else {
    const algo = signatureMethod === 'HMAC-SHA256' ? 'sha256' : 'sha1'
    signature = hmac(algo, signingKey, baseString).toString('base64')
  }
  oauthParams.oauth_signature = signature

  const headerParams = Object.keys(oauthParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`)
    .join(', ')
  const realm = auth.oauth1Realm?.trim()
  headers['Authorization'] = realm ? `OAuth realm="${percentEncode(realm)}", ${headerParams}` : `OAuth ${headerParams}`
}

function applyAws(
  auth: RequestAuth,
  method: string,
  url: string,
  headers: Record<string, string>,
  params: Record<string, string>,
  body: RequestBody,
  data: unknown
): void {
  const accessKey = auth.awsAccessKey?.trim()
  const secretKey = auth.awsSecretKey ?? ''
  if (!accessKey || !secretKey) return
  const region = auth.awsRegion?.trim() || 'us-east-1'
  const service = auth.awsService?.trim() || 'execute-api'
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)

  const urlObj = new URL(url)
  for (const [key, value] of Object.entries(params)) {
    if (!urlObj.searchParams.has(key)) urlObj.searchParams.set(key, value)
  }
  const canonicalUri = urlObj.pathname || '/'
  const canonicalQuery = [...urlObj.searchParams.entries()]
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const payload = payloadBuffer(body, data)
  const payloadHash = payload ? sha256Hex(payload) : 'UNSIGNED-PAYLOAD'
  headers['x-amz-date'] = amzDate
  headers['x-amz-content-sha256'] = payloadHash
  if (auth.awsSessionToken?.trim()) headers['x-amz-security-token'] = auth.awsSessionToken.trim()
  if (!headers['host'] && !headers['Host']) headers['host'] = urlObj.host

  const signedHeaderNames = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .filter((k) => k === 'host' || k.startsWith('x-amz-'))
    .sort()
  const headerLookup = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]))
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headerLookup.get(name) ?? ''}\n`).join('')
  const signedHeaders = signedHeaderNames.join(';')
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`
  const kDate = hmac('sha256', `AWS4${secretKey}`, dateStamp)
  const kRegion = hmac('sha256', kDate, region)
  const kService = hmac('sha256', kRegion, service)
  const kSigning = hmac('sha256', kService, 'aws4_request')
  const signature = hmac('sha256', kSigning, stringToSign).toString('hex')
  headers['Authorization'] =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

function applyHawk(
  auth: RequestAuth,
  method: string,
  url: string,
  headers: Record<string, string>
): void {
  const id = auth.hawkId?.trim()
  const key = auth.hawkKey ?? ''
  if (!id || !key) return
  const algorithm = auth.hawkAlgorithm === 'sha1' ? 'sha1' : 'sha256'
  const ts = String(Math.floor(Date.now() / 1000))
  const nonce = auth.hawkNonce?.trim() || randomHex(6)
  const urlObj = new URL(url)
  const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80')
  const resource = `${urlObj.pathname}${urlObj.search}`
  const ext = auth.hawkExt ?? ''
  const normalized = `hawk.1.header\n${ts}\n${nonce}\n${method.toUpperCase()}\n${resource}\n${urlObj.hostname.toLowerCase()}\n${port}\n\n${ext}\n`
  const mac = hmac(algorithm, key, normalized).toString('base64')
  const parts = [`id="${id}"`, `ts="${ts}"`, `nonce="${nonce}"`, `mac="${mac}"`]
  if (ext) parts.push(`ext="${ext.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  if (auth.hawkUser?.trim()) parts.push(`user="${auth.hawkUser.trim()}"`)
  if (auth.hawkApp?.trim()) parts.push(`app="${auth.hawkApp.trim()}"`)
  headers['Authorization'] = `Hawk ${parts.join(', ')}`
}

/** Apply JWT / OAuth1 / AWS / Hawk signatures onto the outgoing request. */
export function applySignedAuth(
  input: ResolvedHttpRequest,
  headers: Record<string, string>,
  params: Record<string, string>,
  data: unknown
): void {
  const auth = input.auth
  if (!auth) return
  switch (auth.type) {
    case 'jwt':
      applyJwt(auth, headers, params)
      break
    case 'oauth1':
      applyOAuth1(auth, input.method, input.url, headers, params)
      break
    case 'aws':
      applyAws(auth, input.method, input.url, headers, params, input.body, data)
      break
    case 'hawk':
      applyHawk(auth, input.method, input.url, headers)
      break
    default:
      break
  }
}

function md5Hex(value: string): string {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex')
}

function parseDigestChallenge(header: string): Record<string, string> {
  const result: Record<string, string> = {}
  const body = header.replace(/^Digest\s+/i, '')
  const re = /(\w+)=("(?:[^"\\]|\\.)*"|[^,]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body))) {
    result[match[1]] = match[2].replace(/^"|"$/g, '').replace(/\\"/g, '"')
  }
  return result
}

export function buildDigestAuthorization(
  auth: RequestAuth,
  method: string,
  url: string,
  challengeHeader: string
): string | null {
  const username = auth.digestUsername ?? ''
  const password = auth.digestPassword ?? ''
  if (!username && !password) return null
  const challenge = parseDigestChallenge(challengeHeader)
  const realm = auth.digestRealm?.trim() || challenge.realm || ''
  const nonce = challenge.nonce
  if (!nonce) return null
  const urlObj = new URL(url)
  const uri = `${urlObj.pathname}${urlObj.search}`
  const qop = (challenge.qop ?? '').split(',')[0]?.trim()
  const algorithm = (challenge.algorithm || 'MD5').toUpperCase()
  const cnonce = randomHex(8)
  const nc = '00000001'
  const ha1 = md5Hex(`${username}:${realm}:${password}`)
  const ha2 = md5Hex(`${method.toUpperCase()}:${uri}`)
  const response = qop
    ? md5Hex(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5Hex(`${ha1}:${nonce}:${ha2}`)
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`
  ]
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`)
  if (algorithm) parts.push(`algorithm=${algorithm}`)
  if (qop) {
    parts.push(`qop=${qop}`)
    parts.push(`nc=${nc}`)
    parts.push(`cnonce="${cnonce}"`)
  }
  return `Digest ${parts.join(', ')}`
}

export { EMPTY_SHA256 }
