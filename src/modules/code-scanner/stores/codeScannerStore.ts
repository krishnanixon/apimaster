import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { CodeScanEnrichEstimate, CodeScanEnrichResult, CodeScanProgress, CodeScanResult, DetectedEndpoint } from '@shared/types/code-scanner'
import { endpointKey } from '@shared/lib/code-scanner/fingerprint'
import { diffScans, isEmptyDiff, type ScanDiff } from '@shared/lib/code-scanner/scan-diff'

export type CodeScanStatus = 'idle' | 'scanning' | 'done' | 'error'

/** Optional AI pass: estimate → user confirms → run. */
export interface EnrichState {
  phase: 'idle' | 'estimating' | 'confirm' | 'running'
  estimate: CodeScanEnrichEstimate | null
  /** Endpoints the run covers (the selection when the dialog opened). */
  endpointIds: string[]
  enrichId: string | null
  progress: { done: number; total: number } | null
}

const IDLE_ENRICH: EnrichState = { phase: 'idle', estimate: null, endpointIds: [], enrichId: null, progress: null }

/** The current scan compared with the API at a git branch / tag / commit. */
export interface CompareState {
  phase: 'idle' | 'running' | 'done' | 'error'
  ref: string
  commit?: string
  /** Endpoints at the ref; the page diffs them against the current scan, so re-scans stay current. */
  base?: DetectedEndpoint[]
  error?: string
}

/**
 * Carries over what belongs to the person or the AI rather than the code: selection, and AI-filled
 * text and examples on endpoints that still exist.
 */
function carryOver(previous: CodeScanResult, next: CodeScanResult, selected: Record<string, boolean>) {
  const before = new Map(previous.endpoints.map((e) => [endpointKey(e), e]))
  const endpoints = next.endpoints.map((e): DetectedEndpoint => {
    const old = before.get(endpointKey(e))
    if (!old?.aiEnriched?.length) return e
    return {
      ...e,
      summary: e.summary ?? old.summary,
      description: e.description ?? old.description,
      responseExample: e.responseExample ?? old.responseExample,
      aiEnriched: old.aiEnriched
    }
  })
  const chosen = Object.fromEntries(
    endpoints.map((e) => {
      const old = before.get(endpointKey(e))
      return [e.id, old ? Boolean(selected[old.id]) : !e.host]
    })
  )
  return { result: { ...next, endpoints }, selected: chosen }
}

interface CodeScannerState {
  status: CodeScanStatus
  rootPath: string | null
  scanId: string | null
  progress: CodeScanProgress | null
  result: CodeScanResult | null
  error: string | null
  /** Endpoint id → included in the import. */
  selected: Record<string, boolean>
  enrich: EnrichState
  /** Re-scan automatically when source files in the folder change. */
  watching: boolean
  /** What the last automatic re-scan changed; cleared when dismissed or on a manual scan. */
  changes: ScanDiff | null
  compare: CompareState

  chooseAndScan: () => Promise<void>
  rescan: () => Promise<void>
  cancel: () => Promise<void>
  setSelected: (ids: string[], value: boolean) => void
  /** Opens the consent dialog with what enriching these endpoints would send and cost. */
  prepareEnrich: (endpointIds: string[]) => Promise<void>
  runEnrich: () => Promise<CodeScanEnrichResult | null>
  cancelEnrich: () => Promise<void>
  closeEnrich: () => void
  setWatching: (on: boolean) => Promise<void>
  dismissChanges: () => void
  compareWithRef: (ref: string) => Promise<void>
  closeCompare: () => void
}

let stopWatchListener: (() => void) | null = null

