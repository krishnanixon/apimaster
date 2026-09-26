import type { AppScope } from './scope'

/** Supported database providers (extensible registry) */
export type DbProviderId =
  | 'sqlite'
  | 'mysql'
  | 'mariadb'
  | 'postgresql'
  | 'mssql'
  | 'mongodb'
  | 'redis'
  | 'oracle'
  | 'snowflake'
  | 'cockroachdb'
  | 'neo4j'
  | 'bigquery'

export type DbConnectionHealth = 'unknown' | 'healthy' | 'degraded' | 'offline'

export interface DbSslConfig {
  enabled: boolean
  rejectUnauthorized?: boolean
  ca?: string
  cert?: string
  key?: string
}

export interface DbSshTunnelConfig {
  enabled: boolean
  host?: string
  port?: number
  username?: string
  authMethod?: 'password' | 'privateKey'
  /** Reference to vault item for SSH credentials */
  vaultItemId?: string
  /** Seconds between SSH keep-alive packets (0 disables) */
  keepAliveIntervalSec?: number
}

export interface DbPoolConfig {
  min?: number
  max?: number
  idleTimeoutMs?: number
}

export interface DbConnectionConfig {
  host?: string
  port?: number
  database?: string
  schema?: string
  username?: string
  /** SQLite file path */
  filePath?: string
  ssl?: DbSslConfig
  sshTunnel?: DbSshTunnelConfig
  pool?: DbPoolConfig
  autoReconnect?: boolean
  readonly?: boolean
  connectionTimeoutMs?: number
  queryTimeoutMs?: number
  autoCommit?: boolean
  defaultSchema?: string
  /** Connect with a full URI (stored in secrets.connectionString) instead of host/port fields */
  useConnectionString?: boolean
  /** MongoDB: database used to authenticate (defaults to "admin") */
  authSource?: string
  /** MongoDB: replica set name */
  replicaSet?: string
  /** MongoDB: connect directly to a single host (skip topology discovery) */
  directConnection?: boolean
  /** Application name reported to the server (pg, mongodb, mssql) */
  applicationName?: string
  /** Document databases: documents sampled to infer collection schema */
  schemaSampleSize?: number
}

export interface DbConnectionSecrets {
  /** Full connection URI when config.useConnectionString is true (may embed credentials) */
  connectionString?: string
  password?: string
  sshPassword?: string
  sshPrivateKey?: string
  sshPassphrase?: string
}

