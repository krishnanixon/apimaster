import type { AuthType } from '../types/api.types'

export const AUTH_TYPE_OPTIONS: { value: AuthType; label: string }[] = [
  { value: 'inherit', label: 'Inherit auth from parent' },
  { value: 'none', label: 'No Auth' },
  { value: 'apiKey', label: 'API Key' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'jwt', label: 'JWT Bearer' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'digest', label: 'Digest Auth' },
  { value: 'oauth1', label: 'OAuth 1.0' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'aws', label: 'AWS Signature' },
  { value: 'hawk', label: 'Hawk Authentication' }
]

export function authTypeLabel(type: AuthType | string | undefined): string {
  return AUTH_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? type ?? 'No Auth'
}
