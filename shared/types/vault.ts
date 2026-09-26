export type VaultItemType =
  | 'password'
  | 'api_key'
  | 'ssh'
  | 'database'
  | 'credit_card'
  | 'license'
  | 'identity'
  | 'secure_note'
  | 'server'
  | 'custom'

export type VaultAutoLockMinutes = 0 | 5 | 10 | 30

export type VaultClipboardClearSeconds = 15 | 30 | 60

export type VaultViewFilter = 'all' | 'favorites' | 'recent' | 'archive' | 'trash'

export interface VaultSettings {
  autoLockMinutes: VaultAutoLockMinutes
  clipboardClearSeconds: VaultClipboardClearSeconds
}

export interface VaultStatus {
  isInitialized: boolean
  isUnlocked: boolean
  settings: VaultSettings
}

export interface VaultFolder {
  id: string
  parentId: string | null
  name: string
  icon: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface VaultTag {
  id: string
  name: string
  color: string
  createdAt: string
}

/** Sensitive fields — only returned when explicitly revealed or for editing while unlocked. */
export interface VaultItemSecrets {
  username: string
  password: string
  url: string
  notes: string
  email: string
  phone: string
  apiKey: string
  secretKey: string
  privateKey: string
  publicKey: string
  jwtSecret: string
  databaseUsername: string
  databasePassword: string
  sshUsername: string
  sshPassword: string
  token: string
}

export interface VaultItemListEntry {
  id: string
  folderId: string | null
  projectId: string | null
  itemType: VaultItemType
  title: string
  url: string
  username: string
  favorite: boolean
  isPinned: boolean
  archivedAt: string | null
  deletedAt: string | null
  expiresAt: string | null
  sortOrder: number
  tagIds: string[]
  tagNames: string[]
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  /** Masked preview only — never the real secret. */
  hasPassword: boolean
  passwordStrength: number
  isWeak: boolean
  isDuplicate: boolean
  isExpired: boolean
}

export interface VaultItem extends VaultItemListEntry, VaultItemSecrets {}

export interface VaultHistoryEntry {
  id: string
  itemId: string
  passwordHint: string
  changedAt: string
  changeReason: string
}

export interface VaultActivityLog {
  id: string
  action: string
  itemId: string | null
  itemTitle: string | null
  details: string
  createdAt: string
}

export interface CreateVaultFolderInput {
  name: string
  parentId?: string | null
  icon?: string
}

export interface UpdateVaultFolderInput {
  name?: string
  parentId?: string | null
  icon?: string
  sortOrder?: number
}

export interface CreateVaultItemInput {
  folderId?: string | null
  projectId?: string | null
  itemType: VaultItemType
  title: string
  tagIds?: string[]
  expiresAt?: string | null
  secrets: Partial<VaultItemSecrets>
}

export interface UpdateVaultItemInput {
  folderId?: string | null
  projectId?: string | null
  itemType?: VaultItemType
  title?: string
  tagIds?: string[]
  favorite?: boolean
  isPinned?: boolean
  expiresAt?: string | null
  sortOrder?: number
  secrets?: Partial<VaultItemSecrets>
}

export interface VaultSearchQuery {
  query: string
  folderId?: string | null
  tagId?: string | null
  itemType?: VaultItemType
  filter?: VaultViewFilter
}

export interface VaultSearchResult {
  items: VaultItemListEntry[]
  folders: VaultFolder[]
  tags: VaultTag[]
}

export interface GeneratePasswordOptions {
  length?: number
  uppercase?: boolean
  lowercase?: boolean
  numbers?: boolean
  symbols?: boolean
  excludeAmbiguous?: boolean
}

export interface GeneratePasswordResult {
  password: string
  strength: number
  label: 'weak' | 'fair' | 'good' | 'strong' | 'excellent'
}

export interface VaultExportOptions {
  format: 'json' | 'encrypted' | 'csv'
  exportPassword?: string
  includeSecrets?: boolean
  folderId?: string | null
}

export interface VaultImportOptions {
  format: 'json' | 'encrypted' | 'csv' | 'bitwarden' | '1password' | 'keepass'
  data: string
  importPassword?: string
  folderId?: string | null
}

export interface VaultImportResult {
  imported: number
  skipped: number
  errors: string[]
}

export interface VaultRevealResult {
  field: keyof VaultItemSecrets
  value: string
  expiresAt: number
}

export interface VaultDuplicateGroup {
  passwordHash: string
  itemIds: string[]
  titles: string[]
}

export interface VaultSecurityReport {
  weakCount: number
  duplicateCount: number
  expiredCount: number
  exposedPatterns: string[]
  rotationSuggestions: Array<{ itemId: string; title: string; reason: string }>
}

export interface VaultAiSuggestion {
  type: 'stronger_password' | 'rotation' | 'exposed_secret' | 'security_issue' | 'api_key'
  itemId?: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
}

export interface VaultSetupInput {
  masterPassword: string
  hint?: string
}

export interface VaultUnlockInput {
  masterPassword: string
}

export interface VaultProjectCredentialRef {
  itemId: string
  title: string
  itemType: VaultItemType
  username: string
  url: string
}
