import { useState } from 'react'
import { toast } from 'sonner'
import { Shield } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import { SecretInput } from '../SecretInput'
import { ExpandableField } from '../ExpandableField'
import { AUTH_TYPE_OPTIONS, authTypeLabel } from '../../services/authTypes'
import type {
  AuthType,
  HawkAlgorithm,
  JwtAlgorithm,
  OAuth1SignatureMethod,
  OAuth2GrantType,
  RequestAuth
} from '../../types/api.types'

interface AuthTabProps {
  auth: RequestAuth
  onChange: (auth: RequestAuth) => void
  inherit?: {
    parentLabel: string
    resolved: RequestAuth
  } | null
}

const SELECT =
  'h-8 w-full max-w-sm rounded-md border border-input bg-background px-2.5 text-xs text-foreground'

const DEFAULT_REDIRECT = 'http://localhost:8765/callback'

const JWT_ALGORITHMS: JwtAlgorithm[] = ['HS256', 'HS384', 'HS512']
const OAUTH1_METHODS: OAuth1SignatureMethod[] = ['HMAC-SHA1', 'HMAC-SHA256', 'PLAINTEXT']
const OAUTH2_GRANTS: { value: OAuth2GrantType; label: string }[] = [
  { value: 'authorization_code', label: 'Authorization Code' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password Credentials' }
]
const HAWK_ALGS: HawkAlgorithm[] = ['sha256', 'sha1']

export function AuthTab({ auth, onChange, inherit }: AuthTabProps) {
  const [oauthLoading, setOauthLoading] = useState(false)
  const options = inherit ? AUTH_TYPE_OPTIONS : AUTH_TYPE_OPTIONS.filter((opt) => opt.value !== 'inherit')
  const selected = auth.type === 'inherit' && !inherit ? 'none' : auth.type
  const grantType: OAuth2GrantType = auth.oauth2GrantType ?? 'authorization_code'

  async function handleOAuthToken() {
    const grant = auth.oauth2GrantType ?? 'authorization_code'
    if (grant === 'authorization_code') {
      await handleAuthorizationCode()
      return
    }
    if (!auth.oauth2TokenUrl || !auth.oauth2ClientId) {
      toast.error('Token URL and Client ID are required')
      return
    }
    if (grant === 'password' && !auth.oauth2Username?.trim()) {
      toast.error('Username is required for password grant')
      return
    }
    setOauthLoading(true)
    try {
      const tokenRes = await window.electronAPI.apiStudio.oauth2.exchangeToken({
        tokenUrl: auth.oauth2TokenUrl,
        clientId: auth.oauth2ClientId,
        clientSecret: auth.oauth2ClientSecret,
        grantType: grant,
        username: auth.oauth2Username,
        password: auth.oauth2Password,
        scope: auth.oauth2Scope
      })
      if (!tokenRes.success || !tokenRes.data) {
        toast.error(tokenRes.error ?? 'Token request failed')
        return
      }
      onChange({
        ...auth,
        type: 'oauth2',
        oauth2AccessToken: tokenRes.data.accessToken,
        oauth2RefreshToken: tokenRes.data.refreshToken
      })
      toast.success('OAuth token obtained')
    } finally {
      setOauthLoading(false)
    }
  }

  async function handleAuthorizationCode() {
    if (!auth.oauth2AuthUrl || !auth.oauth2ClientId) {
      toast.error('Auth URL and Client ID are required')
      return
    }
    const redirectUri = auth.oauth2RedirectUri?.trim() || DEFAULT_REDIRECT
    setOauthLoading(true)
    try {
      const authRes = await window.electronAPI.apiStudio.oauth2.authorize({
        authUrl: auth.oauth2AuthUrl,
        clientId: auth.oauth2ClientId,
        redirectUri,
        scope: auth.oauth2Scope
      })
      if (!authRes.success || !authRes.data) {
        toast.error(authRes.error ?? 'Authorization failed')
        return
      }
      if (!auth.oauth2TokenUrl) {
        toast.error('Token URL is required to exchange the code')
        return
      }
      const tokenRes = await window.electronAPI.apiStudio.oauth2.exchangeToken({
        tokenUrl: auth.oauth2TokenUrl,
        clientId: auth.oauth2ClientId,
        clientSecret: auth.oauth2ClientSecret,
        grantType: 'authorization_code',
        code: authRes.data.code,
        redirectUri,
        scope: auth.oauth2Scope
      })
      if (!tokenRes.success || !tokenRes.data) {
        toast.error(tokenRes.error ?? 'Token exchange failed')
        return
      }
      onChange({
        ...auth,
        type: 'oauth2',
        oauth2GrantType: 'authorization_code',
        oauth2RedirectUri: redirectUri,
        oauth2AccessToken: tokenRes.data.accessToken,
        oauth2RefreshToken: tokenRes.data.refreshToken
      })
      toast.success('OAuth token obtained')
    } finally {
      setOauthLoading(false)
    }
  }

  return (
    <div className="space-y-4 p-3">
      <Field label="Type">
        <select
          className={SELECT}
          value={selected}
          onChange={(e) => onChange({ ...auth, type: e.target.value as AuthType })}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      {selected === 'inherit' && inherit && (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs text-foreground">
            Using authorization from <span className="font-medium">{inherit.parentLabel}</span>.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Change the type to override, or edit the parent from the collection sidebar (Authorization).
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            <span>
              Resolved type:{' '}
              <span className="font-medium text-foreground">{authTypeLabel(inherit.resolved.type)}</span>
            </span>
          </div>
        </div>
      )}

      {selected === 'none' && (
        <p className="text-xs text-muted-foreground">This request does not use any authorization.</p>
      )}

      {selected === 'bearer' && (
        <Field label="Token">
          <SecretInput
            value={auth.bearerToken ?? ''}
            onChange={(bearerToken) => onChange({ ...auth, bearerToken })}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
          />
        </Field>
      )}

      {selected === 'jwt' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Algorithm">
              <select
                className={SELECT}
                value={auth.jwtAlgorithm ?? 'HS256'}
                onChange={(e) => onChange({ ...auth, jwtAlgorithm: e.target.value as JwtAlgorithm })}
              >
                {JWT_ALGORITHMS.map((alg) => (
                  <option key={alg} value={alg}>
                    {alg}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Add JWT to">
              <Segmented
                value={auth.jwtAddTo ?? 'header'}
                options={[
                  { value: 'header', label: 'Request Header' },
                  { value: 'query', label: 'Query Param' }
                ]}
                onChange={(jwtAddTo) => onChange({ ...auth, jwtAddTo })}
              />
            </Field>
          </div>
          <Field label="Secret">
            <SecretInput
              value={auth.jwtSecret ?? ''}
              onChange={(jwtSecret) => onChange({ ...auth, jwtSecret })}
              placeholder="HMAC secret"
            />
          </Field>
          {(auth.jwtAddTo ?? 'header') === 'query' && (
            <Field label="Query param name">
              <ExpandableField
                value={auth.jwtQueryParam ?? 'token'}
                onChange={(jwtQueryParam) => onChange({ ...auth, jwtQueryParam })}
                compact
              />
            </Field>
          )}
          <Field label="Payload (JSON)">
            <ExpandableField
              value={auth.jwtPayload ?? ''}
              onChange={(jwtPayload) => onChange({ ...auth, jwtPayload })}
              placeholder='{ "sub": "1234567890" }'
              mono
            />
          </Field>
          <Field label="Header (JSON, optional)">
            <ExpandableField
              value={auth.jwtHeader ?? ''}
              onChange={(jwtHeader) => onChange({ ...auth, jwtHeader })}
              placeholder='{ "kid": "key-id" }'
              compact
              mono
            />
          </Field>
        </div>
      )}

      {selected === 'basic' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <ExpandableField
              value={auth.basicUsername ?? ''}
              onChange={(basicUsername) => onChange({ ...auth, basicUsername })}
              compact
            />
          </Field>
          <Field label="Password">
            <SecretInput
              value={auth.basicPassword ?? ''}
              onChange={(basicPassword) => onChange({ ...auth, basicPassword })}
            />
          </Field>
        </div>
      )}

      {selected === 'digest' && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Sends the request, then retries with a Digest response if the server returns 401.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <ExpandableField
                value={auth.digestUsername ?? ''}
                onChange={(digestUsername) => onChange({ ...auth, digestUsername })}
                compact
              />
            </Field>
            <Field label="Password">
              <SecretInput
                value={auth.digestPassword ?? ''}
                onChange={(digestPassword) => onChange({ ...auth, digestPassword })}
              />
            </Field>
          </div>
          <Field label="Realm (optional)">
            <ExpandableField
              value={auth.digestRealm ?? ''}
              onChange={(digestRealm) => onChange({ ...auth, digestRealm })}
              placeholder="Taken from WWW-Authenticate if empty"
              compact
            />
          </Field>
        </div>
      )}

      {selected === 'apiKey' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Key">
              <ExpandableField
                value={auth.apiKeyName ?? ''}
                onChange={(apiKeyName) => onChange({ ...auth, apiKeyName })}
                placeholder="x-api-key"
                compact
              />
            </Field>
            <Field label="Value">
              <SecretInput
                value={auth.apiKeyValue ?? ''}
                onChange={(apiKeyValue) => onChange({ ...auth, apiKeyValue })}
              />
            </Field>
          </div>
          <Field label="Add to">
            <Segmented
              value={auth.apiKeyLocation ?? 'header'}
              options={[
                { value: 'header', label: 'Header' },
                { value: 'query', label: 'Query Params' }
              ]}
              onChange={(apiKeyLocation) => onChange({ ...auth, apiKeyLocation })}
            />
          </Field>
        </div>
      )}

      {selected === 'oauth1' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Consumer Key">
              <ExpandableField
                value={auth.oauth1ConsumerKey ?? ''}
                onChange={(oauth1ConsumerKey) => onChange({ ...auth, oauth1ConsumerKey })}
                compact
              />
            </Field>
            <Field label="Consumer Secret">
              <SecretInput
                value={auth.oauth1ConsumerSecret ?? ''}
                onChange={(oauth1ConsumerSecret) => onChange({ ...auth, oauth1ConsumerSecret })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Access Token">
              <ExpandableField
                value={auth.oauth1Token ?? ''}
                onChange={(oauth1Token) => onChange({ ...auth, oauth1Token })}
                compact
              />
            </Field>
            <Field label="Token Secret">
              <SecretInput
                value={auth.oauth1TokenSecret ?? ''}
                onChange={(oauth1TokenSecret) => onChange({ ...auth, oauth1TokenSecret })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signature Method">
              <select
                className={SELECT}
                value={auth.oauth1SignatureMethod ?? 'HMAC-SHA1'}
                onChange={(e) =>
                  onChange({ ...auth, oauth1SignatureMethod: e.target.value as OAuth1SignatureMethod })
                }
              >
                {OAUTH1_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Version">
              <ExpandableField
                value={auth.oauth1Version ?? '1.0'}
                onChange={(oauth1Version) => onChange({ ...auth, oauth1Version })}
                compact
              />
            </Field>
          </div>
          <Field label="Realm (optional)">
            <ExpandableField
              value={auth.oauth1Realm ?? ''}
              onChange={(oauth1Realm) => onChange({ ...auth, oauth1Realm })}
              compact
            />
          </Field>
        </div>
      )}

      {selected === 'oauth2' && (
        <div className="space-y-3">
          <Field label="Grant type">
            <select
              className={SELECT}
              value={grantType}
              onChange={(e) => onChange({ ...auth, oauth2GrantType: e.target.value as OAuth2GrantType })}
            >
              {OAUTH2_GRANTS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
          {grantType === 'authorization_code' && (
            <Field label="Authorization URL">
              <ExpandableField
                value={auth.oauth2AuthUrl ?? ''}
                onChange={(oauth2AuthUrl) => onChange({ ...auth, oauth2AuthUrl })}
                placeholder="https://provider.com/oauth/authorize"
                compact
                mono
              />
            </Field>
          )}
          <Field label="Access Token URL">
            <ExpandableField
              value={auth.oauth2TokenUrl ?? ''}
              onChange={(oauth2TokenUrl) => onChange({ ...auth, oauth2TokenUrl })}
              placeholder="https://provider.com/oauth/token"
              compact
              mono
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client ID">
              <ExpandableField
                value={auth.oauth2ClientId ?? ''}
                onChange={(oauth2ClientId) => onChange({ ...auth, oauth2ClientId })}
                compact
              />
            </Field>
            <Field label="Client Secret">
              <SecretInput
                value={auth.oauth2ClientSecret ?? ''}
                onChange={(oauth2ClientSecret) => onChange({ ...auth, oauth2ClientSecret })}
              />
            </Field>
          </div>
          {grantType === 'password' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username">
                <ExpandableField
                  value={auth.oauth2Username ?? ''}
                  onChange={(oauth2Username) => onChange({ ...auth, oauth2Username })}
                  compact
                />
              </Field>
              <Field label="Password">
                <SecretInput
                  value={auth.oauth2Password ?? ''}
                  onChange={(oauth2Password) => onChange({ ...auth, oauth2Password })}
                />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scope">
              <ExpandableField
                value={auth.oauth2Scope ?? ''}
                onChange={(oauth2Scope) => onChange({ ...auth, oauth2Scope })}
                placeholder="read write"
                compact
              />
            </Field>
            {grantType === 'authorization_code' && (
              <Field label="Redirect URI">
                <ExpandableField
                  value={auth.oauth2RedirectUri ?? DEFAULT_REDIRECT}
                  onChange={(oauth2RedirectUri) => onChange({ ...auth, oauth2RedirectUri })}
                  compact
                  mono
                />
              </Field>
            )}
          </div>
          <Button size="sm" onClick={() => void handleOAuthToken()} disabled={oauthLoading}>
            {oauthLoading ? <Spinner size="sm" /> : <Shield className="h-3.5 w-3.5" />}
            Get New Access Token
          </Button>
          {auth.oauth2AccessToken && (
            <Field label="Access Token">
              <SecretInput value={auth.oauth2AccessToken} readOnly />
            </Field>
          )}
        </div>
      )}

      {selected === 'aws' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Access Key">
              <ExpandableField
                value={auth.awsAccessKey ?? ''}
                onChange={(awsAccessKey) => onChange({ ...auth, awsAccessKey })}
                compact
              />
            </Field>
            <Field label="Secret Key">
              <SecretInput
                value={auth.awsSecretKey ?? ''}
                onChange={(awsSecretKey) => onChange({ ...auth, awsSecretKey })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Region">
              <ExpandableField
                value={auth.awsRegion ?? 'us-east-1'}
                onChange={(awsRegion) => onChange({ ...auth, awsRegion })}
                placeholder="us-east-1"
                compact
              />
            </Field>
            <Field label="Service Name">
              <ExpandableField
                value={auth.awsService ?? 'execute-api'}
                onChange={(awsService) => onChange({ ...auth, awsService })}
                placeholder="execute-api"
                compact
              />
            </Field>
          </div>
          <Field label="Session Token (optional)">
            <SecretInput
              value={auth.awsSessionToken ?? ''}
              onChange={(awsSessionToken) => onChange({ ...auth, awsSessionToken })}
            />
          </Field>
        </div>
      )}

      {selected === 'hawk' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hawk Auth ID">
              <ExpandableField
                value={auth.hawkId ?? ''}
                onChange={(hawkId) => onChange({ ...auth, hawkId })}
                compact
              />
            </Field>
            <Field label="Auth Key">
              <SecretInput value={auth.hawkKey ?? ''} onChange={(hawkKey) => onChange({ ...auth, hawkKey })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Algorithm">
              <select
                className={SELECT}
                value={auth.hawkAlgorithm ?? 'sha256'}
                onChange={(e) => onChange({ ...auth, hawkAlgorithm: e.target.value as HawkAlgorithm })}
              >
                {HAWK_ALGS.map((alg) => (
                  <option key={alg} value={alg}>
                    {alg}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="User (optional)">
              <ExpandableField
                value={auth.hawkUser ?? ''}
                onChange={(hawkUser) => onChange({ ...auth, hawkUser })}
                compact
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nonce (optional)">
              <ExpandableField
                value={auth.hawkNonce ?? ''}
                onChange={(hawkNonce) => onChange({ ...auth, hawkNonce })}
                placeholder="Generated if empty"
                compact
              />
            </Field>
            <Field label="App (optional)">
              <ExpandableField
                value={auth.hawkApp ?? ''}
                onChange={(hawkApp) => onChange({ ...auth, hawkApp })}
                compact
              />
            </Field>
          </div>
          <Field label="Extra data (optional)">
            <ExpandableField
              value={auth.hawkExt ?? ''}
              onChange={(hawkExt) => onChange({ ...auth, hawkExt })}
              compact
            />
          </Field>
        </div>
      )}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md border px-2.5 py-1 text-xs transition-colors',
            value === opt.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
