import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { logger } from '../infra/logger.service'

let prisma: PrismaClient | null = null
let flowDiagramTableReady = false
let architectureTableReady = false
let presentationTableReady = false
let documentLayoutColumnsReady = false
let usageTableReady = false
let vaultTablesReady = false
let voiceAssistantTablesReady = false

function toSqliteFileUrl(dbPath: string): string {
  return `file:${dbPath.replace(/\\/g, '/')}`
}

export function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
  return join(dbDir, 'studio.db')
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const dbPath = getDatabasePath()
    const adapter = new PrismaBetterSqlite3({ url: toSqliteFileUrl(dbPath) })
    prisma = new PrismaClient({ adapter })
  }
  return prisma
}

const FLOW_DIAGRAM_DDL = `
  CREATE TABLE IF NOT EXISTS "FlowDiagram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Flow',
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'process',
    "nodes" TEXT NOT NULL DEFAULT '[]',
    "edges" TEXT NOT NULL DEFAULT '[]',
    "viewport" TEXT NOT NULL DEFAULT '{}',
    "layoutState" TEXT NOT NULL DEFAULT '{}',
    "isPinned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
  )
`

/** Idempotent — safe to call before every Flow Designer DB operation. */
export async function ensureFlowDiagramTable(): Promise<void> {
  if (flowDiagramTableReady) return

  const dbPath = getDatabasePath()
  const client = getPrismaClient()

  await client.$executeRawUnsafe(FLOW_DIAGRAM_DDL)
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "FlowDiagram_projectId_idx" ON "FlowDiagram"("projectId")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "FlowDiagram_category_idx" ON "FlowDiagram"("category")`
  )

  const tables = await client.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='FlowDiagram'`
  )

  if (tables.length === 0) {
    flowDiagramTableReady = false
    throw new Error(`FlowDiagram table missing after migration (db: ${dbPath})`)
  }

  flowDiagramTableReady = true
  logger.info(`FlowDiagram table ready at ${dbPath}`, 'Database')
}

const ARCHITECTURE_DIAGRAM_DDL = `
  CREATE TABLE IF NOT EXISTS "ArchitectureDiagram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Architecture',
    "description" TEXT NOT NULL DEFAULT '',
    "systemType" TEXT NOT NULL DEFAULT 'web',
    "model" TEXT NOT NULL DEFAULT '{}',
    "viewState" TEXT NOT NULL DEFAULT '{}',
    "versions" TEXT NOT NULL DEFAULT '[]',
    "documentJson" TEXT NOT NULL DEFAULT '',
    "schemaVersion" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT NOT NULL DEFAULT '',
    "isFavorite" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "isPinned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
  )
`

/** Idempotent — safe to call before every Architecture Designer DB operation. */
export async function ensureArchitectureTable(): Promise<void> {
  if (architectureTableReady) return

  const dbPath = getDatabasePath()
  const client = getPrismaClient()

  await client.$executeRawUnsafe(ARCHITECTURE_DIAGRAM_DDL)
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ArchitectureDiagram_projectId_idx" ON "ArchitectureDiagram"("projectId")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ArchitectureDiagram_systemType_idx" ON "ArchitectureDiagram"("systemType")`
  )

  const tables = await client.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='ArchitectureDiagram'`
  )

  if (tables.length === 0) {
    architectureTableReady = false
    throw new Error(`ArchitectureDiagram table missing after migration (db: ${dbPath})`)
  }

  architectureTableReady = true
  logger.info(`ArchitectureDiagram table ready at ${dbPath}`, 'Database')
}

const PRESENTATION_DDL = `
  CREATE TABLE IF NOT EXISTS "Presentation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Presentation',
    "description" TEXT NOT NULL DEFAULT '',
    "themeId" TEXT NOT NULL DEFAULT 'professional',
    "cards" TEXT NOT NULL DEFAULT '[]',
    "viewState" TEXT NOT NULL DEFAULT '{}',
    "versions" TEXT NOT NULL DEFAULT '[]',
    "isPinned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
  )
`

