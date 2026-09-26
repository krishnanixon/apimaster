import { getPrismaClient } from './client'
import { RAG_TRAINING_DDL } from './rag-training-schema'
import { logger } from '../infra/logger.service'

let ragTrainingTablesReady = false

export async function ensureRagTrainingTables(): Promise<void> {
  if (ragTrainingTablesReady) return

  const client = getPrismaClient()
  const statements = RAG_TRAINING_DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await client.$executeRawUnsafe(statement)
  }

  ragTrainingTablesReady = true
  logger.info('RAG Training tables ready', 'Database')
}

export function resetRagTrainingTablesFlag(): void {
  ragTrainingTablesReady = false
}
