import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { VAULT_ITEM_TYPES, useVaultStore } from '../stores/vault.store'
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator'
import type { VaultItemType } from '@shared/types/vault'

interface NewCredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderId?: string | null
}

export function NewCredentialDialog({ open, onOpenChange, folderId }: NewCredentialDialogProps) {
  const { createItem, generatePassword, folders } = useVaultStore()
  const [title, setTitle] = useState('')
  const [itemType, setItemType] = useState<VaultItemType>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string>(folderId ?? '')
  const [strength, setStrength] = useState(0)

  const handleGenerate = async () => {
    const res = await window.electronAPI.vault.generatePassword({ length: 20 })
    if (res.success && res.data) {
      setPassword(res.data.password)
      setStrength(res.data.strength)
    }
  }

  const handleCreate = async () => {
    if (!title.trim()) return
    await createItem({
      folderId: selectedFolder || null,
      itemType,
      title: title.trim(),
      secrets: { username, password, url }
    })
    onOpenChange(false)
    setTitle('')
    setUsername('')
    setPassword('')
    setUrl('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Credential</DialogTitle>
        </DialogHeader>
      <div className="space-y-4">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Type</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={itemType}
              onChange={(e) => setItemType(e.target.value as VaultItemType)}
            >
              {VAULT_ITEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Folder</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
            >
              <option value="">None</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="font-mono"
            autoComplete="new-password"
          />
          <Button variant="outline" onClick={handleGenerate}>
            Generate
          </Button>
        </div>
        {password && <PasswordStrengthIndicator score={strength || 5} />}
        <p className="text-[11px] text-muted-foreground">
          Passwords are never shown after saving — use Copy to paste.
        </p>
        <Input placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim()}>
            Save Credential
          </Button>
        </div>
      </div>
    </DialogContent>
    </Dialog>
  )
}
