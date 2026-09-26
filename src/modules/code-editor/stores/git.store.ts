import { create } from 'zustand'
import { toast } from 'sonner'
import type { GitDiffResult, GitLogEntry, GitSnapshot, GitStashEntry, GitStatusEntry } from '@shared/types/git'

interface GitState {
  snapshot: GitSnapshot | null
  log: GitLogEntry[]
  stashes: GitStashEntry[]
  selectedPath: string | null
  selectedStaged: boolean
  diff: GitDiffResult | null
  commitMessage: string
  loading: boolean
  mutating: boolean

  refresh: () => Promise<void>
  initialize: () => Promise<void>
  selectFile: (entry: GitStatusEntry, staged: boolean) => Promise<void>
  setCommitMessage: (message: string) => void
  stage: (path: string) => Promise<void>
  unstage: (path: string) => Promise<void>
  stageAll: () => Promise<void>
  unstageAll: () => Promise<void>
  discardAll: () => Promise<void>
  commit: () => Promise<void>
  commitAndPush: () => Promise<void>
  checkout: (branch: string) => Promise<void>
  createBranch: (branch: string) => Promise<void>
  discard: (path: string) => Promise<void>
  fetch: () => Promise<void>
  pull: () => Promise<void>
  push: () => Promise<void>
  stash: (message?: string) => Promise<void>
  stashPop: () => Promise<void>
  applyStash: (ref: string, pop?: boolean) => Promise<void>
  dropStash: (ref: string) => Promise<void>
  reset: () => void
}

function changedEntries(snapshot: GitSnapshot | null): GitStatusEntry[] {
  if (!snapshot) return []
  return snapshot.entries.filter((e) => e.unstaged || e.status === 'untracked')
}

function stagedEntries(snapshot: GitSnapshot | null): GitStatusEntry[] {
  if (!snapshot) return []
  return snapshot.entries.filter((e) => e.staged)
}

