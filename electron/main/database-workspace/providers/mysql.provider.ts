import mysql from 'mysql2/promise'
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
import { mapMySqlColumns, mapMySqlIndexes } from './sql-metadata'

type MySqlPool = mysql.Pool
const pools = new Map<string, MySqlPool>()

function getPool(connectionId: string): MySqlPool {
  const pool = pools.get(connectionId)
  if (!pool) throw new Error('MySQL connection not open')
  return pool
}

function buildSslOption(config: DbProviderContext['config']): mysql.SslOptions | undefined {
  if (!config.ssl?.enabled) {
    // Explicitly disable TLS — mysql2 may otherwise upgrade when the server advertises SSL
    return undefined
  }
  return {
    rejectUnauthorized: config.ssl.rejectUnauthorized ?? false,
    ...(config.ssl.ca ? { ca: config.ssl.ca } : {})
  }
}

function buildConfig(ctx: DbProviderContext, provider: DbProviderId): mysql.PoolOptions {
  const { config, secrets } = ctx
  const sslEnabled = config.ssl?.enabled ?? false
  const shared: mysql.PoolOptions = {
    connectionLimit: config.pool?.max ?? 5,
    connectTimeout: config.connectionTimeoutMs ?? 10_000,
    enableKeepAlive: true,
    ...(config.pool?.idleTimeoutMs ? { idleTimeout: config.pool.idleTimeoutMs } : {})
  }
  if (config.useConnectionString && secrets.connectionString) {
    return {
      ...shared,
      uri: secrets.connectionString.replace(/^mariadb:/i, 'mysql:'),
      ...(sslEnabled ? { ssl: buildSslOption(config)! } : {})
    }
  }
  return {
    ...shared,
    host: config.host ?? 'localhost',
    port: config.port ?? (provider === 'mariadb' ? 3306 : 3306),
    database: config.database || undefined,
    user: config.username,
    password: secrets.password,
    // mysql2 accepts `ssl: false` at runtime to force plaintext, but its typings only allow string | SslOptions
    ...(sslEnabled ? { ssl: buildSslOption(config)! } : ({ ssl: false } as unknown as Pick<mysql.PoolOptions, 'ssl'>))
  }
}

