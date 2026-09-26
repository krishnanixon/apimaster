import { createHash } from 'crypto'
import { dbWorkspaceRepository } from '../repositories/db-workspace.repository'
import { getDbProvider, getAllProviderMeta } from './providers/registry'
import type { ResolvedDbContext } from './providers/types'
import type {
  CreateDbConnectionInput,
  DbAiRequest,
  DbAiResponse,
  DbConnectionTestResult,
  DbDataPageOptions,
  DbDdlPreviewInput,
  DbErDiagram,
  DbExplorerNode,
  DbKnowledgeSyncReport,
  DbQueryOptions,
  DbSaveDataChangesInput,
  DbSchemaCompareInput,
  DbSchemaDiff,
  DbSearchResult,
  DbTableInfo,
  DbWorkspaceSettings,
  UpdateDbConnectionInput,
  DbAiSchemaSnapshot,
  DbAiSchemaTable,
  DbAiSchemaSnapshotInfo
} from '@shared/types/database-workspace'
import { knowledgeRepository } from '../repositories/knowledge.repository'
import { dbWorkspaceAiService } from './db-workspace-ai.service'
import { logger } from '../infra/logger.service'
import { closeSessionTunnel, ensureSessionTunnel, openSshTunnel, type DbSshTunnel } from './ssh-tunnel'
import { getProviderMeta, defaultPortForProvider } from '@shared/types/database-workspace'
import type { DbConnectionConfig, DbConnectionSecrets, DbProviderId } from '@shared/types/database-workspace'

const activeSessions = new Set<string>()
const connectInflight = new Map<string, Promise<void>>()
const aiSchemaCaptureInflight = new Map<string, Promise<DbAiSchemaSnapshot | null>>()
const aiSchemaCapturedAt = new Map<string, number>()
const AI_SCHEMA_RECAPTURE_MS = 60_000
const AI_SCHEMA_MAX_TABLES = 300

/** SSH tunnels forward host/port; URI-based connections keep their own routing. */
function wantsTunnel(config: DbConnectionConfig): boolean {
  return Boolean(config.sshTunnel?.enabled && config.sshTunnel.host && !config.useConnectionString)
}

function throughTunnel(config: DbConnectionConfig, tunnel: DbSshTunnel): DbConnectionConfig {
  return { ...config, host: tunnel.localHost, port: tunnel.localPort }
}

/** Default schema for a provider when the connection does not set one explicitly. */
function defaultSchemaFor(provider: DbProviderId | undefined, database: string): string {
  if (provider === 'sqlite') return 'main'
  if (provider === 'mysql' || provider === 'mariadb' || provider === 'mongodb') return database
  return getProviderMeta(provider).defaultSchema ?? 'public'
}

function collectExplorerObjects(nodes: DbExplorerNode[]): DbExplorerNode[] {
  const out: DbExplorerNode[] = []
  for (const node of nodes) {
    if ((node.type === 'table' || node.type === 'view' || node.type === 'collection') && node.table) out.push(node)
    if (node.children?.length) out.push(...collectExplorerObjects(node.children))
  }
  return out
}

function toAiSchemaInfo(snapshot: DbAiSchemaSnapshot | null): DbAiSchemaSnapshotInfo | null {
  if (!snapshot) return null
  return {
    connectionId: snapshot.connectionId,
    database: snapshot.database,
    schema: snapshot.schema,
    capturedAt: snapshot.capturedAt,
    tableCount: snapshot.tableCount
  }
}

function compactTableForAi(info: DbTableInfo, kind: 'table' | 'view'): DbAiSchemaTable {
  return {
    table: info.name,
    kind,
    columns: info.columns.map((c) => ({
      name: c.name,
      type: c.dataType,
      ...(c.isPrimaryKey ? { pk: true } : {}),
      ...(c.isForeignKey ? { fk: true } : {}),
      ...(c.nullable ? { nullable: true } : {}),
      ...(c.isUnique ? { unique: true } : {})
    })),
    foreignKeys: info.foreignKeys.map((fk) => ({
      column: fk.column,
      referencedTable: fk.referencedTable,
      referencedColumn: fk.referencedColumn
    })),
    indexes: info.indexes.map((idx) => ({
      name: idx.name,
      columns: idx.columns,
      ...(idx.unique ? { unique: true } : {}),
      ...(idx.primary ? { primary: true } : {})
    }))
  }
}

