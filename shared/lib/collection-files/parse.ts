import type {
  ApiCollection,
  ApiEnvironment,
  ApiFolder,
  ApiRequest,
  FormDataField,
  HttpMethod,
  KeyValuePair,
  RequestAuth,
  RequestBody,
  RequestBodyType,
  RequestType
} from '../../types/api-studio'
import {
  COLLECTION_FILE,
  COLLECTION_FORMAT_VERSION,
  ENVIRONMENTS_DIR,
  FOLDER_FILE,
  REQUEST_SUFFIX,
  fromYaml,
  isManagedPath,
  toYaml,
  migrateDocument,
  type CollectionDocKind,
  type CollectionFiles
} from './format'
import { environmentDoc, folderDoc, requestDoc, serializeCollection } from './serialize'
import { isAuthSecretField } from './secrets'

type Doc = Record<string, unknown>

export interface CollectionFileError {
  /** Path relative to the collection folder. */
  path: string
  message: string
}

export interface ParsedCollectionFolder {
  /** `null` only when the collection file itself is missing, broken, or from a newer format. */
  collection: ApiCollection | null
  environments: ApiEnvironment[]
  /** Files that could not be read. Everything else still loads. */
  errors: CollectionFileError[]
  /** Why `collection` is null. */
  fatal?: string
  /** Format version found on disk (before migration). */
  formatVersion: number
}

export interface ParseOptions {
  /**
   * The copy already in the local workspace. Unchanged items are returned as-is (same object), and
   * values kept off disk — secrets, file attachments, cached GraphQL schemas, timestamps — are taken from it.
   */
  previous?: ApiCollection
  previousEnvironments?: ApiEnvironment[]
  /** Folder path recorded on a new collection (`collection.folder.path`). */
  folderPath?: string
  /** Timestamp for new or changed items. */
  now?: string
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const REQUEST_TYPES: RequestType[] = ['http', 'websocket', 'graphql']
const BODY_TYPES: RequestBodyType[] = ['none', 'json', 'text', 'form-data', 'x-www-form-urlencoded']

class ShapeError extends Error {}

function asDoc(value: unknown, field: string): Doc | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new ShapeError(`\`${field}\` must be a mapping`)
  return value as Doc
}

function asList(value: unknown, field: string): unknown[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ShapeError(`\`${field}\` must be a list`)
  return value
}

/** Scalars are accepted as text so `value: 8080` or `value: true` in a hand-edited file still work. */
function asText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new ShapeError(`\`${field}\` must be text`)
}

function readPairs(value: unknown, field: string, ownerId: string): KeyValuePair[] {
  return asList(value, field).map((item, index) => {
    const row = asDoc(item, `${field}[${index}]`) ?? {}
    const pair: KeyValuePair = {
      id: `${ownerId}.${field}.${index}`,
      key: asText(row.key, `${field}[${index}].key`) ?? '',
      value: asText(row.value, `${field}[${index}].value`) ?? '',
      enabled: row.enabled !== false
    }
    const description = asText(row.description, `${field}[${index}].description`)
    if (description) pair.description = description
    if (row.secret === true) pair.secret = true
    if (row.secret === false) pair.secret = false
    if (pair.secret) pair.value = ''
    return pair
  })
}

function readFormData(value: unknown, ownerId: string): FormDataField[] | undefined {
  if (value === undefined || value === null) return undefined
  return asList(value, 'body.formData').map((item, index) => {
    const field = `body.formData[${index}]`
    const row = asDoc(item, field) ?? {}
    const out: FormDataField = {
      id: `${ownerId}.formData.${index}`,
      key: asText(row.key, `${field}.key`) ?? '',
      value: row.secret === true ? '' : (asText(row.value, `${field}.value`) ?? ''),
      enabled: row.enabled !== false,
      type: row.type === 'file' ? 'file' : 'text'
    }
    const fileName = asText(row.fileName, `${field}.fileName`)
    const fileContentType = asText(row.fileContentType, `${field}.fileContentType`)
    if (fileName) out.fileName = fileName
    if (fileContentType) out.fileContentType = fileContentType
    if (row.secret === true) out.secret = true
    if (row.secret === false) out.secret = false
    return out
  })
}

