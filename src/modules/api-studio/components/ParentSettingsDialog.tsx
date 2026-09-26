import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { AuthTab } from './request/AuthTab'
import { HeadersTab } from './request/HeadersTab'
import { PreRequestTab } from './request/PreRequestTab'
import { createDefaultAuth, createEmptyKeyValue } from '../services/requestBuilder'
import { createInheritAuth, describeFolderInheritParent, resolveFolderParentAuth } from '../services/inheritance'
import type { RequestAuth } from '../types/api.types'

export type ParentSettingsTarget =
  | { kind: 'collection'; collectionId: string }
  | { kind: 'folder'; collectionId: string; folderId: string }

type SettingsTabId = 'auth' | 'headers' | 'scripts'

interface ParentSettingsDialogProps {
  target: ParentSettingsTarget | null
  onOpenChange: (open: boolean) => void
}

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'auth', label: 'Authorization' },
  { id: 'headers', label: 'Headers' },
  { id: 'scripts', label: 'Pre-request' }
]

export function ParentSettingsDialog({ target, onOpenChange }: ParentSettingsDialogProps) {
  const collections = useApiStudioStore((s) => s.collections)
  const updateCollectionSettings = useApiStudioStore((s) => s.updateCollectionSettings)
  const updateFolderSettings = useApiStudioStore((s) => s.updateFolderSettings)
  const switchChildRequestsToInherit = useApiStudioStore((s) => s.switchChildRequestsToInherit)
  const [tab, setTab] = useState<SettingsTabId>('auth')

  const collection = target ? collections.find((c) => c.id === target.collectionId) : undefined
  const folder =
    target?.kind === 'folder' ? collection?.folders.find((f) => f.id === target.folderId) : undefined
  const open = Boolean(target && collection && (target.kind === 'collection' || folder))

  const title =
    target?.kind === 'folder'
      ? `Folder authorization — ${folder?.name ?? ''}`
      : `Collection authorization — ${collection?.name ?? ''}`

  const auth: RequestAuth =
    target?.kind === 'folder'
      ? (folder?.auth ?? createInheritAuth())
      : (collection?.auth ?? createDefaultAuth())
  const headers = (target?.kind === 'folder' ? folder?.headers : collection?.headers) ?? [createEmptyKeyValue()]
  const script = (target?.kind === 'folder' ? folder?.preRequestScript : collection?.preRequestScript) ?? ''

  const inherit =
    target?.kind === 'folder' && folder && collection
      ? {
          parentLabel: describeFolderInheritParent(folder, collection),
          resolved: resolveFolderParentAuth(folder, collection).auth
        }
      : null

  function patch(next: { auth?: RequestAuth; headers?: typeof headers; preRequestScript?: string }) {
    if (!target) return
    if (target.kind === 'folder') updateFolderSettings(target.collectionId, target.folderId, next)
    else updateCollectionSettings(target.collectionId, next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {target?.kind === 'folder'
            ? 'Requests in this folder inherit these settings unless they override them.'
            : 'Folders and requests inherit these settings unless they override them.'}
        </p>

        <div className="flex gap-1 border-b border-border">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'border-b-2 px-3 py-1.5 text-xs transition-colors',
                tab === item.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="max-h-[420px] min-h-[240px] overflow-y-auto rounded-md border border-border">
          {tab === 'auth' && <AuthTab auth={auth} onChange={(next) => patch({ auth: next })} inherit={inherit} />}
          {tab === 'headers' && (
            <HeadersTab headers={headers} onChange={(next) => patch({ headers: next })} />
          )}
          {tab === 'scripts' && (
            <PreRequestTab script={script} onChange={(next) => patch({ preRequestScript: next })} />
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Existing requests keep their own Auth until you switch them to Inherit.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={!target}
            onClick={() => {
              if (!target) return
              switchChildRequestsToInherit(
                target.collectionId,
                target.kind === 'folder' ? target.folderId : null
              )
            }}
          >
            Switch child requests to Inherit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
