import { getPrismaClient } from './client'
import { VECTOR_WORKSPACE_DDL } from './vector-workspace-schema'
import { logger } from '../infra/logger.service'

let vectorWorkspaceTablesReady = false

export async function ensureVectorWorkspaceTables(): Promise<void> {
  if (vectorWorkspaceTablesReady) return

  const client = getPrismaClient()
  const statements = VECTOR_WORKSPACE_DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await client.$executeRawUnsafe(statement)
  }

  vectorWorkspaceTablesReady = true
  logger.info('Vector Workspace tables ready', 'Database')
}

export function resetVectorWorkspaceTablesFlag(): void {
  vectorWorkspaceTablesReady = false
}