export const useCodeScannerStore = create<CodeScannerState>()((set, get) => {
  const runScan = async (rootPath: string, reason: 'manual' | 'watch' = 'manual') => {
    // A new scan replaces the endpoints an AI run would update; stop spending tokens on it.
    const { enrichId } = get().enrich
    if (enrichId) void window.electronAPI.codeScanner.cancel(enrichId)
    const scanId = uuidv4()
    set({ status: 'scanning', rootPath, scanId, progress: null, error: null, enrich: IDLE_ENRICH })
    const stopListening = window.electronAPI.codeScanner.onProgress((progress) => {
      if (progress.scanId === get().scanId) set({ progress })
    })
    try {
      const response = await window.electronAPI.codeScanner.scan({ scanId, rootPath })
      if (get().scanId !== scanId) return
      if (!response.success || !response.data) {
        const cancelled = response.error === 'Scan cancelled'
        set({
          status: cancelled && get().result ? 'done' : cancelled ? 'idle' : 'error',
          error: cancelled ? null : (response.error ?? 'Scan failed'),
          scanId: null
        })
        return
      }
      const previous = get().result
      if (previous && previous.rootPath === response.data.rootPath) {
        const kept = carryOver(previous, response.data, get().selected)
        const diff = reason === 'watch' ? diffScans(previous.endpoints, kept.result.endpoints) : null
        set({
          status: 'done',
          scanId: null,
          ...kept,
          changes: diff && !isEmptyDiff(diff) ? diff : reason === 'watch' ? get().changes : null
        })
        return
      }
      const result = response.data
      set({
        status: 'done',
        result,
        scanId: null,
        changes: null,
        compare: { phase: 'idle', ref: get().compare.ref },
        // Third-party APIs the frontend calls are listed but not imported unless picked.
        selected: Object.fromEntries(result.endpoints.map((e) => [e.id, !e.host]))
      })
    } finally {
      stopListening()
    }
  }

  return {
    status: 'idle',
    rootPath: null,
    scanId: null,
    progress: null,
    result: null,
    error: null,
    selected: {},
    enrich: IDLE_ENRICH,
    watching: false,
    changes: null,
    compare: { phase: 'idle', ref: 'main' },

    chooseAndScan: async () => {
      if (get().status === 'scanning') return
      const picked = await window.electronAPI.codeScanner.pickFolder()
      if (!picked.success) {
        set({ status: 'error', error: picked.error ?? 'Could not open the folder picker' })
        return
      }
      if (picked.data) {
        // Watching follows the open folder.
        if (get().watching && picked.data !== get().rootPath) await get().setWatching(false)
        await runScan(picked.data)
      }
    },

    rescan: async () => {
      const { rootPath, status } = get()
      if (rootPath && status !== 'scanning') await runScan(rootPath)
    },

    cancel: async () => {
      const { scanId } = get()
      if (scanId) await window.electronAPI.codeScanner.cancel(scanId)
    },

    setSelected: (ids, value) => {
      set((state) => ({ selected: { ...state.selected, ...Object.fromEntries(ids.map((id) => [id, value])) } }))
    },

    prepareEnrich: async (endpointIds) => {
      const { result } = get()
      if (!result || get().enrich.phase === 'running') return
      set({ enrich: { ...IDLE_ENRICH, phase: 'estimating', endpointIds } })
      const ids = new Set(endpointIds)
      const response = await window.electronAPI.codeScanner.estimateEnrich({
        rootPath: result.rootPath,
        endpoints: result.endpoints.filter((e) => ids.has(e.id))
      })
      if (get().enrich.phase !== 'estimating') return
      if (!response.success || !response.data) {
        set({ enrich: IDLE_ENRICH })
        throw new Error(response.error ?? 'Could not prepare AI enrichment')
      }
      set({ enrich: { ...get().enrich, phase: 'confirm', estimate: response.data } })
    },

    runEnrich: async () => {
      const { result, enrich } = get()
      if (!result || enrich.phase !== 'confirm') return null
      const enrichId = uuidv4()
      const ids = new Set(enrich.endpointIds)
      set({ enrich: { ...enrich, phase: 'running', enrichId, progress: { done: 0, total: enrich.estimate?.batches ?? 0 } } })
      const stopListening = window.electronAPI.codeScanner.onEnrichProgress((progress) => {
        if (progress.enrichId === get().enrich.enrichId) set({ enrich: { ...get().enrich, progress } })
      })
      try {
        const response = await window.electronAPI.codeScanner.enrich({
          enrichId,
          rootPath: result.rootPath,
          endpoints: result.endpoints.filter((e) => ids.has(e.id))
        })
        const current = get().result
        // The folder was re-scanned meanwhile: these answers belong to endpoints that no longer exist.
        if (current?.scanId !== result.scanId) return null
        if (!response.success || !response.data) throw new Error(response.error ?? 'AI enrichment failed')
        const updated = new Map(response.data.endpoints.map((e) => [e.id, e]))
        set({ result: { ...current, endpoints: current.endpoints.map((e) => updated.get(e.id) ?? e) } })
        return response.data
      } finally {
        stopListening()
        set({ enrich: IDLE_ENRICH })
      }
    },

    cancelEnrich: async () => {
      const { enrichId } = get().enrich
      if (enrichId) await window.electronAPI.codeScanner.cancel(enrichId)
    },

    closeEnrich: () => {
      if (get().enrich.phase !== 'running') set({ enrich: IDLE_ENRICH })
    },

    setWatching: async (on) => {
      const { rootPath } = get()
      stopWatchListener?.()
      stopWatchListener = null
      const response = await window.electronAPI.codeScanner.watch(on && rootPath ? rootPath : null)
      if (!response.success) throw new Error(response.error ?? 'Could not watch the folder')
      if (on && rootPath) {
        stopWatchListener = window.electronAPI.codeScanner.onChanged((changed) => {
          // An AI run would be overwritten mid-way; the next change re-scans.
          if (changed === get().rootPath && get().status !== 'scanning' && get().enrich.phase !== 'running') void runScan(changed, 'watch')
        })
      }
      set({ watching: on && Boolean(rootPath) })
    },

    dismissChanges: () => set({ changes: null }),

    compareWithRef: async (ref) => {
      const { result } = get()
      if (!result || get().compare.phase === 'running') return
      set({ compare: { phase: 'running', ref } })
      const response = await window.electronAPI.codeScanner.scanRef({ rootPath: result.rootPath, ref })
      if (get().compare.ref !== ref) return
      if (!response.success || !response.data) {
        set({ compare: { phase: 'error', ref, error: response.error ?? 'Could not scan that branch' } })
        return
      }
      set({ compare: { phase: 'done', ref, commit: response.data.commit, base: response.data.endpoints } })
    },

    closeCompare: () => set({ compare: { phase: 'idle', ref: get().compare.ref } })
  }
})
