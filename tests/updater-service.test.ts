import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  autoUpdate: true,
  checkResult: null as null | { updateInfo: { version: string } },
  sent: [] as Array<{ phase: string; latestVersion?: string }>
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', isPackaged: true, getPath: () => '' }
}))

vi.mock('../electron/main/repositories/settings.repository', () => ({
  settingsRepository: { get: async () => ({ autoUpdate: state.autoUpdate }) }
}))

vi.mock('../electron/main/infra/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('electron-updater', async () => {
  const { EventEmitter: Emitter } = await import('events')
  return { autoUpdater: new Emitter() }
})

import { autoUpdater } from 'electron-updater'
import { UpdaterService } from '../electron/main/infra/updater.service'
import { UPDATE_CHECK_INTERVAL_MS, UPDATE_INITIAL_DELAY_MS } from '@shared/settings/updates'

const updater = autoUpdater as unknown as EventEmitter & Record<string, unknown>

const checkForUpdates = vi.fn(async () => {
  const result = state.checkResult
  if (result) updater.emit('update-available', result.updateInfo)
  else updater.emit('update-not-available', {})
  return result
})
const quitAndInstall = vi.fn()

function fakeWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: (_channel: string, status: { phase: string }) => state.sent.push(status) }
  } as never
}

describe('UpdaterService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    updater.removeAllListeners()
    Object.assign(updater, { checkForUpdates, quitAndInstall })
    checkForUpdates.mockClear()
    quitAndInstall.mockClear()
    state.autoUpdate = true
    state.checkResult = null
    state.sent = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('makes no update requests while automatic updates are off', async () => {
    state.autoUpdate = false
    const service = new UpdaterService('install')
    await service.start(fakeWindow)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 3)
    expect(checkForUpdates).not.toHaveBeenCalled()
    expect(service.getStatus().autoUpdate).toBe(false)
  })

  it('checks after launch and then every 6 hours, and stops when turned off', async () => {
    const service = new UpdaterService('install')
    await service.start(fakeWindow)
    expect(checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(UPDATE_INITIAL_DELAY_MS)
    await vi.waitFor(() => expect(checkForUpdates).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS)
    await vi.waitFor(() => expect(checkForUpdates).toHaveBeenCalledTimes(2))

    service.setEnabled(false)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 2)
    expect(checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('downloads in install mode and offers a restart once downloaded', async () => {
    state.autoUpdate = false
    state.checkResult = { updateInfo: { version: '1.1.0' } }
    const service = new UpdaterService('install')
    await service.start(fakeWindow)

    // A manual check works even with automatic updates off.
    const status = await service.check()
    expect(updater.autoDownload).toBe(true)
    expect(status.phase).toBe('downloading')
    expect(status.latestVersion).toBe('1.1.0')

    updater.emit('update-downloaded', { version: '1.1.0' })
    expect(service.getStatus().phase).toBe('downloaded')
    expect(state.sent.at(-1)?.phase).toBe('downloaded')

    service.install()
    expect(quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('only notifies with a release link in notify mode (macOS)', async () => {
    state.checkResult = { updateInfo: { version: '1.2.0' } }
    const service = new UpdaterService('notify')
    await service.start(fakeWindow)
    const status = await service.check()
    expect(updater.autoDownload).toBe(false)
    expect(status.phase).toBe('available')
    expect(status.releaseUrl).toBe('https://github.com/shurikly/shurikly/releases/tag/v1.2.0')
    expect(() => service.install()).toThrow()
  })

  it('reports up to date when the release is not newer', async () => {
    state.checkResult = { updateInfo: { version: '1.0.0' } }
    const service = new UpdaterService('notify')
    await service.start(fakeWindow)
    expect((await service.check()).phase).toBe('up-to-date')
  })

  it('keeps the first line of a failed check', async () => {
    checkForUpdates.mockRejectedValueOnce(new Error('HttpError: 404\n<html>long body</html>'))
    const service = new UpdaterService('install')
    await service.start(fakeWindow)
    const status = await service.check()
    expect(status.phase).toBe('error')
    expect(status.error).toBe('HttpError: 404')
  })

  it('never checks in unsupported builds', async () => {
    const service = new UpdaterService('unsupported')
    await service.start(fakeWindow)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS)
    expect((await service.check()).phase).toBe('error')
    expect(checkForUpdates).not.toHaveBeenCalled()
  })
})
