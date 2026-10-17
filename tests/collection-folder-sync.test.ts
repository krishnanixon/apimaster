/** @vitest-environment happy-dom */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CollectionFiles } from '@shared/lib/collection-files'
import { readCollectionDirectory, writeCollectionDirectory } from '@shared/lib/collection-files/node'

const root = mkdtempSync(join(tmpdir(), 'shurikly-sync-'))
let nextPick: string | null = null
let changed: ((change: { path: string; files: CollectionFiles }) => void) | null = null

const ok = <T>(data?: T) => ({ success: true as const, data })

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  workspace: {
    load: async () => ok({ payload: null, source: 'none', restored: false, encrypted: true }),
    save: async () => ok({ encrypted: true }),
    saveSync: () => ok({ encrypted: true })
  },
  collectionFolders: {
    pick: async () => ok(nextPick),
    read: async (path: string) => {
      try {
        return ok(await readCollectionDirectory(path))
      } catch (error) {
        return { success: false as const, error: (error as Error).message }
      }
    },
    write: async (input: { path: string; files: CollectionFiles; protectedPaths?: string[]; createIfMissing?: CollectionFiles }) =>
      ok(await writeCollectionDirectory(input.path, input.files, input)),
    watch: async () => ok(),
    unwatch: async () => ok(),
    forget: async () => ok(),
    reveal: async () => ok(),
    onChanged: (callback: typeof changed) => {
      changed = callback
      return () => (changed = null)
    }
  }
}

const { useApiStudioStore } = await import('@/modules/api-studio/stores/apiStudioStore')
const sync = await import('@/modules/api-studio/services/collectionFolderSync')

async function pushDiskChange(path: string): Promise<void> {
  const { files } = await readCollectionDirectory(path)
  changed?.({ path, files })
}

