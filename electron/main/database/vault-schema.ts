export const VAULT_TABLES_DDL = [
  `CREATE TABLE IF NOT EXISTS "VaultMeta" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'vault',
    "passwordHash" TEXT NOT NULL,
    "kdfSalt" TEXT NOT NULL,
    "verificationBlob" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "VaultSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'settings',
    "autoLockMinutes" INTEGER NOT NULL DEFAULT 10,
    "clipboardClearSeconds" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "vault_folders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'folder',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("parentId") REFERENCES "vault_folders"("id") ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "vault_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folderId" TEXT,
    "projectId" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'password',
    "title" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL DEFAULT '',
    "urlPreview" TEXT NOT NULL DEFAULT '',
    "usernamePreview" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "favorite" INTEGER NOT NULL DEFAULT 0,
    "isPinned" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    "expiresAt" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    FOREIGN KEY ("folderId") REFERENCES "vault_folders"("id") ON DELETE SET NULL,
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "vault_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "vault_item_tags" (
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("itemId", "tagId"),
    FOREIGN KEY ("itemId") REFERENCES "vault_items"("id") ON DELETE CASCADE,
    FOREIGN KEY ("tagId") REFERENCES "vault_tags"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "vault_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "passwordHint" TEXT NOT NULL DEFAULT '',
    "changeReason" TEXT NOT NULL DEFAULT '',
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("itemId") REFERENCES "vault_items"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "vault_favorites" (
    "itemId" TEXT NOT NULL PRIMARY KEY,
    "pinnedOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("itemId") REFERENCES "vault_items"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "vault_activity_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "itemId" TEXT,
    "itemTitle" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`
]

export const VAULT_INDEXES_DDL = [
  `CREATE INDEX IF NOT EXISTS "vault_folders_parentId_idx" ON "vault_folders"("parentId")`,
  `CREATE INDEX IF NOT EXISTS "vault_folders_sortOrder_idx" ON "vault_folders"("sortOrder")`,
  `CREATE INDEX IF NOT EXISTS "vault_items_folderId_idx" ON "vault_items"("folderId")`,
  `CREATE INDEX IF NOT EXISTS "vault_items_projectId_idx" ON "vault_items"("projectId")`,
  `CREATE INDEX IF NOT EXISTS "vault_items_deletedAt_idx" ON "vault_items"("deletedAt")`,
  `CREATE INDEX IF NOT EXISTS "vault_items_title_idx" ON "vault_items"("title")`,
  `CREATE INDEX IF NOT EXISTS "vault_history_itemId_idx" ON "vault_history"("itemId")`,
  `CREATE INDEX IF NOT EXISTS "vault_activity_logs_createdAt_idx" ON "vault_activity_logs"("createdAt")`
]

export const DEFAULT_VAULT_FOLDERS: Array<{ name: string; icon: string; sortOrder: number }> = [
  { name: 'Servers', icon: 'server', sortOrder: 0 },
  { name: 'Database', icon: 'database', sortOrder: 1 },
  { name: 'Production', icon: 'shield', sortOrder: 2 },
  { name: 'Development', icon: 'code', sortOrder: 3 },
  { name: 'AWS', icon: 'cloud', sortOrder: 4 },
  { name: 'OpenAI', icon: 'sparkles', sortOrder: 5 },
  { name: 'GitHub', icon: 'github', sortOrder: 6 },
  { name: 'Stripe', icon: 'credit-card', sortOrder: 7 },
  { name: 'SMTP', icon: 'mail', sortOrder: 8 },
  { name: 'Mongo', icon: 'database', sortOrder: 9 },
  { name: 'MySQL', icon: 'database', sortOrder: 10 },
  { name: 'Postgres', icon: 'database', sortOrder: 11 },
  { name: 'SSH', icon: 'terminal', sortOrder: 12 },
  { name: 'FTP', icon: 'folder-sync', sortOrder: 13 },
  { name: 'Redis', icon: 'zap', sortOrder: 14 }
]
