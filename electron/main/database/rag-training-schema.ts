export const RAG_TRAINING_DDL = `
  CREATE TABLE IF NOT EXISTS "RagTrainingDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'other',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "content" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "RagTrainingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "settingsJson" TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS "RagTrainingDocument_scope_idx" ON "RagTrainingDocument"("scope");
  CREATE INDEX IF NOT EXISTS "RagTrainingDocument_projectId_idx" ON "RagTrainingDocument"("projectId");
  CREATE INDEX IF NOT EXISTS "RagTrainingDocument_enabled_idx" ON "RagTrainingDocument"("enabled");
`
