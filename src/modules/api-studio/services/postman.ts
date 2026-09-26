import { v4 as uuidv4 } from 'uuid'
import type { ApiCollection, ApiFolder, ApiRequest, HttpMethod, KeyValuePair, RequestAuth, RequestBodyType } from '../types/api.types'
import { createDefaultAuth, createDefaultBody, createEmptyKeyValue, splitUrlAndParams, syncPathParams } from './requestBuilder'
import { createInheritAuth } from './inheritance'

interface PostmanHeader {
  key: string
  value: string
  disabled?: boolean
}

interface PostmanUrl {
  raw?: string
  query?: { key: string; value: string; disabled?: boolean }[]
  variable?: { key: string; value: string; disabled?: boolean }[]
}

interface PostmanBody {
  mode?: 'raw' | 'formdata' | 'urlencoded' | 'graphql'
  raw?: string
  formdata?: { key: string; value: string; type?: string; disabled?: boolean }[]
  urlencoded?: { key: string; value: string; disabled?: boolean }[]
  options?: { raw?: { language?: string } }
  graphql?: { query?: string; variables?: string | Record<string, unknown>; operationName?: string }
}

interface PostmanAuth {
  type?: string
  bearer?: { key: string; value: string }[]
  basic?: { key: string; value: string }[]
  apikey?: { key: string; value: string }[]
  oauth2?: { key: string; value: string; type?: string }[]
  jwt?: { key: string; value: string }[]
  digest?: { key: string; value: string }[]
  oauth1?: { key: string; value: string }[]
  awsv4?: { key: string; value: string }[]
  hawk?: { key: string; value: string }[]
}

interface PostmanEvent {
  listen?: string
  script?: { type?: string; exec?: string[] }
}

interface PostmanRequest {
  method?: string
  header?: PostmanHeader[]
  url?: PostmanUrl | string
  body?: PostmanBody
  auth?: PostmanAuth
  description?: string
}

interface PostmanItem {
  name?: string
  description?: string
  item?: PostmanItem[]
  request?: PostmanRequest
  event?: PostmanEvent[]
  auth?: PostmanAuth
}

interface PostmanCollectionJson {
  info?: { name?: string; description?: string }
  item?: PostmanItem[]
  auth?: PostmanAuth
  event?: PostmanEvent[]
}

function toKeyValues(entries?: { key: string; value: string; disabled?: boolean }[]): KeyValuePair[] {
  if (!entries || entries.length === 0) return [createEmptyKeyValue()]
  return entries.map((e) => ({ id: uuidv4(), key: e.key, value: e.value, enabled: !e.disabled }))
}

function authKv(list: { key: string; value: string }[] | undefined, key: string): string {
  return list?.find((b) => b.key === key)?.value ?? ''
}

