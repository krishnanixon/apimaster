import sql from 'mssql'
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

const pools = new Map<string, sql.ConnectionPool>()

function getPool(connectionId: string): sql.ConnectionPool {
  const pool = pools.get(connectionId)
  if (!pool) throw new Error('SQL Server connection not open')
  return pool
}

function buildConfig(ctx: DbProviderContext): sql.config {
  const { config, secrets } = ctx
  return {
    server: config.host ?? 'localhost',
    port: config.port ?? 1433,
    database: config.database,
    user: config.username,
    password: secrets.password,
    options: {
      encrypt: config.ssl?.enabled ?? true,
      trustServerCertificate: !config.ssl?.rejectUnauthorized,
      appName: config.applicationName || 'Tessarok Database Workbench'
    },
    pool: { max: config.pool?.max ?? 5, idleTimeoutMillis: config.pool?.idleTimeoutMs ?? 30_000 },
    connectionTimeout: config.connectionTimeoutMs ?? 10_000,
    requestTimeout: config.queryTimeoutMs ?? 30_000
  }
}

export class MssqlProvider implements DbProvider {
  id: DbProviderId = 'mssql'
  label = 'Microsoft SQL Server'
  driverVersion = 'mssql'

  async connect(ctx: DbProviderContext): Promise<void> {
    const existing = pools.get(ctx.connectionId)
    if (existing?.connected) return

    if (existing) {
      await this.disconnect(ctx.connectionId)
    }
    const pool = await new sql.ConnectionPool(buildConfig(ctx)).connect()
    pools.set(ctx.connectionId, pool)
  }

  async disconnect(connectionId: string): Promise<void> {
    const pool = pools.get(connectionId)
    if (pool) {
      await pool.close()
      pools.delete(connectionId)
    }
  }