function readAuth(value: unknown, field: string): RequestAuth | undefined {
  const doc = asDoc(value, field)
  if (!doc) return undefined
  const type = asText(doc.type, `${field}.type`)
  if (!type) throw new ShapeError(`\`${field}.type\` is required`)
  const auth: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(doc)) {
    if (child === undefined || child === null) continue
    auth[key] = typeof child === 'object' ? child : typeof child === 'string' ? child : String(child)
  }
  return auth as unknown as RequestAuth
}

function readBody(value: unknown, ownerId: string): RequestBody {
  const doc = asDoc(value, 'body')
  if (!doc) return { type: 'none', content: '' }
  const type = asText(doc.type, 'body.type') ?? 'none'
  if (!BODY_TYPES.includes(type as RequestBodyType)) throw new ShapeError(`Unknown body type "${type}"`)
  const body: RequestBody = { type: type as RequestBodyType, content: asText(doc.content, 'body.content') ?? '' }
  const formData = readFormData(doc.formData, ownerId)
  if (formData) body.formData = formData
  return body
}

function readScripts(value: unknown): { preRequest?: string; tests?: string } {
  const doc = asDoc(value, 'scripts') ?? {}
  return { preRequest: asText(doc.preRequest, 'scripts.preRequest'), tests: asText(doc.tests, 'scripts.tests') }
}

function readRequest(doc: Doc, fallbackId: string, fallbackName: string, folderId: string | null, now: string): ApiRequest {
  const id = asText(doc.id, 'id') || fallbackId
  const method = (asText(doc.method, 'method') ?? 'GET').toUpperCase()
  if (!HTTP_METHODS.includes(method as HttpMethod)) throw new ShapeError(`Unknown method "${method}"`)
  const type = asText(doc.type, 'type')
  if (type !== undefined && !REQUEST_TYPES.includes(type as RequestType)) throw new ShapeError(`Unknown request type "${type}"`)
  const scripts = readScripts(doc.scripts)

  const request: ApiRequest = {
    id,
    name: asText(doc.name, 'name') ?? fallbackName,
    method: method as HttpMethod,
    url: asText(doc.url, 'url') ?? '',
    headers: readPairs(doc.headers, 'headers', id),
    queryParams: readPairs(doc.params, 'params', id),
    body: readBody(doc.body, id),
    auth: readAuth(doc.auth, 'auth') ?? { type: 'inherit' },
    folderId,
    updatedAt: now
  }
  if (type !== undefined) request.requestType = type as RequestType
  if (doc.pathParams !== undefined) request.pathParams = readPairs(doc.pathParams, 'pathParams', id)
  if (doc.timeoutMs !== undefined) {
    if (typeof doc.timeoutMs !== 'number' || !Number.isFinite(doc.timeoutMs)) throw new ShapeError('`timeoutMs` must be a number')
    request.timeoutMs = doc.timeoutMs
  }
  if (scripts.preRequest !== undefined) request.preRequestScript = scripts.preRequest
  if (scripts.tests !== undefined) request.tests = scripts.tests
  const docs = asText(doc.docs, 'docs')
  if (docs !== undefined) request.description = docs
  const graphql = asDoc(doc.graphql, 'graphql')
  if (graphql) {
    request.graphql = {
      query: asText(graphql.query, 'graphql.query') ?? '',
      variables: asText(graphql.variables, 'graphql.variables') ?? ''
    }
    const operationName = asText(graphql.operationName, 'graphql.operationName')
    if (operationName) request.graphql.operationName = operationName
  }
  const scan = asDoc(doc.scan, 'scan')
  if (scan) request.scan = scan as unknown as ApiRequest['scan']
  return request
}

function readFolder(doc: Doc, id: string, fallbackName: string, parentId: string | null): ApiFolder {
  const folder: ApiFolder = { id, name: asText(doc.name, 'name') || fallbackName, parentId }
  const auth = readAuth(doc.auth, 'auth')
  if (auth) folder.auth = auth
  if (doc.headers !== undefined) folder.headers = readPairs(doc.headers, 'headers', id)
  const scripts = readScripts(doc.scripts)
  if (scripts.preRequest !== undefined) folder.preRequestScript = scripts.preRequest
  return folder
}

