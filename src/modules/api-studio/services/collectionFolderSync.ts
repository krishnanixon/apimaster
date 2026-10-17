import { create } from 'zustand'
import { toast } from 'sonner'
import {
  README_FILE,
  collectionReadme,
  parseCollectionFiles,
  serializeCollection,
  type CollectionFileError,
  type CollectionFiles,
  type ParsedCollectionFolder
} from '@shared/lib/collection-files'
import type { ApiCollection, ApiEnvironment } from '@shared/types/api-studio'
import { useApiStudioStore } from '../stores/apiStudioStore'

/**
 * Keeps folder-linked collections and their folders in step:
 * local edits are written (debounced) and external edits (git pull, an editor) are read back.
 * Format and parsing live in shared/lib/collection-files.
 */

const SAVE_DELAY_MS = 600

export interface CollectionFolderStatus {
  path: string
  /** Files that failed to parse; they are skipped and never overwritten. */
  errors: CollectionFileError[]
  /** The folder can't be used (missing, unreadable collection file, newer format). Saving is paused. */
  fatal?: string
  /** Disk changed while local edits were waiting to be saved. Saving is paused until the user picks. */
  conflict?: boolean
  /** Last save failure. */
  saveError?: string
}

export const useCollectionFolderStatus = create<{ byId: Record<string, CollectionFolderStatus> }>(() => ({ byId: {} }))

function setStatus(collectionId: string, patch: Partial<CollectionFolderStatus> | null): void {
  useCollectionFolderStatus.setState((state) => {
    const byId = { ...state.byId }
    if (patch === null) delete byId[collectionId]
    else byId[collectionId] = { ...(byId[collectionId] ?? { path: '', errors: [] }), ...patch }
    return { byId }
  })
}

interface Link {
  collectionId: string
  path: string
  /** Canonical files for what is on disk (our last write or read). */
  lastFiles: CollectionFiles | null
  /** Raw disk text, so files the user hand-formatted are not rewritten when unchanged. */
  diskFiles: CollectionFiles
  protectedPaths: string[]
  timer: ReturnType<typeof setTimeout> | null
  writing: Promise<void> | null
  paused: boolean
  pendingDisk: CollectionFiles | null
  seenCollection: ApiCollection | null
  seenEnvironments: ApiEnvironment[]
  createReadme: boolean
}

const links = new Map<string, Link>()

function api() {
  return typeof window !== 'undefined' ? window.electronAPI?.collectionFolders : undefined
}

function environmentsOf(collectionId: string): ApiEnvironment[] {
  return useApiStudioStore.getState().environments.filter((e) => e.collectionId === collectionId)
}

function collectionOf(collectionId: string): ApiCollection | undefined {
  return useApiStudioStore.getState().collections.find((c) => c.id === collectionId)
}

function sameList<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function sameFiles(a: CollectionFiles | null, b: CollectionFiles): boolean {
  if (!a) return false
  const keys = Object.keys(b)
  return keys.length === Object.keys(a).length && keys.every((key) => a[key] === b[key])
}

function canonical(parsed: ParsedCollectionFolder, protectedPaths: string[]): CollectionFiles {
  return serializeCollection(parsed.collection!, parsed.environments, { reservedPaths: protectedPaths })
}

function parse(link: Link, files: CollectionFiles): ParsedCollectionFolder {
  return parseCollectionFiles(files, {
    previous: collectionOf(link.collectionId),
    previousEnvironments: environmentsOf(link.collectionId),
    folderPath: link.path
  })
}

function hasLocalChanges(link: Link): boolean {
  if (link.timer || link.writing) return true
  const collection = collectionOf(link.collectionId)
  if (!collection) return false
  const files = serializeCollection(collection, environmentsOf(link.collectionId), { reservedPaths: link.protectedPaths })
  return !sameFiles(link.lastFiles, files)
}

function dirtyTabCount(collectionId: string): number {
  return useApiStudioStore.getState().tabs.filter((t) => t.collectionId === collectionId && t.dirty).length
}

