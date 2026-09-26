/**
 * Database Workspace persistence schema (SQLite via raw DDL).
 * Connections, queries, history, settings, snapshots, links, AI cache.
 */

export const DB_WORKSPACE_DDL = `
  CREATE TABLE IF NOT EXISTS "DbConnectionFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "projectId" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "DbConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "projectId" TEXT,
    "folderId" TEXT,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "encryptedSecrets" TEXT,
    "vaultItemId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "isFavorite" INTEGER NOT NULL DEFAULT 0,
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "latencyMs" INTEGER,
    "driverVersion" TEXT,
    "lastConnectedAt" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
    FOREIGN KEY ("folderId") REFERENCES "DbConnectionFolder"("id") ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS "DbSavedQuery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "sql" TEXT NOT NULL DEFAULT '',
    "folderId" TEXT,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "isFavorite" INTEGER NOT NULL DEFAULT 0,
    "isPinned" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("connectionId") REFERENCES "DbConnection"("id") ON DELETE SET NULL,
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "DbQueryHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "executionTimeMs" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "success" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("connectionId") REFERENCES "DbConnection"("id") ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "DbWorkspaceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "DbSchemaSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "schemaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("connectionId") REFERENCES "DbConnection"("id") ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "DbTableLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "database" TEXT NOT NULL DEFAULT '',
    "schema" TEXT NOT NULL DEFAULT '',
    "table" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("connectionId") REFERENCES "DbConnection"("id") ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "DbAiCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("connectionId") REFERENCES "DbConnection"("id") ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "DbBookmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("connectionId") REFERENCES "DbConnection"("id") ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS "DbConnection_scope_idx" ON "DbConnection"("scope");
  CREATE INDEX IF NOT EXISTS "DbConnection_projectId_idx" ON "DbConnection"("projectId");
  CREATE INDEX IF NOT EXISTS "DbConnection_folderId_idx" ON "DbConnection"("folderId");
  CREATE INDEX IF NOT EXISTS "DbSavedQuery_connectionId_idx" ON "DbSavedQuery"("connectionId");
  CREATE INDEX IF NOT EXISTS "DbQueryHistory_connectionId_idx" ON "DbQueryHistory"("connectionId");
  CREATE INDEX IF NOT EXISTS "DbQueryHistory_executedAt_idx" ON "DbQueryHistory"("executedAt");
  CREATE INDEX IF NOT EXISTS "DbSchemaSnapshot_connectionId_idx" ON "DbSchemaSnapshot"("connectionId");
  CREATE INDEX IF NOT EXISTS "DbTableLink_connectionId_idx" ON "DbTableLink"("connectionId");
  CREATE INDEX IF NOT EXISTS "DbAiCache_cacheKey_idx" ON "DbAiCache"("cacheKey");
`
