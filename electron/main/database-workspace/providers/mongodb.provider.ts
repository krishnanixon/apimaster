import vm from 'vm'
import {
  MongoClient,
  ObjectId,
  Long,
  Int32,
  Double,
  Decimal128,
  Timestamp,
  UUID,
  BSON,
  type Document,
  type MongoClientOptions,
  type Db
} from 'mongodb'
import type {
  DbColumnInfo,
  DbConnectionTestResult,
  DbDataPageOptions,
  DbDataPageResult,
  DbExplorerNode,
  DbIndexInfo,
  DbProviderId,
  DbQueryOptions,
  DbQueryResult,
  DbRowChange,
  DbTableInfo
} from '@shared/types/database-workspace'
import type { DbProvider, DbProviderContext } from './types'

const { EJSON } = BSON

const clients = new Map<string, { client: MongoClient; defaultDb: string; sampleSize?: number }>()
const DEFAULT_SAMPLE_SIZE = 100

function getClient(connectionId: string) {
  const entry = clients.get(connectionId)
  if (!entry) throw new Error('MongoDB connection not open')
  return entry
}

function buildClient(ctx: DbProviderContext): { client: MongoClient; defaultDb: string } {
  const { config, secrets } = ctx
  const options: MongoClientOptions = {
    appName: config.applicationName || 'Tessarok Database Workbench',
    serverSelectionTimeoutMS: config.connectionTimeoutMs ?? 10_000,
    connectTimeoutMS: config.connectionTimeoutMs ?? 10_000,
    maxPoolSize: config.pool?.max ?? 5,
    ...(config.pool?.idleTimeoutMs ? { maxIdleTimeMS: config.pool.idleTimeoutMs } : {})
  }
  if (config.ssl?.enabled) {
    options.tls = true
    options.tlsAllowInvalidCertificates = config.ssl.rejectUnauthorized === false
    if (config.ssl.ca) options.ca = config.ssl.ca
  }
  if (config.readonly) options.readPreference = 'secondaryPreferred'

  if (config.useConnectionString && secrets.connectionString) {
    const uri = secrets.connectionString
    const pathDb = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i)?.[1]
    return { client: new MongoClient(uri, options), defaultDb: config.database || (pathDb ? decodeURIComponent(pathDb) : 'test') }
  }

  const host = config.host || 'localhost'
  const port = config.port ?? 27017
  if (config.username) {
    options.auth = { username: config.username, password: secrets.password ?? '' }
    options.authSource = config.authSource || 'admin'
  }
  if (config.replicaSet) options.replicaSet = config.replicaSet
  if (config.directConnection ?? !config.replicaSet) options.directConnection = true
  return { client: new MongoClient(`mongodb://${host}:${port}`, options), defaultDb: config.database || 'test' }
}

/** Serialize BSON values into Extended JSON (relaxed) so they survive IPC and can be sent back. */
function toTransport(doc: unknown): Record<string, unknown> {
  const value = EJSON.serialize(doc, { relaxed: true }) as unknown
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return { value }
}

function fromTransport<T = Document>(value: unknown): T {
  return EJSON.deserialize(value as Document, { relaxed: true }) as T
}

function bsonTypeName(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'
  if (value instanceof ObjectId) return 'objectId'
  if (value instanceof Decimal128) return 'decimal'
  if (value instanceof Long) return 'long'
  if (value instanceof Int32) return 'int'
  if (value instanceof Double) return 'double'
  if (value instanceof Timestamp) return 'timestamp'
  if (value instanceof UUID) return 'uuid'
  if (value instanceof RegExp) return 'regex'
  if (typeof value === 'object') {
    const bsontype = (value as { _bsontype?: string })._bsontype
    return bsontype ? bsontype.toLowerCase() : 'object'
  }
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double'
  return typeof value
}