/** Put a parsed folder into the store and remember it as the on-disk state. */
function apply(link: Link, files: CollectionFiles, parsed: ParsedCollectionFolder, announce: boolean): void {
  const collection = parsed.collection!
  link.protectedPaths = parsed.errors.map((error) => error.path)
  link.diskFiles = files
  link.lastFiles = canonical(parsed, link.protectedPaths)
  link.pendingDisk = null
  link.paused = false
  if (link.timer) clearTimeout(link.timer)
  link.timer = null

  const before = collectionOf(link.collectionId)
  const beforeEnvironments = environmentsOf(link.collectionId)
  const changed = before !== collection || !sameList(beforeEnvironments, parsed.environments)
  // Set before the store update so the change isn't mistaken for a local edit to save.
  link.seenCollection = collection
  link.seenEnvironments = parsed.environments
  if (changed) useApiStudioStore.getState().applyCollectionFolder(collection, parsed.environments)
  link.seenCollection = collectionOf(link.collectionId) ?? null
  link.seenEnvironments = environmentsOf(link.collectionId)
  setStatus(link.collectionId, { path: link.path, errors: parsed.errors, fatal: undefined, conflict: undefined })

  if (announce && changed) {
    const dirty = dirtyTabCount(link.collectionId)
    toast.info(`Reloaded "${collection.name}" from its folder`, {
      description: dirty ? `${dirty} open tab${dirty === 1 ? '' : 's'} with unsaved edits kept their changes.` : undefined
    })
  }
  if (parsed.errors.length) {
    toast.warning(`${parsed.errors.length} file${parsed.errors.length === 1 ? '' : 's'} in "${collection.name}" could not be read`, {
      description: parsed.errors.map((e) => `${e.path}: ${e.message}`).join('\n')
    })
  }
}

function pauseWithError(link: Link, fatal: string): void {
  link.paused = true
  if (link.timer) clearTimeout(link.timer)
  link.timer = null
  setStatus(link.collectionId, { path: link.path, fatal })
}

/** Disk contents arrived (startup, watcher, manual reload). */
function receive(link: Link, files: CollectionFiles, mode: 'initial' | 'external' | 'reload'): void {
  const parsed = parse(link, files)
  if (parsed.fatal || !parsed.collection) {
    pauseWithError(link, parsed.fatal ?? 'The collection folder could not be read')
    if (mode !== 'initial') toast.error(parsed.fatal ?? 'The collection folder could not be read')
    return
  }
  if (parsed.collection.id !== link.collectionId) {
    pauseWithError(link, 'The folder now holds a different collection (its id changed). Saving is paused.')
    return
  }
  // Our own write coming back, or nothing that matters changed.
  const errorPaths = parsed.errors.map((e) => e.path)
  if (
    mode === 'external' &&
    sameList(errorPaths, link.protectedPaths) &&
    sameFiles(link.lastFiles, canonical(parsed, errorPaths))
  ) {
    link.diskFiles = files
    return
  }
  if (mode === 'external' && hasLocalChanges(link)) {
    askAboutConflict(link, files)
    return
  }
  apply(link, files, parsed, mode !== 'initial')
}

function askAboutConflict(link: Link, files: CollectionFiles): void {
  link.pendingDisk = files
  link.paused = true
  if (link.timer) clearTimeout(link.timer)
  link.timer = null
  setStatus(link.collectionId, { conflict: true })
  const name = collectionOf(link.collectionId)?.name ?? 'Collection'
  toast.warning(`"${name}" changed on disk while you had unsaved changes`, {
    description: 'Load the folder version, or keep yours and overwrite the folder. Nothing is lost until you choose.',
    duration: Infinity,
    action: { label: 'Load from disk', onClick: () => resolveConflict(link.collectionId, 'disk') },
    cancel: { label: 'Keep mine', onClick: () => resolveConflict(link.collectionId, 'local') }
  })
}

export function resolveConflict(collectionId: string, keep: 'disk' | 'local'): void {
  const link = links.get(collectionId)
  if (!link?.pendingDisk) return
  const files = link.pendingDisk
  if (keep === 'disk') {
    const parsed = parse(link, files)
    if (parsed.collection) apply(link, files, parsed, true)
    return
  }
  link.pendingDisk = null
  link.paused = false
  link.diskFiles = files
  // Force a full write over whatever is on disk now.
  link.lastFiles = null
  setStatus(collectionId, { conflict: undefined })
  void flush(link)
}

