import { app, type BrowserWindow } from 'electron'
import { autoUpdater as lazyAutoUpdater, type AppUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { UpdateStatus } from '@shared/types'
import {
  isNewerVersion,
  releasePageUrl,
  resolveUpdateMode,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_INITIAL_DELAY_MS,
  type UpdateMode
} from '@shared/settings/updates'
import { settingsRepository } from '../repositories/settings.repository'
import { logger } from './logger.service'

const LOG_CONTEXT = 'Updater'

/** electron-updater errors can carry a whole HTTP body; keep the first line. */
function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const firstLine = message.split('\n')[0].trim()
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine || 'Update check failed'
}

/**
 * Checks GitHub releases for a newer Shurikly. Windows and Linux AppImage builds download
 * in the background and offer a restart; macOS (ad-hoc signed) only shows a download link.
 * Nothing here touches the network while automatic updates are off, except a check the
 * user starts from Settings → About.
 */
export class UpdaterService {
  private status: UpdateStatus
  private updater: AppUpdater | null = null
  private getWindow: () => BrowserWindow | null = () => null
  private initialTimer: NodeJS.Timeout | null = null
  private interval: NodeJS.Timeout | null = null
  private inFlight: Promise<void> | null = null

  constructor(
    private readonly mode: UpdateMode = resolveUpdateMode({
      platform: process.platform,
      isPackaged: app.isPackaged,
      appImagePath: process.env.APPIMAGE
    })
  ) {
    this.status = {
      currentVersion: app.getVersion(),
      mode: this.mode,
      autoUpdate: false,
      phase: 'idle'
    }
  }

  async start(getWindow: () => BrowserWindow | null): Promise<void> {
    this.getWindow = getWindow
    const settings = await settingsRepository.get()
    this.setEnabled(settings.autoUpdate)
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  /** Called when the `autoUpdate` setting changes. */
  setEnabled(enabled: boolean): void {
    this.clearSchedule()
    this.update({ autoUpdate: enabled })
    if (!enabled || this.mode === 'unsupported') return
    this.initialTimer = setTimeout(() => void this.check(), UPDATE_INITIAL_DELAY_MS)
    this.interval = setInterval(() => void this.check(), UPDATE_CHECK_INTERVAL_MS)
  }

  async check(): Promise<UpdateStatus> {
    if (this.mode === 'unsupported') {
      return this.update({
        phase: 'error',
        error: app.isPackaged
          ? 'Updates are only available for the AppImage build on Linux.'
          : 'Updates are not checked in development builds.'
      })
    }
    // A downloaded update is waiting for a restart; checking again would only re-download it.
    if (this.status.phase === 'downloaded') return this.status
    if (!this.inFlight) {
      this.inFlight = this.runCheck().finally(() => {
        this.inFlight = null
      })
    }
    await this.inFlight
    return this.status
  }

  install(): void {
    if (this.mode !== 'install' || this.status.phase !== 'downloaded' || !this.updater) {
      throw new Error('No downloaded update to install')
    }
    logger.info(`Restarting to install ${this.status.latestVersion}`, LOG_CONTEXT)
    // Silent install, then relaunch.
    this.updater.quitAndInstall(true, true)
  }

  private async runCheck(): Promise<void> {
    this.update({ phase: 'checking', error: undefined })
    try {
      const updater = this.getUpdater()
      const result = await updater.checkForUpdates()
      // `update-available` / `update-not-available` set the phase; this covers a null result.
      if (!result && this.status.phase === 'checking') this.update({ phase: 'up-to-date' })
      this.update({ checkedAt: new Date().toISOString() })
    } catch (error) {
      const message = shortError(error)
      logger.warn(`Update check failed: ${message}`, LOG_CONTEXT)
      this.update({ phase: 'error', error: message, checkedAt: new Date().toISOString() })
    }
  }

  /** `autoUpdater` is a lazy getter: the platform updater is only created on first check. */
  private getUpdater(): AppUpdater {
    if (this.updater) return this.updater
    const autoUpdater = lazyAutoUpdater
    autoUpdater.logger = {
      info: (message?: unknown) => logger.debug(String(message), LOG_CONTEXT),
      warn: (message?: unknown) => logger.warn(String(message), LOG_CONTEXT),
      error: (message?: unknown) => logger.error(String(message), LOG_CONTEXT),
      debug: (message: string) => logger.debug(message, LOG_CONTEXT)
    }
    autoUpdater.autoDownload = this.mode === 'install'
    autoUpdater.autoInstallOnAppQuit = this.mode === 'install'

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      if (!isNewerVersion(info.version, this.status.currentVersion)) {
        this.update({ phase: 'up-to-date' })
        return
      }
      logger.info(`Update available: ${info.version}`, LOG_CONTEXT)
      this.update({
        phase: this.mode === 'install' ? 'downloading' : 'available',
        latestVersion: info.version,
        releaseUrl: releasePageUrl(info.version),
        progress: this.mode === 'install' ? 0 : undefined
      })
    })
    autoUpdater.on('update-not-available', () => this.update({ phase: 'up-to-date' }))
    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.update({ phase: 'downloading', progress: Math.round(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      logger.info(`Update downloaded: ${info.version}`, LOG_CONTEXT)
      this.update({ phase: 'downloaded', latestVersion: info.version, progress: 100 })
    })
    autoUpdater.on('error', (error: Error) => {
      // A failed background download surfaces here, after checkForUpdates resolved.
      this.update({ phase: 'error', error: shortError(error) })
    })

    this.updater = autoUpdater
    return autoUpdater
  }

  private update(patch: Partial<UpdateStatus>): UpdateStatus {
    this.status = { ...this.status, ...patch }
    const win = this.getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC_CHANNELS.UPDATER_STATUS, this.status)
    return this.status
  }

  private clearSchedule(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer)
    if (this.interval) clearInterval(this.interval)
    this.initialTimer = null
    this.interval = null
  }
}

export const updaterService = new UpdaterService()
