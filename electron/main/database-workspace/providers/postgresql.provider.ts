import pg from 'pg'
import type {
  DbConnectionTestResult,
  DbDataPageOptions,
  DbDataPageResult,
  DbExplorerNode,
  DbProviderId,
  DbQueryOptions,
  DbQueryResult,
  DbRowChange,
  DbTableInfo
} from '@shared/types/database-workspace'
import type { DbProvider, DbProviderContext } from './types'
import { mapPgColumns, mapPgForeignKeys, mapPgIndexes } from './sql-metadata'

const { Pool } = pg
type PgPool = InstanceType<typeof Pool>

const pools = new Map<string, PgPool>()

function getPool(connectionId: string): PgPool {
  const pool = pools.get(connectionId)
  if (!pool) throw new Error('PostgreSQL connection not open')
  return pool
}

function buildConnectionString(ctx: DbProviderContext): pg.PoolConfig {
  const { config, secrets } = ctx
  const ssl = config.ssl?.enabled
    ? { rejectUnauthorized: config.ssl.rejectUnauthorized ?? true, ...(config.ssl.ca ? { ca: config.ssl.ca } : {}) }
    : undefined
  const shared: pg.PoolConfig = {
    connectionTimeoutMillis: config.connectionTimeoutMs ?? 10_000,
    max: config.pool?.max ?? 5,
    idleTimeoutMillis: config.pool?.idleTimeoutMs ?? 30_000,
    application_name: config.applicationName || 'Tessarok Database Workbench',
    ...(config.queryTimeoutMs ? { statement_timeout: config.queryTimeoutMs } : {}),
    keepAlive: true
  }
  if (config.useConnectionString && secrets.connectionString) {
    // SSL in the URI (sslmode=…) wins; the toggle only adds TLS when the URI does not specify it
    const uriHasSsl = /[?&]ssl(mode)?=/i.test(secrets.connectionString)
    return { ...shared, connectionString: secrets.connectionString, ...(ssl && !uriHasSsl ? { ssl } : {}) }
  }
  return {
    ...shared,
    host: config.host ?? 'localhost',
    port: config.port ?? 5432,
    database: config.database ?? 'postgres',
    user: config.username,
    password: secrets.password,
    ssl
  }
}

export class PostgresqlProvider implements DbProvider {
  id: DbProviderId = 'postgresql'
  label = 'PostgreSQL'
  driverVersion = 'pg'

  async connect(ctx: DbProviderContext): Promise<void> {
    const existing = pools.get(ctx.connectionId)
    if (existing) {
      try {
        await existing.query('SELECT 1')
        return
      } catch {
        await this.disconnect(ctx.connectionId)
      }
    }
    const pool = new Pool(buildConnectionString(ctx))
    await pool.query('SELECT 1')
    pools.set(ctx.connectionId, pool)
  }

  async disconnect(connectionId: string): Promise<void> {
    const pool = pools.get(connectionId)
    if (pool) {
      await pool.end()
      pools.delete(connectionId)
    }
  }

  async testConnection(ctx: DbProviderContext): Promise<DbConnectionTestResult> {
    const start = Date.now()
    const pool = new Pool(buildConnectionString(ctx))
    try {
      const res = await pool.query('SELECT version() AS v')
      const version = String(res.rows[0]?.v ?? '')
      await pool.end()
      return {
        success: true,
        latencyMs: Date.now() - start,
        driverVersion: this.driverVersion,
        serverVersion: version,
        message: 'Connection successful'
      }
    } catch (e) {
      await pool.end().catch(() => {})
      return {
        success: false,
        latencyMs: Date.now() - start,
        driverVersion: this.driverVersion,
        serverVersion: null,
        message: e instanceof Error ? e.message : 'Connection failed'
      }
    }
  }