function readEnvironment(doc: Doc, fallbackId: string, fallbackName: string, now: string): ApiEnvironment {
  const id = asText(doc.id, 'id') || fallbackId
  return {
    id,
    name: asText(doc.name, 'name') || fallbackName,
    variables: readPairs(doc.variables, 'variables', id),
    createdAt: now,
    updatedAt: now
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.split('\n')[0]
  return String(error)
}

// ── Merging with the local copy ────────────────────────────────────────────

function same(a: Doc, b: Doc): boolean {
  return toYaml(a) === toYaml(b)
}

/** Fill values the file leaves out (secrets) from the local copy, and keep row ids stable. */
function mergePairs(parsed: KeyValuePair[], previous: KeyValuePair[] | undefined): KeyValuePair[] {
  if (!previous?.length) return parsed
  const rows = previous.filter((pair) => pair.key || pair.value || pair.description)
  return parsed.map((pair, index) => {
    const local = rows[index]?.key === pair.key ? rows[index] : rows.find((row) => row.key === pair.key)
    if (!local) return pair
    const value = pair.secret && !pair.value ? local.value : pair.value
    return { ...pair, id: local.id, value }
  })
}

function mergeFormData(parsed: FormDataField[] | undefined, previous: FormDataField[] | undefined): FormDataField[] | undefined {
  if (!parsed || !previous?.length) return parsed
  return parsed.map((field, index) => {
    const local = previous[index]?.key === field.key ? previous[index] : previous.find((row) => row.key === field.key)
    if (!local) return field
    const merged: FormDataField = { ...field, id: local.id }
    if (field.secret && !field.value) merged.value = local.value
    if (field.type === 'file' && local.fileBase64 && local.fileName === field.fileName) merged.fileBase64 = local.fileBase64
    return merged
  })
}

function mergeAuth(parsed: RequestAuth | undefined, previous: RequestAuth | undefined): RequestAuth | undefined {
  if (!parsed || !previous || parsed.type !== previous.type) return parsed
  const out: Record<string, unknown> = { ...parsed }
  for (const [key, value] of Object.entries(previous)) {
    if (isAuthSecretField(key) && out[key] === undefined && value) out[key] = value
  }
  return out as unknown as RequestAuth
}

function mergeRequest(parsed: ApiRequest, previous: ApiRequest | undefined): ApiRequest {
  if (!previous) return parsed
  if (same(requestDoc(parsed), requestDoc(previous)) && (parsed.folderId ?? null) === (previous.folderId ?? null)) return previous
  const merged: ApiRequest = {
    ...parsed,
    headers: mergePairs(parsed.headers, previous.headers),
    queryParams: mergePairs(parsed.queryParams, previous.queryParams),
    pathParams: parsed.pathParams ? mergePairs(parsed.pathParams, previous.pathParams) : undefined,
    body: { ...parsed.body, formData: mergeFormData(parsed.body.formData, previous.body?.formData) },
    auth: mergeAuth(parsed.auth, previous.auth) ?? parsed.auth
  }
  if (!merged.pathParams) delete merged.pathParams
  if (!merged.body.formData) delete merged.body.formData
  if (merged.graphql && previous.graphql?.schema) merged.graphql = { ...merged.graphql, schema: previous.graphql.schema }
  return merged
}

function mergeFolder(parsed: ApiFolder, previous: ApiFolder | undefined): ApiFolder {
  if (!previous) return parsed
  if (same(folderDoc(parsed), folderDoc(previous)) && (parsed.parentId ?? null) === (previous.parentId ?? null)) return previous
  const merged: ApiFolder = { ...parsed, auth: mergeAuth(parsed.auth, previous.auth) }
  if (parsed.headers) merged.headers = mergePairs(parsed.headers, previous.headers)
  if (!merged.auth) delete merged.auth
  return merged
}

function mergeEnvironment(parsed: ApiEnvironment, previous: ApiEnvironment | undefined): ApiEnvironment {
  if (!previous) return parsed
  if (same(environmentDoc(parsed), environmentDoc(previous))) {
    return previous.collectionId === parsed.collectionId ? previous : { ...previous, collectionId: parsed.collectionId }
  }
  return {
    ...parsed,
    variables: mergePairs(parsed.variables, previous.variables),
    createdAt: previous.createdAt
  }
}

function filesEqual(a: CollectionFiles, b: CollectionFiles): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => a[key] === b[key])
}

// ── Folder → collection ────────────────────────────────────────────────────

interface Container {
  dir: string
  doc?: Doc
  folderFileError?: boolean
  childDirs: Set<string>
  requestSlugs: Set<string>
}

