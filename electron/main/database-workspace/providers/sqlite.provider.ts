import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import type {
  DbColumnInfo,
  DbConnectionConfig,
  DbConnectionSecrets,
  DbConnectionTestResult,
  DbDataPageOptions,
  DbDataPageResult,
  DbExplorerNode,
  DbForeignKeyInfo,
  DbIndexInfo,
  DbProviderId,
  DbQueryOptions,
  DbQueryResult,
  DbRowChange,
  DbTableInfo
} from '@shared/types/database-workspace'
import type { DbProvider, DbProviderContext } from './types'

const sessions = new Map<string, Database.Database>()

function getDb(connectionId: string): Database.Database {
  const db = sessions.get(connectionId)
  if (!db) throw new Error('SQLite connection not open')
  return db
}

function quoteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export class SqliteProvider implements DbProvider {
  id: DbProviderId = 'sqlite'
  label = 'SQLite'
  driverVersion = 'better-sqlite3'

  async connect(ctx: DbProviderContext): Promise<void> {
    const existing = sessions.get(ctx.connectionId)
    if (existing?.open) {
      try {
        existing.prepare('SELECT 1').get()
        return
      } catch {
        await this.disconnect(ctx.connectionId)
      }
    }
    const filePath = ctx.config.filePath
    if (!filePath) throw new Error('SQLite file path is required')
    if (!existsSync(filePath)) throw new Error(`SQLite file not found: ${filePath}`)
    const db = new Database(filePath, { readonly: ctx.readonly || ctx.config.readonly })
    sessions.set(ctx.connectionId, db)
  }

  async disconnect(connectionId: string): Promise<void> {
    const db = sessions.get(connectionId)
    if (db) {
      db.close()
      sessions.delete(connectionId)
    }
  }

  async testConnection(ctx: DbProviderContext): Promise<DbConnectionTestResult> {
    const start = Date.now()
    try {
      const filePath = ctx.config.filePath
      if (!filePath) {
        return {
          success: false,
          latencyMs: 0,
          driverVersion: this.driverVersion,
          serverVersion: null,
          message: 'SQLite file path is required'
        }
      }
      if (!existsSync(filePath)) {
        return {
          success: false,
          latencyMs: 0,
          driverVersion: this.driverVersion,
          serverVersion: null,
          message: `File not found: ${filePath}`
        }
      }
      const db = new Database(filePath, { readonly: true })
      const version = String(db.pragma('user_version', { simple: true }))
      const sqliteVersion = String(db.prepare('SELECT sqlite_version() AS v').get()?.v ?? '')
      db.close()
      return {
        success: true,
        latencyMs: Date.now() - start,
        driverVersion: this.driverVersion,
        serverVersion: sqliteVersion || version,
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
    return ['main']
  }

  async listSchemas(_connectionId: string, _database: string): Promise<string[]> {
    return ['main']
  }

  async getExplorerTree(connectionId: string, database = 'main', schema = 'main'): Promise<DbExplorerNode[]> {
    const db = getDb(connectionId)
    const tables = db
      .prepare(
        `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as Array<{ name: string; type: string }>

    const tableNodes: DbExplorerNode[] = tables
      .filter((t) => t.type === 'table')
      .map((t) => ({
        id: `${connectionId}:${database}:${schema}:table:${t.name}`,
        type: 'table' as const,
        name: t.name,
        connectionId,
        database,
        schema,
        table: t.name
      }))

    const viewNodes: DbExplorerNode[] = tables
      .filter((t) => t.type === 'view')
      .map((t) => ({
        id: `${connectionId}:${database}:${schema}:view:${t.name}`,
        type: 'view' as const,
        name: t.name,
        connectionId,
        database,
        schema,
        table: t.name
      }))

    const indexRows = db
      .prepare(`SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name`)
      .all() as Array<{ name: string; tbl_name: string }>

    const indexNodes: DbExplorerNode[] = indexRows.map((idx) => ({
      id: `${connectionId}:${database}:${schema}:index:${idx.tbl_name}:${idx.name}`,
      type: 'index' as const,
      name: idx.name,
      connectionId,
      database,
      schema,
      table: idx.tbl_name
    }))

    return [
      {
        id: `${connectionId}:${database}:${schema}:tables`,
        type: 'schema',
        name: 'Tables',
        connectionId,
        database,
        schema,
        children: tableNodes
      },
      {
        id: `${connectionId}:${database}:${schema}:views`,
        type: 'schema',
        name: 'Views',
        connectionId,
        database,
        schema,
        children: viewNodes
      },
      {
        id: `${connectionId}:${database}:${schema}:indexes`,
        type: 'schema',
        name: 'Indexes',
        connectionId,
        database,
        schema,
        children: indexNodes
      }
    ]
  }

  async getTableInfo(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<DbTableInfo> {
    const db = getDb(connectionId)
    const columnsRaw = db.prepare(`PRAGMA table_info(${quoteId(table)})`).all() as Array<{
      cid: number
      name: string
      type: string
      notnull: number
      dflt_value: unknown
      pk: number
    }>

    const fkList = db.prepare(`PRAGMA foreign_key_list(${quoteId(table)})`).all() as Array<{
      id: number
      seq: number
      table: string
      from: string
      to: string
      on_update: string
      on_delete: string
    }>

    const indexList = db.prepare(`PRAGMA index_list(${quoteId(table)})`).all() as Array<{
      name: string
      unique: number
      origin: string
    }>

    const indexes: DbIndexInfo[] = indexList.map((idx) => {
      const cols = db.prepare(`PRAGMA index_info(${quoteId(idx.name)})`).all() as Array<{ name: string }>
      return {
        name: idx.name,
        columns: cols.map((c) => c.name),
        unique: idx.unique === 1,
        primary: idx.origin === 'pk',
        type: 'btree'
      }
    })

    const foreignKeys: DbForeignKeyInfo[] = fkList.map((fk) => ({
      name: `fk_${fk.from}_${fk.table}`,
      column: fk.from,
      referencedTable: fk.table,
      referencedColumn: fk.to,
      onDelete: fk.on_delete,
      onUpdate: fk.on_update
    }))

    const pkCols = new Set(columnsRaw.filter((c) => c.pk > 0).map((c) => c.name))
    const fkCols = new Set(fkList.map((f) => f.from))

    const columns: DbColumnInfo[] = columnsRaw.map((c) => ({
      name: c.name,
      dataType: c.type || 'TEXT',
      nullable: c.notnull === 0,
      defaultValue: c.dflt_value != null ? String(c.dflt_value) : null,
      isPrimaryKey: pkCols.has(c.name),
      isForeignKey: fkCols.has(c.name),
      isUnique: indexes.some((i) => i.unique && i.columns.length === 1 && i.columns[0] === c.name),
      isAutoIncrement: c.type.toUpperCase().includes('INTEGER') && c.pk > 0,
      isGenerated: false,
      comment: null,
      maxLength: null,
      precision: null,
      scale: null,
      ordinalPosition: c.cid + 1,
      referencedTable: fkList.find((f) => f.from === c.name)?.table,
      referencedColumn: fkList.find((f) => f.from === c.name)?.to
    }))

    let rowCount: number | null = null
    try {
      const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM ${quoteId(table)}`).get() as { cnt: number }
      rowCount = countRow.cnt
    } catch {
      rowCount = null
    }

    const isView = Boolean(
      db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = ?`).get(table)
    )

    return {
      name: table,
      schema,
      database,
      type: isView ? 'view' : 'table',
      rowCount,
      comment: null,
      columns,
      indexes,
      foreignKeys,
      constraints: []
    }
  }

  async executeQuery(options: DbQueryOptions, ctx: DbProviderContext): Promise<DbQueryResult> {
    const db = getDb(options.connectionId)
    const start = Date.now()
    const maxRows = options.maxRows ?? 1000
    const sql = options.sql.trim()

    if (ctx.readonly || ctx.config.readonly) {
      const destructive = /^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE)\b/i.test(sql)
      if (destructive) throw new Error('Connection is in readonly mode')
    }

    const isSelect = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql)
    if (isSelect) {
      const stmt = db.prepare(sql)
      const rows = stmt.all(...(options.params ?? [])) as Record<string, unknown>[]
      const truncated = rows.length > maxRows
      const limited = truncated ? rows.slice(0, maxRows) : rows
      const columns =
        limited.length > 0
          ? Object.keys(limited[0]).map((name) => ({ name, dataType: typeof limited[0][name] as string }))
          : stmt.columns().map((c) => ({ name: c.name, dataType: c.type ?? 'unknown' }))

      return {
        columns,
        rows: limited,
        rowCount: limited.length,
        affectedRows: 0,
        executionTimeMs: Date.now() - start,
        truncated
      }
    }

    const result = db.prepare(sql).run(...(options.params ?? []))
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      affectedRows: result.changes,
      executionTimeMs: Date.now() - start,
      truncated: false
    }
  }

  async fetchDataPage(options: DbDataPageOptions, _ctx: DbProviderContext): Promise<DbDataPageResult> {
    const db = getDb(options.connectionId)
    const table = quoteId(options.table)
    const offset = options.offset ?? 0
    const limit = options.limit ?? 100

    let orderClause = ''
    if (options.orderBy?.length) {
      orderClause =
        ' ORDER BY ' +
        options.orderBy.map((o) => `${quoteId(o.column)} ${o.direction.toUpperCase()}`).join(', ')
    }

    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number }
    const rows = db.prepare(`SELECT * FROM ${table}${orderClause} LIMIT ? OFFSET ?`).all(limit, offset) as Record<
      string,
      unknown
    >[]

    const info = await this.getTableInfo(options.connectionId, options.database, options.schema, options.table)

    return {
      columns: info.columns,
      rows,
      totalCount: countRow.cnt,
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
    const db = getDb(connectionId)
    const quoted = quoteId(table)
    let affected = 0

    const run = db.transaction(() => {
      for (const change of changes) {
        if (change.type === 'insert' && change.after) {
          const cols = Object.keys(change.after)
          const placeholders = cols.map(() => '?').join(', ')
          db.prepare(
            `INSERT INTO ${quoted} (${cols.map(quoteId).join(', ')}) VALUES (${placeholders})`
          ).run(...cols.map((c) => change.after![c]))
          affected++
        } else if (change.type === 'update' && change.after) {
          const sets = Object.keys(change.after).map((c) => `${quoteId(c)} = ?`).join(', ')
          const pkCols = Object.keys(change.primaryKey)
          const where = pkCols.map((c) => `${quoteId(c)} = ?`).join(' AND ')
          const values = [...Object.values(change.after), ...Object.values(change.primaryKey)]
          db.prepare(`UPDATE ${quoted} SET ${sets} WHERE ${where}`).run(...values)
          affected++
        } else if (change.type === 'delete') {
          const pkCols = Object.keys(change.primaryKey)
          const where = pkCols.map((c) => `${quoteId(c)} = ?`).join(' AND ')
          db.prepare(`DELETE FROM ${quoted} WHERE ${where}`).run(...Object.values(change.primaryKey))
          affected++
        }
      }
    })
    run()
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
          `ALTER TABLE ${quoteId(String(op.table))} ADD COLUMN ${quoteId(String(op.column))} ${String(op.dataType ?? 'TEXT')}`
        )
      } else if (kind === 'rename_table') {
        statements.push(`ALTER TABLE ${quoteId(String(op.from))} RENAME TO ${quoteId(String(op.to))}`)
      } else {
        warnings.push(`Unsupported operation: ${kind}`)
      }
    }
    return { sql: statements.join(';\n') + (statements.length ? ';' : ''), warnings }
  }
}

export const sqliteProvider = new SqliteProvider()