  async listDatabases(connectionId: string): Promise<string[]> {
    const pool = getPool(connectionId)
    const res = await pool.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
    )
    return res.rows.map((r) => String(r.datname))
  }

  async listSchemas(connectionId: string, _database: string): Promise<string[]> {
    const pool = getPool(connectionId)
    const res = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema') ORDER BY schema_name`
    )
    return res.rows.map((r) => String(r.schema_name))
  }

  async getExplorerTree(connectionId: string, database = '', schema = 'public'): Promise<DbExplorerNode[]> {
    if (!database) {
      const dbs = await this.listDatabases(connectionId)
      const dbNodes: DbExplorerNode[] = dbs.map((db) => ({
        id: `${connectionId}:db:${db}`,
        type: 'database' as const,
        name: db,
        connectionId,
        database: db,
        schema: 'public'
      }))
      return [
        {
          id: `${connectionId}:databases`,
          type: 'schema',
          name: 'Databases',
          connectionId,
          children: dbNodes
        }
      ]
    }

    const pool = getPool(connectionId)
    const tables = await pool.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 AND table_type IN ('BASE TABLE','VIEW') ORDER BY table_name`,
      [schema]
    )

    const tableNodes: DbExplorerNode[] = tables.rows
      .filter((r) => r.table_type === 'BASE TABLE')
      .map((r) => ({
        id: `${connectionId}:${database}:${schema}:table:${r.table_name}`,
        type: 'table' as const,
        name: String(r.table_name),
        connectionId,
        database,
        schema,
        table: String(r.table_name)
      }))

    const viewNodes: DbExplorerNode[] = tables.rows
      .filter((r) => r.table_type === 'VIEW')
      .map((r) => ({
        id: `${connectionId}:${database}:${schema}:view:${r.table_name}`,
        type: 'view' as const,
        name: String(r.table_name),
        connectionId,
        database,
        schema,
        table: String(r.table_name)
      }))

    const matViews = await pool
      .query(`SELECT matviewname FROM pg_matviews WHERE schemaname = $1 ORDER BY matviewname`, [schema])
      .catch(() => ({ rows: [] as Array<{ matviewname: string }> }))
    const matViewNodes: DbExplorerNode[] = matViews.rows.map((r) => ({
      id: `${connectionId}:${database}:${schema}:mview:${r.matviewname}`,
      type: 'materializedView' as const,
      name: String(r.matviewname),
      connectionId,
      database,
      schema,
      table: String(r.matviewname)
    }))

    return [
      { id: `${connectionId}:tables`, type: 'schema', name: 'Tables', connectionId, database, schema, children: tableNodes },
      { id: `${connectionId}:views`, type: 'schema', name: 'Views', connectionId, database, schema, children: viewNodes },
      { id: `${connectionId}:mviews`, type: 'schema', name: 'Materialized Views', connectionId, database, schema, children: matViewNodes }
    ]
  }

  async getTableInfo(connectionId: string, database: string, schema: string, table: string): Promise<DbTableInfo> {
    const pool = getPool(connectionId)
    const cols = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default, ordinal_position, character_maximum_length, numeric_precision, numeric_scale
       FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [schema, table]
    )
    const pk = await pool.query(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2`,
      [schema, table]
    )
    const pkSet = new Set(pk.rows.map((r) => String(r.column_name)))
    const fks = await pool.query(
      `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2`,
      [schema, table]
    )
    const indexes = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
      [schema, table]
    )

    const countRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "${schema}"."${table}"`).catch(() => null)

    return {
      name: table,
      schema,
      database,
      type: 'table',
      rowCount: countRes?.rows[0]?.cnt ?? null,
      comment: null,
      columns: mapPgColumns(cols.rows, pkSet, fks.rows),
      indexes: mapPgIndexes(indexes.rows),
      foreignKeys: mapPgForeignKeys(fks.rows),
      constraints: []
    }
  }

  async executeQuery(options: DbQueryOptions, ctx: DbProviderContext): Promise<DbQueryResult> {
    const pool = getPool(options.connectionId)
    const start = Date.now()
    const maxRows = options.maxRows ?? 1000
    const sql = options.sql.trim()

    if (ctx.readonly || ctx.config.readonly) {
      if (/^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/i.test(sql)) {
        throw new Error('Connection is in readonly mode')
      }
    }

    const isSelect = /^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql)
    const res = await pool.query({ text: sql, values: options.params ?? [], rowMode: 'array' }).catch(async () => {
      const r = await pool.query(sql, options.params ?? [])
      return r
    })

    if (isSelect || res.fields?.length) {
      const fields = res.fields ?? []
      const rows = (res.rows as unknown[]).map((row) => {
        if (Array.isArray(row)) {
          return Object.fromEntries(fields.map((f, i) => [f.name, row[i]]))
        }
        return row as Record<string, unknown>
      })
      const truncated = rows.length > maxRows
      return {
        columns: fields.map((f) => ({ name: f.name, dataType: f.dataTypeID?.toString() ?? 'unknown' })),
        rows: truncated ? rows.slice(0, maxRows) : rows,
        rowCount: rows.length,
        affectedRows: 0,
        executionTimeMs: Date.now() - start,
        truncated
      }
    }

    return {
      columns: [],
      rows: [],
      rowCount: 0,
      affectedRows: res.rowCount ?? 0,
      executionTimeMs: Date.now() - start,
      truncated: false
    }
  }

  async fetchDataPage(options: DbDataPageOptions, ctx: DbProviderContext): Promise<DbDataPageResult> {
    const pool = getPool(options.connectionId)
    const schema = options.schema
    const table = options.table
    const offset = options.offset ?? 0
    const limit = options.limit ?? 100
    const quoted = `"${schema}"."${table}"`

    let orderClause = ''
    if (options.orderBy?.length) {
      orderClause = ' ORDER BY ' + options.orderBy.map((o) => `"${o.column}" ${o.direction.toUpperCase()}`).join(', ')
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${quoted}`)
    const dataRes = await pool.query(`SELECT * FROM ${quoted}${orderClause} LIMIT $1 OFFSET $2`, [limit, offset])
    const info = await this.getTableInfo(options.connectionId, options.database, schema, table)

    return {
      columns: info.columns,
      rows: dataRes.rows as Record<string, unknown>[],
      totalCount: countRes.rows[0]?.cnt ?? null,
      offset,
      limit
    }
  }

  async saveDataChanges(
    connectionId: string,
    database: string,
    schema: string,
    table: string,
    changes: DbRowChange[],
    ctx: DbProviderContext
  ): Promise<{ affectedRows: number }> {
    if (ctx.readonly || ctx.config.readonly) throw new Error('Connection is in readonly mode')
    const pool = getPool(connectionId)
    const client = await pool.connect()
    let affected = 0
    try {
      await client.query('BEGIN')
      const quoted = `"${schema}"."${table}"`
      for (const change of changes) {
        if (change.type === 'insert' && change.after) {
          const cols = Object.keys(change.after)
          const vals = cols.map((_, i) => `$${i + 1}`).join(', ')
          await client.query(
            `INSERT INTO ${quoted} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals})`,
            cols.map((c) => change.after![c])
          )
          affected++
        } else if (change.type === 'update' && change.after) {
          const sets = Object.keys(change.after).map((c, i) => `"${c}" = $${i + 1}`).join(', ')
          const pkCols = Object.keys(change.primaryKey)
          const pkStart = Object.keys(change.after).length + 1
          const where = pkCols.map((c, i) => `"${c}" = $${pkStart + i}`).join(' AND ')
          await client.query(`UPDATE ${quoted} SET ${sets} WHERE ${where}`, [
            ...Object.values(change.after),
            ...Object.values(change.primaryKey)
          ])
          affected++
        } else if (change.type === 'delete') {
          const pkCols = Object.keys(change.primaryKey)
          const where = pkCols.map((c, i) => `"${c}" = $${i + 1}`).join(' AND ')
          await client.query(`DELETE FROM ${quoted} WHERE ${where}`, Object.values(change.primaryKey))
          affected++
        }
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
    return { affectedRows: affected }
  }

  async previewDdl(
    _connectionId: string,
    operations: Array<Record<string, unknown>>,
    _ctx: DbProviderContext
  ): Promise<{ sql: string; warnings: string[] }> {
    const statements: string[] = []
    const warnings: string[] = []
    for (const op of operations) {
      const kind = String(op.kind ?? '')
      if (kind === 'add_column') {
        statements.push(
          `ALTER TABLE "${String(op.schema ?? 'public')}"."${String(op.table)}" ADD COLUMN "${String(op.column)}" ${String(op.dataType ?? 'TEXT')}`
        )
      } else {
        warnings.push(`Unsupported operation: ${kind}`)
      }
    }
    return { sql: statements.join(';\n') + (statements.length ? ';' : ''), warnings }
  }
}

export const postgresqlProvider = new PostgresqlProvider()

/** CockroachDB speaks the PostgreSQL wire protocol and exposes compatible catalogs. */
export class CockroachdbProvider extends PostgresqlProvider {
  id: DbProviderId = 'cockroachdb'
  label = 'CockroachDB'
}

export const cockroachdbProvider = new CockroachdbProvider()
