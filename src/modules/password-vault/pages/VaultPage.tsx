import { useEffect, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import {
  Search,
  Plus,
  Lock,
  Settings,
  Download,
  Sparkles,
  ShieldAlert,
  KeyRound
} from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { ModulePage, ModuleToolbar, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { VaultAuthScreen } from '../components/VaultAuthScreen'
import { VaultFolderTree } from '../components/VaultFolderTree'
import { VaultItemList, VaultItemListHeader } from '../components/VaultItemList'
import { VaultItemDetail } from '../components/VaultItemDetail'
import { NewCredentialDialog } from '../components/NewCredentialDialog'
import { useVaultStore } from '../stores/vault.store'
import { useVaultKeyboard } from '../hooks/useVaultKeyboard'
import type { VaultAutoLockMinutes, VaultClipboardClearSeconds } from '@shared/types/vault'

export function VaultPage() {
  const {
    status,
    folders,
    items,
    selectedFolderId,
    selectedItemId,
    selectedItem,
    viewFilter,
    searchQuery,
    isLoading,
    aiSuggestions,
    securityReport,
    statusBootstrapping,
    statusError,
    loadStatus,
    setup,
    unlock,
    lock,
    updateSettings,
    loadFolders,
    loadItems,
    selectFolder,
    selectItem,
    setViewFilter,
    setSearchQuery,
    runSearch,
    createFolder,
    loadAiSuggestions,
    loadSecurityReport,
    exportVault
  } = useVaultStore()

  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  useVaultKeyboard(() => setNewDialogOpen(true))

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (status?.isUnlocked) {
      void loadFolders()
      void loadItems()
      void loadAiSuggestions()
      void loadSecurityReport()
    }
  }, [status?.isUnlocked, loadFolders, loadItems, loadAiSuggestions, loadSecurityReport])

  useEffect(() => {
    if (!status?.isUnlocked) return
    const t = setTimeout(() => {
      if (searchQuery.trim()) void runSearch()
      else void loadItems()
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, status?.isUnlocked, runSearch, loadItems])

  if (statusBootstrapping) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (statusError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-destructive">{statusError}</p>
        <Button variant="outline" onClick={() => void loadStatus()}>
          Retry
        </Button>
      </div>
    )
  }

  if (!status.isInitialized) {
    return (
      <VaultAuthScreen
        mode="setup"
        isLoading={isLoading}
        onSubmit={(password, hint) => void setup(password, hint)}
      />
    )
  }

  if (!status.isUnlocked) {
    return (
      <VaultAuthScreen
        mode="unlock"
        isLoading={isLoading}
        onSubmit={(password) => void unlock(password)}
      />
    )
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim() || 'New Folder'
    await createFolder({ name, parentId: selectedFolderId })
    setNewFolderName('')
  }

  return (
    <ModulePage>
      <PageHeader
        title="Password Vault"
        description="Local developer credentials"
        fluid
        actions={
          <Button variant="ghost" size="sm" className="h-7" onClick={() => void lock()}>
            <Lock className="mr-1.5 h-4 w-4" />
            Lock
          </Button>
        }
      />

      <ModuleToolbar>
        <div className="relative min-w-0 flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="vault-search-input"
            placeholder="Search title, username, tags, URL, notes… (Ctrl+Shift+F)"
            className="h-7 pl-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
          />
        </div>
        <Button size="sm" className="h-7" onClick={() => setNewDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New
        </Button>
        <Button variant="outline" size="sm" className="h-7" onClick={() => void exportVault('json')}>
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-7" onClick={() => setSettingsOpen(!settingsOpen)}>
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </ModuleToolbar>

      {/* Security banner */}
      {securityReport && (securityReport.weakCount > 0 || securityReport.duplicateCount > 0) && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            {securityReport.weakCount} weak, {securityReport.duplicateCount} duplicate password
            {securityReport.duplicateCount !== 1 ? 's' : ''} detected
          </span>
        </div>
      )}

      {/* Settings panel */}
      {settingsOpen && (
        <div className="border-b border-border/50 bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              Auto-lock
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={status.settings.autoLockMinutes}
                onChange={(e) =>
                  void updateSettings({ autoLockMinutes: Number(e.target.value) as VaultAutoLockMinutes })
                }
              >
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={30}>30 min</option>
                <option value={0}>Never</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Clipboard clear
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={status.settings.clipboardClearSeconds}
                onChange={(e) =>
                  void updateSettings({
                    clipboardClearSeconds: Number(e.target.value) as VaultClipboardClearSeconds
                  })
                }
              >
                <option value={15}>15 sec</option>
                <option value={30}>30 sec</option>
                <option value={60}>60 sec</option>
              </select>
            </label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="New folder name"
                className="h-8 w-40"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={handleCreateFolder}>
                Add Folder
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => void exportVault('encrypted')}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Encrypted Backup
            </Button>
          </div>
        </div>
      )}

      {/* AI suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="border-b border-border/50 px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            {aiSuggestions.slice(0, 3).map((s, i) => (
              <span
                key={i}
                className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
              >
                {s.message}
              </span>
            ))}
          </div>
        </div>
      )}

      <PageContent fullBleed>
      {/* 3-panel layout — v4 treats numeric sizes as pixels; use % strings */}
      <Group
        id="vault-layout"
        orientation="horizontal"
        className="min-h-0 w-full flex-1"
        defaultLayout={{ 'vault-folders': 20, 'vault-list': 34, 'vault-detail': 46 }}
      >
        <Panel
          id="vault-folders"
          defaultSize="20%"
          minSize="200px"
          maxSize="30%"
          className="min-w-0"
        >
          <div className="flex h-full min-w-0 flex-col overflow-hidden border-r border-border/40 bg-muted/20">
            <VaultFolderTree
              folders={folders}
              selectedFolderId={selectedFolderId}
              viewFilter={viewFilter}
              onSelectFolder={selectFolder}
              onSetViewFilter={setViewFilter}
              onCreateFolder={() => setSettingsOpen(true)}
            />
          </div>
        </Panel>

        <Separator className="w-1 shrink-0 bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50" />

        <Panel
          id="vault-list"
          defaultSize="34%"
          minSize="260px"
          maxSize="48%"
          className="min-w-0"
        >
          <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
            <VaultItemListHeader count={items.length} />
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <VaultItemList
                items={items}
                selectedItemId={selectedItemId}
                isLoading={isLoading}
                onSelectItem={(id) => void selectItem(id)}
              />
            </div>
          </div>
        </Panel>

        <Separator className="w-1 shrink-0 bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50" />

        <Panel id="vault-detail" defaultSize="46%" minSize="320px" className="min-w-0">
          <div className="flex h-full min-w-0 flex-col overflow-hidden bg-card/30">
            {selectedItem ? (
              <VaultItemDetail item={selectedItem} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
                  <KeyRound className="h-7 w-7 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Select a credential</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">
                    Choose an item from the list or press Ctrl+N to create one
                  </p>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </Group>
      </PageContent>

      <NewCredentialDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        folderId={selectedFolderId}
      />
    </ModulePage>
  )
}