/** Infer top-level fields, their BSON types and presence from sampled documents. */
function inferColumns(docs: Document[]): DbColumnInfo[] {
  const stats = new Map<string, { types: Map<string, number>; count: number; order: number }>()
  let order = 0
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      let entry = stats.get(key)
      if (!entry) {
        entry = { types: new Map(), count: 0, order: key === '_id' ? -1 : order++ }
        stats.set(key, entry)
      }
      entry.count++
      const t = bsonTypeName(value)
      entry.types.set(t, (entry.types.get(t) ?? 0) + 1)
    }
  }
  if (!stats.has('_id')) stats.set('_id', { types: new Map([['objectId', 1]]), count: docs.length, order: -1 })
  const total = Math.max(docs.length, 1)
  return [...stats.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name, s], i) => {
      const types = [...s.types.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
      const presence = Math.min(1, s.count / total)
      return {
        name,
        dataType: types.filter((t) => t !== 'null').join(' | ') || 'null',
        nullable: name !== '_id' && (presence < 1 || types.includes('null')),
        defaultValue: null,
        isPrimaryKey: name === '_id',
        isForeignKey: false,
        isUnique: name === '_id',
        isAutoIncrement: false,
        isGenerated: false,
        comment: null,
        presence,
        maxLength: null,
        precision: null,
        scale: null,
        ordinalPosition: i + 1
      }
    })
}

function mapIndexes(indexes: Document[]): DbIndexInfo[] {
  return indexes.map((idx) => {
    const key = (idx.key ?? {}) as Record<string, unknown>
    const kinds = new Set(Object.values(key).map((v) => (typeof v === 'string' ? v : 'btree')))
    return {
      name: String(idx.name),
      columns: Object.entries(key).map(([k, v]) => (v === -1 ? `${k} ↓` : k)),
      unique: Boolean(idx.unique) || idx.name === '_id_',
      primary: idx.name === '_id_',
      type: [...kinds].join(', ') + (idx.sparse ? ' · sparse' : '') + (idx.expireAfterSeconds != null ? ' · TTL' : '')
    }
  })
}

// ── Shell-style query parsing ──────────────────────────────────────────────
// Queries like `db.users.find({ age: { $gt: 30 } }).sort({ age: -1 }).limit(10)` are evaluated in an
// isolated VM context where `db` only *records* the call chain. Nothing touches the driver until the
// recorded call is validated and replayed below.

interface RecordedCall {
  target: 'collection' | 'db'
  collection?: string
  method: string
  args: unknown[]
  chain: Array<{ method: string; args: unknown[] }>
}

const COLLECTION_READ_METHODS = new Set([
  'find', 'findOne', 'aggregate', 'countDocuments', 'estimatedDocumentCount', 'count', 'distinct',
  'indexes', 'getIndexes', 'stats'
])
const COLLECTION_WRITE_METHODS = new Set([
  'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
  'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'createIndex', 'dropIndex', 'drop', 'bulkWrite', 'rename'
])
const DB_METHODS = new Set(['runCommand', 'getCollectionNames', 'listCollections', 'createCollection', 'dropDatabase', 'stats', 'getCollection'])
const CURSOR_METHODS = new Set(['sort', 'limit', 'skip', 'project', 'projection', 'toArray', 'pretty', 'count', 'explain', 'hint', 'batchSize', 'maxTimeMS'])
const READONLY_COMMANDS = new Set([
  'find', 'aggregate', 'count', 'distinct', 'listCollections', 'listIndexes', 'dbStats', 'collStats',
  'serverStatus', 'buildInfo', 'ping', 'hello', 'isMaster', 'explain', 'listDatabases', 'connectionStatus', 'hostInfo'
])