export interface DbConnection {
  id: string
  name: string
  provider: DbProviderId
  scope: AppScope
  projectId: string | null
  folderId: string | null
  config: DbConnectionConfig
  notes: string
  tags: string[]
  isFavorite: boolean
  vaultItemId: string | null
  health: DbConnectionHealth
  latencyMs: number | null
  driverVersion: string | null
  lastConnectedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface DbConnectionFolder {
  id: string
  name: string
  scope: AppScope
  projectId: string | null
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateDbConnectionInput {
  name: string
  provider: DbProviderId
  scope: AppScope
  projectId?: string | null
  folderId?: string | null
  config: DbConnectionConfig
  notes?: string
  tags?: string[]
  secrets?: DbConnectionSecrets
  vaultItemId?: string | null
}

export interface UpdateDbConnectionInput {
  name?: string
  folderId?: string | null
  config?: DbConnectionConfig
  notes?: string
  tags?: string[]
  isFavorite?: boolean
  secrets?: DbConnectionSecrets
  vaultItemId?: string | null
}

export interface DbConnectionTestResult {
  success: boolean
  latencyMs: number
  driverVersion: string | null
  serverVersion: string | null
  message: string
}

export type DbExplorerNodeType =
  | 'connection'
  | 'database'
  | 'schema'
  | 'table'
  | 'view'
  | 'index'
  | 'trigger'
  | 'function'
  | 'procedure'
  | 'sequence'
  | 'constraint'
  | 'foreignKey'
  | 'materializedView'
  | 'column'
  | 'collection'

export interface DbExplorerNode {
  id: string
  type: DbExplorerNodeType
  name: string
  connectionId: string
  database?: string
  schema?: string
  table?: string
  children?: DbExplorerNode[]
  metadata?: Record<string, unknown>
}

export interface DbColumnInfo {
  name: string
  dataType: string
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
  isForeignKey: boolean
  isUnique: boolean
  isAutoIncrement: boolean
  isGenerated: boolean
  comment: string | null
  /** Document databases: share of sampled documents that contain this field (0–1) */
  presence?: number
  maxLength: number | null
  precision: number | null
  scale: number | null
  ordinalPosition: number
  referencedTable?: string
  referencedColumn?: string
}

export interface DbIndexInfo {
  name: string
  columns: string[]
  unique: boolean
  primary: boolean
  type: string
}

export interface DbForeignKeyInfo {
  name: string
  column: string
  referencedTable: string
  referencedColumn: string
  onDelete: string | null
  onUpdate: string | null
}

export interface DbConstraintInfo {
  name: string
  type: 'primary_key' | 'unique' | 'check' | 'not_null' | 'foreign_key' | 'default'
  columns: string[]
  definition: string | null
}

export interface DbTableInfo {
  name: string
  schema: string
  database: string
  type: 'table' | 'view' | 'materialized_view' | 'collection'
  rowCount: number | null
  comment: string | null
  columns: DbColumnInfo[]
  indexes: DbIndexInfo[]
  foreignKeys: DbForeignKeyInfo[]
  constraints: DbConstraintInfo[]
}

export interface DbQueryOptions {
  connectionId: string
  sql: string
  database?: string
  schema?: string
  params?: unknown[]
  maxRows?: number
  timeoutMs?: number
  readonly?: boolean
  transactionId?: string
}

export interface DbQueryColumn {
  name: string
  dataType: string
}

export interface DbQueryResult {
  columns: DbQueryColumn[]
  rows: Record<string, unknown>[]
  rowCount: number
  affectedRows: number
  executionTimeMs: number
  truncated: boolean
  explainPlan?: string
}

export interface DbDataPageOptions {
  connectionId: string
  database: string
  schema: string
  table: string
  offset?: number
  limit?: number
  orderBy?: Array<{ column: string; direction: 'asc' | 'desc' }>
  filters?: Array<{ column: string; operator: string; value: unknown }>
  /** Document databases: filter document as JSON / shell syntax, e.g. { status: "active" } */
  documentFilter?: string
}

export interface DbDataPageResult {
  columns: DbColumnInfo[]
  rows: Record<string, unknown>[]
  totalCount: number | null
  offset: number
  limit: number
}

export interface DbRowChange {
  type: 'insert' | 'update' | 'delete'
  primaryKey: Record<string, unknown>
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  /** Document databases: replace the whole document instead of $set-ing fields */
  replace?: boolean
}

export interface DbSaveDataChangesInput {
  connectionId: string
  database: string
  schema: string
  table: string
  changes: DbRowChange[]
  transactionMode?: boolean
}

export interface DbSavedQuery {
  id: string
  connectionId: string | null
  scope: AppScope
  projectId: string | null
  name: string
  sql: string
  folderId: string | null
  tags: string[]
  isFavorite: boolean
  isPinned: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface DbQueryHistoryEntry {
  id: string
  connectionId: string
  sql: string
  executionTimeMs: number
  rowCount: number
  success: boolean
  error: string | null
  executedAt: string
}

export interface DbDefaultConnectionSettings {
  provider: DbProviderId
  host: string
  port: number
  username: string
  /** Plaintext in memory when editing; encrypted before persistence */
  password: string
  database: string
}

export interface DbWorkspaceSettings {
  defaultProvider: DbProviderId
  /** Pre-fill values for new database connections */
  defaultConnection: DbDefaultConnectionSettings
  /** Encrypted default password at rest (main process persistence) */
  defaultConnectionPasswordEnc?: string | null
  autoReconnect: boolean
  queryTimeoutMs: number
  maxRows: number
  autoCommit: boolean
  sqlFormatterDialect: string
  editorTheme: 'light' | 'dark' | 'system'
  editorFontSize: number
  gridDensity: 'compact' | 'comfortable' | 'spacious'
  aiEnabled: boolean
  metadataRefreshIntervalMs: number
  queryHistoryLimit: number
  autoSave: boolean
  defaultExportFormat: 'csv' | 'json' | 'sql' | 'xlsx'
  defaultSchema: string
  connectionPoolMax: number
  sshDefaults: DbSshTunnelConfig
  resultCacheEnabled: boolean
  confirmDestructiveQueries: boolean
  layoutJson: string
}

export interface DbSchemaSnapshot {
  id: string
  connectionId: string
  label: string
  schemaJson: string
  createdAt: string
}

export interface DbAiSchemaTable {
  table: string
  kind: 'table' | 'view'
  columns: Array<{
    name: string
    type: string
    pk?: boolean
    fk?: boolean
    nullable?: boolean
    unique?: boolean
  }>
  foreignKeys: Array<{ column: string; referencedTable: string; referencedColumn: string }>
  indexes: Array<{ name: string; columns: string[]; unique?: boolean; primary?: boolean }>
}

export interface DbAiSchemaSnapshot {
  connectionId: string
  database: string
  schema: string
  capturedAt: string
  tableCount: number
  tables: DbAiSchemaTable[]
}

export interface DbAiSchemaSnapshotInfo {
  connectionId: string
  database: string
  schema: string
  capturedAt: string
  tableCount: number
}

export interface DbTableLink {
  id: string
  connectionId: string
  database: string
  schema: string
  table: string
  linkType: 'requirement' | 'business_rule' | 'knowledge' | 'api' | 'flow' | 'document' | 'validation' | 'task'
  targetId: string
  targetLabel: string
  createdAt: string
}

export interface DbSearchResult {
  id: string
  type: DbExplorerNodeType | 'saved_query' | 'connection'
  name: string
  connectionId?: string
  path: string
  snippet?: string
}

export interface DbErDiagramNode {
  id: string
  table: string
  schema: string
  columns: DbColumnInfo[]
  x: number
  y: number
  collapsed: boolean
}

export interface DbErDiagramEdge {
  id: string
  sourceTable: string
  targetTable: string
  sourceColumn: string
  targetColumn: string
  label?: string
}

export interface DbErDiagram {
  nodes: DbErDiagramNode[]
  edges: DbErDiagramEdge[]
}

export interface DbSchemaCompareInput {
  sourceConnectionId: string
  targetConnectionId?: string
  targetSnapshotId?: string
  projectId?: string
}

export interface DbSchemaDiff {
  addedTables: string[]
  removedTables: string[]
  modifiedTables: Array<{
    table: string
    columnChanges: Array<{ column: string; change: 'added' | 'removed' | 'modified'; details?: string }>
    indexChanges: string[]
    constraintChanges: string[]
  }>
}

export interface DbKnowledgeSyncReport {
  missingTables: string[]
  missingAttributes: Array<{ entity: string; attribute: string }>
  extraColumns: Array<{ table: string; column: string }>
  relationshipMismatches: Array<{ entity: string; expected: string; actual: string }>
  namingMismatches: Array<{ entity: string; expected: string; actual: string }>
}

export type DbAiAction =
  | 'explain_schema'
  | 'explain_table'
  | 'explain_relationships'
  | 'generate_documentation'
  | 'generate_er_diagram'
  | 'generate_prisma'
  | 'generate_sequelize'
  | 'generate_drizzle'
  | 'generate_typeorm'
  | 'generate_dtos'
  | 'generate_crud'
  | 'generate_rest_api'
  | 'generate_graphql'
  | 'generate_openapi'
  | 'generate_test_data'
  | 'generate_seed'
  | 'generate_migration'
  | 'suggest_normalization'
  | 'find_duplicate_columns'
  | 'find_missing_indexes'
  | 'find_orphan_tables'
  | 'suggest_constraints'
  | 'explain_query'
  | 'optimize_query'
  | 'explain_plan'
  | 'business_description'
  | 'detect_security'
  | 'detect_performance'
  | 'suggest_caching'
  | 'generate_markdown'
  | 'natural_language'

export interface DbAiQueryResultContext {
  sql?: string
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
}

export interface DbAiChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface DbAiLiveContext {
  connectionId: string
  database: string
  schema: string
  table: string
  columns: string[]
  selectedRows: Record<string, unknown>[]
  loadedSample: Record<string, unknown>[]
}

export interface DbAiRequest {
  action: DbAiAction
  connectionId: string
  database?: string
  schema?: string
  table?: string
  sql?: string
  projectId?: string
  prompt?: string
  model?: string
  /** Currently selected rows in the data grid */
  selectedRows?: Record<string, unknown>[]
  /** Sample of currently loaded / visible table rows */
  rowSample?: Record<string, unknown>[]
  /** Latest SQL editor result set */
  queryResult?: DbAiQueryResultContext
  /** Recent chat turns so follow-ups keep context */
  conversation?: DbAiChatTurn[]
}

export interface DbAiResponse {
  content: string
  cached: boolean
  action: DbAiAction
}

export interface DbAiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  action?: DbAiAction
  at: string
}

export interface DbDdlPreviewInput {
  connectionId: string
  operations: Array<Record<string, unknown>>
}

export interface DbDdlPreviewResult {
  sql: string
  warnings: string[]
}

export interface DbExportConnectionsInput {
  connectionIds: string[]
  includeSecrets?: boolean
}

export interface DbImportConnectionsInput {
  payload: string
  scope: AppScope
  projectId?: string | null
}

/** Workspace tab types */
export type DbWorkspaceTabType = 'table' | 'query' | 'er-diagram' | 'schema-compare' | 'documentation'

export interface DbWorkspaceTab {
  id: string
  type: DbWorkspaceTabType
  title: string
  connectionId: string
  database?: string
  schema?: string
  table?: string
  sql?: string
  subTab?: string
  dirty?: boolean
}

export const DEFAULT_DB_WORKSPACE_SETTINGS: DbWorkspaceSettings = {
  defaultProvider: 'mysql',
  defaultConnection: {
    provider: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: '',
    database: ''
  },
  autoReconnect: true,
  queryTimeoutMs: 30_000,
  maxRows: 1000,
  autoCommit: true,
  sqlFormatterDialect: 'mysql',
  editorTheme: 'system',
  editorFontSize: 13,
  gridDensity: 'compact',
  aiEnabled: true,
  metadataRefreshIntervalMs: 300_000,
  queryHistoryLimit: 500,
  autoSave: false,
  defaultExportFormat: 'csv',
  defaultSchema: 'public',
  connectionPoolMax: 10,
  sshDefaults: { enabled: false },
  resultCacheEnabled: true,
  confirmDestructiveQueries: true,
  layoutJson: '{}'
}

export function emptyConnectionForm(
  scope: AppScope,
  projectId: string | null,
  settings?: Pick<DbWorkspaceSettings, 'defaultProvider' | 'defaultConnection' | 'defaultSchema' | 'autoReconnect'>
): CreateDbConnectionInput {
  const provider = settings?.defaultProvider ?? settings?.defaultConnection.provider ?? 'mysql'
  const defaults = settings?.defaultConnection
  // Workspace defaults only apply when they were configured for the same provider
  const sameProvider = defaults?.provider === provider
  const base = applyProviderDefaults(provider, {
    host: (sameProvider && defaults?.host) || 'localhost',
    port: sameProvider ? defaults?.port : undefined,
    database: (sameProvider && defaults?.database) || undefined,
    username: sameProvider ? defaults?.username : undefined,
    ssl: { enabled: false },
    autoReconnect: settings?.autoReconnect ?? true,
    readonly: false
  })
  if (getProviderMeta(provider).supportsSchemas && settings?.defaultSchema && !base.schema) {
    base.schema = settings.defaultSchema
    base.defaultSchema = settings.defaultSchema
  }
  return {
    name: '',
    provider,
    scope,
    projectId: scope === 'PROJECT' ? projectId : null,
    config: base,
    notes: '',
    tags: [],
    secrets: sameProvider && defaults?.password ? { password: defaults.password } : {}
  }
}

/**
 * Fill provider-specific defaults (port, user, schema…) and drop fields that do not apply.
 * Values the user already typed are kept unless they are the previous provider's defaults.
 */
export function applyProviderDefaults(
  provider: DbProviderId,
  config: DbConnectionConfig,
  previousProvider?: DbProviderId
): DbConnectionConfig {
  const meta = getProviderMeta(provider)
  const prev = previousProvider ? getProviderMeta(previousProvider) : null
  const wasDefault = <T>(value: T | undefined, prevDefault: T | undefined) =>
    value == null || value === '' || (prev != null && value === prevDefault)

  const next: DbConnectionConfig = { ...config }
  if (meta.kind === 'embedded') {
    delete next.host
    delete next.port
    delete next.username
    delete next.useConnectionString
    next.sshTunnel = next.sshTunnel ? { ...next.sshTunnel, enabled: false } : undefined
  } else {
    next.host = next.host || 'localhost'
    if (wasDefault(next.port, prev?.defaultPort)) next.port = meta.defaultPort
    if (wasDefault(next.username, prev?.defaultUsername)) next.username = meta.defaultUsername
    if (wasDefault(next.database, prev?.defaultDatabase)) next.database = meta.defaultDatabase
    delete next.filePath
    if (!meta.supportsConnectionString) next.useConnectionString = false
  }
  if (meta.supportsSchemas) {
    const current = next.schema ?? next.defaultSchema
    const schema = wasDefault(current, prev?.defaultSchema) ? meta.defaultSchema : current
    next.schema = schema
    next.defaultSchema = schema
  } else {
    delete next.schema
    delete next.defaultSchema
  }
  if (meta.kind !== 'document') {
    delete next.authSource
    delete next.replicaSet
    delete next.directConnection
    delete next.schemaSampleSize
  }
  return next
}

/** @deprecated Use emptyConnectionForm — connections are managed directly, not via workspace defaults */
export function buildNewConnectionInput(
  settings: DbWorkspaceSettings,
  scope: AppScope,
  projectId: string | null
): CreateDbConnectionInput {
  return emptyConnectionForm(scope, projectId, settings)
}

export const DB_PROVIDER_LABELS: Record<DbProviderId, string> = {
  sqlite: 'SQLite',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  postgresql: 'PostgreSQL',
  mssql: 'Microsoft SQL Server',
  mongodb: 'MongoDB',
  redis: 'Redis',
  oracle: 'Oracle',
  snowflake: 'Snowflake',
  cockroachdb: 'CockroachDB',
  neo4j: 'Neo4j',
  bigquery: 'BigQuery'
}


/** How the workbench models a provider's data — drives connection form and workspace UI */
export type DbProviderKind = 'relational' | 'document' | 'embedded'

export type DbQueryLanguage = 'sql' | 'mongo'

export interface DbProviderMeta {
  id: DbProviderId
  label: string
  kind: DbProviderKind
  description: string
  defaultPort?: number
  defaultUsername?: string
  defaultDatabase?: string
  defaultSchema?: string
  queryLanguage: DbQueryLanguage
  /** sql-formatter dialect for relational providers */
  sqlDialect?: 'postgresql' | 'mysql' | 'mariadb' | 'sqlite' | 'tsql'
  supportsSchemas: boolean
  supportsSsh: boolean
  supportsConnectionString: boolean
  connectionStringPlaceholder?: string
  /** Foreign keys / ER diagrams are meaningful */
  supportsRelations: boolean
  implemented: boolean
}

export const DB_PROVIDER_META: Record<DbProviderId, DbProviderMeta> = {
  postgresql: {
    id: 'postgresql', label: 'PostgreSQL', kind: 'relational', description: 'Advanced open-source relational database',
    defaultPort: 5432, defaultUsername: 'postgres', defaultDatabase: 'postgres', defaultSchema: 'public',
    queryLanguage: 'sql', sqlDialect: 'postgresql', supportsSchemas: true, supportsSsh: true,
    supportsConnectionString: true, connectionStringPlaceholder: 'postgresql://user:password@host:5432/database',
    supportsRelations: true, implemented: true
  },
  mysql: {
    id: 'mysql', label: 'MySQL', kind: 'relational', description: 'Popular open-source relational database',
    defaultPort: 3306, defaultUsername: 'root', queryLanguage: 'sql', sqlDialect: 'mysql',
    supportsSchemas: false, supportsSsh: true, supportsConnectionString: true,
    connectionStringPlaceholder: 'mysql://user:password@host:3306/database', supportsRelations: true, implemented: true
  },
  mariadb: {
    id: 'mariadb', label: 'MariaDB', kind: 'relational', description: 'Community-developed MySQL fork',
    defaultPort: 3306, defaultUsername: 'root', queryLanguage: 'sql', sqlDialect: 'mariadb',
    supportsSchemas: false, supportsSsh: true, supportsConnectionString: true,
    connectionStringPlaceholder: 'mysql://user:password@host:3306/database', supportsRelations: true, implemented: true
  },
  mssql: {
    id: 'mssql', label: 'SQL Server', kind: 'relational', description: 'Microsoft SQL Server & Azure SQL',
    defaultPort: 1433, defaultUsername: 'sa', defaultDatabase: 'master', defaultSchema: 'dbo',
    queryLanguage: 'sql', sqlDialect: 'tsql', supportsSchemas: true, supportsSsh: true,
    supportsConnectionString: false, supportsRelations: true, implemented: true
  },
  cockroachdb: {
    id: 'cockroachdb', label: 'CockroachDB', kind: 'relational', description: 'Distributed SQL (PostgreSQL wire protocol)',
    defaultPort: 26257, defaultUsername: 'root', defaultDatabase: 'defaultdb', defaultSchema: 'public',
    queryLanguage: 'sql', sqlDialect: 'postgresql', supportsSchemas: true, supportsSsh: true,
    supportsConnectionString: true, connectionStringPlaceholder: 'postgresql://user:password@host:26257/defaultdb?sslmode=verify-full',
    supportsRelations: true, implemented: true
  },
  sqlite: {
    id: 'sqlite', label: 'SQLite', kind: 'embedded', description: 'Local file-based database',
    defaultSchema: 'main', queryLanguage: 'sql', sqlDialect: 'sqlite', supportsSchemas: false,
    supportsSsh: false, supportsConnectionString: false, supportsRelations: true, implemented: true
  },
  mongodb: {
    id: 'mongodb', label: 'MongoDB', kind: 'document', description: 'Document / object database (BSON)',
    defaultPort: 27017, defaultDatabase: 'test', queryLanguage: 'mongo', supportsSchemas: false,
    supportsSsh: true, supportsConnectionString: true,
    connectionStringPlaceholder: 'mongodb+srv://user:password@cluster.example.net/database',
    supportsRelations: false, implemented: true
  },
  redis: {
    id: 'redis', label: 'Redis', kind: 'document', description: 'In-memory key-value store',
    defaultPort: 6379, queryLanguage: 'mongo', supportsSchemas: false, supportsSsh: true,
    supportsConnectionString: true, supportsRelations: false, implemented: false
  },
  oracle: {
    id: 'oracle', label: 'Oracle', kind: 'relational', description: 'Oracle Database', defaultPort: 1521,
    queryLanguage: 'sql', supportsSchemas: true, supportsSsh: true, supportsConnectionString: false,
    supportsRelations: true, implemented: false
  },
  snowflake: {
    id: 'snowflake', label: 'Snowflake', kind: 'relational', description: 'Cloud data warehouse',
    queryLanguage: 'sql', supportsSchemas: true, supportsSsh: false, supportsConnectionString: false,
    supportsRelations: true, implemented: false
  },
  neo4j: {
    id: 'neo4j', label: 'Neo4j', kind: 'document', description: 'Graph database', defaultPort: 7687,
    queryLanguage: 'mongo', supportsSchemas: false, supportsSsh: true, supportsConnectionString: true,
    supportsRelations: false, implemented: false
  },
  bigquery: {
    id: 'bigquery', label: 'BigQuery', kind: 'relational', description: 'Google Cloud data warehouse',
    queryLanguage: 'sql', supportsSchemas: true, supportsSsh: false, supportsConnectionString: false,
    supportsRelations: false, implemented: false
  }
}

export const IMPLEMENTED_DB_PROVIDERS: DbProviderId[] = (Object.keys(DB_PROVIDER_META) as DbProviderId[]).filter(
  (id) => DB_PROVIDER_META[id].implemented
)

export const DB_PROVIDER_KIND_LABELS: Record<DbProviderKind, string> = {
  relational: 'Relational (SQL)',
  document: 'Document / Object (NoSQL)',
  embedded: 'Embedded / File'
}

export const DEFAULT_DB_PROVIDER_PORTS: Partial<Record<DbProviderId, number>> = Object.fromEntries(
  (Object.keys(DB_PROVIDER_META) as DbProviderId[])
    .filter((id) => DB_PROVIDER_META[id].defaultPort != null)
    .map((id) => [id, DB_PROVIDER_META[id].defaultPort])
)

export function defaultPortForProvider(provider: DbProviderId): number | undefined {
  return DEFAULT_DB_PROVIDER_PORTS[provider]
}

export function getProviderMeta(provider: DbProviderId | undefined | null): DbProviderMeta {
  return DB_PROVIDER_META[provider ?? 'postgresql'] ?? DB_PROVIDER_META.postgresql
}

export function isDocumentProvider(provider: DbProviderId | undefined | null): boolean {
  return getProviderMeta(provider).kind === 'document'
}

/** Quote an identifier for use in generated SQL for the given provider. */
export function quoteDbIdentifier(provider: DbProviderId | undefined | null, name: string): string {
  switch (provider) {
    case 'mysql':
    case 'mariadb':
      return `\`${name.replace(/`/g, '``')}\``
    case 'mssql':
      return `[${name.replace(/]/g, ']]')}]`
    default:
      return `"${name.replace(/"/g, '""')}"`
  }
}