describe('collection folder live sync', () => {
  let stop: () => void
  let collectionId = ''
  const folder = join(root, 'orders')

  beforeAll(async () => {
    await vi.waitFor(() => expect(useApiStudioStore.persist.hasHydrated()).toBe(true))
    stop = sync.startCollectionFolderSync()
    const store = useApiStudioStore.getState()
    const collection = store.createCollection('Orders API')
    collectionId = collection.id
    store.createRequest(collectionId)
    const requestId = useApiStudioStore.getState().collections[0].requests[0].id
    useApiStudioStore.setState((state) => ({
      collections: state.collections.map((c) => ({
        ...c,
        auth: { type: 'bearer', bearerToken: 'sk_live_local_only' },
        requests: c.requests.map((r) => (r.id === requestId ? { ...r, name: 'List orders', url: '{{baseUrl}}/orders' } : r))
      }))
    }))
    useApiStudioStore.setState({ tabs: [] })
    store.openRequestTab(collectionId, requestId)
    const env = store.createEnvironment('Local')
    store.updateEnvironmentVariables(env.id, [
      { id: 'a', key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
      { id: 'b', key: 'password', value: 'local-password', enabled: true }
    ])
    store.setEnvironmentCollection(env.id, collectionId)
  })

  afterAll(() => {
    stop?.()
    rmSync(root, { recursive: true, force: true })
  })

  it('saves an existing collection to a folder without secrets', async () => {
    nextPick = folder
    expect(await sync.saveCollectionToFolder(collectionId)).toBe(folder)
    const { files } = await readCollectionDirectory(folder)
    expect(Object.keys(files).sort()).toEqual(['environments/local.yaml', 'list-orders.request.yaml', 'shurikly.collection.yaml'])
    const all = Object.values(files).join('\n')
    expect(all).not.toContain('sk_live_local_only')
    expect(all).not.toContain('local-password')
    expect(readFileSync(join(folder, 'README.md'), 'utf8')).toContain('Secrets are not stored here')
    expect(useApiStudioStore.getState().collections[0].folder).toEqual({ path: folder })
  })

  it('writes local edits to disk after a short delay', async () => {
    const tabId = useApiStudioStore.getState().tabs[0].id
    useApiStudioStore.getState().updateDraft(tabId, { url: '{{baseUrl}}/orders?limit=10' })
    useApiStudioStore.getState().saveTab(tabId)
    await vi.waitFor(
      () => expect(readFileSync(join(folder, 'list-orders.request.yaml'), 'utf8')).toContain('/orders?limit=10'),
      { timeout: 3000 }
    )
  })

  it('reloads external edits and keeps unsaved tab drafts', async () => {
    const tabId = useApiStudioStore.getState().tabs[0].id
    useApiStudioStore.getState().updateDraft(tabId, { url: 'draft-not-saved' })
    const path = join(folder, 'list-orders.request.yaml')
    writeFileSync(path, readFileSync(path, 'utf8').replace('List orders', 'List all orders'))
    await pushDiskChange(folder)
    const state = useApiStudioStore.getState()
    expect(state.collections[0].requests[0].name).toBe('List all orders')
    expect(state.collections[0].auth?.bearerToken).toBe('sk_live_local_only')
    expect(state.environments[0].variables[1].value).toBe('local-password')
    expect(state.tabs[0].request.url).toBe('draft-not-saved')
    expect(state.tabs[0].dirty).toBe(true)
  })

  it('asks before replacing unsaved collection changes, and changes nothing until answered', async () => {
    useApiStudioStore.getState().renameCollection(collectionId, 'Orders (local rename)')
    const collectionFile = join(folder, 'shurikly.collection.yaml')
    writeFileSync(collectionFile, readFileSync(collectionFile, 'utf8').replace('name: Orders API', 'name: Orders (remote)'))
    await pushDiskChange(folder)
    expect(sync.useCollectionFolderStatus.getState().byId[collectionId].conflict).toBe(true)
    expect(useApiStudioStore.getState().collections[0].name).toBe('Orders (local rename)')
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(readFileSync(collectionFile, 'utf8')).toContain('Orders (remote)')

    sync.resolveConflict(collectionId, 'disk')
    expect(useApiStudioStore.getState().collections[0].name).toBe('Orders (remote)')
    expect(sync.useCollectionFolderStatus.getState().byId[collectionId].conflict).toBeUndefined()
  })

  it('keeps a broken file untouched and loads everything else', async () => {
    const broken = join(folder, 'broken.request.yaml')
    writeFileSync(broken, 'name: [oops\n')
    await pushDiskChange(folder)
    const status = sync.useCollectionFolderStatus.getState().byId[collectionId]
    expect(status.conflict).toBeUndefined()
    expect(status.errors.map((e) => e.path)).toEqual(['broken.request.yaml'])
    expect(useApiStudioStore.getState().collections[0].requests).toHaveLength(1)

    useApiStudioStore.getState().createRequest(collectionId)
    await vi.waitFor(async () => {
      const { files } = await readCollectionDirectory(folder)
      expect(files['new-request.request.yaml']).toBeDefined()
    }, { timeout: 3000 })
    expect(readFileSync(broken, 'utf8')).toBe('name: [oops\n')
  })

  it('opens a collection folder into a workspace that has never seen it', async () => {
    const other = join(root, 'billing')
    await writeCollectionDirectory(other, {
      'shurikly.collection.yaml': 'formatVersion: 1\nid: billing\nname: Billing\n',
      'invoices/get-invoice.request.yaml': "id: inv\nname: Get invoice\nmethod: GET\nurl: '{{baseUrl}}/invoices/:id'\n"
    })
    nextPick = other
    const id = await sync.openFolderAsCollection()
    expect(id).toBe('billing')
    const billing = useApiStudioStore.getState().collections.find((c) => c.id === 'billing')!
    expect(billing.folder).toEqual({ path: other })
    expect(billing.folders.map((f) => f.name)).toEqual(['invoices'])
    expect(billing.requests[0].folderId).toBe('dir:invoices')
  })
})
