import type {
  ApiCollection,
  ApiEnvironment,
  ApiFolder,
  ApiRequest,
  FormDataField,
  KeyValuePair,
  RequestAuth,
  RequestBody
} from '../../types/api-studio'
import {
  COLLECTION_FILE,
  COLLECTION_FORMAT_VERSION,
  ENVIRONMENTS_DIR,
  FOLDER_FILE,
  REQUEST_SUFFIX,
  createSlugAllocator,
  joinPath,
  toYaml,
  type CollectionFiles
} from './format'
import { isSecretFormField, isSecretValue, secretAuthFields } from './secrets'

type Doc = Record<string, unknown>

/** Field order for auth blocks, so the same auth always prints the same way. */
const AUTH_KEY_ORDER: (keyof RequestAuth)[] = [
  'type',
  'bearerToken',
  'basicUsername',
  'basicPassword',
  'apiKeyName',
  'apiKeyValue',
  'apiKeyLocation',
  'vaultItemId',
  'jwtAlgorithm',
  'jwtSecret',
  'jwtPayload',
  'jwtHeader',
  'jwtAddTo',
  'jwtQueryParam',
  'digestUsername',
  'digestPassword',
  'digestRealm',
  'oauth1ConsumerKey',
  'oauth1ConsumerSecret',
  'oauth1Token',
  'oauth1TokenSecret',
  'oauth1SignatureMethod',
  'oauth1Realm',
  'oauth1Version',
  'oauth2GrantType',
  'oauth2AuthUrl',
  'oauth2TokenUrl',
  'oauth2ClientId',
  'oauth2ClientSecret',
  'oauth2Scope',
  'oauth2RedirectUri',
  'oauth2Username',
  'oauth2Password',
  'oauth2AccessToken',
  'oauth2RefreshToken',
  'awsAccessKey',
  'awsSecretKey',
  'awsRegion',
  'awsService',
  'awsSessionToken',
  'hawkId',
  'hawkKey',
  'hawkAlgorithm',
  'hawkUser',
  'hawkNonce',
  'hawkExt',
  'hawkApp'
]