class DbWorkspaceService {
  async listProviders() {
    return getAllProviderMeta()
  }

  private async resolveContext(connectionId: string): Promise<ResolvedDbContext> {
    const connection = await dbWorkspaceRepository.getConnection(connectionId)
    if (!connection) throw new Error('Connection not found')
    const secrets = await dbWorkspaceRepository.getConnectionSecrets(connectionId)
    const provider = getDbProvider(connection.provider)
    let config = connection.config
    if (wantsTunnel(config)) {
      const tunnel = await ensureSessionTunnel(
        connectionId,
        config,
        secrets,
        defaultPortForProvider(connection.provider) ?? 0
      )
      config = throughTunnel(config, tunnel)
    }
    return {
      connectionId,
      config,
      secrets,
      readonly: connection.config.readonly ?? false,
      provider
    }
  }

  async listConnections(filter?: Parameters<typeof dbWorkspaceRepository.listConnections>[0]) {
    return dbWorkspaceRepository.listConnections(filter)
  }

  async getConnection(id: string) {
    return dbWorkspaceRepository.getConnection(id)
  }

  async getConnectionSecrets(id: string) {
    return dbWorkspaceRepository.getConnectionSecrets(id)
  }

  async createConnection(input: CreateDbConnectionInput) {
    return dbWorkspaceRepository.createConnection(input)
  }

  async updateConnection(id: string, input: UpdateDbConnectionInput) {
    const updated = await dbWorkspaceRepository.updateConnection(id, input)
    // Connection settings changed: drop the live session so the next use reconnects with them
    if (input.config || input.secrets) await this.disconnect(id)
    return updated
  }

  async deleteConnection(id: string) {
    await this.disconnect(id)
    return dbWorkspaceRepository.deleteConnection(id)
  }

  async duplicateConnection(id: string) {
    return dbWorkspaceRepository.duplicateConnection(id)
  }

  async testConnection(connectionId: string): Promise<DbConnectionTestResult> {
    const ctx = await this.resolveContext(connectionId)
    const result = await ctx.provider.testConnection(ctx)
    await dbWorkspaceRepository.updateConnectionHealth(
      connectionId,
      result.success ? 'healthy' : 'offline',
      result.latencyMs,
      result.driverVersion
    )
    return result
  }

