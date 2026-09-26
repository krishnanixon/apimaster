import type { VaultItemSecrets } from '@shared/types/vault'

/** Never rendered in the UI — copy-to-clipboard only. */
export const COPY_ONLY_SECRET_FIELDS: ReadonlySet<keyof VaultItemSecrets> = new Set([
  'password',
  'databasePassword',
  'sshPassword',
  'apiKey',
  'secretKey',
  'privateKey',
  'jwtSecret',
  'token'
])

export function isCopyOnlySecret(field: keyof VaultItemSecrets): boolean {
  return COPY_ONLY_SECRET_FIELDS.has(field)
}

export const MASKED_PLACEHOLDER = '••••••••••••'
