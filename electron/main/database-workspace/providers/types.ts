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

export interface DbProviderContext {
  connectionId: string
  config: DbConnectionConfig
  secrets: DbConnectionSecrets
  readonly: boolean
}

export interface DbProvider {
  id: DbProviderId
  label: string
  driverVersion: string
  connect(ctx: DbProviderContext): Promise<void>
  disconnect(connectionId: string): Promise<void>
  testConnection(ctx: DbProviderContext): Promise<DbConnectionTestResult>
  listDatabases(connectionId: string): Promise<string[]>
  listSchemas(connectionId: string, database: string): Promise<string[]>
  getExplorerTree(connectionId: string, database?: string, schema?: string): Promise<DbExplorerNode[]>
  getTableInfo(
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<DbTableInfo>
  executeQuery(options: DbQueryOptions, ctx: DbProviderContext): Promise<DbQueryResult>
  fetchDataPage(options: DbDataPageOptions, ctx: DbProviderContext): Promise<DbDataPageResult>
  saveDataChanges(
    connectionId: string,
    database: string,
    schema: string,
    table: string,
    changes: DbRowChange[],
    ctx: DbProviderContext
  ): Promise<{ affectedRows: number }>
  previewDdl(
    connectionId: string,
    operations: Array<Record<string, unknown>>,
    ctx: DbProviderContext
  ): Promise<{ sql: string; warnings: string[] }>
}

export interface ResolvedDbContext extends DbProviderContext {
  provider: DbProvider
}