function recordShellCall(source: string, timeoutMs: number): RecordedCall {
  let recorded: RecordedCall | null = null

  const cursorProxy = (call: RecordedCall): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (typeof prop !== 'string') return undefined
          if (!CURSOR_METHODS.has(prop)) throw new Error(`Unsupported cursor method: .${prop}()`)
          return (...args: unknown[]) => {
            call.chain.push({ method: prop, args })
            return cursorProxy(call)
          }
        }
      }
    )

  const collectionProxy = (name: string): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (typeof prop !== 'string') return undefined
          if (!COLLECTION_READ_METHODS.has(prop) && !COLLECTION_WRITE_METHODS.has(prop)) {
            // allow dotted collection names: db.system.users.find()
            return collectionProxy(`${name}.${prop}`)
          }
          return (...args: unknown[]) => {
            recorded = { target: 'collection', collection: name, method: prop, args, chain: [] }
            return cursorProxy(recorded)
          }
        }
      }
    )

  const dbProxy = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== 'string') return undefined
        if (prop === 'getCollection') return (name: string) => collectionProxy(String(name))
        if (DB_METHODS.has(prop)) {
          return (...args: unknown[]) => {
            recorded = { target: 'db', method: prop, args, chain: [] }
            return cursorProxy(recorded)
          }
        }
        return collectionProxy(prop)
      }
    }
  )

  const sandbox = vm.createContext({
    db: dbProxy,
    ObjectId: (id?: string) => new ObjectId(id),
    ISODate: (s?: string) => (s ? new Date(s) : new Date()),
    Date,
    NumberLong: (v: string | number) => Long.fromString(String(v)),
    NumberInt: (v: number) => new Int32(Number(v)),
    NumberDecimal: (v: string | number) => Decimal128.fromString(String(v)),
    UUID: (v?: string) => new UUID(v),
    Timestamp: (t: number, i: number) => new Timestamp({ t, i }),
    RegExp,
    Math,
    JSON
  })

  const code = source
    .replace(/^\s*use\s+\S+\s*;?\s*$/gim, '')
    .trim()
    .replace(/;\s*$/, '')
  if (!code) throw new Error('Empty query')
  if (/;\s*\S/.test(code.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""'))) {
    throw new Error('Run one MongoDB command at a time')
  }
  vm.runInContext(`(${code})`, sandbox, { timeout: Math.min(timeoutMs, 2_000), displayErrors: false })
  if (!recorded) throw new Error('Query must start with db.<collection>.<method>(…) or db.runCommand({…})')
  return recorded
}

function isWriteCall(call: RecordedCall): boolean {
  if (call.target === 'collection') return COLLECTION_WRITE_METHODS.has(call.method)
  if (call.method === 'runCommand') {
    const cmd = (call.args[0] ?? {}) as Record<string, unknown>
    const name = Object.keys(cmd)[0]
    return !name || !READONLY_COMMANDS.has(name)
  }
  return ['createCollection', 'dropDatabase'].includes(call.method)
}

async function drainCursor(
  cursor: AsyncIterable<Document> & { close: () => Promise<void> },
  maxRows: number
): Promise<{ docs: Document[]; truncated: boolean }> {
  const docs: Document[] = []
  let truncated = false
  for await (const doc of cursor) {
    if (docs.length >= maxRows) {
      truncated = true
      break
    }
    docs.push(doc)
  }
  await cursor.close().catch(() => {})
  return { docs, truncated }
}

function docsToResult(docs: Document[], start: number, truncated: boolean, affectedRows = 0): DbQueryResult {
  const columns = inferColumns(docs.slice(0, 200)).map((c) => ({ name: c.name, dataType: c.dataType }))
  const hasId = docs.some((d) => '_id' in d)
  return {
    columns: hasId ? columns : columns.filter((c) => c.name !== '_id'),
    rows: docs.map(toTransport),
    rowCount: docs.length,
    affectedRows,
    executionTimeMs: Date.now() - start,
    truncated
  }
}

function scalarResult(value: unknown, start: number, affectedRows = 0): DbQueryResult {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? toTransport(value) : { result: toTransport(value).value ?? value }
  return {
    columns: Object.keys(row).map((name) => ({ name, dataType: typeof row[name] })),
    rows: [row],
    rowCount: 1,
    affectedRows,
    executionTimeMs: Date.now() - start,
    truncated: false
  }
}

function affectedFrom(result: Document): number {
  return Number(
    result.insertedCount ?? result.modifiedCount ?? result.deletedCount ?? result.upsertedCount ?? (result.acknowledged ? 1 : 0)
  )
}

/** Coerce an _id coming back from the UI (EJSON or plain hex string) into a filter. */
function idFilter(raw: unknown): Document {
  const id = fromTransport<{ v: unknown }>({ v: raw }).v
  if (typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) {
    return { _id: { $in: [new ObjectId(id), id] } }
  }
  return { _id: id }
}

