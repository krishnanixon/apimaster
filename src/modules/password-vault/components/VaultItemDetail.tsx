import { useEffect, useState } from 'react'
import {
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Archive,
  Trash2,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Pencil,
  X
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Badge } from '@/shared/components/ui/badge'
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator'
import { VaultConfirmDialog, type VaultConfirmAction } from './VaultConfirmDialog'
import { MASKED_PLACEHOLDER } from '../lib/vault-secrets'
import type { VaultItem, VaultItemListEntry, VaultItemSecrets } from '@shared/types/vault'
import { useVaultStore } from '../stores/vault.store'

interface VaultItemDetailProps {
  item: VaultItemListEntry
}

function CopyOnlyField({
  label,
  onCopy,
  visible = true
}: {
  label: string
  onCopy: () => void
  visible?: boolean
}) {
  if (!visible) return null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 font-mono text-sm tracking-widest text-muted-foreground">
        {MASKED_PLACEHOLDER}
      </div>
    </div>
  )
}

function RevealableField({
  label,
  value,
  revealed,
  onReveal,
  onCopy,
  editing,
  onChange,
  multiline = false
}: {
  label: string
  value: string
  revealed: boolean
  onReveal: () => void
  onCopy: () => void
  editing?: boolean
  onChange?: (v: string) => void
  multiline?: boolean
}) {
  if (!value && !editing) return null

  const display = editing ? value : revealed ? value : value ? MASKED_PLACEHOLDER : ''

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {!editing && value && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onReveal}>
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCopy}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {editing && onChange ? (
        multiline ? (
          <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[80px] text-sm" />
        ) : (
          <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
        )
      ) : multiline ? (
        <Textarea readOnly value={display} className="min-h-[80px] text-sm" />
      ) : (
        <Input readOnly value={display} className="text-sm" />
      )}
    </div>
  )
}

const EMPTY_SECRETS: VaultItemSecrets = {
  username: '',
  password: '',
  url: '',
  notes: '',
  email: '',
  phone: '',
  apiKey: '',
  secretKey: '',
  privateKey: '',
  publicKey: '',
  jwtSecret: '',
  databaseUsername: '',
  databasePassword: '',
  sshUsername: '',
  sshPassword: '',
  token: ''
}