  async testConnectionConfig(input: CreateDbConnectionInput & { id?: string }): Promise<DbConnectionTestResult> {
    const provider = getDbProvider(input.provider)
    const secrets = await this.mergeStoredSecrets(input.id, input.secrets)
    let tunnel: DbSshTunnel | null = null
    let config = input.config
    const start = Date.now()
    try {
      if (wantsTunnel(config)) {
        tunnel = await openSshTunnel(config, secrets, defaultPortForProvider(input.provider) ?? 0)
        config = throughTunnel(config, tunnel)
      }
      const result = await provider.testConnection({ connectionId: 'test', config, secrets, readonly: true })
      return tunnel && result.success ? { ...result, message: `${result.message} (via SSH tunnel)` } : result
    } catch (e) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        driverVersion: provider.driverVersion,
        serverVersion: null,
        message: e instanceof Error ? e.message : 'Connection failed'
      }
    } finally {
      await tunnel?.close()
    }
  }

  /**
   * When editing a saved connection the form may leave secret fields blank ("unchanged").
   * Fill those gaps from the stored, encrypted secrets.
   */
  private async mergeStoredSecrets(id: string | undefined, secrets?: DbConnectionSecrets): Promise<DbConnectionSecrets> {
    const provided = secrets ?? {}
    if (!id) return provided
    const stored = await dbWorkspaceRepository.getConnectionSecrets(id).catch(() => ({}) as DbConnectionSecrets)
    const merged: DbConnectionSecrets = { ...stored }
    for (const [key, value] of Object.entries(provided) as Array<[keyof DbConnectionSecrets, string | undefined]>) {
      if (value) merged[key] = value
    }
    return merged
  }

  async connect(connectionId: string): Promise<void> {
    if (activeSessions.has(connectionId)) return

    const inflight = connectInflight.get(connectionId)
    if (inflight) return inflight

    const task = (async () => {
      const ctx = await this.resolveContext(connectionId)
      try {
        await ctx.provider.connect(ctx)
      } catch (e) {
        await closeSessionTunnel(connectionId)
        await dbWorkspaceRepository.updateConnectionHealth(connectionId, 'offline', null, ctx.provider.driverVersion)
        throw e
      }
      activeSessions.add(connectionId)
      await dbWorkspaceRepository.updateConnectionHealth(
        connectionId,
        'healthy',
        null,
        ctx.provider.driverVersion
      )
    })().finally(() => {
      connectInflight.delete(connectionId)
    })

    connectInflight.set(connectionId, task)
    return task
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = await dbWorkspaceRepository.getConnection(connectionId)
    if (!connection) return
    try {
      const provider = getDbProvider(connection.provider)
      await provider.disconnect(connectionId)
    } catch (e) {
      logger.warn(`Disconnect error: ${e}`, 'DbWorkspace')
    }
    await closeSessionTunnel(connectionId)
    activeSessions.delete(connectionId)
  }

  async listDatabases(connectionId: string): Promise<string[]> {
    await this.ensureConnected(connectionId)
    const ctx = await this.resolveContext(connectionId)
    return ctx.provider.listDatabases(connectionId)
  }

  async listSchemas(connectionId: string, database: string): Promise<string[]> {
    await this.ensureConnected(connectionId)
    const ctx = await this.resolveContext(connectionId)
    return ctx.provider.listSchemas(connectionId, database)
  }

  async getExplorerTree(connectionId: string, database?: string, schema?: string): Promise<DbExplorerNode[]> {
    await this.ensureConnected(connectionId)
    const ctx = await this.resolveContext(connectionId)
    const connection = await dbWorkspaceRepository.getConnection(connectionId)
    const provider = connection?.provider

    let db = database ?? connection?.config.database ?? ''
    if (provider === 'sqlite') {
      db = db || 'main'
    }
    const sch =
      (provider === 'mongodb' ? db : undefined) ??
      schema ??
      connection?.config.schema ??
      connection?.config.defaultSchema ??
      defaultSchemaFor(provider, db)

    const children = await ctx.provider.getExplorerTree(connectionId, db || undefined, sch)
    const tree: DbExplorerNode[] = [
      {
        id: connectionId,
        type: 'connection',
        name: connection?.name ?? connectionId,
        connectionId,
        children
      }
    ]
    if (db) {
      void this.captureAiSchema(connectionId, db, sch).catch((e) => {
        logger.warn(`AI schema capture failed: ${e}`, 'DbWorkspace')
      })
    }
    return tree
  }

  async getSavedAiSchema(
    connectionId: string,
    database: string,
    schema: string
  ): Promise<DbAiSchemaSnapshot | null> {
    const row = await dbWorkspaceRepository.getAiSchemaSnapshot(connectionId, database, schema)
    if (!row) return null
    try {
      return JSON.parse(row.schemaJson) as DbAiSchemaSnapshot
    } catch {
      return null
    }
  }

  async captureAiSchema(
    connectionId: string,
    database: string,
    schema: string,
    force = false
  ): Promise<DbAiSchemaSnapshot | null> {
    const key = `${connectionId}::${database}::${schema}`
    const inflight = aiSchemaCaptureInflight.get(key)
    if (inflight) return inflight

    const last = aiSchemaCapturedAt.get(key) ?? 0
    if (!force && Date.now() - last < AI_SCHEMA_RECAPTURE_MS) {
      return this.getSavedAiSchema(connectionId, database, schema)
    }

    const task = (async () => {
      await this.ensureConnected(connectionId)
      const ctx = await this.resolveContext(connectionId)
      const tree = await ctx.provider.getExplorerTree(connectionId, database, schema)
      const objects = collectExplorerObjects(tree).slice(0, AI_SCHEMA_MAX_TABLES)
      if (objects.length === 0) return null

      const tables: DbAiSchemaTable[] = []
      for (const node of objects) {
        if (!node.table) continue
        try {
          const info = await ctx.provider.getTableInfo(
            connectionId,
            node.database ?? database,
            node.schema ?? schema,
            node.table
          )
          tables.push(compactTableForAi(info, node.type === 'view' ? 'view' : 'table'))
        } catch (e) {
          logger.warn(`AI schema skip ${node.table}: ${e}`, 'DbWorkspace')
        }
      }

      const snapshot: DbAiSchemaSnapshot = {
        connectionId,
        database,
        schema,
        capturedAt: new Date().toISOString(),
        tableCount: tables.length,
        tables
      }
      await dbWorkspaceRepository.upsertAiSchemaSnapshot(
        connectionId,
        database,
        schema,
        JSON.stringify(snapshot)
      )
      aiSchemaCapturedAt.set(key, Date.now())
      logger.info(
        `Saved AI schema snapshot: ${database}.${schema} (${tables.length} tables)`,
        'DbWorkspace'
      )
      return snapshot
    })().finally(() => {
      aiSchemaCaptureInflight.delete(key)
    })

    aiSchemaCaptureInflight.set(key, task)
    return task
  }

  async getAiSchemaInfo(
    connectionId: string,
    database: string,
    schema: string
  ): Promise<DbAiSchemaSnapshotInfo | null> {
    const key = `${connectionId}::${database}::${schema}`
    const inflight = aiSchemaCaptureInflight.get(key)
    if (inflight) return toAiSchemaInfo(await inflight)
    const saved = await this.getSavedAiSchema(connectionId, database, schema)
    if (saved) return toAiSchemaInfo(saved)
    return toAiSchemaInfo(await this.captureAiSchema(connectionId, database, schema, false))
  }

  async resyncAiSchema(
    connectionId: string,
    database: string,
    schema: string
  ): Promise<DbAiSchemaSnapshotInfo | null> {
    const key = `${connectionId}::${database}::${schema}`
    const inflight = aiSchemaCaptureInflight.get(key)
    if (inflight) await inflight
    aiSchemaCapturedAt.delete(key)
    return toAiSchemaInfo(await this.captureAiSchema(connectionId, database, schema, true))
  }

  async getTableInfo(connectionId: string, database: string, schema: string, table: string): Promise<DbTableInfo> {
    await this.ensureConnected(connectionId)
    const ctx = await this.resolveContext(connectionId)
    return ctx.provider.getTableInfo(connectionId, database, schema, table)
  }

  async executeQuery(options: DbQueryOptions) {
    const settings = await dbWorkspaceRepository.getSettings()
    await this.ensureConnected(options.connectionId)
    const ctx = await this.resolveContext(options.connectionId)
    const merged: DbQueryOptions = {
      ...options,
      maxRows: options.maxRows ?? settings.maxRows,
      timeoutMs: options.timeoutMs ?? settings.queryTimeoutMs
    }
    const start = Date.now()
    try {
      const result = await ctx.provider.executeQuery(merged, ctx)
      await dbWorkspaceRepository.addQueryHistory({
        connectionId: options.connectionId,
        sql: options.sql,
        executionTimeMs: result.executionTimeMs,
        rowCount: result.rowCount,
        success: true,
        error: null,
        executedAt: new Date().toISOString()
      })
      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Query failed'
      await dbWorkspaceRepository.addQueryHistory({
        connectionId: options.connectionId,
        sql: options.sql,
        executionTimeMs: Date.now() - start,
        rowCount: 0,
        success: false,
        error: msg,
        executedAt: new Date().toISOString()
      })
      throw e
    }
  }

  async fetchDataPage(options: DbDataPageOptions) {
    await this.ensureConnected(options.connectionId)
    const ctx = await this.resolveContext(options.connectionId)
    const settings = await dbWorkspaceRepository.getSettings()
    return ctx.provider.fetchDataPage(
      { ...options, limit: options.limit ?? settings.maxRows },
      ctx
    )
  }

  async saveDataChanges(input: DbSaveDataChangesInput) {
    await this.ensureConnected(input.connectionId)
    const ctx = await this.resolveContext(input.connectionId)
    return ctx.provider.saveDataChanges(
      input.connectionId,
      input.database,
      input.schema,
      input.table,
      input.changes,
      ctx
    )
  }

  async previewDdl(input: DbDdlPreviewInput) {
    const ctx = await this.resolveContext(input.connectionId)
    return ctx.provider.previewDdl(input.connectionId, input.operations, ctx)
  }

  async getSettings(): Promise<DbWorkspaceSettings> {
    return dbWorkspaceRepository.getSettings()
  }

  async saveSettings(settings: Partial<DbWorkspaceSettings>): Promise<DbWorkspaceSettings> {
    return dbWorkspaceRepository.saveSettings(settings)
  }

  async listQueryHistory(connectionId?: string, limit?: number) {
    return dbWorkspaceRepository.listQueryHistory(connectionId, limit)
  }

  async listSavedQueries(filter?: Parameters<typeof dbWorkspaceRepository.listSavedQueries>[0]) {
    return dbWorkspaceRepository.listSavedQueries(filter)
  }

  async saveQuery(input: Parameters<typeof dbWorkspaceRepository.saveQuery>[0]) {
    return dbWorkspaceRepository.saveQuery(input)
  }

  async deleteSavedQuery(id: string) {
    return dbWorkspaceRepository.deleteSavedQuery(id)
  }

  async listTableLinks(connectionId: string, table?: string) {
    return dbWorkspaceRepository.listTableLinks(connectionId, table)
  }

  async createTableLink(input: Parameters<typeof dbWorkspaceRepository.createTableLink>[0]) {
    return dbWorkspaceRepository.createTableLink(input)
  }

  async search(query: string, connectionId?: string): Promise<DbSearchResult[]> {
    const q = query.toLowerCase()
    const results: DbSearchResult[] = []
    const connections = connectionId
      ? [await dbWorkspaceRepository.getConnection(connectionId)].filter(Boolean)
      : await dbWorkspaceRepository.listConnections()

    for (const conn of connections) {
      if (!conn) continue
      if (conn.name.toLowerCase().includes(q)) {
        results.push({ id: conn.id, type: 'connection', name: conn.name, connectionId: conn.id, path: conn.name })
      }
      try {
        const tree = await this.getExplorerTree(conn.id)
        this.flattenExplorer(tree, results, q, conn.id)
      } catch {
        // skip unreachable connections
      }
    }

    const saved = await dbWorkspaceRepository.listSavedQueries()
    for (const sq of saved) {
      if (sq.name.toLowerCase().includes(q) || sq.sql.toLowerCase().includes(q)) {
        results.push({
          id: sq.id,
          type: 'saved_query',
          name: sq.name,
          connectionId: sq.connectionId ?? undefined,
          path: sq.name,
          snippet: sq.sql.slice(0, 120)
        })
      }
    }
    return results.slice(0, 50)
  }

  private flattenExplorer(nodes: DbExplorerNode[], results: DbSearchResult[], q: string, connectionId: string, path = '') {
    for (const node of nodes) {
      const nodePath = path ? `${path} › ${node.name}` : node.name
      if (node.name.toLowerCase().includes(q)) {
        results.push({
          id: node.id,
          type: node.type,
          name: node.name,
          connectionId,
          path: nodePath
        })
      }
      if (node.children) this.flattenExplorer(node.children, results, q, connectionId, nodePath)
    }
  }

  async generateErDiagram(connectionId: string, database: string, schema: string): Promise<DbErDiagram> {
    await this.ensureConnected(connectionId)
    const ctx = await this.resolveContext(connectionId)
    const tree = await ctx.provider.getExplorerTree(connectionId, database, schema)
    const tableNodes = tree.flatMap((g) => g.children ?? []).filter((n) => n.type === 'table')
    const nodes: DbErDiagram['nodes'] = []
    const edges: DbErDiagram['edges'] = []

    let x = 0
    for (const t of tableNodes) {
      if (!t.table) continue
      const info = await ctx.provider.getTableInfo(connectionId, database, schema, t.table)
      nodes.push({
        id: t.id,
        table: t.table,
        schema,
        columns: info.columns,
        x: x % 800,
        y: Math.floor(x / 800) * 300,
        collapsed: false
      })
      for (const fk of info.foreignKeys) {
        edges.push({
          id: `${t.table}-${fk.name}`,
          sourceTable: t.table,
          targetTable: fk.referencedTable,
          sourceColumn: fk.column,
          targetColumn: fk.referencedColumn,
          label: fk.name
        })
      }
      x += 280
    }
    return { nodes, edges }
  }

  async compareSchema(input: DbSchemaCompareInput): Promise<DbSchemaDiff> {
    const sourceConn = await dbWorkspaceRepository.getConnection(input.sourceConnectionId)
    if (!sourceConn) throw new Error('Source connection not found')

    await this.ensureConnected(input.sourceConnectionId)
    const ctx = await this.resolveContext(input.sourceConnectionId)
    const db = sourceConn.config.database ?? 'main'
    const schema = sourceConn.config.schema ?? sourceConn.config.defaultSchema ?? 'public'
    const sourceTree = await ctx.provider.getExplorerTree(input.sourceConnectionId, db, schema)
    const sourceTables = new Set(
      sourceTree.flatMap((g) => g.children ?? []).filter((n) => n.type === 'table').map((n) => n.name)
    )

    let targetTables = new Set<string>()
    if (input.targetConnectionId) {
      const targetCtx = await this.resolveContext(input.targetConnectionId)
      await this.ensureConnected(input.targetConnectionId)
      const targetConn = await dbWorkspaceRepository.getConnection(input.targetConnectionId)
      const tDb = targetConn?.config.database ?? db
      const tSchema = targetConn?.config.schema ?? schema
      const targetTree = await targetCtx.provider.getExplorerTree(input.targetConnectionId, tDb, tSchema)
      targetTables = new Set(
        targetTree.flatMap((g) => g.children ?? []).filter((n) => n.type === 'table').map((n) => n.name)
      )
    } else if (input.targetSnapshotId) {
      const snapshots = await dbWorkspaceRepository.listSnapshots(input.sourceConnectionId)
      const snap = snapshots.find((s) => s.id === input.targetSnapshotId)
      if (snap) {
        const parsed = JSON.parse(snap.schemaJson) as { tables?: string[] }
        targetTables = new Set(parsed.tables ?? [])
      }
    } else if (input.projectId) {
      const bundle = await knowledgeRepository.loadBundle(input.projectId)
      targetTables = new Set((bundle.entities ?? []).map((e) => e.name))
    }

    const added = [...targetTables].filter((t) => !sourceTables.has(t))
    const removed = [...sourceTables].filter((t) => !targetTables.has(t))

    return { addedTables: added, removedTables: removed, modifiedTables: [] }
  }

  async syncKnowledgeReport(connectionId: string, projectId: string, database: string, schema: string): Promise<DbKnowledgeSyncReport> {
    await this.ensureConnected(connectionId)
    const ctx = await this.resolveContext(connectionId)
    const tree = await ctx.provider.getExplorerTree(connectionId, database, schema)
    const dbTables = tree.flatMap((g) => g.children ?? []).filter((n) => n.type === 'table')
    const dbTableMap = new Map<string, DbTableInfo>()
    for (const t of dbTables) {
      if (!t.table) continue
      dbTableMap.set(t.table.toLowerCase(), await ctx.provider.getTableInfo(connectionId, database, schema, t.table))
    }

    const bundle = await knowledgeRepository.loadBundle(projectId)
    const entities = bundle.entities ?? []
    const entityNames = new Set(entities.map((e) => e.name.toLowerCase()))

    const missingTables = entities.filter((e) => !dbTableMap.has(e.name.toLowerCase())).map((e) => e.name)
    const missingAttributes: DbKnowledgeSyncReport['missingAttributes'] = []
    const extraColumns: DbKnowledgeSyncReport['extraColumns'] = []
    const namingMismatches: DbKnowledgeSyncReport['namingMismatches'] = []

    for (const entity of entities) {
      const table = dbTableMap.get(entity.name.toLowerCase())
      if (!table) continue
      const entityFields = (JSON.parse(entity.fields || '[]') as Array<{ name: string }>).map((f) => f.name.toLowerCase())
      const colNames = table.columns.map((c) => c.name.toLowerCase())
      for (const field of entityFields) {
        if (!colNames.includes(field)) {
          missingAttributes.push({ entity: entity.name, attribute: field })
        }
      }
      for (const col of colNames) {
        if (!entityFields.includes(col)) {
          extraColumns.push({ table: entity.name, column: col })
        }
      }
      if (entity.name.toLowerCase() !== table.name.toLowerCase() && entity.name.toLowerCase() === table.name.toLowerCase()) {
        // exact match skip
      } else if (entity.name !== table.name && entity.name.toLowerCase() === table.name.toLowerCase()) {
        namingMismatches.push({ entity: entity.name, expected: entity.name, actual: table.name })
      }
    }

    const orphanTables = [...dbTableMap.keys()].filter((t) => !entityNames.has(t))

    return {
      missingTables,
      missingAttributes,
      extraColumns,
      relationshipMismatches: [],
      namingMismatches,
      ...(orphanTables.length ? { missingTables: [...missingTables, ...orphanTables.map((t) => dbTableMap.get(t)!.name)] } : {})
    } as DbKnowledgeSyncReport
  }

  async runAi(request: DbAiRequest): Promise<DbAiResponse> {
    const settings = await dbWorkspaceRepository.getSettings()
    if (!settings.aiEnabled) throw new Error('AI is disabled in Database Workspace settings')
    const liveContext =
      request.action === 'natural_language' ||
      Boolean(request.selectedRows?.length) ||
      Boolean(request.rowSample?.length) ||
      Boolean(request.queryResult) ||
      Boolean(request.conversation?.length)
    if (!liveContext) {
      const cacheKey = createHash('sha256').update(JSON.stringify(request)).digest('hex')
      const cached = await dbWorkspaceRepository.getAiCache(request.connectionId, request.action, cacheKey)
      if (cached) return { content: cached, cached: true, action: request.action }
      const content = await dbWorkspaceAiService.run(request)
      await dbWorkspaceRepository.setAiCache(request.connectionId, request.action, cacheKey, content)
      return { content, cached: false, action: request.action }
    }
    const content = await dbWorkspaceAiService.run(request)
    return { content, cached: false, action: request.action }
  }

  async exportConnections(connectionIds: string[], includeSecrets = false) {
    const connections = []
    for (const id of connectionIds) {
      const conn = await dbWorkspaceRepository.getConnection(id)
      if (!conn) continue
      const payload: Record<string, unknown> = { ...conn }
      if (includeSecrets) {
        payload.secrets = await dbWorkspaceRepository.getConnectionSecrets(id)
      }
      delete payload.id
      connections.push(payload)
    }
    return JSON.stringify({ version: 1, connections }, null, 2)
  }

  async importConnections(payload: string, scope: CreateDbConnectionInput['scope'], projectId?: string | null) {
    const parsed = JSON.parse(payload) as { connections: Array<CreateDbConnectionInput & { secrets?: Record<string, string> }> }
    const created = []
    for (const item of parsed.connections ?? []) {
      const conn = await dbWorkspaceRepository.createConnection({
        name: item.name,
        provider: item.provider,
        scope,
        projectId: projectId ?? null,
        folderId: item.folderId,
        config: item.config,
        notes: item.notes,
        tags: item.tags,
        secrets: item.secrets,
        vaultItemId: item.vaultItemId
      })
      created.push(conn)
    }
    return created
  }

  async createSnapshot(connectionId: string, label: string) {
    const conn = await dbWorkspaceRepository.getConnection(connectionId)
    if (!conn) throw new Error('Connection not found')
    await this.ensureConnected(connectionId)
    const ctx = await this.resolveContext(connectionId)
    const db = conn.config.database ?? 'main'
    const schema = conn.config.schema ?? conn.config.defaultSchema ?? 'public'
    const tree = await ctx.provider.getExplorerTree(connectionId, db, schema)
    const tables = tree.flatMap((g) => g.children ?? []).filter((n) => n.type === 'table').map((n) => n.name)
    return dbWorkspaceRepository.createSnapshot(connectionId, label, JSON.stringify({ tables, capturedAt: new Date().toISOString() }))
  }

  async listSnapshots(connectionId: string) {
    return dbWorkspaceRepository.listSnapshots(connectionId)
  }

  async listFolders(filter?: Parameters<typeof dbWorkspaceRepository.listFolders>[0]) {
    return dbWorkspaceRepository.listFolders(filter)
  }

  async createFolder(input: Parameters<typeof dbWorkspaceRepository.createFolder>[0]) {
    return dbWorkspaceRepository.createFolder(input)
  }

  private async ensureConnected(connectionId: string): Promise<void> {
    if (activeSessions.has(connectionId)) return
    const settings = await dbWorkspaceRepository.getSettings()
    if (settings.autoReconnect) {
      await this.connect(connectionId)
      return
    }
    throw new Error('Not connected. Connect to the database first.')
  }
}

export const dbWorkspaceService = new DbWorkspaceService()