/** Grid edits arrive as text; restore JSON objects/arrays and numbers where the original was typed. */
function coerceEdited(after: Record<string, unknown>, before?: Record<string, unknown>): Document {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(after)) {
    if (key.startsWith('__')) continue
    const prev = before?.[key]
    if (typeof value === 'string' && prev != null && typeof prev === 'object') {
      try {
        out[key] = JSON.parse(value)
        continue
      } catch {
        // keep as string
      }
    }
    if (typeof value === 'string' && typeof prev === 'number' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      out[key] = Number(value)
      continue
    }
    if (typeof value === 'string' && typeof prev === 'boolean' && /^(true|false)$/i.test(value)) {
      out[key] = value.toLowerCase() === 'true'
      continue
    }
    out[key] = value
  }
  return fromTransport(out)
}

export class MongodbProvider implements DbProvider {
  id: DbProviderId = 'mongodb'
  label = 'MongoDB'
  driverVersion = 'mongodb'

  private db(connectionId: string, database?: string): Db {
    const { client, defaultDb } = getClient(connectionId)
    return client.db(database || defaultDb)
  }

  async connect(ctx: DbProviderContext): Promise<void> {
    const existing = clients.get(ctx.connectionId)
    if (existing) {
      try {
        await existing.client.db('admin').command({ ping: 1 })
        return
      } catch {
        await this.disconnect(ctx.connectionId)
      }
    }
    const entry = buildClient(ctx)
    await entry.client.connect()
    await entry.client.db(entry.defaultDb).command({ ping: 1 })
    clients.set(ctx.connectionId, { ...entry, sampleSize: ctx.config.schemaSampleSize })
  }

  async disconnect(connectionId: string): Promise<void> {
    const entry = clients.get(connectionId)
    if (entry) {
      clients.delete(connectionId)
      await entry.client.close().catch(() => {})
    }
  }