function parsePostmanAuth(auth?: PostmanAuth, missing: RequestAuth = createInheritAuth()): RequestAuth {
  if (!auth || !auth.type) return missing
  if (auth.type === 'noauth') return createDefaultAuth()
  if (auth.type === 'bearer') {
    return { type: 'bearer', bearerToken: authKv(auth.bearer, 'token') }
  }
  if (auth.type === 'basic') {
    return {
      type: 'basic',
      basicUsername: authKv(auth.basic, 'username'),
      basicPassword: authKv(auth.basic, 'password')
    }
  }
  if (auth.type === 'apikey') {
    return {
      type: 'apiKey',
      apiKeyName: authKv(auth.apikey, 'key'),
      apiKeyValue: authKv(auth.apikey, 'value'),
      apiKeyLocation: (authKv(auth.apikey, 'in') as 'header' | 'query') || 'header'
    }
  }
  if (auth.type === 'jwt') {
    const addTo = authKv(auth.jwt, 'addTokenTo')
    return {
      type: 'jwt',
      jwtAlgorithm: (authKv(auth.jwt, 'algorithm') as RequestAuth['jwtAlgorithm']) || 'HS256',
      jwtSecret: authKv(auth.jwt, 'secret'),
      jwtPayload: authKv(auth.jwt, 'payload'),
      jwtHeader: authKv(auth.jwt, 'header'),
      jwtAddTo: addTo === 'queryParams' || addTo === 'query' ? 'query' : 'header',
      jwtQueryParam: authKv(auth.jwt, 'queryParamKey') || 'token'
    }
  }
  if (auth.type === 'digest') {
    return {
      type: 'digest',
      digestUsername: authKv(auth.digest, 'username'),
      digestPassword: authKv(auth.digest, 'password'),
      digestRealm: authKv(auth.digest, 'realm')
    }
  }
  if (auth.type === 'oauth1') {
    return {
      type: 'oauth1',
      oauth1ConsumerKey: authKv(auth.oauth1, 'consumerKey'),
      oauth1ConsumerSecret: authKv(auth.oauth1, 'consumerSecret'),
      oauth1Token: authKv(auth.oauth1, 'token'),
      oauth1TokenSecret: authKv(auth.oauth1, 'tokenSecret'),
      oauth1SignatureMethod:
        (authKv(auth.oauth1, 'signatureMethod') as RequestAuth['oauth1SignatureMethod']) || 'HMAC-SHA1',
      oauth1Realm: authKv(auth.oauth1, 'realm'),
      oauth1Version: authKv(auth.oauth1, 'version') || '1.0'
    }
  }
  if (auth.type === 'oauth2') {
    const grant = authKv(auth.oauth2, 'grant_type')
    return {
      type: 'oauth2',
      oauth2GrantType:
        grant === 'client_credentials' || grant === 'password' ? grant : 'authorization_code',
      oauth2AuthUrl: authKv(auth.oauth2, 'authUrl'),
      oauth2TokenUrl: authKv(auth.oauth2, 'accessTokenUrl'),
      oauth2ClientId: authKv(auth.oauth2, 'clientId'),
      oauth2ClientSecret: authKv(auth.oauth2, 'clientSecret'),
      oauth2Scope: authKv(auth.oauth2, 'scope'),
      oauth2RedirectUri: authKv(auth.oauth2, 'redirect_uri'),
      oauth2Username: authKv(auth.oauth2, 'username'),
      oauth2Password: authKv(auth.oauth2, 'password'),
      oauth2AccessToken: authKv(auth.oauth2, 'accessToken')
    }
  }
  if (auth.type === 'awsv4') {
    return {
      type: 'aws',
      awsAccessKey: authKv(auth.awsv4, 'accessKey'),
      awsSecretKey: authKv(auth.awsv4, 'secretKey'),
      awsRegion: authKv(auth.awsv4, 'region'),
      awsService: authKv(auth.awsv4, 'service'),
      awsSessionToken: authKv(auth.awsv4, 'sessionToken')
    }
  }
  if (auth.type === 'hawk') {
    return {
      type: 'hawk',
      hawkId: authKv(auth.hawk, 'authId'),
      hawkKey: authKv(auth.hawk, 'authKey'),
      hawkAlgorithm: authKv(auth.hawk, 'algorithm') === 'sha1' ? 'sha1' : 'sha256',
      hawkUser: authKv(auth.hawk, 'user'),
      hawkNonce: authKv(auth.hawk, 'nonce'),
      hawkExt: authKv(auth.hawk, 'extraData'),
      hawkApp: authKv(auth.hawk, 'app')
    }
  }
  return createDefaultAuth()
}

function scriptFromEvents(events: PostmanEvent[] | undefined, listen: string): string {
  const event = events?.find((e) => e.listen === listen)
  const exec = event?.script?.exec
  if (!exec || exec.length === 0) return ''
  return exec.join('\n')
}

function parsePostmanBody(body?: PostmanBody): ApiRequest['body'] {
  if (!body || !body.mode) return createDefaultBody()
  if (body.mode === 'raw') {
    const language = body.options?.raw?.language
    const type: RequestBodyType = language === 'json' ? 'json' : 'text'
    return { type, content: body.raw ?? '' }
  }
  if (body.mode === 'urlencoded') {
    const content = (body.urlencoded ?? [])
      .filter((e) => !e.disabled)
      .map((e) => `${e.key}=${e.value}`)
      .join('\n')
    return { type: 'x-www-form-urlencoded', content }
  }
  if (body.mode === 'formdata') {
    return {
      type: 'form-data',
      content: '',
      formData: (body.formdata ?? []).map((f) => ({
        id: uuidv4(),
        key: f.key,
        value: f.value,
        enabled: !f.disabled,
        type: f.type === 'file' ? 'file' : 'text'
      }))
    }
  }
  return createDefaultBody()
}

