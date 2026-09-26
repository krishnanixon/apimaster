import { create } from 'zustand'
import { toast } from 'sonner'
import { isCopyOnlySecret } from '../lib/vault-secrets'
import type {
  CreateVaultFolderInput,
  CreateVaultItemInput,
  UpdateVaultItemInput,
  VaultAiSuggestion,
  VaultFolder,
  VaultItemListEntry,
  VaultItemSecrets,
  VaultItemType,
  VaultSecurityReport,
  VaultSettings,
  VaultStatus,
  VaultTag,
  VaultViewFilter
} from '@shared/types/vault'

const DEFAULT_VAULT_STATUS: VaultStatus = {
  isInitialized: false,
  isUnlocked: false,
  settings: { autoLockMinutes: 10, clipboardClearSeconds: 30 }
}

interface VaultState {
  status: VaultStatus
  statusBootstrapping: boolean
  statusError: string | null
  folders: VaultFolder[]
  items: VaultItemListEntry[]
  tags: VaultTag[]
  selectedFolderId: string | null
  selectedItemId: string | null
  selectedItem: VaultItemListEntry | null
  viewFilter: VaultViewFilter
  searchQuery: string
  isLoading: boolean
  securityReport: VaultSecurityReport | null
  aiSuggestions: VaultAiSuggestion[]
  revealedFields: Partial<Record<keyof VaultItemSecrets, string>>

  loadStatus: () => Promise<void>
  setup: (password: string, hint?: string) => Promise<boolean>
  unlock: (password: string) => Promise<boolean>
  lock: () => Promise<void>
  updateSettings: (settings: Partial<VaultSettings>) => Promise<void>
  loadFolders: () => Promise<void>
  loadItems: () => Promise<void>
  loadTags: () => Promise<void>
  selectFolder: (id: string | null) => void
  selectItem: (id: string | null) => Promise<void>
  setViewFilter: (filter: VaultViewFilter) => void
  setSearchQuery: (query: string) => void
  runSearch: () => Promise<void>
  createFolder: (input: CreateVaultFolderInput) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  createItem: (input: CreateVaultItemInput) => Promise<void>
  updateItem: (id: string, input: UpdateVaultItemInput) => Promise<void>
  archiveItem: (id: string) => Promise<void>
  restoreItem: (id: string) => Promise<void>
  trashItem: (id: string) => Promise<void>
  deleteItemPermanent: (id: string) => Promise<void>
  revealField: (field: keyof VaultItemSecrets) => Promise<void>
  copyField: (field: keyof VaultItemSecrets) => Promise<void>
  generatePassword: () => Promise<string>
  loadSecurityReport: () => Promise<void>
  loadAiSuggestions: () => Promise<void>
  exportVault: (format: 'json' | 'encrypted' | 'csv', exportPassword?: string) => Promise<void>
  importVault: (format: string, data: string, importPassword?: string) => Promise<void>
}