export function VaultItemDetail({ item }: VaultItemDetailProps) {
  const {
    revealedFields,
    revealField,
    copyField,
    updateItem,
    archiveItem,
    trashItem,
    restoreItem,
    deleteItemPermanent,
    generatePassword,
    viewFilter
  } = useVaultStore()

  const [editing, setEditing] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [draft, setDraft] = useState<VaultItemSecrets>(EMPTY_SECRETS)
  const [confirmAction, setConfirmAction] = useState<VaultConfirmAction | null>(null)

  useEffect(() => {
    setEditing(false)
    setDraft(EMPTY_SECRETS)
  }, [item.id])

  const handleStartEdit = async () => {
    setLoadingEdit(true)
    const res = await window.electronAPI.vault.getItem(item.id, true)
    setLoadingEdit(false)
    if (res.success && res.data) {
      const full = res.data as VaultItem
      setDraft({
        username: full.username ?? '',
        password: full.password ?? '',
        url: full.url ?? item.url ?? '',
        notes: full.notes ?? '',
        email: full.email ?? '',
        phone: full.phone ?? '',
        apiKey: full.apiKey ?? '',
        secretKey: full.secretKey ?? '',
        privateKey: full.privateKey ?? '',
        publicKey: full.publicKey ?? '',
        jwtSecret: full.jwtSecret ?? '',
        databaseUsername: full.databaseUsername ?? '',
        databasePassword: full.databasePassword ?? '',
        sshUsername: full.sshUsername ?? '',
        sshPassword: full.sshPassword ?? '',
        token: full.token ?? ''
      })
      setEditing(true)
    }
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setDraft(EMPTY_SECRETS)
  }

  const handleSave = async () => {
    await updateItem(item.id, {
      title: item.title,
      secrets: draft
    })
    setEditing(false)
    setDraft(EMPTY_SECRETS)
  }

  const handleGeneratePassword = async () => {
    const pwd = await generatePassword()
    if (!pwd) return
    if (editing) {
      setDraft((d) => ({ ...d, password: pwd }))
    } else {
      await updateItem(item.id, { secrets: { password: pwd } })
    }
  }

  const handleConfirm = async (action: VaultConfirmAction) => {
    setConfirmAction(null)
    switch (action.type) {
      case 'archive-item':
        await archiveItem(action.id)
        break
      case 'trash-item':
        await trashItem(action.id)
        break
      case 'delete-item':
        await deleteItemPermanent(action.id)
        break
    }
  }

  const isTrash = Boolean(item.deletedAt) || viewFilter === 'trash'
  const isArchive = Boolean(item.archivedAt) || viewFilter === 'archive'

  return (
    <>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="border-b border-border/50 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold tracking-tight">{item.title}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="capitalize">
                  {item.itemType.replace('_', ' ')}
                </Badge>
                {item.isWeak && <Badge variant="destructive">Weak</Badge>}
                {item.isDuplicate && <Badge className="bg-amber-500/15 text-amber-600">Duplicate</Badge>}
                {item.isExpired && <Badge className="bg-red-500/15 text-red-600">Expired</Badge>}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              {item.url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => void window.electronAPI.app.openExternal(item.url)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              {editing ? (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    Save
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleStartEdit}
                  disabled={loadingEdit}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <RevealableField
            label="Username"
            value={editing ? draft.username : item.username}
            revealed={Boolean(revealedFields.username)}
            onReveal={() => void revealField('username')}
            onCopy={() => void copyField('username')}
            editing={editing}
            onChange={(v) => setDraft((d) => ({ ...d, username: v }))}
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleGeneratePassword} title="Generate new password">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                {(editing || item.hasPassword) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void copyField('password')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                )}
              </div>
            </div>
            {editing ? (
              <Input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                placeholder="Enter or generate password"
                className="font-mono"
                autoComplete="new-password"
              />
            ) : (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 font-mono text-sm tracking-widest text-muted-foreground">
                {item.hasPassword ? MASKED_PLACEHOLDER : '—'}
              </div>
            )}
            <PasswordStrengthIndicator score={item.passwordStrength} />
          </div>

          {(item.itemType === 'database' || editing) && (
            <>
              <RevealableField
                label="Database Username"
                value={editing ? draft.databaseUsername : item.username}
                revealed={Boolean(revealedFields.databaseUsername)}
                onReveal={() => void revealField('databaseUsername')}
                onCopy={() => void copyField('databaseUsername')}
                editing={editing}
                onChange={(v) => setDraft((d) => ({ ...d, databaseUsername: v }))}
              />
              <CopyOnlyField
                label="Database Password"
                visible={!editing && item.hasPassword}
                onCopy={() => void copyField('databasePassword')}
              />
              {editing && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Database Password</label>
                  <Input
                    type="password"
                    value={draft.databasePassword}
                    onChange={(e) => setDraft((d) => ({ ...d, databasePassword: e.target.value }))}
                    placeholder="Database password"
                    className="font-mono"
                    autoComplete="new-password"
                  />
                </div>
              )}
            </>
          )}

          {(item.itemType === 'ssh' || editing) && (
            <>
              <RevealableField
                label="SSH Username"
                value={editing ? draft.sshUsername : item.username}
                revealed={Boolean(revealedFields.sshUsername)}
                onReveal={() => void revealField('sshUsername')}
                onCopy={() => void copyField('sshUsername')}
                editing={editing}
                onChange={(v) => setDraft((d) => ({ ...d, sshUsername: v }))}
              />
              <CopyOnlyField
                label="SSH Password"
                visible={!editing && item.hasPassword}
                onCopy={() => void copyField('sshPassword')}
              />
              {editing && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">SSH Password</label>
                  <Input
                    type="password"
                    value={draft.sshPassword}
                    onChange={(e) => setDraft((d) => ({ ...d, sshPassword: e.target.value }))}
                    placeholder="SSH password"
                    className="font-mono"
                    autoComplete="new-password"
                  />
                </div>
              )}
            </>
          )}

          {(item.itemType === 'api_key' || editing) && (
            <>
              {!editing && (
                <>
                  <CopyOnlyField label="API Key" visible={item.hasPassword} onCopy={() => void copyField('apiKey')} />
                  <CopyOnlyField label="Secret Key" onCopy={() => void copyField('secretKey')} />
                  <CopyOnlyField label="JWT Secret" onCopy={() => void copyField('jwtSecret')} />
                </>
              )}
              {editing && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">API Key</label>
                    <Input
                      type="password"
                      value={draft.apiKey}
                      onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                      placeholder="API key"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Secret Key</label>
                    <Input
                      type="password"
                      value={draft.secretKey}
                      onChange={(e) => setDraft((d) => ({ ...d, secretKey: e.target.value }))}
                      placeholder="Secret key"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">JWT Secret</label>
                    <Input
                      type="password"
                      value={draft.jwtSecret}
                      onChange={(e) => setDraft((d) => ({ ...d, jwtSecret: e.target.value }))}
                      placeholder="JWT secret"
                      className="font-mono"
                    />
                  </div>
                </>
              )}
            </>
          )}

          <RevealableField
            label="URL"
            value={editing ? draft.url : item.url}
            revealed
            onReveal={() => {}}
            onCopy={() => void copyField('url')}
            editing={editing}
            onChange={(v) => setDraft((d) => ({ ...d, url: v }))}
          />

          <RevealableField
            label="Notes"
            value={editing ? draft.notes : (revealedFields.notes ?? '')}
            revealed={Boolean(revealedFields.notes)}
            onReveal={() => void revealField('notes')}
            onCopy={() => void copyField('notes')}
            editing={editing}
            onChange={(v) => setDraft((d) => ({ ...d, notes: v }))}
            multiline
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-5 py-3">
          {isTrash ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void restoreItem(item.id)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Restore
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  setConfirmAction({ type: 'delete-item', id: item.id, title: item.title })
                }
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete permanently
              </Button>
            </>
          ) : isArchive ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void restoreItem(item.id)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Restore
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfirmAction({ type: 'trash-item', id: item.id, title: item.title })
                }
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Trash
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfirmAction({ type: 'archive-item', id: item.id, title: item.title })
                }
              >
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                Archive
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfirmAction({ type: 'trash-item', id: item.id, title: item.title })
                }
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Trash
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => updateItem(item.id, { favorite: !item.favorite })}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {item.favorite ? 'Unfavorite' : 'Favorite'}
          </Button>
        </div>
      </div>

      <VaultConfirmDialog
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