function urlToString(url?: PostmanUrl | string): string {
  if (!url) return ''
  if (typeof url === 'string') return url
  return url.raw ?? ''
}

function flattenItems(
  items: PostmanItem[],
  requests: ApiRequest[],
  folders: ApiFolder[],
  warnings: string[],
  folderId: string | null = null
): void {
  for (const item of items) {
    if (item.item && item.item.length > 0) {
      const folder: ApiFolder = {
        id: uuidv4(),
        name: item.name || 'Folder',
        parentId: folderId,
        auth: parsePostmanAuth(item.auth, createInheritAuth()),
        preRequestScript: scriptFromEvents(item.event, 'prerequest')
      }
      folders.push(folder)
      flattenItems(item.item, requests, folders, warnings, folder.id)
      continue
    }
    if (!item.request) continue

    const rawUrl = urlToString(item.request.url)
    const { base, params } = splitUrlAndParams(rawUrl)
    const queryFromPostman = item.request.url && typeof item.request.url !== 'string' ? item.request.url.query : undefined
    const pathFromPostman = item.request.url && typeof item.request.url !== 'string' ? item.request.url.variable : undefined
    const pathParams = syncPathParams(base, pathFromPostman?.length ? toKeyValues(pathFromPostman) : [])
    const graphqlBody = item.request.body?.mode === 'graphql' ? item.request.body.graphql : undefined
    const variables = graphqlBody?.variables
    const variablesText =
      typeof variables === 'string' ? variables : variables ? JSON.stringify(variables, null, 2) : '{\n}'

    requests.push({
      id: uuidv4(),
      name: item.name || 'Imported Request',
      method: graphqlBody ? 'POST' : ((item.request.method?.toUpperCase() as HttpMethod) || 'GET'),
      url: base,
      headers: toKeyValues(item.request.header),
      queryParams: queryFromPostman?.length ? toKeyValues(queryFromPostman) : params.length ? params : [createEmptyKeyValue()],
      pathParams,
      body: graphqlBody ? createDefaultBody() : parsePostmanBody(item.request.body),
      auth: parsePostmanAuth(item.request.auth, createInheritAuth()),
      tests: scriptFromEvents(item.event, 'test'),
      preRequestScript: scriptFromEvents(item.event, 'prerequest'),
      description: typeof item.description === 'string' ? item.description : '',
      requestType: graphqlBody ? 'graphql' : 'http',
      graphql: graphqlBody
        ? {
            query: graphqlBody.query ?? '',
            variables: variablesText,
            ...(graphqlBody.operationName ? { operationName: graphqlBody.operationName } : {})
          }
        : undefined,
      folderId,
      updatedAt: new Date().toISOString()
    })
  }
}

export function importPostmanCollection(json: string): { collection: ApiCollection; warnings: string[] } {
  const parsed = JSON.parse(json) as PostmanCollectionJson
  const warnings: string[] = []
  const requests: ApiRequest[] = []
  const folders: ApiFolder[] = []

  flattenItems(parsed.item ?? [], requests, folders, warnings)

  const now = new Date().toISOString()
  return {
    collection: {
      id: uuidv4(),
      name: parsed.info?.name || 'Imported Collection',
      description: parsed.info?.description || '',
      folders,
      requests,
      auth: parsePostmanAuth(parsed.auth, createDefaultAuth()),
      preRequestScript: scriptFromEvents(parsed.event, 'prerequest'),
      createdAt: now,
      updatedAt: now
    },
    warnings
  }
}