/** Drop `undefined` keys so they never print as `null`. Key order is the insertion order. */
function compact(doc: Doc): Doc {
  const out: Doc = {}
  for (const [key, value] of Object.entries(doc)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function nonEmpty(value: string | undefined): string | undefined {
  return value ? value : undefined
}

function isBlankPair(pair: KeyValuePair): boolean {
  return !pair.key && !pair.value && !pair.description
}

export function pairsDoc(pairs: KeyValuePair[] | undefined): Doc[] | undefined {
  const rows = (pairs ?? []).filter((pair) => !isBlankPair(pair))
  if (rows.length === 0) return undefined
  return rows.map((pair) => {
    const secret = isSecretValue(pair)
    return compact({
      key: pair.key,
      value: secret ? undefined : pair.value,
      secret: secret ? true : pair.secret === false ? false : undefined,
      enabled: pair.enabled === false ? false : undefined,
      description: nonEmpty(pair.description)
    })
  })
}

function formDataDoc(fields: FormDataField[] | undefined): Doc[] | undefined {
  const rows = (fields ?? []).filter((field) => field.key || field.value || field.fileName)
  if (rows.length === 0) return undefined
  return rows.map((field) => {
    const secret = isSecretFormField(field)
    return compact({
      key: field.key,
      type: field.type === 'file' ? 'file' : undefined,
      value: secret || field.type === 'file' ? undefined : field.value,
      secret: secret ? true : field.secret === false ? false : undefined,
      enabled: field.enabled === false ? false : undefined,
      // File bytes stay out of the folder; the name tells the user what to re-attach.
      fileName: nonEmpty(field.fileName),
      fileContentType: nonEmpty(field.fileContentType)
    })
  })
}

export function authDoc(auth: RequestAuth | undefined): Doc | undefined {
  if (!auth) return undefined
  const secrets = secretAuthFields(auth)
  const record = auth as unknown as Record<string, unknown>
  const known = new Set<string>(AUTH_KEY_ORDER)
  const keys = [...AUTH_KEY_ORDER, ...Object.keys(record).filter((key) => !known.has(key)).sort()]
  const out: Doc = {}
  for (const key of keys) {
    const value = record[key]
    if (value === undefined || value === null || value === '') continue
    if (secrets.has(key as keyof RequestAuth)) continue
    out[key] = value
  }
  return out
}

function bodyDoc(body: RequestBody | undefined): Doc | undefined {
  if (!body) return undefined
  const formData = formDataDoc(body.formData)
  if (body.type === 'none' && !body.content && !formData) return undefined
  return compact({ type: body.type, content: nonEmpty(body.content), formData })
}

function scriptsDoc(preRequest: string | undefined, tests?: string): Doc | undefined {
  const doc = compact({ preRequest: nonEmpty(preRequest), tests: nonEmpty(tests) })
  return Object.keys(doc).length ? doc : undefined
}

export function requestDoc(request: ApiRequest): Doc {
  const graphql = request.graphql
  return compact({
    id: request.id,
    name: request.name,
    type: request.requestType,
    method: request.method,
    url: request.url,
    timeoutMs: request.timeoutMs,
    params: pairsDoc(request.queryParams),
    pathParams: pairsDoc(request.pathParams),
    headers: pairsDoc(request.headers),
    body: bodyDoc(request.body),
    auth: authDoc(request.auth),
    // The introspection cache is machine-local and can be megabytes; it is refetched on demand.
    graphql: graphql
      ? compact({
          query: graphql.query ?? '',
          variables: nonEmpty(graphql.variables),
          operationName: nonEmpty(graphql.operationName)
        })
      : undefined,
    scripts: scriptsDoc(request.preRequestScript, request.tests),
    docs: nonEmpty(request.description),
    scan: request.scan
  })
}

export function folderDoc(folder: ApiFolder): Doc {
  return compact({
    id: folder.id,
    name: folder.name,
    auth: authDoc(folder.auth),
    headers: pairsDoc(folder.headers),
    scripts: scriptsDoc(folder.preRequestScript)
  })
}

export function collectionDoc(collection: ApiCollection): Doc {
  return compact({
    formatVersion: COLLECTION_FORMAT_VERSION,
    id: collection.id,
    name: collection.name,
    description: nonEmpty(collection.description),
    auth: authDoc(collection.auth),
    headers: pairsDoc(collection.headers),
    scripts: scriptsDoc(collection.preRequestScript)
  })
}

export function environmentDoc(environment: ApiEnvironment): Doc {
  return compact({
    id: environment.id,
    name: environment.name,
    variables: pairsDoc(environment.variables) ?? []
  })
}

export interface SerializeOptions {
  /** Paths that failed to parse. New files are never given these names, so they are not overwritten. */
  reservedPaths?: string[]
}

function reservedNamesIn(dir: string, reservedPaths: string[], suffix: string): string[] {
  const prefix = dir ? `${dir}/` : ''
  return reservedPaths
    .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && path.endsWith(suffix))
    .map((path) => path.slice(prefix.length, path.length - suffix.length))
}

/**
 * Collection (plus the environments that belong to it) → folder contents.
 * Pure and deterministic: the same input always gives byte-identical files.
 * Secrets are left out (see `secrets.ts`); timestamps are not written, so saves don't churn diffs.
 */
export function serializeCollection(
  collection: ApiCollection,
  environments: ApiEnvironment[] = [],
  options: SerializeOptions = {}
): CollectionFiles {
  const reserved = options.reservedPaths ?? []
  const files: CollectionFiles = {}
  const byId = new Map(collection.folders.map((folder) => [folder.id, folder]))
  const parentOf = (folder: ApiFolder): string | null => {
    const parentId = folder.parentId && byId.has(folder.parentId) ? folder.parentId : null
    // A parent cycle would hide its folders; put them at the root instead.
    const seen = new Set([folder.id])
    for (let id = parentId; id; id = byId.get(id)?.parentId ?? null) {
      if (seen.has(id)) return null
      seen.add(id)
    }
    return parentId
  }
  const folderIds = new Set(byId.keys())
  const containerOf = (request: ApiRequest): string | null =>
    request.folderId && folderIds.has(request.folderId) ? request.folderId : null

  const writeContainer = (dir: string, containerId: string | null, doc: Doc, fileName: string): void => {
    const childFolders = collection.folders.filter((folder) => parentOf(folder) === containerId)
    const childRequests = collection.requests.filter((request) => containerOf(request) === containerId)

    const folderSlug = createSlugAllocator(dir ? [] : [ENVIRONMENTS_DIR])
    const requestSlug = createSlugAllocator(reservedNamesIn(dir, reserved, REQUEST_SUFFIX))
    const folderEntries = childFolders.map((folder) => ({ folder, slug: folderSlug(folder.name, 'folder') }))
    const requestEntries = childRequests.map((request) => ({ request, slug: requestSlug(request.name, 'request') }))

    files[joinPath(dir, fileName)] = toYaml(
      compact({
        ...doc,
        folders: folderEntries.length ? folderEntries.map((entry) => entry.slug) : undefined,
        requests: requestEntries.length ? requestEntries.map((entry) => entry.slug) : undefined
      })
    )
    for (const { request, slug } of requestEntries) {
      files[joinPath(dir, `${slug}${REQUEST_SUFFIX}`)] = toYaml(requestDoc(request))
    }
    for (const { folder, slug } of folderEntries) {
      writeContainer(joinPath(dir, slug), folder.id, folderDoc(folder), FOLDER_FILE)
    }
  }

  writeContainer('', null, collectionDoc(collection), COLLECTION_FILE)

  const environmentSlug = createSlugAllocator(reservedNamesIn(ENVIRONMENTS_DIR, reserved, '.yaml'))
  for (const environment of environments) {
    files[joinPath(ENVIRONMENTS_DIR, `${environmentSlug(environment.name, 'environment')}.yaml`)] = toYaml(
      environmentDoc(environment)
    )
  }

  return files
}