/** Idempotent — safe to call before every Presentation Studio DB operation. */
export async function ensurePresentationTable(): Promise<void> {
  if (presentationTableReady) return

  const dbPath = getDatabasePath()
  const client = getPrismaClient()

  await client.$executeRawUnsafe(PRESENTATION_DDL)
  const columns = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `PRAGMA table_info("Presentation")`
  )
  const existing = new Set(columns.map((column) => String(column.name ?? '')))
  const additions = [
    ['documentJson', `TEXT NOT NULL DEFAULT ''`],
    ['schemaVersion', `INTEGER NOT NULL DEFAULT 0`],
    ['templateId', `TEXT NOT NULL DEFAULT ''`],
    ['isFavorite', `INTEGER NOT NULL DEFAULT 0`],
    ['deletedAt', `DATETIME`]
  ] as const
  for (const [name, definition] of additions) {
    if (!existing.has(name)) {
      await client.$executeRawUnsafe(
        `ALTER TABLE "Presentation" ADD COLUMN "${name}" ${definition}`
      )
    }
  }
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Presentation_projectId_idx" ON "Presentation"("projectId")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Presentation_projectId_deletedAt_idx" ON "Presentation"("projectId", "deletedAt")`
  )

  const tables = await client.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='Presentation'`
  )

  if (tables.length === 0) {
    presentationTableReady = false
    throw new Error(`Presentation table missing after migration (db: ${dbPath})`)
  }

  presentationTableReady = true
  logger.info(`Presentation table ready at ${dbPath}`, 'Database')
}

const VOICE_MEMORY_DDL = `
  CREATE TABLE IF NOT EXISTS "VoiceMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "projectId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'spoken',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`

const VOICE_CONVERSATION_DDL = `
  CREATE TABLE IF NOT EXISTS "VoiceConversationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" TEXT NOT NULL DEFAULT '{}'
  )
`