/** Starter query for browsing a table/collection in the query editor. */
export function buildBrowseQuery(
  provider: DbProviderId | undefined | null,
  table: string,
  opts: { schema?: string; limit?: number } = {}
): string {
  const limit = opts.limit ?? 100
  if (isDocumentProvider(provider)) {
    const ref = /^[A-Za-z_$][\w$]*$/.test(table) ? `db.${table}` : `db.getCollection(${JSON.stringify(table)})`
    return `${ref}.find({}).limit(${limit})`
  }
  const qualified =
    opts.schema && getProviderMeta(provider).supportsSchemas
      ? `${quoteDbIdentifier(provider, opts.schema)}.${quoteDbIdentifier(provider, table)}`
      : quoteDbIdentifier(provider, table)
  if (provider === 'mssql') return `SELECT TOP ${limit} * FROM ${qualified};`
  return `SELECT * FROM ${qualified} LIMIT ${limit};`
}

/** Normalize connection form values before save, test, or connect. */
export function normalizeConnectionInput(
  input: CreateDbConnectionInput,
  scope: AppScope,
  projectId: string | null
): CreateDbConnectionInput {
  const meta = getProviderMeta(input.provider)
  const config = { ...input.config }
  if (config.port != null && Number.isNaN(Number(config.port))) {
    delete config.port
  } else if (config.port != null) {
    config.port = Number(config.port)
  }

  const secrets: DbConnectionSecrets = { password: input.secrets?.password ?? '' }

  if (meta.kind === 'embedded') {
    config.filePath = config.filePath?.trim() || undefined
  } else {
    config.host = config.host?.trim() || 'localhost'
    if (config.port == null) {
      config.port = defaultPortForProvider(input.provider) ?? 3306
    }
    config.database = config.database?.trim() || undefined
    config.username = config.username?.trim() || undefined
    if (meta.supportsSchemas) {
      const schema = (config.schema ?? config.defaultSchema)?.trim() || undefined
      config.schema = schema
      config.defaultSchema = schema
    }
    if (config.useConnectionString && meta.supportsConnectionString) {
      secrets.connectionString = input.secrets?.connectionString?.trim() ?? ''
    } else {
      config.useConnectionString = false
    }
    if (config.sshTunnel?.enabled) {
      config.sshTunnel = {
        ...config.sshTunnel,
        host: config.sshTunnel.host?.trim(),
        port: Number(config.sshTunnel.port) || 22,
        username: config.sshTunnel.username?.trim(),
        authMethod: config.sshTunnel.authMethod ?? 'password'
      }
      secrets.sshPassword = input.secrets?.sshPassword ?? ''
      secrets.sshPrivateKey = input.secrets?.sshPrivateKey ?? ''
      secrets.sshPassphrase = input.secrets?.sshPassphrase ?? ''
    }
    config.authSource = config.authSource?.trim() || undefined
    config.replicaSet = config.replicaSet?.trim() || undefined
    config.applicationName = config.applicationName?.trim() || undefined
  }
  for (const key of ['connectionTimeoutMs', 'queryTimeoutMs', 'schemaSampleSize'] as const) {
    const value = config[key]
    if (value == null || Number.isNaN(Number(value)) || Number(value) <= 0) delete config[key]
    else config[key] = Number(value)
  }
  if (config.pool?.max != null) {
    const max = Number(config.pool.max)
    config.pool = { ...config.pool, max: Number.isFinite(max) && max > 0 ? Math.min(max, 100) : undefined }
  }

  return {
    ...input,
    name: input.name.trim(),
    scope,
    projectId: scope === 'PROJECT' ? projectId : null,
    config,
    notes: input.notes?.trim() ?? '',
    tags: input.tags ?? [],
    secrets
  }
}