function createMysqlProvider(providerId: DbProviderId, label: string): DbProvider {
  return {
    id: providerId,
    label,
    driverVersion: 'mysql2',

    async connect(ctx) {
      const existing = pools.get(ctx.connectionId)
      if (existing) {
        try {
          await existing.query('SELECT 1')
          return
        } catch {
          await existing.end()
          pools.delete(ctx.connectionId)
        }
      }
      const pool = mysql.createPool(buildConfig(ctx, providerId))
      await pool.query('SELECT 1')
      pools.set(ctx.connectionId, pool)
    },

    async disconnect(connectionId) {
      const pool = pools.get(connectionId)
      if (pool) {
        await pool.end()
        pools.delete(connectionId)
      }
    },

    async testConnection(ctx) {
      const start = Date.now()
      const pool = mysql.createPool(buildConfig(ctx, providerId))
      try {
        const [rows] = await pool.query('SELECT VERSION() AS v')
        const version = String((rows as Array<{ v: string }>)[0]?.v ?? '')
        await pool.end()
        return {
          success: true,
          latencyMs: Date.now() - start,
          driverVersion: 'mysql2',
          serverVersion: version,
          message: 'Connection successful'
        }
      } catch (e) {
        await pool.end().catch(() => {})
        return {
          success: false,
          latencyMs: Date.now() - start,
          driverVersion: 'mysql2',
          serverVersion: null,
          message: e instanceof Error ? e.message : 'Connection failed'
        }
      }
    },

    async listDatabases(connectionId) {
      const pool = getPool(connectionId)
      const [rows] = await pool.query('SHOW DATABASES')
      return (rows as Array<{ Database: string }>).map((r) => r.Database)
    },

    async listSchemas(connectionId, database) {
      return [database]
    },

    async getExplorerTree(connectionId, database = '', schema = '') {
      const pool = getPool(connectionId)

      if (!database) {
        const dbs = await this.listDatabases(connectionId)
        const dbNodes: DbExplorerNode[] = dbs
          .filter((db) => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(db))
          .map((db) => ({
            id: `${connectionId}:db:${db}`,
            type: 'database' as const,
            name: db,
            connectionId,
            database: db,
            schema: db
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

      const db = database
      const [tables] = await pool.query(
        `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
        [db]
      )

      const tableNodes: DbExplorerNode[] = (tables as Array<{ TABLE_NAME: string; TABLE_TYPE: string }>)
        .filter((t) => t.TABLE_TYPE === 'BASE TABLE')
        .map((t) => ({
          id: `${connectionId}:${db}:${db}:table:${t.TABLE_NAME}`,
          type: 'table' as const,
          name: t.TABLE_NAME,
          connectionId,
          database: db,
          schema: db,
          table: t.TABLE_NAME
        }))

      const viewNodes: DbExplorerNode[] = (tables as Array<{ TABLE_NAME: string; TABLE_TYPE: string }>)
        .filter((t) => t.TABLE_TYPE === 'VIEW')
        .map((t) => ({
          id: `${connectionId}:${db}:${db}:view:${t.TABLE_NAME}`,
          type: 'view' as const,
          name: t.TABLE_NAME,
          connectionId,
          database: db,
          schema: db,
          table: t.TABLE_NAME
        }))

      return [
        { id: `${connectionId}:tables`, type: 'schema', name: 'Tables', connectionId, database: db, schema: db, children: tableNodes },
        { id: `${connectionId}:views`, type: 'schema', name: 'Views', connectionId, database: db, schema: db, children: viewNodes }
      ]
    },

    async getTableInfo(connectionId, database, schema, table): Promise<DbTableInfo> {
      const pool = getPool(connectionId)
      const db = database || schema
      const [cols] = await pool.query(
        `SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
        [db, table]
      )
      const [pkRows] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
        [db, table]
      )
      const pkSet = new Set((pkRows as Array<{ COLUMN_NAME: string }>).map((r) => r.COLUMN_NAME))
      const [idxRows] = await pool.query(`SHOW INDEX FROM \`${table}\``)
      const [countRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``).catch(() => [[{ cnt: null }]])

      return {
        name: table,
        schema: db,
        database: db,
        type: 'table',
        rowCount: (countRows as Array<{ cnt: number }>)[0]?.cnt ?? null,
        comment: null,
        columns: mapMySqlColumns(cols as Array<Record<string, unknown>>, pkSet),
        indexes: mapMySqlIndexes(idxRows as Array<Record<string, unknown>>),
        foreignKeys: [],
        constraints: []
      }
    },

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

      const isSelect = /^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)\b/i.test(sql)
      const [result, fields] = await pool.query(sql, options.params ?? [])
      const executionTimeMs = Date.now() - start

      if (isSelect && Array.isArray(result)) {
        const rows = result as Record<string, unknown>[]
        const truncated = rows.length > maxRows
        return {
          columns: (fields ?? []).map((f) => ({ name: f.name, dataType: String(f.type ?? 'unknown') })),
          rows: truncated ? rows.slice(0, maxRows) : rows,
          rowCount: rows.length,
          affectedRows: 0,
          executionTimeMs,
          truncated
        }
      }

      const res = result as mysql.ResultSetHeader
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: res.affectedRows ?? 0,
        executionTimeMs,
        truncated: false
      }
    },

    async fetchDataPage(options: DbDataPageOptions, _ctx): Promise<DbDataPageResult> {
      const pool = getPool(options.connectionId)
      const table = options.table
      const offset = options.offset ?? 0
      const limit = options.limit ?? 100
      let orderClause = ''
      if (options.orderBy?.length) {
        orderClause = ' ORDER BY ' + options.orderBy.map((o) => `\`${o.column}\` ${o.direction.toUpperCase()}`).join(', ')
      }
      const [countRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``)
      const [rows] = await pool.query(`SELECT * FROM \`${table}\`${orderClause} LIMIT ? OFFSET ?`, [limit, offset])
      const info = await createMysqlProvider(providerId, label).getTableInfo(
        options.connectionId,
        options.database,
        options.schema,
        options.table
      )
      return {
        columns: info.columns,
        rows: rows as Record<string, unknown>[],
        totalCount: (countRows as Array<{ cnt: number }>)[0]?.cnt ?? null,
        offset,
        limit
      }
    },

    async saveDataChanges(connectionId, database, schema, table, changes, ctx) {
      if (ctx.readonly || ctx.config.readonly) throw new Error('Connection is in readonly mode')
      const pool = getPool(connectionId)
      const conn = await pool.getConnection()
      let affected = 0
      try {
        await conn.beginTransaction()
        for (const change of changes) {
          if (change.type === 'insert' && change.after) {
            const cols = Object.keys(change.after)
            await conn.query(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => change.after![c]))
            affected++
          } else if (change.type === 'update' && change.after) {
            const sets = Object.keys(change.after).map((c) => `\`${c}\` = ?`).join(', ')
            const pkCols = Object.keys(change.primaryKey)
            const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ')
            await conn.query(`UPDATE \`${table}\` SET ${sets} WHERE ${where}`, [...Object.values(change.after), ...Object.values(change.primaryKey)])
            affected++
          } else if (change.type === 'delete') {
            const pkCols = Object.keys(change.primaryKey)
            const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ')
            await conn.query(`DELETE FROM \`${table}\` WHERE ${where}`, Object.values(change.primaryKey))
            affected++
          }
        }
        await conn.commit()
      } catch (e) {
        await conn.rollback()
        throw e
      } finally {
        conn.release()
      }
      return { affectedRows: affected }
    },

    async previewDdl(_connectionId, operations, _ctx) {
      const statements: string[] = []
      const warnings: string[] = []
      for (const op of operations) {
        if (op.kind === 'add_column') {
          statements.push(`ALTER TABLE \`${String(op.table)}\` ADD COLUMN \`${String(op.column)}\` ${String(op.dataType ?? 'TEXT')}`)
        } else {
          warnings.push(`Unsupported operation: ${String(op.kind)}`)
        }
      }
      return { sql: statements.join(';\n') + (statements.length ? ';' : ''), warnings }
    }
  }
}

export const mysqlProvider = createMysqlProvider('mysql', 'MySQL')
export const mariadbProvider = createMysqlProvider('mariadb', 'MariaDB')
