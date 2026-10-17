import type { UpdateMode } from '../settings/updates'

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  currentVersion: string
  mode: UpdateMode
  /** Mirrors the `autoUpdate` setting; when false nothing touches the network unless asked. */
  autoUpdate: boolean
  phase: UpdatePhase
  latestVersion?: string
  /** GitHub release page for `latestVersion` (the macOS notice links here). */
  releaseUrl?: string
  /** Download progress, 0–100, while `phase` is `downloading`. */
  progress?: number
  error?: string
  checkedAt?: string
}
