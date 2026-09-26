import { useCallback, useEffect, useRef, useState } from 'react'
import { FileKey, KeyRound, Lock, Shield, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Spinner } from '@/shared/components/ui/spinner'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'
import {
  detectSshKeyFormat,
  isLikelySshKeyFileName,
  looksLikeVpsTarget,
  parseVpsTarget,
  sshKeyFormatLabel,
  sshKeyTypeLabel
} from '@shared/lib/vps-connection'
import { useVPSStore } from '../stores/vps.store'
import type { SshAgentKind, VPSKeyInspectResult, VPSServerInput } from '../types/server.types'

export type AuthTab = 'password' | 'sshKey' | 'agent'

export interface SeededSshKey {
  privateKey: string
  fileName?: string
}

interface AddServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (serverId: string) => void
  initialAuth?: AuthTab
  seedKey?: SeededSshKey | null
  onSeedConsumed?: () => void
}

interface FormState {
  os: 'linux' | 'windows'
  name: string
  host: string
  port: string
  username: string
  authType: AuthTab
  password: string
  sshKey: string
  passphrase: string
  keyFileName: string
  agentKind: SshAgentKind
  connectAfter: boolean
}

const defaultForm: FormState = {
  os: 'linux',
  name: '',
  host: '',
  port: '22',
  username: 'root',
  authType: 'sshKey',
  password: '',
  sshKey: '',
  passphrase: '',
  keyFileName: '',
  agentKind: 'openssh',
  connectAfter: true
}

function buildInput(form: FormState): VPSServerInput {
  return {
    os: form.os,
    name: form.name.trim(),
    host: form.host.trim(),
    port: Number(form.port),
    username: form.username.trim(),
    authType: form.authType,
    password: form.authType === 'password' ? form.password : undefined,
    sshKey: form.authType === 'sshKey' ? form.sshKey : undefined,
    passphrase: form.authType === 'sshKey' && form.passphrase ? form.passphrase : undefined,
    keyFileName: form.authType === 'sshKey' ? form.keyFileName || undefined : undefined,
    agentKind: form.authType === 'agent' ? form.agentKind : undefined
  }
}