/** Idempotent — SQLite tables for Diablo memory and conversation snapshots. */
export async function ensureVoiceAssistantTables(): Promise<void> {
  if (voiceAssistantTablesReady) return

  const client = getPrismaClient()
  await client.$executeRawUnsafe(VOICE_MEMORY_DDL)
  await client.$executeRawUnsafe(VOICE_CONVERSATION_DDL)
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "VoiceMemory_projectId_idx" ON "VoiceMemory"("projectId")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "VoiceMemory_updatedAt_idx" ON "VoiceMemory"("updatedAt")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "VoiceConversationRecord_updatedAt_idx" ON "VoiceConversationRecord"("updatedAt")`
  )

  voiceAssistantTablesReady = true
  logger.info('Voice assistant tables ready', 'Database')
}

let appSettingsExportColumnsReady = false

/** Adds export default columns to AppSettings (idempotent). */
export async function ensureAppSettingsExportColumns(): Promise<void> {
  if (appSettingsExportColumnsReady) return

  const client = getPrismaClient()
  const columns = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `PRAGMA table_info("AppSettings")`
  )
  const existing = new Set(
    columns.map((c) => String(c.name ?? c.Name ?? '')).filter(Boolean)
  )

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: 'exportDefaultFormat',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportDefaultFormat" TEXT NOT NULL DEFAULT 'pdf'`
    },
    {
      name: 'exportIncludeCoverPage',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportIncludeCoverPage" INTEGER NOT NULL DEFAULT 1`
    },
    {
      name: 'exportIncludeTableOfContents',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportIncludeTableOfContents" INTEGER NOT NULL DEFAULT 1`
    },
    {
      name: 'exportIncludePageNumbers',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportIncludePageNumbers" INTEGER NOT NULL DEFAULT 1`
    },
    {
      name: 'exportIncludeHeaderFooter',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportIncludeHeaderFooter" INTEGER NOT NULL DEFAULT 1`
    },
    {
      name: 'exportCoverStyle',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportCoverStyle" TEXT NOT NULL DEFAULT 'modern'`
    },
    {
      name: 'exportTocStyle',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportTocStyle" TEXT NOT NULL DEFAULT 'classic'`
    },
    {
      name: 'exportPageNumberStyle',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportPageNumberStyle" TEXT NOT NULL DEFAULT 'page-total'`
    },
    {
      name: 'exportHeaderFooterStyle',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportHeaderFooterStyle" TEXT NOT NULL DEFAULT 'standard'`
    },
    {
      name: 'exportIncludeLogo',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportIncludeLogo" INTEGER NOT NULL DEFAULT 1`
    },
    {
      name: 'exportCoverAccent',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportCoverAccent" TEXT NOT NULL DEFAULT ''`
    },
    {
      name: 'exportCoverSubtitle',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportCoverSubtitle" TEXT NOT NULL DEFAULT ''`
    },
    {
      name: 'exportPreparedBy',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportPreparedBy" TEXT NOT NULL DEFAULT ''`
    },
    {
      name: 'exportIncludeWatermark',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportIncludeWatermark" INTEGER NOT NULL DEFAULT 0`
    },
    {
      name: 'exportWatermarkStyle',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportWatermarkStyle" TEXT NOT NULL DEFAULT 'confidential'`
    },
    {
      name: 'exportWatermarkText',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportWatermarkText" TEXT NOT NULL DEFAULT ''`
    },
    {
      name: 'exportClassification',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportClassification" TEXT NOT NULL DEFAULT 'none'`
    },
    {
      name: 'exportPageSize',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportPageSize" TEXT NOT NULL DEFAULT 'letter'`
    },
    {
      name: 'exportOrientation',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportOrientation" TEXT NOT NULL DEFAULT 'portrait'`
    },
    {
      name: 'exportCoverBackground',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportCoverBackground" TEXT NOT NULL DEFAULT ''`
    },
    {
      name: 'exportCoverOverlay',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportCoverOverlay" INTEGER NOT NULL DEFAULT 40`
    },
    {
      name: 'exportCoverFont',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportCoverFont" TEXT NOT NULL DEFAULT ''`
    },
    {
      name: 'exportImageQuality',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportImageQuality" TEXT NOT NULL DEFAULT 'standard'`
    },
    {
      name: 'exportFolderPath',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "exportFolderPath" TEXT NOT NULL DEFAULT ''`
    },
    {
      name: 'documentWorkflowMode',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "documentWorkflowMode" TEXT NOT NULL DEFAULT 'simple'`
    },
    {
      name: 'documentGenerationRules',
      sql: `ALTER TABLE "AppSettings" ADD COLUMN "documentGenerationRules" TEXT NOT NULL DEFAULT ''`
    }
  ]

  for (const { name, sql } of migrations) {
    if (!existing.has(name)) {
      await client.$executeRawUnsafe(sql)
      logger.info(`Added AppSettings.${name} column`, 'Database')
    }
  }

  appSettingsExportColumnsReady = true
}

let projectSettingsColumnsReady = false

/** Adds generation-rules column to ProjectSettings (idempotent). */
export async function ensureProjectSettingsColumns(): Promise<void> {
  if (projectSettingsColumnsReady) return

  const client = getPrismaClient()
  const columns = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `PRAGMA table_info("ProjectSettings")`
  )
  const existing = new Set(
    columns.map((c) => String(c.name ?? c.Name ?? '')).filter(Boolean)
  )

  if (!existing.has('documentGenerationRules')) {
    await client.$executeRawUnsafe(
      `ALTER TABLE "ProjectSettings" ADD COLUMN "documentGenerationRules" TEXT NOT NULL DEFAULT ''`
    )
    logger.info('Added ProjectSettings.documentGenerationRules column', 'Database')
  }

  projectSettingsColumnsReady = true
}

let conversationScopeColumnsReady = false

function parseSqliteTableInfo(
  columns: Array<Record<string, unknown>>
): Map<string, { notnull: boolean }> {
  const map = new Map<string, { notnull: boolean }>()
  for (const col of columns) {
    const name = String(col.name ?? col.Name ?? '')
    if (!name) continue
    map.set(name, { notnull: Number(col.notnull ?? col.NotNull ?? 0) === 1 })
  }
  return map
}

