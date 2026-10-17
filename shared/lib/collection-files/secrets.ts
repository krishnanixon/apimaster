import type { FormDataField, KeyValuePair, RequestAuth } from '../../types/api-studio'
import { AUTH_SECRET_FIELDS } from '../redact-secrets'

/** `{{token}}` or `Bearer {{token}}`-style text: a reference, not a credential. */
const ONLY_REFERENCES = /^[^\S\r\n]*(?:(?:Bearer|Basic|Token)\s+)?(?:\{\{[^{}]+\}\}[^\S\r\n]*)+$/i

const CREDENTIAL_HEADER = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token|x-access-token)$/i
const CREDENTIAL_NAME = /(password|passwd|secret|api[-_]?key|access[-_]?key|private[-_]?key|credential)|token$/i

/**
 * Narrower than `isSensitiveKey` on purpose: `tokenUrl` or `sessionId` are shared settings,
 * and stripping them would leave teammates with a broken collection.
 */
export function isCredentialKey(key: string): boolean {
  const trimmed = key.trim()
  return CREDENTIAL_HEADER.test(trimmed) || CREDENTIAL_NAME.test(trimmed)
}

export function isVariableReference(value: string): boolean {
  return ONLY_REFERENCES.test(value)
}

/**
 * Values that must never reach a collection folder: anything marked secret, and any literal value
 * under a credential-shaped key (`Authorization`, `apiKey`, `password`…) unless explicitly unmarked.
 */
export function isSecretValue(pair: Pick<KeyValuePair, 'key' | 'value' | 'secret'>): boolean {
  if (pair.secret === true) return true
  if (pair.secret === false) return false
  return Boolean(pair.value) && isCredentialKey(pair.key) && !isVariableReference(pair.value)
}

export function isSecretFormField(field: FormDataField): boolean {
  if (field.type === 'file') return false
  return isSecretValue(field)
}

/** Auth fields kept off disk: credential fields holding a literal value. `{{var}}` references are written. */
export function secretAuthFields(auth: RequestAuth): Set<keyof RequestAuth> {
  const fields = new Set<keyof RequestAuth>()
  for (const field of AUTH_SECRET_FIELDS) {
    const value = auth[field]
    if (typeof value === 'string' && value && !isVariableReference(value)) fields.add(field)
  }
  return fields
}

export function isAuthSecretField(field: string): boolean {
  return (AUTH_SECRET_FIELDS as readonly string[]).includes(field)
}