  async testConnection(ctx: DbProviderContext): Promise<DbConnectionTestResult> {
    const start = Date.now()
    const { client, defaultDb } = buildClient(ctx)
    try {
      await client.connect()
      await client.db(defaultDb).command({ ping: 1 })
      const info = await client.db('admin').command({ buildInfo: 1 }).catch(() => null)
      return {
        success: true,
        latencyMs: Date.now() - start,
        driverVersion: this.driverVersion,
        serverVersion: info?.version ? `MongoDB ${info.version}` : null,
        message: 'Connection successful'
      }
    } catch (e) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        driverVersion: this.driverVersion,
        serverVersion: null,
        message: e instanceof Error ? e.message : 'Connection failed'
      }
    } finally {
      await client.close().catch(() => {})
    }
  }

  async listDatabases(connectionId: string): Promise<string[]> {
    const { client, defaultDb } = getClient(connectionId)
    try {
      const res = await client.db('admin').admin().listDatabases({ nameOnly: true, authorizedDatabases: true })
      const names = res.databases.map((d) => d.name).filter((n) => !['admin', 'config', 'local'].includes(n))
      return names.length ? names : [defaultDb]
    } catch {
      // Users scoped to a single database may not run listDatabases
      return [defaultDb]
    }
  }

  async listSchemas(_connectionId: string, database: string): Promise<string[]> {
    return [database]
  }

  async getExplorerTree(connectionId: string, database = ''): Promise<DbExplorerNode[]> {
    if (!database) {
      const dbs = await this.listDatabases(connectionId)
      return [
        {
          id: `${connectionId}:databases`,
          type: 'schema',
          name: 'Databases',
          connectionId,
          children: dbs.map((db) => ({
            id: `${connectionId}:db:${db}`,
            type: 'database' as const,
            name: db,
            connectionId,
            database: db,
            schema: db
          }))
        }
      ]
    }

    const infos = await this.db(connectionId, database)
      .listCollections({}, { nameOnly: false, authorizedCollections: true })
      .toArray()
    const visible = infos.filter((c) => !c.name.startsWith('system.')).sort((a, b) => a.name.localeCompare(b.name))
    const toNode = (c: (typeof infos)[number], type: 'collection' | 'view'): DbExplorerNode => ({
      id: `${connectionId}:${database}:${type}:${c.name}`,
      type,
      name: c.name,
      connectionId,
      database,
      schema: database,
      table: c.name,
      metadata: { kind: c.type }
    })

    return [
      {
        id: `${connectionId}:collections`,
        type: 'schema',
        name: 'Collections',
        connectionId,
        database,
        schema: database,
        children: visible.filter((c) => c.type !== 'view').map((c) => toNode(c, 'collection'))
      },
      {
        id: `${connectionId}:views`,
        type: 'schema',
        name: 'Views',
        connectionId,
        database,
        schema: database,
        children: visible.filter((c) => c.type === 'view').map((c) => toNode(c, 'view'))
      }
    ]
  }

  private async sampleDocs(connectionId: string, database: string, collection: string, size: number): Promise<Document[]> {
    const coll = this.db(connectionId, database).collection(collection)
    try {
      return await coll.aggregate([{ $sample: { size } }], { maxTimeMS: 10_000 }).toArray()
    } catch {
      // $sample is unavailable on views / some versions
      return coll.find({}, { maxTimeMS: 10_000 }).limit(size).toArray()
    }
  }

  async getTableInfo(connectionId: string, database: string, _schema: string, table: string): Promise<DbTableInfo> {
    const db = this.db(connectionId, database)
    const meta = await db.listCollections({ name: table }, { nameOnly: false }).toArray()
    const isView = meta[0]?.type === 'view'
    const coll = db.collection(table)
    const [docs, indexes, count] = await Promise.all([
      this.sampleDocs(connectionId, database, table, getClient(connectionId).sampleSize ?? DEFAULT_SAMPLE_SIZE),
      isView ? Promise.resolve([] as Document[]) : coll.indexes().catch(() => [] as Document[]),
      coll.estimatedDocumentCount().catch(() => null)
    ])
    const validator = (meta[0]?.options as Document | undefined)?.validator
    return {
      name: table,
      schema: database,
      database,
      type: isView ? 'view' : 'collection',
      rowCount: count,
      comment: validator ? `Validator: ${JSON.stringify(EJSON.serialize(validator))}` : null,
      columns: inferColumns(docs),
      indexes: mapIndexes(indexes),
      foreignKeys: [],
      constraints: []
    }
  }

  async executeQuery(options: DbQueryOptions, ctx: DbProviderContext): Promise<DbQueryResult> {
    const start = Date.now()
    const maxRows = options.maxRows ?? 1000
    const timeoutMs = options.timeoutMs ?? 30_000
    const call = recordShellCall(options.sql, timeoutMs)

    if ((ctx.readonly || ctx.config.readonly || options.readonly) && isWriteCall(call)) {
      throw new Error('Connection is in readonly mode — only read operations are allowed')
    }

    const db = this.db(options.connectionId, options.database)

    if (call.target === 'db') {
      switch (call.method) {
        case 'getCollectionNames':
        case 'listCollections': {
          const list = await db.listCollections({}, { nameOnly: false }).toArray()
          return docsToResult(list.map((c) => ({ name: c.name, type: c.type })), start, false)
        }
        case 'runCommand': {
          const res = await db.command(call.args[0] as Document, { timeoutMS: timeoutMs })
          const batch = (res.cursor as Document | undefined)?.firstBatch as Document[] | undefined
          return batch ? docsToResult(batch.slice(0, maxRows), start, batch.length > maxRows) : scalarResult(res, start)
        }
        case 'createCollection':
          await db.createCollection(String(call.args[0]), (call.args[1] ?? {}) as Document)
          return scalarResult({ ok: 1, created: String(call.args[0]) }, start, 1)
        case 'dropDatabase':
          return scalarResult({ ok: await db.dropDatabase() }, start, 1)
        case 'stats':
          return scalarResult(await db.stats(), start)
      }
      throw new Error(`Unsupported db method: ${call.method}`)
    }

    const coll = db.collection(call.collection!)
    const [a0, a1, a2] = call.args as [Document?, Document?, Document?]
    const chain = call.chain.filter((c) => !['toArray', 'pretty', 'batchSize'].includes(c.method))

    switch (call.method) {
      case 'find': {
        const wantsCount = chain.some((c) => c.method === 'count')
        if (wantsCount) return scalarResult({ count: await coll.countDocuments(a0 ?? {}, { maxTimeMS: timeoutMs }) }, start)
        let cursor = coll.find(a0 ?? {}, { projection: a1, maxTimeMS: timeoutMs })
        let explain = false
        for (const c of chain) {
          const [x] = c.args as [unknown]
          if (c.method === 'sort') cursor = cursor.sort(x as Document)
          else if (c.method === 'limit') cursor = cursor.limit(Number(x))
          else if (c.method === 'skip') cursor = cursor.skip(Number(x))
          else if (c.method === 'project' || c.method === 'projection') cursor = cursor.project(x as Document)
          else if (c.method === 'hint') cursor = cursor.hint(x as Document)
          else if (c.method === 'maxTimeMS') cursor = cursor.maxTimeMS(Number(x))
          else if (c.method === 'explain') explain = true
        }
        if (explain) return { ...scalarResult(await cursor.explain(), start), explainPlan: 'mongodb' }
        const { docs, truncated } = await drainCursor(cursor, maxRows)
        return docsToResult(docs, start, truncated)
      }
      case 'findOne': {
        const doc = await coll.findOne(a0 ?? {}, { projection: a1, maxTimeMS: timeoutMs })
        return docsToResult(doc ? [doc] : [], start, false)
      }
      case 'aggregate': {
        const pipeline = (Array.isArray(a0) ? a0 : call.args) as Document[]
        if (ctx.readonly || ctx.config.readonly || options.readonly) {
          if (pipeline.some((stage) => '$out' in stage || '$merge' in stage)) {
            throw new Error('Connection is in readonly mode — $out/$merge are not allowed')
          }
        }
        const cursor = coll.aggregate(pipeline, { maxTimeMS: timeoutMs, allowDiskUse: true })
        if (chain.some((c) => c.method === 'explain')) return { ...scalarResult(await cursor.explain(), start), explainPlan: 'mongodb' }
        const { docs, truncated } = await drainCursor(cursor, maxRows)
        return docsToResult(docs, start, truncated)
      }
      case 'countDocuments':
      case 'count':
        return scalarResult({ count: await coll.countDocuments(a0 ?? {}, { maxTimeMS: timeoutMs }) }, start)
      case 'estimatedDocumentCount':
        return scalarResult({ count: await coll.estimatedDocumentCount() }, start)
      case 'distinct': {
        const values = await coll.distinct(String(a0), (a1 ?? {}) as Document, { maxTimeMS: timeoutMs })
        return docsToResult(values.slice(0, maxRows).map((value) => ({ value })), start, values.length > maxRows)
      }
      case 'indexes':
      case 'getIndexes':
        return docsToResult(await coll.indexes(), start, false)
      case 'stats':
        return scalarResult(await db.command({ collStats: call.collection }), start)
      case 'insertOne': {
        const res = await coll.insertOne(a0 ?? {})
        return scalarResult(res, start, 1)
      }
      case 'insertMany': {
        const res = await coll.insertMany((a0 ?? []) as unknown as Document[])
        return scalarResult({ acknowledged: res.acknowledged, insertedCount: res.insertedCount }, start, res.insertedCount)
      }
      case 'updateOne':
      case 'updateMany':
      case 'replaceOne':
      case 'deleteOne':
      case 'deleteMany': {
        const fn = coll[call.method].bind(coll) as (...args: unknown[]) => Promise<Document>
        const res = await fn(a0 ?? {}, a1, a2)
        return scalarResult(res, start, affectedFrom(res))
      }
      case 'findOneAndUpdate':
      case 'findOneAndReplace':
      case 'findOneAndDelete': {
        const fn = coll[call.method].bind(coll) as (...args: unknown[]) => Promise<Document | null>
        const res = call.method === 'findOneAndDelete' ? await fn(a0 ?? {}, a1 ?? {}) : await fn(a0 ?? {}, a1 ?? {}, a2 ?? {})
        return docsToResult(res ? [res] : [], start, false, res ? 1 : 0)
      }
      case 'createIndex':
        return scalarResult({ created: await coll.createIndex((a0 ?? {}) as Document, (a1 ?? {}) as Document) }, start, 1)
      case 'dropIndex':
        return scalarResult(await coll.dropIndex(a0 as unknown as string), start, 1)
      case 'drop':
        return scalarResult({ dropped: await coll.drop() }, start, 1)
      case 'rename':
        await coll.rename(String(a0))
        return scalarResult({ renamed: String(a0) }, start, 1)
      case 'bulkWrite': {
        const res = await coll.bulkWrite((a0 ?? []) as unknown as Parameters<typeof coll.bulkWrite>[0])
        const affected = res.insertedCount + res.modifiedCount + res.deletedCount + res.upsertedCount
        return scalarResult(
          { insertedCount: res.insertedCount, modifiedCount: res.modifiedCount, deletedCount: res.deletedCount, upsertedCount: res.upsertedCount },
          start,
          affected
        )
      }
    }
    throw new Error(`Unsupported collection method: ${call.method}`)
  }

  async fetchDataPage(options: DbDataPageOptions, _ctx: DbProviderContext): Promise<DbDataPageResult> {
    const coll = this.db(options.connectionId, options.database).collection(options.table)
    const offset = options.offset ?? 0
    const limit = options.limit ?? 100
    const filter: Document = options.documentFilter?.trim()
      ? fromTransport(parseLooseJson(options.documentFilter))
      : {}
    const sort: Document = {}
    for (const o of options.orderBy ?? []) sort[o.column] = o.direction === 'desc' ? -1 : 1

    const hasFilter = Object.keys(filter).length > 0
    const [docs, totalCount] = await Promise.all([
      coll
        .find(filter, { maxTimeMS: 30_000 })
        .sort(Object.keys(sort).length ? sort : { _id: 1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      (hasFilter ? coll.countDocuments(filter, { maxTimeMS: 15_000 }) : coll.estimatedDocumentCount()).catch(() => null)
    ])
    // Merge sampled schema with this page so sparse fields still get a column
    const sample = offset === 0 ? await this.sampleDocs(options.connectionId, options.database, options.table, 50) : []
    return {
      columns: inferColumns([...docs, ...sample]),
      rows: docs.map(toTransport),
      totalCount,
      offset,
      limit
    }
  }

  async saveDataChanges(
    connectionId: string,
    database: string,
    _schema: string,
    table: string,
    changes: DbRowChange[],
    ctx: DbProviderContext
  ): Promise<{ affectedRows: number }> {
    if (ctx.readonly || ctx.config.readonly) throw new Error('Connection is in readonly mode')
    const coll = this.db(connectionId, database).collection(table)
    let affected = 0
    for (const change of changes) {
      if (change.type === 'insert' && change.after) {
        const doc = coerceEdited(change.after)
        if (doc._id == null || doc._id === '') delete doc._id
        for (const [k, v] of Object.entries(doc)) if (v === null && change.replace !== true) delete doc[k]
        await coll.insertOne(doc)
        affected++
      } else if (change.type === 'update' && change.after) {
        const filter = idFilter(change.primaryKey._id ?? change.before?._id)
        // Whole-document edits are already typed JSON; grid edits arrive as text and need coercion
        const doc = coerceEdited(change.after, change.replace ? undefined : change.before)
        delete doc._id
        const res = change.replace ? await coll.replaceOne(filter, doc) : await coll.updateOne(filter, { $set: doc })
        affected += res.modifiedCount
      } else if (change.type === 'delete') {
        const res = await coll.deleteOne(idFilter(change.primaryKey._id ?? change.before?._id))
        affected += res.deletedCount
      }
    }
    return { affectedRows: affected }
  }

  async previewDdl(): Promise<{ sql: string; warnings: string[] }> {
    return { sql: '', warnings: ['MongoDB collections are schemaless — use createIndex / collMod validators instead of DDL'] }
  }
}

/** Accept strict JSON or shell-style objects ({ age: { $gt: 3 } }, ObjectId("…")) for filters. */
export function parseLooseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const sandbox = vm.createContext({
      ObjectId: (id?: string) => ({ $oid: new ObjectId(id).toHexString() }),
      ISODate: (s?: string) => ({ $date: (s ? new Date(s) : new Date()).toISOString() }),
      NumberLong: (v: string | number) => ({ $numberLong: String(v) }),
      NumberDecimal: (v: string | number) => ({ $numberDecimal: String(v) })
    })
    const value = vm.runInContext(`(${text})`, sandbox, { timeout: 500 }) as unknown
    return JSON.parse(JSON.stringify(value, (_k, v) =>
        Object.prototype.toString.call(v) === '[object RegExp]' ? { $regex: (v as RegExp).source, $options: (v as RegExp).flags } : v))
  }
}

export const mongodbProvider = new MongodbProvider()