async function flush(link: Link): Promise<void> {
  if (link.timer) clearTimeout(link.timer)
  link.timer = null
  const folders = api()
  const collection = collectionOf(link.collectionId)
  if (!folders || !collection || link.paused) return
  if (link.writing) {
    await link.writing
    return flush(link)
  }
  const environments = environmentsOf(link.collectionId)
  link.seenCollection = collection
  link.seenEnvironments = environments
  const files = serializeCollection(collection, environments, { reservedPaths: link.protectedPaths })
  if (sameFiles(link.lastFiles, files)) return

  // Unchanged items keep the exact text on disk, so hand-formatted files aren't rewritten.
  const outgoing: CollectionFiles = {}
  for (const [path, text] of Object.entries(files)) {
    outgoing[path] = link.lastFiles?.[path] === text && link.diskFiles[path] !== undefined ? link.diskFiles[path] : text
  }

  const write = (async () => {
    const res = await folders.write({
      path: link.path,
      files: outgoing,
      protectedPaths: link.protectedPaths,
      createIfMissing: link.createReadme ? { [README_FILE]: collectionReadme(collection.name) } : undefined
    })
    if (res.success) {
      link.lastFiles = files
      link.diskFiles = outgoing
      link.createReadme = false
      setStatus(link.collectionId, { saveError: undefined })
    } else {
      const message = res.error ?? 'Could not save the collection folder'
      if (useCollectionFolderStatus.getState().byId[link.collectionId]?.saveError !== message) toast.error(message)
      setStatus(link.collectionId, { saveError: message })
    }
  })()
  link.writing = write
  try {
    await write
  } finally {
    link.writing = null
  }
}

function scheduleWrite(link: Link): void {
  if (link.paused) return
  if (link.timer) clearTimeout(link.timer)
  link.timer = setTimeout(() => void flush(link), SAVE_DELAY_MS)
}

function attach(collectionId: string, path: string, init: Partial<Link> = {}): Link {
  const link: Link = {
    collectionId,
    path,
    lastFiles: null,
    diskFiles: {},
    protectedPaths: [],
    timer: null,
    writing: null,
    paused: false,
    pendingDisk: null,
    seenCollection: collectionOf(collectionId) ?? null,
    seenEnvironments: environmentsOf(collectionId),
    createReadme: false,
    ...init
  }
  links.set(collectionId, link)
  setStatus(collectionId, { path, errors: [] })
  void api()
    ?.watch(path)
    .then((res) => {
      if (!res.success) setStatus(collectionId, { saveError: res.error ?? 'Could not watch the folder for changes' })
    })
  return link
}

function detach(link: Link): void {
  if (link.timer) clearTimeout(link.timer)
  links.delete(link.collectionId)
  setStatus(link.collectionId, null)
  void api()?.unwatch(link.path)
}

async function readInto(link: Link, mode: 'initial' | 'reload'): Promise<void> {
  const res = await api()!.read(link.path)
  if (!res.success || !res.data) {
    pauseWithError(link, res.error ?? `Folder not found: ${link.path}`)
    return
  }
  receive(link, res.data.files, mode)
}

/** Store changed: link new folder collections, drop removed ones, and queue writes for edits. */
function reconcile(): void {
  const { collections } = useApiStudioStore.getState()
  const linked = new Map(collections.filter((c) => c.folder?.path).map((c) => [c.id, c]))
  for (const link of [...links.values()]) {
    const collection = linked.get(link.collectionId)
    if (!collection || collection.folder!.path !== link.path) detach(link)
  }
  for (const collection of linked.values()) {
    const link = links.get(collection.id)
    if (!link) {
      // Linked without going through this module (e.g. restored on startup): read the folder first.
      void readInto(attach(collection.id, collection.folder!.path), 'initial')
      continue
    }
    const environments = environmentsOf(collection.id)
    if (link.seenCollection !== collection || !sameList(link.seenEnvironments, environments)) {
      link.seenCollection = collection
      link.seenEnvironments = environments
      if (link.lastFiles) scheduleWrite(link)
    }
  }
}

let started = false

/** Call once at app start. Returns a stop function. */
export function startCollectionFolderSync(): () => void {
  const folders = api()
  if (!folders || started) return () => undefined
  started = true

  const run = () => reconcile()
  const unsubscribeStore = useApiStudioStore.subscribe(run)
  const persist = useApiStudioStore.persist
  let unsubscribeHydration: (() => void) | undefined
  if (persist.hasHydrated()) run()
  else unsubscribeHydration = persist.onFinishHydration(run)

  const unsubscribeChanges = folders.onChanged(({ path, files }) => {
    const link = [...links.values()].find((l) => l.path === path)
    if (link) receive(link, files, 'external')
  })

  // Hand pending saves to the main process before the window goes away.
  const onUnload = () => {
    for (const link of links.values()) if (link.timer) void flush(link)
  }
  window.addEventListener('beforeunload', onUnload)

  return () => {
    started = false
    unsubscribeStore()
    unsubscribeHydration?.()
    unsubscribeChanges()
    window.removeEventListener('beforeunload', onUnload)
    for (const link of [...links.values()]) detach(link)
  }
}