function authToPostman(auth?: RequestAuth): PostmanAuth | undefined {
  if (!auth || auth.type === 'inherit') return undefined
  if (auth.type === 'none') return { type: 'noauth' }
  if (auth.type === 'bearer') {
    return { type: 'bearer', bearer: [{ key: 'token', value: auth.bearerToken ?? '' }] }
  }
  if (auth.type === 'basic') {
    return {
      type: 'basic',
      basic: [
        { key: 'username', value: auth.basicUsername ?? '' },
        { key: 'password', value: auth.basicPassword ?? '' }
      ]
    }
  }
  if (auth.type === 'apiKey') {
    return {
      type: 'apikey',
      apikey: [
        { key: 'key', value: auth.apiKeyName ?? '' },
        { key: 'value', value: auth.apiKeyValue ?? '' },
        { key: 'in', value: auth.apiKeyLocation ?? 'header' }
      ]
    }
  }
  if (auth.type === 'oauth2') {
    return {
      type: 'oauth2',
      oauth2: [
        { key: 'grant_type', value: auth.oauth2GrantType ?? 'authorization_code', type: 'string' },
        { key: 'authUrl', value: auth.oauth2AuthUrl ?? '', type: 'string' },
        { key: 'accessTokenUrl', value: auth.oauth2TokenUrl ?? '', type: 'string' },
        { key: 'clientId', value: auth.oauth2ClientId ?? '', type: 'string' },
        { key: 'clientSecret', value: auth.oauth2ClientSecret ?? '', type: 'string' },
        { key: 'scope', value: auth.oauth2Scope ?? '', type: 'string' },
        { key: 'redirect_uri', value: auth.oauth2RedirectUri ?? '', type: 'string' },
        { key: 'username', value: auth.oauth2Username ?? '', type: 'string' },
        { key: 'password', value: auth.oauth2Password ?? '', type: 'string' },
        { key: 'accessToken', value: auth.oauth2AccessToken ?? '', type: 'string' }
      ]
    }
  }
  if (auth.type === 'jwt') {
    return {
      type: 'jwt',
      jwt: [
        { key: 'algorithm', value: auth.jwtAlgorithm ?? 'HS256' },
        { key: 'secret', value: auth.jwtSecret ?? '' },
        { key: 'payload', value: auth.jwtPayload ?? '' },
        { key: 'header', value: auth.jwtHeader ?? '' },
        { key: 'addTokenTo', value: auth.jwtAddTo === 'query' ? 'queryParams' : 'header' },
        { key: 'queryParamKey', value: auth.jwtQueryParam ?? 'token' }
      ]
    }
  }
  if (auth.type === 'digest') {
    return {
      type: 'digest',
      digest: [
        { key: 'username', value: auth.digestUsername ?? '' },
        { key: 'password', value: auth.digestPassword ?? '' },
        { key: 'realm', value: auth.digestRealm ?? '' }
      ]
    }
  }
  if (auth.type === 'oauth1') {
    return {
      type: 'oauth1',
      oauth1: [
        { key: 'consumerKey', value: auth.oauth1ConsumerKey ?? '' },
        { key: 'consumerSecret', value: auth.oauth1ConsumerSecret ?? '' },
        { key: 'token', value: auth.oauth1Token ?? '' },
        { key: 'tokenSecret', value: auth.oauth1TokenSecret ?? '' },
        { key: 'signatureMethod', value: auth.oauth1SignatureMethod ?? 'HMAC-SHA1' },
        { key: 'realm', value: auth.oauth1Realm ?? '' },
        { key: 'version', value: auth.oauth1Version ?? '1.0' }
      ]
    }
  }
  if (auth.type === 'aws') {
    return {
      type: 'awsv4',
      awsv4: [
        { key: 'accessKey', value: auth.awsAccessKey ?? '' },
        { key: 'secretKey', value: auth.awsSecretKey ?? '' },
        { key: 'region', value: auth.awsRegion ?? 'us-east-1' },
        { key: 'service', value: auth.awsService ?? 'execute-api' },
        { key: 'sessionToken', value: auth.awsSessionToken ?? '' }
      ]
    }
  }
  if (auth.type === 'hawk') {
    return {
      type: 'hawk',
      hawk: [
        { key: 'authId', value: auth.hawkId ?? '' },
        { key: 'authKey', value: auth.hawkKey ?? '' },
        { key: 'algorithm', value: auth.hawkAlgorithm ?? 'sha256' },
        { key: 'user', value: auth.hawkUser ?? '' },
        { key: 'nonce', value: auth.hawkNonce ?? '' },
        { key: 'extraData', value: auth.hawkExt ?? '' },
        { key: 'app', value: auth.hawkApp ?? '' }
      ]
    }
  }
  return undefined
}