export const useGitStore = create<GitState>((set, get) => ({
  snapshot: null,
  log: [],
  stashes: [],
  selectedPath: null,
  selectedStaged: false,
  diff: null,
  commitMessage: '',
  loading: false,
  mutating: false,

  reset: () =>
    set({
      snapshot: null,
      log: [],
      stashes: [],
      selectedPath: null,
      selectedStaged: false,
      diff: null,
      commitMessage: '',
      loading: false,
      mutating: false
    }),

  refresh: async () => {
    set({ loading: true })
    try {
      const statusRes = await window.electronAPI.git.status()
      if (!statusRes.success || !statusRes.data) {
        set({ snapshot: null, log: [], stashes: [], loading: false })
        return
      }
      if (!statusRes.data.available) {
        set({ snapshot: statusRes.data, log: [], stashes: [], loading: false })
        return
      }
      const [logRes, stashRes] = await Promise.all([
        window.electronAPI.git.log(25),
        window.electronAPI.git.listStashes()
      ])
      set({
        snapshot: statusRes.data,
        log: logRes.success && logRes.data ? logRes.data : [],
        stashes: stashRes.success && stashRes.data ? stashRes.data : [],
        loading: false
      })
      const { selectedPath, selectedStaged } = get()
      if (selectedPath) {
        const stillThere = statusRes.data.entries.some((entry) => entry.path === selectedPath)
        if (stillThere) {
          const diffRes = await window.electronAPI.git.diff(selectedPath, selectedStaged)
          set({ diff: diffRes.success ? (diffRes.data ?? null) : null })
        } else {
          set({ selectedPath: null, diff: null })
        }
      }
    } catch {
      set({ loading: false })
    }
  },

  initialize: async () => {
    set({ mutating: true })
    const result = await window.electronAPI.git.initialize()
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Could not initialize repository')
      return
    }
    toast.success('Initialized Git repository')
    await get().refresh()
  },

  selectFile: async (entry, staged) => {
    set({ selectedPath: entry.path, selectedStaged: staged, diff: null })
    const result = await window.electronAPI.git.diff(entry.path, staged)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to load diff')
      return
    }
    set({ diff: result.data ?? null })
  },

  setCommitMessage: (message) => set({ commitMessage: message }),

  stage: async (path) => {
    set({ mutating: true })
    const result = await window.electronAPI.git.stage(path)
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Failed to stage')
      return
    }
    await get().refresh()
  },

  unstage: async (path) => {
    set({ mutating: true })
    const result = await window.electronAPI.git.unstage(path)
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Failed to unstage')
      return
    }
    await get().refresh()
  },

  stageAll: async () => {
    const paths = changedEntries(get().snapshot).map((e) => e.path)
    if (paths.length === 0) return
    set({ mutating: true })
    for (const path of paths) {
      const result = await window.electronAPI.git.stage(path)
      if (!result.success) {
        set({ mutating: false })
        toast.error(result.error ?? 'Failed to stage all')
        await get().refresh()
        return
      }
    }
    set({ mutating: false })
    await get().refresh()
  },

  unstageAll: async () => {
    const paths = stagedEntries(get().snapshot).map((e) => e.path)
    if (paths.length === 0) return
    set({ mutating: true })
    for (const path of paths) {
      const result = await window.electronAPI.git.unstage(path)
      if (!result.success) {
        set({ mutating: false })
        toast.error(result.error ?? 'Failed to unstage all')
        await get().refresh()
        return
      }
    }
    set({ mutating: false })
    await get().refresh()
  },

  discardAll: async () => {
    const paths = changedEntries(get().snapshot)
      .filter((e) => e.status !== 'untracked')
      .map((e) => e.path)
    if (paths.length === 0) {
      toast.message('Nothing to discard (untracked files are kept)')
      return
    }
    set({ mutating: true })
    for (const path of paths) {
      const result = await window.electronAPI.git.revert({ path, mode: 'discard' })
      if (!result.success) {
        set({ mutating: false })
        toast.error(result.error ?? 'Failed to discard all')
        await get().refresh()
        return
      }
    }
    set({ mutating: false })
    toast.success('Discarded changes')
    await get().refresh()
  },

  commit: async () => {
    const message = get().commitMessage.trim()
    if (!message) {
      toast.error('Enter a commit message')
      return
    }
    set({ mutating: true })
    const result = await window.electronAPI.git.commit({ message })
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Commit failed')
      return
    }
    set({ commitMessage: '' })
    toast.success('Committed')
    await get().refresh()
  },

  commitAndPush: async () => {
    const message = get().commitMessage.trim()
    if (!message) {
      toast.error('Enter a commit message')
      return
    }
    set({ mutating: true })
    const commitResult = await window.electronAPI.git.commit({ message })
    if (!commitResult.success) {
      set({ mutating: false })
      toast.error(commitResult.error ?? 'Commit failed')
      return
    }
    set({ commitMessage: '' })
    const pushApi = window.electronAPI.git.push
    if (!pushApi) {
      set({ mutating: false })
      toast.success('Committed (restart app to enable push)')
      await get().refresh()
      return
    }
    const pushResult = await pushApi()
    set({ mutating: false })
    if (!pushResult.success) {
      toast.error(pushResult.error ?? 'Push failed after commit')
      await get().refresh()
      return
    }
    toast.success('Committed and pushed')
    await get().refresh()
  },

  checkout: async (branch) => {
    set({ mutating: true })
    const result = await window.electronAPI.git.checkout({ branch })
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Checkout failed')
      return
    }
    toast.success(`Checked out ${branch}`)
    await get().refresh()
  },

  createBranch: async (branch) => {
    set({ mutating: true })
    const result = await window.electronAPI.git.checkout({ branch, create: true })
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Could not create branch')
      return
    }
    toast.success(`Created and checked out ${branch}`)
    await get().refresh()
  },

  discard: async (path) => {
    set({ mutating: true })
    const result = await window.electronAPI.git.revert({ path, mode: 'discard' })
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Discard failed')
      return
    }
    await get().refresh()
  },

  fetch: async () => {
    const api = window.electronAPI.git
    if (!api.fetch) {
      toast.error('Restart the app to enable git fetch/pull/push')
      return
    }
    set({ mutating: true })
    const result = await api.fetch()
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Fetch failed')
      return
    }
    toast.success('Fetched')
    await get().refresh()
  },

  pull: async () => {
    const api = window.electronAPI.git
    if (!api.pull) {
      toast.error('Restart the app to enable git fetch/pull/push')
      return
    }
    set({ mutating: true })
    const result = await api.pull()
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Pull failed')
      return
    }
    toast.success('Pulled')
    await get().refresh()
  },

  push: async () => {
    const api = window.electronAPI.git
    if (!api.push) {
      toast.error('Restart the app to enable git fetch/pull/push')
      return
    }
    set({ mutating: true })
    const result = await api.push()
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Push failed')
      return
    }
    toast.success('Pushed')
    await get().refresh()
  },

  stash: async (message) => {
    const api = window.electronAPI.git
    if (!api.stash) {
      toast.error('Restart the app to enable git stash')
      return
    }
    set({ mutating: true })
    const result = await api.stash(message)
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Stash failed')
      return
    }
    toast.success('Stashed working tree')
    await get().refresh()
  },

  stashPop: async () => {
    const api = window.electronAPI.git
    if (!api.stashPop) {
      toast.error('Restart the app to enable git stash')
      return
    }
    set({ mutating: true })
    const result = await api.stashPop()
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Stash pop failed')
      return
    }
    toast.success('Stash applied')
    await get().refresh()
  },

  applyStash: async (ref, pop = false) => {
    set({ mutating: true })
    const result = await window.electronAPI.git.applyStash(ref, pop)
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? `Failed to ${pop ? 'pop' : 'apply'} stash`)
      return
    }
    toast.success(pop ? 'Stash popped' : 'Stash applied')
    await get().refresh()
  },

  dropStash: async (ref) => {
    set({ mutating: true })
    const result = await window.electronAPI.git.dropStash(ref)
    set({ mutating: false })
    if (!result.success) {
      toast.error(result.error ?? 'Failed to drop stash')
      return
    }
    toast.success('Dropped stash')
    await get().refresh()
  }
}))
