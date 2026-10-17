import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Cookie, FileKey2, Globe, Laptop, Network, Plus, ShieldCheck, Trash2, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import type {
  ClientCertificate,
  NetworkSecretsPatch,
  NetworkSettingsPatch,
  NetworkSettingsView,
  ProxyMode
} from '@shared/types/network'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Badge } from '@/shared/components/ui/badge'
import { SettingToggle } from '@/features/settings/components/SettingToggle'
import {
  OptionCards,
  SegmentedControl,
  SettingsField,
  SettingsGroup,
  SettingsNote,
  SettingsSection
} from '@/features/settings/components/SettingsSection'

const PROXY_MODES = [
  { value: 'none', label: 'No proxy', hint: 'Connect directly', icon: Unplug },
  { value: 'system', label: 'System proxy', hint: 'Use the OS / PAC settings', icon: Laptop },
  { value: 'manual', label: 'Custom proxy', hint: 'HTTP(S) proxy you enter', icon: Network }
] as const

function fileName(path?: string): string {
  if (!path) return '—'
  return path.split(/[\\/]/).pop() || path
}

async function pickFile(title: string, kind: 'pem' | 'key' | 'pfx' | 'any'): Promise<string | null> {
  const res = await window.electronAPI.network.pickFile({ title, kind })
  if (!res.success) {
    toast.error(res.error ?? 'Could not open the file picker')
    return null
  }
  return res.data ?? null
}

/** Text input that saves when it loses focus (or on Enter). */
function CommitInput({
  value,
  onCommit,
  ...props
}: { value: string; onCommit: (value: string) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function SecretField({
  label,
  saved,
  disabled,
  onSave
}: {
  label: string
  saved: boolean
  disabled?: boolean
  onSave: (value: string | null) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="password"
        className="w-56"
        placeholder={saved ? '•••••••• (saved)' : label}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !draft}
        onClick={() => void onSave(draft).then(() => setDraft(''))}
      >
        Save
      </Button>
      {saved && (
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void onSave(null)}>
          Remove
        </Button>
      )}
    </div>
  )
}

function NewCertificateForm({ onAdd, onCancel }: { onAdd: (cert: ClientCertificate, passphrase: string) => void; onCancel: () => void }) {
  const [cert, setCert] = useState<ClientCertificate>({ id: uuidv4(), host: '', kind: 'pem', enabled: true })
  const [passphrase, setPassphrase] = useState('')
  const set = (patch: Partial<ClientCertificate>) => setCert((c) => ({ ...c, ...patch }))
  const fileButton = (label: string, key: 'certPath' | 'keyPath' | 'pfxPath', kind: 'pem' | 'key' | 'pfx') => (
    <Button
      size="sm"
      variant="outline"
      className="max-w-[220px] justify-start truncate"
      onClick={() =>
        void pickFile(`Choose ${label}`, kind).then((path) => {
          if (path) set({ [key]: path })
        })
      }
    >
      <FileKey2 className="h-3.5 w-3.5" />
      <span className="truncate">{cert[key] ? fileName(cert[key]) : label}</span>
    </Button>
  )
  const ready = cert.host.trim() && (cert.kind === 'pfx' ? cert.pfxPath : cert.certPath && cert.keyPath)

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Host, e.g. api.example.com or *.corp.local:8443"
          value={cert.host}
          onChange={(e) => set({ host: e.target.value })}
        />
        <SegmentedControl
          ariaLabel="Certificate format"
          value={cert.kind}
          options={[
            { value: 'pem', label: 'PEM (cert + key)' },
            { value: 'pfx', label: 'PFX / P12' }
          ]}
          onChange={(kind) => set({ kind })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {cert.kind === 'pem' ? (
          <>
            {fileButton('Certificate file', 'certPath', 'pem')}
            {fileButton('Key file', 'keyPath', 'key')}
          </>
        ) : (
          fileButton('PFX file', 'pfxPath', 'pfx')
        )}
        <Input
          type="password"
          className="w-48"
          placeholder="Passphrase (optional)"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!ready} onClick={() => onAdd({ ...cert, host: cert.host.trim() }, passphrase)}>
          Add certificate
        </Button>
      </div>
    </div>
  )
}