// ── Actions for the UI ─────────────────────────────────────────────────────

/** Pick a folder that holds a collection and add (or re-link) it. Returns the collection id. */
export async function openFolderAsCollection(): Promise<string | null> {
  const folders = api()
  if (!folders) {
    toast.error('Collection folders need the desktop app')
    return null
  }
  const picked = await folders.pick({ mode: 'open' })
  if (!picked.success) {
    toast.error(picked.error ?? 'Could not open the folder')
    return null
  }
  const path = picked.data
  if (!path) return null
  const read = await folders.read(path)
  if (!read.success || !read.data) {
    toast.error(read.error ?? 'Could not read the folder')
    return null
  }
  const store = useApiStudioStore.getState()
  const probe = parseCollectionFiles(read.data.files, { folderPath: path })
  if (probe.fatal || !probe.collection) {
    toast.error(probe.fatal ?? 'This folder does not contain a collection')
    void folders.forget(path)
    return null
  }
  const id = probe.collection.id
  const existing = store.collections.find((c) => c.id === id)
  if (existing?.folder?.path && existing.folder.path !== path) {
    toast.error(`"${existing.name}" is already open from ${existing.folder.path}`)
    return null
  }
  const link = links.get(id) ?? attach(id, path)
  // Same collection already in the workspace: it is the local copy (secrets, timestamps).
  const parsed = parse(link, read.data.files)
  if (!parsed.collection) return null
  parsed.collection = { ...parsed.collection, folder: { path } }
  apply(link, read.data.files, parsed, false)
  toast.success(`Opened "${parsed.collection.name}" from ${path}`)
  return id
}

/** Write an existing collection to a folder the user picks, and keep it in sync from now on. */
export async function saveCollectionToFolder(collectionId: string): Promise<string | null> {
  const folders = api()
  const collection = collectionOf(collectionId)
  if (!folders || !collection) return null
  const picked = await folders.pick({ mode: 'save', collectionName: collection.name, collectionId })
  if (!picked.success) {
    toast.error(picked.error ?? 'Could not choose the folder')
    return null
  }
  const path = picked.data
  if (!path) return null
  // Moving to another folder: stop watching the old one (its files stay on disk).
  const previous = links.get(collectionId)
  if (previous) {
    if (previous.writing) await previous.writing
    detach(previous)
    if (previous.path !== path) void folders.forget(previous.path)
  }
  const existing = await folders.read(path)
  const link = attach(collectionId, path, {
    diskFiles: existing.success && existing.data ? existing.data.files : {},
    createReadme: true
  })
  useApiStudioStore.getState().linkCollectionFolder(collectionId, path)
  await flush(link)
  const status = useCollectionFolderStatus.getState().byId[collectionId]
  if (status?.saveError) return null
  toast.success(`"${collection.name}" is saved in ${path}`, {
    description: 'Changes are written there as you work. Secret values stay in this app.'
  })
  return path
}

export function unlinkCollectionFolder(collectionId: string): void {
  const link = links.get(collectionId)
  const path = link?.path ?? collectionOf(collectionId)?.folder?.path
  if (link) detach(link)
  if (path) void api()?.forget(path)
  useApiStudioStore.getState().unlinkCollectionFolder(collectionId)
}

export async function reloadCollectionFolder(collectionId: string): Promise<void> {
  const link = links.get(collectionId)
  if (!link) return
  link.paused = false
  await readInto(link, 'reload')
}

export function revealCollectionFolder(collectionId: string): void {
  const path = collectionOf(collectionId)?.folder?.path
  if (path) void api()?.reveal(path)
}

/** Called before a linked collection is removed from the workspace. The folder stays on disk. */
export function forgetCollectionFolder(collectionId: string): void {
  const link = links.get(collectionId)
  if (link) detach(link)
  const path = collectionOf(collectionId)?.folder?.path
  if (path) void api()?.forget(path)
}