function eventsFromScripts(preRequestScript?: string, tests?: string): PostmanEvent[] {
  const events: PostmanEvent[] = []
  if (preRequestScript?.trim()) {
    events.push({
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: preRequestScript.split('\n') }
    })
  }
  if (tests?.trim()) {
    events.push({
      listen: 'test',
      script: { type: 'text/javascript', exec: tests.split('\n') }
    })
  }
  return events
}

export function exportToPostmanCollection(collection: ApiCollection): string {
  function requestToPostmanItem(request: ApiRequest): PostmanItem {
    const header: PostmanHeader[] = request.headers
      .filter((h) => h.key.trim())
      .map((h) => ({ key: h.key, value: h.value, disabled: !h.enabled }))

    const query = request.queryParams
      .filter((p) => p.key.trim())
      .map((p) => ({ key: p.key, value: p.value, disabled: !p.enabled }))

    let body: PostmanBody | undefined
    if (request.requestType === 'graphql') {
      body = {
        mode: 'graphql',
        graphql: {
          query: request.graphql?.query ?? '',
          variables: request.graphql?.variables ?? '',
          ...(request.graphql?.operationName ? { operationName: request.graphql.operationName } : {})
        }
      }
    } else if (request.body.type === 'json' || request.body.type === 'text') {
      body = {
        mode: 'raw',
        raw: request.body.content,
        options: { raw: { language: request.body.type === 'json' ? 'json' : 'text' } }
      }
    } else if (request.body.type === 'x-www-form-urlencoded') {
      body = {
        mode: 'urlencoded',
        urlencoded: request.body.content
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [key, value = ''] = line.split('=')
            return { key, value }
          })
      }
    } else if (request.body.type === 'form-data') {
      body = {
        mode: 'formdata',
        formdata: (request.body.formData ?? []).map((f) => ({ key: f.key, value: f.value, type: f.type, disabled: !f.enabled }))
      }
    }

    const auth = authToPostman(request.auth)
    const events = eventsFromScripts(request.preRequestScript, request.tests)

    const description =
      request.description?.trim() ||
      (request.requestType === 'websocket' ? 'WebSocket request (exported as HTTP-compatible item)' : undefined)

    return {
      name: request.name,
      ...(description ? { description } : {}),
      ...(events.length ? { event: events } : {}),
      request: {
        method: request.requestType === 'graphql' ? 'POST' : request.method,
        header,
        url: {
          raw: request.url,
          query,
          variable: (request.pathParams ?? [])
            .filter((p) => p.key.trim())
            .map((p) => ({ key: p.key, value: p.value, disabled: !p.enabled }))
        },
        body,
        auth
      }
    }
  }

  const rootRequests = collection.requests.filter((r) => !r.folderId).map(requestToPostmanItem)

  function folderToPostmanItem(folder: ApiFolder): PostmanItem {
    const childFolders = collection.folders.filter((f) => (f.parentId ?? null) === folder.id)
    const childRequests = collection.requests
      .filter((r) => r.folderId === folder.id)
      .map(requestToPostmanItem)
    const folderAuth = authToPostman(folder.auth)
    const folderEvents = eventsFromScripts(folder.preRequestScript)
    return {
      name: folder.name,
      ...(folderAuth ? { auth: folderAuth } : {}),
      ...(folderEvents.length ? { event: folderEvents } : {}),
      item: [...childFolders.map(folderToPostmanItem), ...childRequests]
    }
  }

  const rootFolders = collection.folders.filter((f) => (f.parentId ?? null) == null)
  const folderItems: PostmanItem[] = rootFolders.map(folderToPostmanItem)
  const collectionAuth = authToPostman(collection.auth)
  const collectionEvents = eventsFromScripts(collection.preRequestScript)

  const doc = {
    info: {
      _postman_id: collection.id,
      name: collection.name,
      description: collection.description ?? '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [...folderItems, ...rootRequests],
    ...(collectionAuth ? { auth: collectionAuth } : {}),
    event: collectionEvents,
    variable: []
  }

  return JSON.stringify(doc, null, 2)
}
