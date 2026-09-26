export const VECTOR_WORKSPACE_DDL = `
  CREATE TABLE IF NOT EXISTS "VectorConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'litechroma',
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "projectId" TEXT,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "encryptedSecrets" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "isFavorite" INTEGER NOT NULL DEFAULT 0,
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "latencyMs" INTEGER,
    "serverVersion" TEXT,
    "lastConnectedAt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "VectorWorkspaceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "settingsJson" TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS "VectorConnection_scope_idx" ON "VectorConnection"("scope");
  CREATE INDEX IF NOT EXISTS "VectorConnection_projectId_idx" ON "VectorConnection"("projectId");
`