export function validateConnectionInput(input: CreateDbConnectionInput): string | null {
  const meta = getProviderMeta(input.provider)
  if (!input.name.trim()) return 'Name is required'
  if (!meta.implemented) return `${meta.label} is not supported yet`
  if (input.scope === 'PROJECT' && !input.projectId) {
    return 'A project is required for project-scoped connections'
  }
  if (meta.kind === 'embedded') {
    if (!input.config.filePath?.trim()) return 'Database file path is required'
    return null
  }
  if (input.config.useConnectionString) {
    const uri = input.secrets?.connectionString?.trim()
    if (!uri) return 'Connection string is required'
    if (input.provider === 'mongodb' && !/^mongodb(\+srv)?:\/\//i.test(uri)) {
      return 'MongoDB connection string must start with mongodb:// or mongodb+srv://'
    }
    if ((input.provider === 'postgresql' || input.provider === 'cockroachdb') && !/^postgres(ql)?:\/\//i.test(uri)) {
      return 'Connection string must start with postgresql://'
    }
    if ((input.provider === 'mysql' || input.provider === 'mariadb') && !/^(mysql|mariadb):\/\//i.test(uri)) {
      return 'Connection string must start with mysql://'
    }
  } else {
    if (!input.config.host?.trim()) return 'Host is required'
    if (input.config.port == null || Number.isNaN(input.config.port)) return 'Valid port is required'
  }
  const ssh = input.config.sshTunnel
  if (ssh?.enabled) {
    if (!ssh.host?.trim()) return 'SSH host is required'
    if (!ssh.username?.trim()) return 'SSH username is required'
    if (ssh.authMethod === 'privateKey' && !input.secrets?.sshPrivateKey?.trim()) return 'SSH private key is required'
  }
  return null
}
