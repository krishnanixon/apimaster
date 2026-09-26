import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { flattenFolderTree } from '../services/folderTree'

interface SaveRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestName: string
  onConfirm: (collectionId: string, folderId: string | null, name: string) => void
}

export function SaveRequestDialog({ open, onOpenChange, requestName, onConfirm }: SaveRequestDialogProps) {
  const collections = useApiStudioStore((s) => s.collections)
  const createCollection = useApiStudioStore((s) => s.createCollection)
  const [name, setName] = useState(requestName)
  const [collectionId, setCollectionId] = useState<string>(collections[0]?.id ?? '')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [newCollectionName, setNewCollectionName] = useState('')
  const submittedRef = useRef(false)

  useEffect(() => {
    if (open) submittedRef.current = false
  }, [open])

  const activeCollection = collections.find((c) => c.id === collectionId)
  const folderOptions = activeCollection ? flattenFolderTree(activeCollection.folders) : []

  function handleSave() {
    if (submittedRef.current) return
    let targetId = collectionId
    if (!targetId && newCollectionName.trim()) {
      targetId = createCollection(newCollectionName.trim()).id
    }
    if (!targetId) return
    submittedRef.current = true
    onConfirm(targetId, folderId, name)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Request name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </label>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Collection</span>
            {collections.length === 0 ? (
              <Input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="New collection name"
                className="h-9"
              />
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCollectionId(c.id)
                      setFolderId(null)
                    }}
                    className={cn(
                      'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      collectionId === c.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeCollection && folderOptions.length > 0 && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Folder (optional)</span>
              <select
                value={folderId ?? ''}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="">No folder (collection root)</option>
                {folderOptions.map(({ folder, depth }) => (
                  <option key={folder.id} value={folder.id}>
                    {'\u00A0'.repeat(depth * 2)}
                    {depth > 0 ? '└ ' : ''}
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || (!collectionId && !newCollectionName.trim())}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