  async testConnection(ctx: DbProviderContext): Promise<DbConnectionTestResult> {
    const start = Date.now()
    try {
      const pool = await new sql.ConnectionPool(buildConfig(ctx)).connect()
      const res = await pool.request().query('SELECT @@VERSION AS v')
      const version = String(res.recordset[0]?.v ?? '')
      await pool.close()
      return {
        success: true,
        latencyMs: Date.now() - start,
        driverVersion: this.driverVersion,
        serverVersion: version,
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
    }
  }

  async listDatabases(connectionId: string): Promise<string[]> {
    const pool = getPool(connectionId)
    const res = await pool.request().query('SELECT name FROM sys.databases ORDER BY name')
    return res.recordset.map((r: { name: string }) => r.name)
  }

  async listSchemas(connectionId: string, _database: string): Promise<string[]> {
    const pool = getPool(connectionId)
    const res = await pool.request().query('SELECT name FROM sys.schemas ORDER BY name')
    return res.recordset.map((r: { name: string }) => r.name)
  }

  async getExplorerTree(connectionId: string, database = 'master', schema = 'dbo'): Promise<DbExplorerNode[]> {
    const pool = getPool(connectionId)
    const res = await pool.request().input('schema', sql.NVarChar, schema).query(`
      SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = @schema ORDER BY TABLE_NAME
    `)

    const tableNodes: DbExplorerNode[] = res.recordset
      .filter((r: { TABLE_TYPE: string }) => r.TABLE_TYPE === 'BASE TABLE')
      .map((r: { TABLE_NAME: string }) => ({
        id: `${connectionId}:${database}:${schema}:table:${r.TABLE_NAME}`,
        type: 'table' as const,
        name: r.TABLE_NAME,
        connectionId,
        database,
        schema,
        table: r.TABLE_NAME
      }))

    const viewNodes: DbExplorerNode[] = res.recordset
      .filter((r: { TABLE_TYPE: string }) => r.TABLE_TYPE === 'VIEW')
      .map((r: { TABLE_NAME: string }) => ({
        id: `${connectionId}:${database}:${schema}:view:${r.TABLE_NAME}`,
        type: 'view' as const,
        name: r.TABLE_NAME,
        connectionId,
        database,
        schema,
        table: r.TABLE_NAME
      }))

    return [
      { id: `${connectionId}:tables`, type: 'schema', name: 'Tables', connectionId, database, schema, children: tableNodes },
      { id: `${connectionId}:views`, type: 'schema', name: 'Views', connectionId, database, schema, children: viewNodes }
    ]
  }

  async getTableInfo(connectionId: string, database: string, schema: string, table: string): Promise<DbTableInfo> {
    const pool = getPool(connectionId)
    const cols = await pool
      .request()
      .input('schema', sql.NVarChar, schema)
      .input('table', sql.NVarChar, table)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table ORDER BY ORDINAL_POSITION
      `)

    return {
      name: table,
      schema,
      database,
      type: 'table',
      rowCount: null,
      comment: null,
      columns: cols.recordset.map((c: Record<string, unknown>, i: number) => ({
        name: String(c.COLUMN_NAME),
        dataType: String(c.DATA_TYPE),
        nullable: c.IS_NULLABLE === 'YES',
        defaultValue: c.COLUMN_DEFAULT != null ? String(c.COLUMN_DEFAULT) : null,
        isPrimaryKey: false,
        isForeignKey: false,
        isUnique: false,
        isAutoIncrement: false,
        isGenerated: false,
        comment: null,
        maxLength: null,
        precision: null,
        scale: null,
        ordinalPosition: Number(c.ORDINAL_POSITION ?? i + 1)
      })),
      indexes: [],
      foreignKeys: [],
      constraints: []
    }
  }

  async executeQuery(options: DbQueryOptions, ctx: DbProviderContext): Promise<DbQueryResult> {
    const pool = getPool(options.connectionId)
    const start = Date.now()
    const maxRows = options.maxRows ?? 1000
    const sqlText = options.sql.trim()

    if (ctx.readonly || ctx.config.readonly) {
      if (/^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/i.test(sqlText)) {
        throw new Error('Connection is in readonly mode')
      }
    }

    const isSelect = /^\s*(SELECT|WITH|EXEC|EXPLAIN)\b/i.test(sqlText)
    const res = await pool.request().query(sqlText)
    const executionTimeMs = Date.now() - start

    if (isSelect && res.recordset) {
      const rows = res.recordset as Record<string, unknown>[]
      const truncated = rows.length > maxRows
      const columns =
        rows.length > 0
          ? Object.keys(rows[0]).map((name) => ({ name, dataType: typeof rows[0][name] as string }))
          : []
      return {
        columns,
        rows: truncated ? rows.slice(0, maxRows) : rows,
        rowCount: rows.length,
        affectedRows: 0,
        executionTimeMs,
        truncated
      }
    }

    return {
      columns: [],
      rows: [],
      rowCount: 0,
      affectedRows: res.rowsAffected?.[0] ?? 0,
      executionTimeMs,
      truncated: false
    }
  }

  async fetchDataPage(options: DbDataPageOptions, _ctx: DbProviderContext): Promise<DbDataPageResult> {
    const pool = getPool(options.connectionId)
    const schema = options.schema
    const table = options.table
    const offset = options.offset ?? 0
    const limit = options.limit ?? 100
    const countRes = await pool.request().query(`SELECT COUNT(*) AS cnt FROM [${schema}].[${table}]`)
    const dataRes = await pool.request().query(
      `SELECT * FROM [${schema}].[${table}] ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
    )
    const info = await this.getTableInfo(options.connectionId, options.database, schema, table)
    return {
      columns: info.columns,
      rows: dataRes.recordset as Record<string, unknown>[],
      totalCount: countRes.recordset[0]?.cnt ?? null,
      offset,
      limit
    }
  }

  async saveDataChanges(
    _connectionId: string,
    _database: string,
    _schema: string,
    _table: string,
    _changes: DbRowChange[],
    ctx: DbProviderContext
  ): Promise<{ affectedRows: number }> {
    if (ctx.readonly || ctx.config.readonly) throw new Error('Connection is in readonly mode')
    throw new Error('SQL Server data editing not yet implemented for this provider')
  }

  async previewDdl(
    _connectionId: string,
    operations: Array<Record<string, unknown>>,
    _ctx: DbProviderContext
  ): Promise<{ sql: string; warnings: string[] }> {
    const statements: string[] = []
    const warnings: string[] = []
    for (const op of operations) {
      if (op.kind === 'add_column') {
        statements.push(
          `ALTER TABLE [${String(op.schema ?? 'dbo')}].[${String(op.table)}] ADD [${String(op.column)}] ${String(op.dataType ?? 'NVARCHAR(MAX)')}`
        )
      } else {
        warnings.push(`Unsupported operation: ${String(op.kind)}`)
      }
    }
    return { sql: statements.join(';\n') + (statements.length ? ';' : ''), warnings }
  }
}

export const mssqlProvider = new MssqlProvider()