export function AddServerDialog({
  open,
  onOpenChange,
  onCreated,
  initialAuth = 'sshKey',
  seedKey,
  onSeedConsumed
}: AddServerDialogProps) {
  const { createServer, pickKeyFile, inspectKey, testConnection, isCreatingServer } = useVPSStore()
  const [form, setForm] = useState(defaultForm)
  const [inspect, setInspect] = useState<VPSKeyInspectResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const seedHandledRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      seedHandledRef.current = null
      return
    }
    setForm({ ...defaultForm, authType: initialAuth })
    setInspect(null)
    setTesting(false)
    setDragOver(false)
    setShowPaste(false)
  }, [open, initialAuth])

  const applyTarget = useCallback((raw: string, current: FormState): FormState => {
    if (!looksLikeVpsTarget(raw) && !/:\d+$/.test(raw.trim())) {
      return { ...current, host: raw }
    }
    const parsed = parseVpsTarget(raw)
    if (!parsed) return { ...current, host: raw }
    return {
      ...current,
      host: parsed.host,
      port: parsed.port ? String(parsed.port) : current.port,
      username: parsed.username || current.username,
      name: current.name || parsed.host
    }
  }, [])

  const applyKey = useCallback(
    async (privateKey: string, fileName?: string, passphrase?: string) => {
      const nextPass = passphrase ?? form.passphrase
      let result: VPSKeyInspectResult
      try {
        result = await inspectKey(privateKey, nextPass || undefined)
      } catch {
        result = {
          format: detectSshKeyFormat(privateKey),
          encrypted: false,
          valid: false,
          fileName,
          error: 'Could not inspect this key'
        }
      }
      setInspect(result)
      setForm((prev) => ({
        ...prev,
        authType: 'sshKey',
        sshKey: privateKey,
        keyFileName: fileName || prev.keyFileName,
        passphrase: nextPass,
        name:
          prev.name || (fileName ? fileName.replace(/\.(pem|ppk|key|openssh)$/i, '') : prev.name)
      }))
      setShowPaste(!fileName)
      if (result.encrypted && !nextPass) {
        toast.message('This key is encrypted — enter the passphrase')
      } else if (result.valid) {
        toast.success(
          `${sshKeyFormatLabel(result.format)}${result.keyType ? ` · ${sshKeyTypeLabel(result.keyType)}` : ''} key loaded`
        )
      } else if (result.error) {
        toast.error(result.error)
      }
    },
    [form.passphrase, inspectKey]
  )

  useEffect(() => {
    if (!open || !seedKey?.privateKey) return
    const token = `${seedKey.fileName ?? ''}:${seedKey.privateKey.length}`
    if (seedHandledRef.current === token) return
    seedHandledRef.current = token
    void applyKey(seedKey.privateKey, seedKey.fileName)
    onSeedConsumed?.()
  }, [open, seedKey, applyKey, onSeedConsumed])

  const handleBrowse = async () => {
    try {
      const picked = await pickKeyFile(form.passphrase || undefined)
      if (!picked) return
      setInspect(picked)
      setForm((prev) => ({
        ...prev,
        authType: 'sshKey',
        sshKey: picked.privateKey,
        keyFileName: picked.fileName || prev.keyFileName,
        name:
          prev.name ||
          (picked.fileName ? picked.fileName.replace(/\.(pem|ppk|key|openssh)$/i, '') : prev.name)
      }))
      setShowPaste(false)
      if (picked.encrypted && !form.passphrase) {
        toast.message('This key is encrypted — enter the passphrase')
      } else if (picked.valid) {
        toast.success(
          `${sshKeyFormatLabel(picked.format)}${picked.keyType ? ` · ${sshKeyTypeLabel(picked.keyType)}` : ''} key loaded`
        )
      } else if (picked.error) {
        toast.error(picked.error)
      }
    } catch {
      // store already toasted
    }
  }

  const handleDroppedFile = async (file: File) => {
    if (
      file.name.endsWith('.pub') ||
      (!isLikelySshKeyFileName(file.name) && file.size > 64 * 1024)
    ) {
      toast.error('Drop a PEM, OpenSSH, or PuTTY (.ppk) private key')
      return
    }
    const text = await file.text()
    await applyKey(text, file.name)
  }

  const canSubmit =
    Number.isInteger(Number(form.port)) &&
    Number(form.port) > 0 &&
    Number(form.port) <= 65535 &&
    Boolean(form.name.trim() && form.host.trim() && form.username.trim()) &&
    (form.authType === 'agent' ||
      (form.authType === 'password' && Boolean(form.password)) ||
      (form.authType === 'sshKey' && Boolean(form.sshKey.trim())))

  const busy = isCreatingServer || testing

  const handleTest = async () => {
    if (!canSubmit) return
    setTesting(true)
    try {
      await testConnection(buildInput(form))
    } catch {
      // store already toasted
    } finally {
      setTesting(false)
    }
  }

  const handleCreate = async () => {
    if (!canSubmit) return
    try {
      const server = await createServer(buildInput(form))
      onOpenChange(false)
      if (form.connectAfter) onCreated?.(server.id)
    } catch {
      // store already toasted
    }
  }

  const keyLoaded = Boolean(form.sshKey.trim())

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add VPS Server</DialogTitle>
          <DialogDescription>
            Connect with a PEM file, OpenSSH/PuTTY key, password, or your local SSH agent.
            Credentials are encrypted before storage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Operating system" hint="Connect securely over SSH">
            <div className="grid grid-cols-2 gap-2">
              {(['linux', 'windows'] as const).map((os) => (
                <Button
                  key={os}
                  type="button"
                  variant={form.os === os ? 'default' : 'outline'}
                  aria-pressed={form.os === os}
                  disabled={busy}
                  onClick={() =>
                    setForm({
                      ...form,
                      os,
                      username: ['root', 'Administrator'].includes(form.username)
                        ? os === 'windows'
                          ? 'Administrator'
                          : 'root'
                        : form.username
                    })
                  }
                >
                  {os === 'windows' ? 'Windows Server' : 'Linux'}
                </Button>
              ))}
            </div>
          </Field>
          {form.os === 'windows' && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed">
              <p className="font-medium">Windows Server · PowerShell over SSH</p>
              <p className="mt-1 text-muted-foreground">
                Enable OpenSSH Server, start the sshd service, and allow your SSH port through the
                firewall. Use a local or domain account. This connection uses SSH (usually port 22),
                not Remote Desktop (3389).
              </p>
              <p className="mt-1 text-muted-foreground">
                PowerShell 5.1 or later is required. Install Git, Node.js and PM2 on the server to
                use deployments and process tools.
              </p>
            </div>
          )}
          <Field label="Name">
            <Input
              placeholder="Production API"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={busy}
            />
          </Field>
          <Field label="Host" hint="IP, domain, or user@host">
            <Input
              placeholder="ubuntu@192.168.1.10 or ssh://user@host:22"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              onBlur={(e) => setForm((prev) => applyTarget(e.target.value, prev))}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                if (looksLikeVpsTarget(text)) {
                  e.preventDefault()
                  setForm((prev) => applyTarget(text, prev))
                }
              }}
              disabled={busy}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Port">
              <Input
                type="number"
                min={1}
                max={65535}
                placeholder="22"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                disabled={busy}
              />
            </Field>
            <Field label="Username">
              <Input
                placeholder={
                  form.os === 'windows' ? 'Administrator or DOMAIN\\user' : 'root or ubuntu'
                }
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                disabled={busy}
              />
            </Field>
          </div>

          <Tabs
            value={form.authType}
            onValueChange={(value) => setForm({ ...form, authType: value as AuthTab })}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sshKey" disabled={busy}>
                <FileKey className="h-3.5 w-3.5" />
                PEM / Key
              </TabsTrigger>
              <TabsTrigger value="password" disabled={busy}>
                <Lock className="h-3.5 w-3.5" />
                Password
              </TabsTrigger>
              <TabsTrigger value="agent" disabled={busy}>
                <Shield className="h-3.5 w-3.5" />
                SSH Agent
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sshKey" className="mt-3 space-y-3">
              <div
                className={cn(
                  'rounded-lg border border-dashed px-4 py-5 text-center transition-colors',
                  dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
                )}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file) void handleDroppedFile(file)
                }}
              >
                <Upload className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">Drop a .pem, .ppk, or OpenSSH key</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  AWS, Lightsail, DigitalOcean, Linode, and id_ed25519 / id_rsa files
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleBrowse}
                    disabled={busy}
                  >
                    <FileKey className="mr-1.5 h-3.5 w-3.5" />
                    Browse key file
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowPaste((v) => !v)}
                    disabled={busy}
                  >
                    Paste key
                  </Button>
                </div>
              </div>

              {keyLoaded && (
                <div className="flex items-start justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate text-sm font-medium">
                        {form.keyFileName || 'Pasted private key'}
                      </span>
                      {inspect && (
                        <Badge variant="outline" className="text-[10px]">
                          {sshKeyFormatLabel(inspect.format)}
                          {inspect.keyType ? ` · ${sshKeyTypeLabel(inspect.keyType)}` : ''}
                        </Badge>
                      )}
                    </div>
                    {inspect?.error && !inspect.valid && (
                      <p className="mt-1 text-xs text-destructive">{inspect.error}</p>
                    )}
                    {inspect?.valid && inspect.comment && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {inspect.comment}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => {
                      setForm({ ...form, sshKey: '', keyFileName: '', passphrase: '' })
                      setInspect(null)
                    }}
                    disabled={busy}
                    aria-label="Clear key"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {showPaste && (
                <Textarea
                  className="font-mono text-xs"
                  rows={5}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={form.keyFileName ? '' : form.sshKey}
                  onChange={(e) => {
                    const value = e.target.value
                    setForm({ ...form, sshKey: value, keyFileName: '' })
                    if (value.trim()) {
                      const format = detectSshKeyFormat(value)
                      setInspect({
                        format,
                        encrypted: false,
                        valid: format !== 'public' && format !== 'unknown'
                      })
                    } else {
                      setInspect(null)
                    }
                  }}
                  disabled={busy}
                />
              )}

              <Field label="Passphrase" hint="Required if the key is encrypted">
                <Input
                  type="password"
                  placeholder="Optional key passphrase"
                  value={form.passphrase}
                  onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                  onBlur={() => {
                    if (form.sshKey)
                      void applyKey(form.sshKey, form.keyFileName || undefined, form.passphrase)
                  }}
                  disabled={busy}
                />
              </Field>
            </TabsContent>

            <TabsContent value="password" className="mt-3">
              <Field label="Password">
                <Input
                  type="password"
                  placeholder="SSH password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  disabled={busy}
                />
              </Field>
            </TabsContent>

            <TabsContent value="agent" className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Uses keys already loaded in your local agent — nothing is stored in this app. On
                Windows this is OpenSSH or Pageant; on macOS and Linux it uses SSH_AUTH_SOCK.
              </p>
              <Field label="Agent">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-soft"
                  value={form.agentKind}
                  onChange={(e) => setForm({ ...form, agentKind: e.target.value as SshAgentKind })}
                  disabled={busy}
                >
                  <option value="openssh">OpenSSH agent</option>
                  <option value="pageant">Pageant (PuTTY)</option>
                </select>
              </Field>
            </TabsContent>
          </Tabs>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={form.connectAfter}
              onChange={(e) => setForm({ ...form, connectAfter: e.target.checked })}
              disabled={busy}
            />
            Connect after adding
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={!canSubmit || busy}>
            {testing && <Spinner size="sm" className="mr-1.5 text-current" />}
            {testing ? 'Testing...' : 'Test connection'}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canSubmit || busy}>
            {isCreatingServer && <Spinner size="sm" className="mr-1.5 text-current" />}
            {isCreatingServer ? 'Adding...' : 'Add Server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between text-xs font-medium text-muted-foreground">
        {label}
        {hint && <span className="font-normal text-muted-foreground/80">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
