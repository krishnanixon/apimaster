import { getPrismaClient } from './client'
import { DB_WORKSPACE_DDL } from './db-workspace-schema'
import { logger } from '../infra/logger.service'

let dbWorkspaceTablesReady = false

export async function ensureDbWorkspaceTables(): Promise<void> {
  if (dbWorkspaceTablesReady) return

  const client = getPrismaClient()
  const statements = DB_WORKSPACE_DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await client.$executeRawUnsafe(statement)
  }

  dbWorkspaceTablesReady = true
  logger.info('Database Workspace tables ready', 'Database')
}

export function resetDbWorkspaceTablesFlag(): void {
  dbWorkspaceTablesReady = false
}