function parentDir(dir: string): string {
  const index = dir.lastIndexOf('/')
  return index === -1 ? '' : dir.slice(0, index)
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Items listed in `order` first (in that order), then the rest alphabetically. */
function ordered(names: Set<string>, order: unknown): string[] {
  const listed = Array.isArray(order) ? order.filter((name): name is string => typeof name === 'string' && names.has(name)) : []
  const seen = new Set(listed)
  return [...new Set(listed), ...[...names].filter((name) => !seen.has(name)).sort()]
}

/**
 * Folder contents → collection and environments. Pure: works on a path → text map, so the same
 * code loads folders in the app, in tests, and in a command-line runner.
 * A file that fails to parse is reported in `errors` and skipped; the rest of the collection still loads.
 */
export function parseCollectionFiles(files: CollectionFiles, options: ParseOptions = {}): ParsedCollectionFolder {
  const now = options.now ?? new Date().toISOString()
  const errors: CollectionFileError[] = []
  const empty = (fatal: string, formatVersion = COLLECTION_FORMAT_VERSION): ParsedCollectionFolder => ({
    collection: null,
    environments: [],
    errors,
    fatal,
    formatVersion
  })

  const rootText = files[COLLECTION_FILE]
  if (rootText === undefined) return empty(`${COLLECTION_FILE} is missing — this is not a Shurikly collection folder`)
  let rootDoc: Doc
  try {
    rootDoc = fromYaml(rootText)
  } catch (error) {
    errors.push({ path: COLLECTION_FILE, message: errorMessage(error) })
    return empty(`${COLLECTION_FILE} could not be read: ${errorMessage(error)}`)
  }
  const formatVersion = rootDoc.formatVersion === undefined ? COLLECTION_FORMAT_VERSION : Number(rootDoc.formatVersion)
  if (!Number.isInteger(formatVersion) || formatVersion < 1) return empty('`formatVersion` must be a positive whole number')
  if (formatVersion > COLLECTION_FORMAT_VERSION) {
    return empty(
      `This collection uses format ${formatVersion}, but this version of Shurikly reads up to ${COLLECTION_FORMAT_VERSION}. Update Shurikly to open it.`,
      formatVersion
    )
  }

  const load = (kind: CollectionDocKind, path: string): Doc | undefined => {
    try {
      const doc = path === COLLECTION_FILE ? rootDoc : fromYaml(files[path])
      return formatVersion < COLLECTION_FORMAT_VERSION ? migrateDocument(kind, doc, formatVersion) : doc
    } catch (error) {
      errors.push({ path, message: errorMessage(error) })
      return undefined
    }
  }

  const root = load('collection', COLLECTION_FILE)
  if (!root) return empty(`${COLLECTION_FILE} could not be migrated`, formatVersion)

  // Directory tree of everything this format owns.
  const containers = new Map<string, Container>()
  const containerFor = (dir: string): Container => {
    let container = containers.get(dir)
    if (!container) {
      container = { dir, childDirs: new Set(), requestSlugs: new Set() }
      containers.set(dir, container)
      if (dir) containerFor(parentDir(dir)).childDirs.add(baseName(dir))
    }
    return container
  }
  containerFor('')
  const environmentPaths: string[] = []
  for (const path of Object.keys(files).sort()) {
    if (!isManagedPath(path) || path === COLLECTION_FILE) continue
    if (path.startsWith(`${ENVIRONMENTS_DIR}/`)) {
      environmentPaths.push(path)
      continue
    }
    const dir = parentDir(path)
    const name = baseName(path)
    if (name === FOLDER_FILE) containerFor(dir)
    else containerFor(dir).requestSlugs.add(name.slice(0, -REQUEST_SUFFIX.length))
  }
  for (const container of containers.values()) {
    if (!container.dir) continue
    const path = `${container.dir}/${FOLDER_FILE}`
    if (files[path] === undefined) continue
    container.doc = load('folder', path)
    if (!container.doc) container.folderFileError = true
  }
  containerFor('').doc = root

  const previousFolders = new Map((options.previous?.folders ?? []).map((folder) => [folder.id, folder]))
  const previousRequests = new Map((options.previous?.requests ?? []).map((request) => [request.id, request]))
  const folders: ApiFolder[] = []
  const requests: ApiRequest[] = []
  const usedFolderIds = new Set<string>()
  const usedRequestIds = new Set<string>()

  const walk = (container: Container, folderId: string | null): void => {
    for (const slug of ordered(container.requestSlugs, container.doc?.requests)) {
      const path = `${container.dir ? `${container.dir}/` : ''}${slug}${REQUEST_SUFFIX}`
      const doc = load('request', path)
      if (!doc) continue
      try {
        let request = readRequest(doc, `file:${path}`, slug, folderId, now)
        // A copied file keeps its source's id; give the copy its own so both survive.
        if (usedRequestIds.has(request.id)) request = { ...request, id: `${request.id}:${path}` }
        usedRequestIds.add(request.id)
        requests.push(mergeRequest(request, previousRequests.get(request.id)))
      } catch (error) {
        errors.push({ path, message: errorMessage(error) })
      }
    }
    for (const name of ordered(container.childDirs, container.doc?.folders)) {
      const child = containers.get(container.dir ? `${container.dir}/${name}` : name)!
      const path = `${child.dir}/${FOLDER_FILE}`
      let folder: ApiFolder
      try {
        let id = asText(child.doc?.id, 'id') || `dir:${child.dir}`
        if (usedFolderIds.has(id)) id = `${id}:${child.dir}`
        folder = readFolder(child.doc ?? {}, id, name, folderId)
      } catch (error) {
        errors.push({ path, message: errorMessage(error) })
        folder = readFolder({}, `dir:${child.dir}`, name, folderId)
      }
      usedFolderIds.add(folder.id)
      folders.push(mergeFolder(folder, previousFolders.get(folder.id)))
      walk(child, folder.id)
    }
  }

  let collection: ApiCollection
  try {
    const previous = options.previous
    const id = asText(root.id, 'id') || previous?.id || `folder:${options.folderPath ?? 'collection'}`
    const scripts = readScripts(root.scripts)
    collection = {
      id,
      name: asText(root.name, 'name') || 'Collection',
      description: asText(root.description, 'description') ?? '',
      folders,
      requests,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    }
    const auth = readAuth(root.auth, 'auth')
    if (auth) collection.auth = mergeAuth(auth, previous?.auth)
    if (root.headers !== undefined) collection.headers = mergePairs(readPairs(root.headers, 'headers', id), previous?.headers)
    if (scripts.preRequest !== undefined) collection.preRequestScript = scripts.preRequest
    if (previous?.source) collection.source = previous.source
    const folderPath = options.folderPath ?? previous?.folder?.path
    if (folderPath) collection.folder = { path: folderPath }
  } catch (error) {
    errors.push({ path: COLLECTION_FILE, message: errorMessage(error) })
    return empty(`${COLLECTION_FILE} could not be read: ${errorMessage(error)}`, formatVersion)
  }
  walk(containerFor(''), null)

  const previousEnvironments = new Map((options.previousEnvironments ?? []).map((env) => [env.id, env]))
  const environments: ApiEnvironment[] = []
  const usedEnvironmentIds = new Set<string>()
  for (const path of environmentPaths) {
    const doc = load('environment', path)
    if (!doc) continue
    try {
      const name = baseName(path).replace(/\.yaml$/, '')
      let environment = readEnvironment(doc, `file:${path}`, name, now)
      if (usedEnvironmentIds.has(environment.id)) environment = { ...environment, id: `${environment.id}:${path}` }
      usedEnvironmentIds.add(environment.id)
      environment.collectionId = collection.id
      environments.push(mergeEnvironment(environment, previousEnvironments.get(environment.id)))
    } catch (error) {
      errors.push({ path, message: errorMessage(error) })
    }
  }

  // Nothing changed on disk: hand back the local copy untouched (keeps timestamps and secrets).
  const previous = options.previous
  if (previous && previous.id === collection.id) {
    const reservedPaths = errors.map((error) => error.path)
    if (filesEqual(serializeCollection(previous, [], { reservedPaths }), serializeCollection(collection, [], { reservedPaths }))) {
      const sameLink = (previous.folder?.path ?? undefined) === (collection.folder?.path ?? undefined)
      collection = sameLink ? previous : { ...previous, folder: collection.folder }
    } else if (previous.createdAt) {
      collection.createdAt = previous.createdAt
    }
  }

  return { collection, environments, errors, formatVersion }
}