/** Adds Conversation.scope and makes projectId nullable for global assistant chats. */
export async function ensureConversationScopeColumns(): Promise<void> {
  if (conversationScopeColumnsReady) return

  const client = getPrismaClient()
  const columns = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `PRAGMA table_info("Conversation")`
  )
  const columnMap = parseSqliteTableInfo(columns)
  const hasScope = columnMap.has('scope')
  const projectIdNotNull = columnMap.get('projectId')?.notnull ?? true

  if (!hasScope && !projectIdNotNull) {
    await client.$executeRawUnsafe(
      `ALTER TABLE "Conversation" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'PROJECT'`
    )
    logger.info('Added Conversation.scope column', 'Database')
    conversationScopeColumnsReady = true
    return
  }

  if (hasScope && !projectIdNotNull) {
    conversationScopeColumnsReady = true
    return
  }

  // SQLite cannot drop NOT NULL on projectId — recreate the table with nullable projectId + scope.
  await client.$executeRawUnsafe(`PRAGMA foreign_keys = OFF`)

  await client.$executeRawUnsafe(`
    CREATE TABLE "Conversation_new" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "scope" TEXT NOT NULL DEFAULT 'PROJECT',
      "projectId" TEXT,
      "title" TEXT NOT NULL DEFAULT 'New Conversation',
      "isPinned" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )
  `)

  if (hasScope) {
    await client.$executeRawUnsafe(`
      INSERT INTO "Conversation_new" ("id", "scope", "projectId", "title", "isPinned", "createdAt", "updatedAt")
      SELECT "id", "scope", "projectId", "title", "isPinned", "createdAt", "updatedAt"
      FROM "Conversation"
    `)
  } else {
    await client.$executeRawUnsafe(`
      INSERT INTO "Conversation_new" ("id", "scope", "projectId", "title", "isPinned", "createdAt", "updatedAt")
      SELECT "id", 'PROJECT', "projectId", "title", "isPinned", "createdAt", "updatedAt"
      FROM "Conversation"
    `)
  }

  await client.$executeRawUnsafe(`DROP TABLE "Conversation"`)
  await client.$executeRawUnsafe(`ALTER TABLE "Conversation_new" RENAME TO "Conversation"`)
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Conversation_projectId_idx" ON "Conversation"("projectId")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Conversation_scope_idx" ON "Conversation"("scope")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Conversation_isPinned_idx" ON "Conversation"("isPinned")`
  )

  await client.$executeRawUnsafe(`PRAGMA foreign_keys = ON`)
  logger.info('Migrated Conversation table for global assistant (nullable projectId + scope)', 'Database')

  conversationScopeColumnsReady = true
}

/** Adds document layout columns introduced after initial release (idempotent). */
export async function ensureDocumentLayoutColumns(): Promise<void> {
  if (documentLayoutColumnsReady) return

  const client = getPrismaClient()
  const columns = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `PRAGMA table_info("Document")`
  )
  const existing = new Set(
    columns.map((c) => String(c.name ?? c.Name ?? '')).filter(Boolean)
  )

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: 'pageTheme',
      sql: `ALTER TABLE "Document" ADD COLUMN "pageTheme" TEXT NOT NULL DEFAULT 'professional'`
    },
    {
      name: 'layoutPreset',
      sql: `ALTER TABLE "Document" ADD COLUMN "layoutPreset" TEXT NOT NULL DEFAULT 'normal'`
    },
    {
      name: 'paddingTop',
      sql: `ALTER TABLE "Document" ADD COLUMN "paddingTop" INTEGER NOT NULL DEFAULT 56`
    },
    {
      name: 'paddingRight',
      sql: `ALTER TABLE "Document" ADD COLUMN "paddingRight" INTEGER NOT NULL DEFAULT 64`
    },
    {
      name: 'paddingBottom',
      sql: `ALTER TABLE "Document" ADD COLUMN "paddingBottom" INTEGER NOT NULL DEFAULT 72`
    },
    {
      name: 'paddingLeft',
      sql: `ALTER TABLE "Document" ADD COLUMN "paddingLeft" INTEGER NOT NULL DEFAULT 64`
    },
    {
      name: 'status',
      sql: `ALTER TABLE "Document" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft'`
    },
    {
      name: 'tags',
      sql: `ALTER TABLE "Document" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]'`
    },
    {
      name: 'lastReviewedAt',
      sql: `ALTER TABLE "Document" ADD COLUMN "lastReviewedAt" DATETIME`
    },
    {
      name: 'pageSettings',
      sql: `ALTER TABLE "Document" ADD COLUMN "pageSettings" TEXT NOT NULL DEFAULT '{}'`
    },
    {
      name: 'commentsJson',
      sql: `ALTER TABLE "Document" ADD COLUMN "commentsJson" TEXT NOT NULL DEFAULT '[]'`
    },
    {
      name: 'exportedFilePath',
      sql: `ALTER TABLE "Document" ADD COLUMN "exportedFilePath" TEXT NOT NULL DEFAULT ''`
    }
  ]

  for (const { name, sql } of migrations) {
    if (!existing.has(name)) {
      await client.$executeRawUnsafe(sql)
      logger.info(`Added Document.${name} column`, 'Database')
    }
  }

  documentLayoutColumnsReady = true
}