export const useVaultStore = create<VaultState>((set, get) => ({
  status: DEFAULT_VAULT_STATUS,
  statusBootstrapping: true,
  statusError: null,
  folders: [],
  items: [],
  tags: [],
  selectedFolderId: null,
  selectedItemId: null,
  selectedItem: null,
  viewFilter: 'all',
  searchQuery: '',
  isLoading: false,
  securityReport: null,
  aiSuggestions: [],
  revealedFields: {},

  loadStatus: async () => {
    set({ statusBootstrapping: true, statusError: null })
    try {
      if (!window.electronAPI?.vault) {
        throw new Error('Vault API unavailable. Restart the desktop app.')
      }
      const res = await window.electronAPI.vault.getStatus()
      if (res.success && res.data) {
        set({ status: res.data, statusBootstrapping: false, statusError: null })
      } else {
        set({
          status: DEFAULT_VAULT_STATUS,
          statusBootstrapping: false,
          statusError: res.error ?? 'Failed to load vault status'
        })
      }
    } catch (e) {
      set({
        status: DEFAULT_VAULT_STATUS,
        statusBootstrapping: false,
        statusError: e instanceof Error ? e.message : 'Failed to load vault status'
      })
    }
  },

  setup: async (password, hint) => {
    set({ isLoading: true })
    try {
      if (!window.electronAPI?.vault) {
        toast.error('Vault API unavailable. Restart the desktop app.')
        return false
      }
      const res = await window.electronAPI.vault.setup({ masterPassword: password, hint })
      if (res.success) {
        toast.success('Vault created')
        await get().loadStatus()
        return true
      }
      toast.error(res.error ?? 'Setup failed')
      return false
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Setup failed')
      return false
    } finally {
      set({ isLoading: false })
    }
  },

  unlock: async (password) => {
    set({ isLoading: true })
    try {
      if (!window.electronAPI?.vault) {
        toast.error('Vault API unavailable. Restart the desktop app.')
        return false
      }
      const res = await window.electronAPI.vault.unlock({ masterPassword: password })
      if (res.success) {
        toast.success('Vault unlocked')
        await get().loadStatus()
        await Promise.all([get().loadFolders(), get().loadItems(), get().loadTags()])
        return true
      }
      toast.error(res.error ?? 'Unlock failed')
      return false
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlock failed')
      return false
    } finally {
      set({ isLoading: false })
    }
  },

  lock: async () => {
    await window.electronAPI.vault.lock()
    set({
      selectedItem: null,
      selectedItemId: null,
      revealedFields: {},
      items: [],
      folders: []
    })
    await get().loadStatus()
  },

  updateSettings: async (settings) => {
    const res = await window.electronAPI.vault.updateSettings(settings)
    if (res.success && res.data) {
      set((s) => ({ status: s.status ? { ...s.status, settings: res.data! } : s.status }))
      toast.success('Vault settings saved')
    }
  },

  loadFolders: async () => {
    const res = await window.electronAPI.vault.listFolders()
    if (res.success && res.data) set({ folders: res.data })
  },

  loadItems: async () => {
    const { selectedFolderId, viewFilter } = get()
    set({ isLoading: true })
    const res = await window.electronAPI.vault.listItems({
      folderId: viewFilter === 'all' ? selectedFolderId : undefined,
      view: viewFilter
    })
    set({ isLoading: false })
    if (res.success && res.data) set({ items: res.data })
  },

  loadTags: async () => {
    const res = await window.electronAPI.vault.listTags()
    if (res.success && res.data) set({ tags: res.data })
  },

  selectFolder: (id) => {
    set({ selectedFolderId: id, viewFilter: 'all' })
    void get().loadItems()
  },

  selectItem: async (id) => {
    if (!id) {
      set({ selectedItemId: null, selectedItem: null, revealedFields: {} })
      return
    }
    set({ selectedItemId: id, revealedFields: {}, isLoading: true })
    const res = await window.electronAPI.vault.getItem(id, false)
    set({ isLoading: false })
    if (res.success && res.data) {
      set({ selectedItem: res.data as VaultItemListEntry })
    }
  },

  setViewFilter: (filter) => {
    set({ viewFilter: filter })
    void get().loadItems()
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  runSearch: async () => {
    const { searchQuery, selectedFolderId, viewFilter } = get()
    if (!searchQuery.trim()) {
      await get().loadItems()
      return
    }
    set({ isLoading: true })
    const res = await window.electronAPI.vault.search({
      query: searchQuery,
      folderId: selectedFolderId,
      filter: viewFilter
    })
    set({ isLoading: false })
    if (res.success && res.data) set({ items: res.data.items })
  },

  createFolder: async (input) => {
    const res = await window.electronAPI.vault.createFolder(input)
    if (res.success) {
      toast.success('Folder created')
      await get().loadFolders()
    } else toast.error(res.error)
  },

  deleteFolder: async (id) => {
    const res = await window.electronAPI.vault.deleteFolder(id)
    if (res.success) {
      toast.success('Folder deleted')
      if (get().selectedFolderId === id) set({ selectedFolderId: null })
      await get().loadFolders()
      await get().loadItems()
    } else toast.error(res.error)
  },

  createItem: async (input) => {
    const res = await window.electronAPI.vault.createItem(input)
    if (res.success && res.data) {
      toast.success('Credential saved')
      await get().loadItems()
      await get().selectItem(res.data.id)
    } else toast.error(res.error)
  },

  updateItem: async (id, input) => {
    const res = await window.electronAPI.vault.updateItem(id, input)
    if (res.success) {
      toast.success('Credential updated')
      await get().loadItems()
      await get().selectItem(id)
    } else toast.error(res.error)
  },

  archiveItem: async (id) => {
    await window.electronAPI.vault.archiveItem(id)
    toast.success('Archived')
    await get().loadItems()
    if (get().selectedItemId === id) set({ selectedItem: null, selectedItemId: null })
  },

  restoreItem: async (id) => {
    await window.electronAPI.vault.restoreItem(id)
    toast.success('Restored')
    await get().loadItems()
  },

  trashItem: async (id) => {
    await window.electronAPI.vault.trashItem(id)
    toast.success('Moved to trash')
    await get().loadItems()
    if (get().selectedItemId === id) set({ selectedItem: null, selectedItemId: null })
  },

  deleteItemPermanent: async (id) => {
    await window.electronAPI.vault.deleteItem(id)
    toast.success('Permanently deleted')
    await get().loadItems()
    if (get().selectedItemId === id) set({ selectedItem: null, selectedItemId: null })
  },

  revealField: async (field) => {
    if (isCopyOnlySecret(field)) return
    const id = get().selectedItemId
    if (!id) return
    const res = await window.electronAPI.vault.revealField(id, field)
    if (res.success && res.data) {
      set((s) => ({
        revealedFields: { ...s.revealedFields, [field]: res.data!.value }
      }))
    }
  },

  copyField: async (field) => {
    const id = get().selectedItemId
    if (!id) return
    const res = await window.electronAPI.vault.copyField(id, field)
    if (res.success && res.data) {
      toast.success(`Copied — clears in ${res.data.clearAfterSeconds}s`)
    }
  },

  generatePassword: async () => {
    const res = await window.electronAPI.vault.generatePassword({ length: 20 })
    return res.success && res.data ? res.data.password : ''
  },

  loadSecurityReport: async () => {
    const res = await window.electronAPI.vault.getSecurityReport()
    if (res.success && res.data) set({ securityReport: res.data })
  },

  loadAiSuggestions: async () => {
    const res = await window.electronAPI.vault.getAiSuggestions()
    if (res.success && res.data) set({ aiSuggestions: res.data })
  },

  exportVault: async (format, exportPassword) => {
    const res = await window.electronAPI.vault.export({
      format,
      exportPassword,
      includeSecrets: true
    })
    if (res.success && res.data?.saved) toast.success('Export saved')
    else if (res.success && !res.data?.saved) toast.message('Export cancelled')
    else toast.error(res.error)
  },

  importVault: async (format, data, importPassword) => {
    const res = await window.electronAPI.vault.import({
      format: format as 'json' | 'encrypted' | 'csv' | 'bitwarden' | '1password' | 'keepass',
      data,
      importPassword
    })
    if (res.success && res.data) {
      toast.success(`Imported ${res.data.imported} items`)
      await get().loadItems()
      await get().loadFolders()
    } else toast.error(res.error)
  }
}))

export const VAULT_ITEM_TYPES: Array<{ value: VaultItemType; label: string }> = [
  { value: 'password', label: 'Password' },
  { value: 'api_key', label: 'API Key' },
  { value: 'ssh', label: 'SSH' },
  { value: 'database', label: 'Database' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'license', label: 'License' },
  { value: 'identity', label: 'Identity' },
  { value: 'secure_note', label: 'Secure Note' },
  { value: 'server', label: 'Server' },
  { value: 'custom', label: 'Custom' }
]

export function strengthColor(score: number): string {
  if (score <= 3) return 'bg-red-500'
  if (score <= 5) return 'bg-orange-500'
  if (score <= 7) return 'bg-yellow-500'
  return 'bg-emerald-500'
}
