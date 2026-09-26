import type { DbProvider } from './types'
import type { DbProviderId } from '@shared/types/database-workspace'
import { sqliteProvider } from './sqlite.provider'
import { postgresqlProvider, cockroachdbProvider } from './postgresql.provider'
import { mysqlProvider, mariadbProvider } from './mysql.provider'
import { mssqlProvider } from './mssql.provider'
import { mongodbProvider } from './mongodb.provider'
import { DB_PROVIDER_LABELS, DB_PROVIDER_META } from '@shared/types/database-workspace'

const providers = new Map<DbProviderId, DbProvider>([
  ['sqlite', sqliteProvider],
  ['postgresql', postgresqlProvider],
  ['mysql', mysqlProvider],
  ['mariadb', mariadbProvider],
  ['mssql', mssqlProvider],
  ['cockroachdb', cockroachdbProvider],
  ['mongodb', mongodbProvider]
])

export function getDbProvider(id: DbProviderId): DbProvider {
  const provider = providers.get(id)
  if (!provider) {
    throw new Error(
      `Database provider "${DB_PROVIDER_LABELS[id] ?? id}" is not yet implemented. Supported: ${listImplementedProviders().join(', ')}`
    )
  }
  return provider
}

export function listImplementedProviders(): DbProviderId[] {
  return [...providers.keys()]
}

export function registerDbProvider(id: DbProviderId, provider: DbProvider): void {
  providers.set(id, provider)
}

export function getAllProviderMeta() {
  return (Object.keys(DB_PROVIDER_META) as DbProviderId[]).map((id) => {
    const p = providers.get(id)
    return {
      ...DB_PROVIDER_META[id],
      driverVersion: p?.driverVersion ?? '',
      implemented: Boolean(p)
    }
  })
}
