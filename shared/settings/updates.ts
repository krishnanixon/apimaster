import { REPOSITORY_URL } from '../constants/product'

/** Automatic update checks are on unless the user turns them off in Settings → About. */
export const DEFAULT_AUTO_UPDATE = true

/** How often a running app checks GitHub releases for a newer version. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Delay before the first check after launch, so startup isn't slowed by the network. */
export const UPDATE_INITIAL_DELAY_MS = 15 * 1000

/**
 * - `install`: download in the background and offer restart-to-update (Windows NSIS, Linux AppImage).
 * - `notify`: only check, then link to the release page. macOS builds are ad-hoc signed, and
 *   Squirrel.Mac refuses to apply updates to an app without a Developer ID signature.
 * - `unsupported`: dev builds and Linux builds that aren't run as an AppImage.
 */
export type UpdateMode = 'install' | 'notify' | 'unsupported'

export function resolveAutoUpdate(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_AUTO_UPDATE
}

export function resolveUpdateMode(input: {
  platform: string
  isPackaged: boolean
  /** Set by the AppImage runtime; absent for .deb/.rpm or an unpacked build. */
  appImagePath?: string
}): UpdateMode {
  if (!input.isPackaged) return 'unsupported'
  if (input.platform === 'win32') return 'install'
  // electron-updater only reads release metadata from inside an AppImage.
  if (input.platform === 'linux') return input.appImagePath ? 'install' : 'unsupported'
  if (input.platform === 'darwin') return 'notify'
  return 'unsupported'
}

export function releasePageUrl(version: string): string {
  return `${REPOSITORY_URL}/releases/tag/v${version.replace(/^v/, '')}`
}

interface ParsedVersion {
  core: number[]
  prerelease: string[]
}

function parseVersion(version: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim())
  if (!match) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : []
  }
}

function comparePrereleaseId(a: string, b: string): number {
  const aNum = /^\d+$/.test(a)
  const bNum = /^\d+$/.test(b)
  if (aNum && bNum) return Math.sign(Number(a) - Number(b))
  if (aNum) return -1
  if (bNum) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Semver ordering: -1 when `a` is older than `b`, 1 when newer, 0 when equal.
 * Unparseable versions sort below valid ones so a malformed release never looks newer.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return Math.sign(pa.core[i] - pb.core[i])
  }
  // A release (no prerelease tag) is newer than any prerelease of the same version.
  if (!pa.prerelease.length || !pb.prerelease.length) {
    return Math.sign(pb.prerelease.length - pa.prerelease.length)
  }
  const len = Math.max(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < len; i++) {
    if (pa.prerelease[i] === undefined) return -1
    if (pb.prerelease[i] === undefined) return 1
    const cmp = comparePrereleaseId(pa.prerelease[i], pb.prerelease[i])
    if (cmp) return cmp
  }
  return 0
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}