export function NetworkSettings() {
  const [settings, setSettings] = useState<NetworkSettingsView | null>(null)
  const [busy, setBusy] = useState(false)
  const [addingCert, setAddingCert] = useState(false)
  const [probeUrl, setProbeUrl] = useState('https://example.com')
  const [probeResult, setProbeResult] = useState<string | null>(null)

  useEffect(() => {
    void window.electronAPI.network.getSettings().then((res) => {
      if (res.success && res.data) setSettings(res.data)
      else toast.error(res.error ?? 'Could not load network settings')
    })
  }, [])

  async function save(patch: NetworkSettingsPatch) {
    setBusy(true)
    try {
      const res = await window.electronAPI.network.updateSettings(patch)
      if (!res.success || !res.data) toast.error(res.error ?? 'Could not save network settings')
      else setSettings(res.data)
    } finally {
      setBusy(false)
    }
  }

  async function saveSecrets(patch: NetworkSecretsPatch) {
    const res = await window.electronAPI.network.updateSecrets(patch)
    if (!res.success || !res.data) toast.error(res.error ?? 'Could not save the secret')
    else setSettings(res.data)
  }

  async function probe() {
    const res = await window.electronAPI.network.resolveProxy(probeUrl)
    if (!res.success || !res.data) {
      setProbeResult(res.error ?? 'Could not check')
      return
    }
    const { proxy, source, unsupported } = res.data
    setProbeResult(
      proxy
        ? `Through ${proxy}`
        : source === 'bypass'
          ? 'Direct (matches the bypass list)'
          : unsupported
            ? `Direct (${unsupported} proxies are not supported)`
            : 'Direct'
    )
  }

  if (!settings) return <p className="text-sm text-muted-foreground">Loading network settings…</p>

  const { proxy, tls, cookies, secrets } = settings

  return (
    <SettingsSection>
      <SettingsGroup
        title="Proxy"
        description="Applies to every request Shurikly sends: the request editor, WebSockets, collection runs, AI Engineer and MCP tools."
        icon={Globe}
      >
        <OptionCards
          ariaLabel="Proxy mode"
          columns={3}
          value={proxy.mode}
          options={PROXY_MODES}
          onChange={(mode: ProxyMode) => void save({ proxy: { mode } })}
        />

        {proxy.mode === 'manual' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsField label="HTTP proxy" description="For http:// and ws:// requests.">
                <CommitInput
                  placeholder="http://proxy.corp:8080"
                  value={proxy.httpProxy}
                  disabled={busy}
                  onCommit={(httpProxy) => void save({ proxy: { httpProxy } })}
                />
              </SettingsField>
              <SettingsField label="HTTPS proxy" description="For https:// and wss://. Empty uses the HTTP proxy.">
                <CommitInput
                  placeholder="Same as HTTP proxy"
                  value={proxy.httpsProxy}
                  disabled={busy}
                  onCommit={(httpsProxy) => void save({ proxy: { httpsProxy } })}
                />
              </SettingsField>
            </div>
            <SettingsField
              label="Bypass proxy for"
              description="Comma or newline separated, NO_PROXY style: localhost, .corp.example (and subdomains), *.internal, 10.0.0.0/8, host:8443, or * for everything."
            >
              <Textarea
                key={proxy.bypass}
                defaultValue={proxy.bypass}
                rows={2}
                className="font-mono text-xs"
                disabled={busy}
                onBlur={(e) => e.target.value !== proxy.bypass && void save({ proxy: { bypass: e.target.value } })}
              />
            </SettingsField>
            <div className="space-y-3 rounded-lg border border-border/60 p-4">
              <SettingToggle
                className="px-0 py-0 hover:bg-transparent"
                label="Proxy requires authentication"
                checked={proxy.authEnabled}
                disabled={busy}
                onChange={(authEnabled) => void save({ proxy: { authEnabled } })}
              />
              {proxy.authEnabled && (
                <div className="flex flex-wrap items-center gap-2">
                  <CommitInput
                    className="w-48"
                    placeholder="Username"
                    value={proxy.username}
                    disabled={busy}
                    onCommit={(username) => void save({ proxy: { username } })}
                  />
                  <SecretField
                    label="Password"
                    saved={secrets.proxyPassword}
                    disabled={!secrets.encryptionAvailable}
                    onSave={(proxyPassword) => saveSecrets({ proxyPassword })}
                  />
                </div>
              )}
              {proxy.authEnabled && !secrets.encryptionAvailable && (
                <p className="text-xs text-destructive">
                  Secure OS credential storage is unavailable, so the password can't be saved.
                </p>
              )}
            </div>
          </>
        )}

        {proxy.mode !== 'none' && (
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-72" value={probeUrl} onChange={(e) => setProbeUrl(e.target.value)} aria-label="URL to check" />
            <Button size="sm" variant="outline" onClick={() => void probe()} disabled={!probeUrl.trim()}>
              Check which proxy is used
            </Button>
            {probeResult && <span className="text-xs text-muted-foreground">{probeResult}</span>}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="SSL / TLS" description="How server certificates are checked." icon={ShieldCheck} flush>
        <SettingToggle
          label="Verify SSL certificates"
          description="Reject servers whose certificate is expired, self-signed or for another host. Individual requests can override this in their Settings tab."
          checked={tls.verifySsl}
          disabled={busy}
          onChange={(verifySsl) => void save({ tls: { verifySsl } })}
        />
        <SettingToggle
          label="Trust the operating system's certificates"
          description="Also trust root certificates installed on this computer, such as a company's inspection proxy CA."
          checked={tls.useSystemCa}
          disabled={busy}
          onChange={(useSystemCa) => void save({ tls: { useSystemCa } })}
        />
        <div className="space-y-2 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">CA certificates</p>
              <p className="mt-0.5 text-xs text-muted-foreground">PEM files trusted in addition to the built-in roots.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void pickFile('Choose a CA certificate (PEM)', 'pem').then((path) => {
                  if (path && !tls.caCertPaths.includes(path)) void save({ tls: { caCertPaths: [...tls.caCertPaths, path] } })
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add CA file
            </Button>
          </div>
          {tls.caCertPaths.map((path) => (
            <div key={path} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-xs">
              <FileKey2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono" title={path}>
                {path}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Remove"
                onClick={() => void save({ tls: { caCertPaths: tls.caCertPaths.filter((p) => p !== path) } })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Client certificates"
        description="Sent for mutual TLS when the request host matches. Passphrases are encrypted with your OS keychain."
        icon={FileKey2}
        actions={
          !addingCert && (
            <Button size="sm" variant="outline" onClick={() => setAddingCert(true)}>
              <Plus className="h-3.5 w-3.5" /> Add certificate
            </Button>
          )
        }
      >
        {tls.clientCertificates.length === 0 && !addingCert && (
          <p className="text-xs text-muted-foreground">No client certificates.</p>
        )}
        {tls.clientCertificates.map((cert) => (
          <div key={cert.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs">
            <span className="font-mono font-medium">{cert.host}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {cert.kind}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={[cert.certPath, cert.keyPath, cert.pfxPath].filter(Boolean).join('\n')}>
              {cert.kind === 'pfx' ? fileName(cert.pfxPath) : `${fileName(cert.certPath)} + ${fileName(cert.keyPath)}`}
            </span>
            {secrets.certificatePassphrases.includes(cert.id) && <span className="text-muted-foreground">passphrase saved</span>}
            <SegmentedControl
              ariaLabel="Certificate enabled"
              value={cert.enabled ? 'on' : 'off'}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' }
              ]}
              onChange={(v) =>
                void save({
                  tls: { clientCertificates: tls.clientCertificates.map((c) => (c.id === cert.id ? { ...c, enabled: v === 'on' } : c)) }
                })
              }
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Remove"
              onClick={() => void save({ tls: { clientCertificates: tls.clientCertificates.filter((c) => c.id !== cert.id) } })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {addingCert && (
          <NewCertificateForm
            onCancel={() => setAddingCert(false)}
            onAdd={(cert, passphrase) => {
              void (async () => {
                await save({ tls: { clientCertificates: [...tls.clientCertificates, cert] } })
                if (passphrase) await saveSecrets({ certificatePassphrases: { [cert.id]: passphrase } })
                setAddingCert(false)
              })()
            }}
          />
        )}
      </SettingsGroup>

      <SettingsGroup title="Cookies" icon={Cookie} flush>
        <SettingToggle
          label="Cookie jar"
          description="Save cookies from responses (including redirects) and send them with matching requests. Turn a single request off in its Settings tab."
          checked={cookies.enabled}
          disabled={busy}
          onChange={(enabled) => void save({ cookies: { enabled } })}
        />
      </SettingsGroup>

      <SettingsNote icon={Cookie}>
        Open the cookie manager from the cookie button in the request toolbar to view, edit or delete cookies by domain.
      </SettingsNote>
    </SettingsSection>
  )
}
