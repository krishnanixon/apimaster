import type { DbConnection, DbProviderId, DbProviderMeta } from '@shared/types/database-workspace'
import { getProviderMeta } from '@shared/types/database-workspace'
import { useDbWorkspaceStore } from '../stores/dbWorkspace.store'

/** Short monogram + accent color per provider, used for badges in lists and pickers. */
export const PROVIDER_BADGE: Record<DbProviderId, { mono: string; className: string }> = {
  postgresql: { mono: 'PG', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  mysql: { mono: 'My', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  mariadb: { mono: 'Ma', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  mssql: { mono: 'MS', className: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  cockroachdb: { mono: 'CR', className: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' },
  sqlite: { mono: 'SL', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  mongodb: { mono: 'Mg', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  redis: { mono: 'Rd', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  oracle: { mono: 'Or', className: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  snowflake: { mono: 'SF', className: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' },
  neo4j: { mono: 'N4', className: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  bigquery: { mono: 'BQ', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' }
}

/** Vocabulary that changes between relational and document databases. */
export interface DbTerms {
  table: string
  tables: string
  row: string
  rows: string
  column: string
  columns: string
  query: string
  queryEditor: string
}

const RELATIONAL_TERMS: DbTerms = {
  table: 'table',
  tables: 'tables',
  row: 'row',
  rows: 'rows',
  column: 'column',
  columns: 'columns',
  query: 'SQL',
  queryEditor: 'Query'
}

const DOCUMENT_TERMS: DbTerms = {
  table: 'collection',
  tables: 'collections',
  row: 'document',
  rows: 'documents',
  column: 'field',
  columns: 'fields',
  query: 'MongoDB query',
  queryEditor: 'Shell'
}

export function termsFor(meta: DbProviderMeta): DbTerms {
  return meta.kind === 'document' ? DOCUMENT_TERMS : RELATIONAL_TERMS
}

export function connectionMeta(connection: DbConnection | undefined | null): DbProviderMeta {
  return getProviderMeta(connection?.provider)
}

/** Provider metadata for a connection id (falls back to the active connection). */
export function useConnectionMeta(connectionId?: string | null): {
  connection: DbConnection | undefined
  meta: DbProviderMeta
  isDocument: boolean
  terms: DbTerms
} {
  const connection = useDbWorkspaceStore((s) =>
    s.connections.find((c) => c.id === (connectionId ?? s.activeConnectionId))
  )
  const meta = connectionMeta(connection)
  return { connection, meta, isDocument: meta.kind === 'document', terms: termsFor(meta) }
}

/** One-line human summary of where a connection points. */
export function describeConnectionTarget(c: DbConnection): string {
  if (c.config.filePath) return c.config.filePath.split(/[\\/]/).pop() ?? c.config.filePath
  if (c.config.useConnectionString) return 'Connection string'
  const host = `${c.config.host ?? 'localhost'}${c.config.port ? `:${c.config.port}` : ''}`
  return c.config.database ? `${host}/${c.config.database}` : host
}