const API_USAGE_DDL = `
  CREATE TABLE IF NOT EXISTS "ApiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "feature" TEXT NOT NULL DEFAULT 'chat',
    "model" TEXT NOT NULL DEFAULT '',
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`

/** Idempotent — safe to call before every API-usage DB operation. */
export async function ensureUsageTable(): Promise<void> {
  if (usageTableReady) return
  const client = getPrismaClient()
  await client.$executeRawUnsafe(API_USAGE_DDL)
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ApiUsage_projectId_idx" ON "ApiUsage"("projectId")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ApiUsage_createdAt_idx" ON "ApiUsage"("createdAt")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ApiUsage_model_idx" ON "ApiUsage"("model")`
  )
  usageTableReady = true
  logger.info('API usage table ready', 'Database')
}

/** Password vault tables (idempotent). */
export async function ensureVaultTables(): Promise<void> {
  if (vaultTablesReady) return
  const client = getPrismaClient()
  const { VAULT_TABLES_DDL, VAULT_INDEXES_DDL } = await import('./vault-schema')
  for (const sql of VAULT_TABLES_DDL) {
    await client.$executeRawUnsafe(sql)
  }
  for (const sql of VAULT_INDEXES_DDL) {
    await client.$executeRawUnsafe(sql)
  }
  await client.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "VaultSettings" ("id") VALUES ('settings')`
  )
  vaultTablesReady = true
  logger.info('Vault tables ready', 'Database')
}

export async function initializeDatabase(): Promise<void> {
  const dbPath = getDatabasePath()
  logger.info(`Using database at ${dbPath}`, 'Database')

  const client = getPrismaClient()

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Project" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "style" TEXT NOT NULL DEFAULT 'professional',
      "status" TEXT NOT NULL DEFAULT 'active',
      "companyName" TEXT NOT NULL DEFAULT '',
      "companyLogo" TEXT NOT NULL DEFAULT '',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastOpenedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectSettings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL UNIQUE,
      "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
      "temperature" REAL NOT NULL DEFAULT 0.7,
      "maxTokens" INTEGER NOT NULL DEFAULT 4096,
      "systemPrompt" TEXT NOT NULL DEFAULT '',
      "brandingPrimary" TEXT NOT NULL DEFAULT '#2563eb',
      "brandingAccent" TEXT NOT NULL DEFAULT '#1e40af',
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )
  `)

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Conversation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "scope" TEXT NOT NULL DEFAULT 'PROJECT',
      "projectId" TEXT,
      "title" TEXT NOT NULL DEFAULT 'New Conversation',
      "isPinned" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )
  `)

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Message" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
    )
  `)

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Document" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT 'Untitled Document',
      "type" TEXT NOT NULL DEFAULT 'requirements',
      "style" TEXT NOT NULL DEFAULT 'professional',
      "pageTheme" TEXT NOT NULL DEFAULT 'professional',
      "layoutPreset" TEXT NOT NULL DEFAULT 'normal',
      "paddingTop" INTEGER NOT NULL DEFAULT 56,
      "paddingRight" INTEGER NOT NULL DEFAULT 64,
      "paddingBottom" INTEGER NOT NULL DEFAULT 72,
      "paddingLeft" INTEGER NOT NULL DEFAULT 64,
      "pageSettings" TEXT NOT NULL DEFAULT '{}',
      "commentsJson" TEXT NOT NULL DEFAULT '[]',
      "content" TEXT NOT NULL DEFAULT '',
      "htmlContent" TEXT NOT NULL DEFAULT '',
      "isPinned" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "tags" TEXT NOT NULL DEFAULT '[]',
      "lastReviewedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )
  `)

  await ensureDocumentLayoutColumns()

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DocumentVersion" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "documentId" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "content" TEXT NOT NULL,
      "htmlContent" TEXT NOT NULL DEFAULT '',
      "label" TEXT NOT NULL DEFAULT '',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE,
      UNIQUE("documentId", "version")
    )
  `)

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSettings" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'app',
      "theme" TEXT NOT NULL DEFAULT 'system',
      "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
      "temperature" REAL NOT NULL DEFAULT 0.7,
      "maxTokens" INTEGER NOT NULL DEFAULT 4096,
      "autoSaveMs" INTEGER NOT NULL DEFAULT 3000,
      "recentProjectIds" TEXT NOT NULL DEFAULT '[]',
      "exportDefaultFormat" TEXT NOT NULL DEFAULT 'pdf',
      "exportIncludeCoverPage" INTEGER NOT NULL DEFAULT 1,
      "exportIncludeTableOfContents" INTEGER NOT NULL DEFAULT 1,
      "exportIncludePageNumbers" INTEGER NOT NULL DEFAULT 1,
      "exportIncludeHeaderFooter" INTEGER NOT NULL DEFAULT 1,
      "exportCoverStyle" TEXT NOT NULL DEFAULT 'modern',
      "exportTocStyle" TEXT NOT NULL DEFAULT 'classic',
      "exportPageNumberStyle" TEXT NOT NULL DEFAULT 'page-total',
      "exportHeaderFooterStyle" TEXT NOT NULL DEFAULT 'standard',
      "exportIncludeLogo" INTEGER NOT NULL DEFAULT 1,
      "exportCoverAccent" TEXT NOT NULL DEFAULT '',
      "exportCoverSubtitle" TEXT NOT NULL DEFAULT '',
      "exportPreparedBy" TEXT NOT NULL DEFAULT '',
      "exportIncludeWatermark" INTEGER NOT NULL DEFAULT 0,
      "exportWatermarkStyle" TEXT NOT NULL DEFAULT 'confidential',
      "exportWatermarkText" TEXT NOT NULL DEFAULT '',
      "exportClassification" TEXT NOT NULL DEFAULT 'none',
      "exportPageSize" TEXT NOT NULL DEFAULT 'letter',
      "exportOrientation" TEXT NOT NULL DEFAULT 'portrait',
      "exportCoverBackground" TEXT NOT NULL DEFAULT '',
      "exportCoverOverlay" INTEGER NOT NULL DEFAULT 40,
      "exportCoverFont" TEXT NOT NULL DEFAULT '',
      "exportImageQuality" TEXT NOT NULL DEFAULT 'standard'
    )
  `)

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SearchIndex" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT '',
      "content" TEXT NOT NULL DEFAULT '',
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const knowledgeTables = [
    `CREATE TABLE IF NOT EXISTS "RequirementKnowledge" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL UNIQUE,
      "projectSummary" TEXT NOT NULL DEFAULT '',
      "businessType" TEXT NOT NULL DEFAULT '',
      "industry" TEXT NOT NULL DEFAULT '',
      "targetUsers" TEXT NOT NULL DEFAULT '',
      "goals" TEXT NOT NULL DEFAULT '[]',
      "scope" TEXT NOT NULL DEFAULT '',
      "outOfScope" TEXT NOT NULL DEFAULT '',
      "vision" TEXT NOT NULL DEFAULT '',
      "objectives" TEXT NOT NULL DEFAULT '[]',
      "notes" TEXT NOT NULL DEFAULT '',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Stakeholder" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT '',
      "responsibilities" TEXT NOT NULL DEFAULT '',
      "contactNotes" TEXT NOT NULL DEFAULT '',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Module" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "priority" TEXT NOT NULL DEFAULT 'medium',
      "status" TEXT NOT NULL DEFAULT 'planned',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Feature" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "moduleId" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "complexity" TEXT NOT NULL DEFAULT 'medium',
      "priority" TEXT NOT NULL DEFAULT 'medium',
      "status" TEXT NOT NULL DEFAULT 'planned',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
      FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "Requirement" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "code" TEXT NOT NULL DEFAULT '',
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "type" TEXT NOT NULL DEFAULT 'functional',
      "moduleId" TEXT,
      "featureId" TEXT,
      "priority" TEXT NOT NULL DEFAULT 'medium',
      "acceptanceCriteria" TEXT NOT NULL DEFAULT '[]',
      "dependencies" TEXT NOT NULL DEFAULT '[]',
      "tags" TEXT NOT NULL DEFAULT '[]',
      "status" TEXT NOT NULL DEFAULT 'draft',
      "nfrCategory" TEXT NOT NULL DEFAULT '',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "BusinessRule" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "moduleId" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Workflow" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "flowData" TEXT NOT NULL DEFAULT '[]',
      "moduleId" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Entity" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "fields" TEXT NOT NULL DEFAULT '[]',
      "relationships" TEXT NOT NULL DEFAULT '[]',
      "indexes" TEXT NOT NULL DEFAULT '[]',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "APIEndpoint" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "method" TEXT NOT NULL DEFAULT 'GET',
      "path" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "request" TEXT NOT NULL DEFAULT '{}',
      "response" TEXT NOT NULL DEFAULT '{}',
      "authentication" TEXT NOT NULL DEFAULT '',
      "validation" TEXT NOT NULL DEFAULT '',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Role" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "permissions" TEXT NOT NULL DEFAULT '[]',
      "modules" TEXT NOT NULL DEFAULT '[]',
      "restrictions" TEXT NOT NULL DEFAULT '[]',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Integration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "type" TEXT NOT NULL DEFAULT '',
      "config" TEXT NOT NULL DEFAULT '{}',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Report" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "moduleId" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Risk" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "severity" TEXT NOT NULL DEFAULT 'medium',
      "likelihood" TEXT NOT NULL DEFAULT 'medium',
      "mitigation" TEXT NOT NULL DEFAULT '',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Assumption" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Decision" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "decision" TEXT NOT NULL DEFAULT '',
      "reason" TEXT NOT NULL DEFAULT '',
      "category" TEXT NOT NULL DEFAULT '',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT NOT NULL DEFAULT '',
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "KnowledgeLink" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "sourceType" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "relationType" TEXT NOT NULL DEFAULT 'relates_to',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "FlowDiagram" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT 'Untitled Flow',
      "description" TEXT NOT NULL DEFAULT '',
      "category" TEXT NOT NULL DEFAULT 'process',
      "nodes" TEXT NOT NULL DEFAULT '[]',
      "edges" TEXT NOT NULL DEFAULT '[]',
      "viewport" TEXT NOT NULL DEFAULT '{}',
      "layoutState" TEXT NOT NULL DEFAULT '{}',
      "isPinned" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`
  ]

  for (const sql of knowledgeTables) {
    await client.$executeRawUnsafe(sql)
  }

  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "FlowDiagram_projectId_idx" ON "FlowDiagram"("projectId")`
  )
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "FlowDiagram_category_idx" ON "FlowDiagram"("category")`
  )

  await ensureFlowDiagramTable()
  await ensureArchitectureTable()
  await ensurePresentationTable()
  await ensureVoiceAssistantTables()
  await ensureUsageTable()
  await ensureVaultTables()
  await ensureAppSettingsExportColumns()
  await ensureProjectSettingsColumns()
  await ensureConversationScopeColumns()

  const { ensureDbWorkspaceTables } = await import('./db-workspace-init')
  await ensureDbWorkspaceTables()

  const { ensureVectorWorkspaceTables } = await import('./vector-workspace-init')
  await ensureVectorWorkspaceTables()

  const { ensureRagTrainingTables } = await import('./rag-training-init')
  await ensureRagTrainingTables()

  const settings = await client.appSettings.findUnique({ where: { id: 'app' } })
  if (!settings) {
    await client.appSettings.create({ data: { id: 'app' } })
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
  }
  flowDiagramTableReady = false
  architectureTableReady = false
  presentationTableReady = false
  documentLayoutColumnsReady = false
  usageTableReady = false
  vaultTablesReady = false
  voiceAssistantTablesReady = false
}
