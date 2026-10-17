import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'
import { tmpdir } from 'os'

const electronState = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => electronState.userData }
}))

import {
  compareVersions,
  DEFAULT_AUTO_UPDATE,
  isNewerVersion,
  releasePageUrl,
  resolveAutoUpdate,
  resolveUpdateMode,
  UPDATE_CHECK_INTERVAL_MS
} from '@shared/settings/updates'
import { SettingsRepository } from '../electron/main/repositories/settings.repository'

describe('compareVersions', () => {
  it('orders major, minor and patch numerically', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1)
  })

  it('accepts a leading v and ignores build metadata', () => {
    expect(compareVersions('v1.4.0', '1.4.0')).toBe(0)
    expect(compareVersions('1.4.0+build.7', '1.4.0')).toBe(0)
  })

  it('ranks prereleases below the release and by their identifiers', () => {
    expect(compareVersions('1.1.0-beta.1', '1.1.0')).toBe(-1)
    expect(compareVersions('1.1.0', '1.1.0-rc.1')).toBe(1)
    expect(compareVersions('1.1.0-beta.2', '1.1.0-beta.10')).toBe(-1)
    expect(compareVersions('1.1.0-alpha', '1.1.0-beta')).toBe(-1)
    expect(compareVersions('1.1.0-beta', '1.1.0-beta.1')).toBe(-1)
    expect(compareVersions('1.1.0-1', '1.1.0-alpha')).toBe(-1)
  })

  it('never treats a malformed version as newer', () => {
    expect(isNewerVersion('latest', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0', 'garbage')).toBe(true)
    expect(compareVersions('nope', 'also-nope')).toBe(0)
  })

  it('reports only strictly newer versions as updates', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false)
  })
})

describe('update mode', () => {
  it('installs on Windows and AppImage, only notifies on macOS', () => {
    expect(resolveUpdateMode({ platform: 'win32', isPackaged: true })).toBe('install')
    expect(resolveUpdateMode({ platform: 'linux', isPackaged: true, appImagePath: '/tmp/Shurikly.AppImage' })).toBe(
      'install'
    )
    expect(resolveUpdateMode({ platform: 'darwin', isPackaged: true })).toBe('notify')
  })

  it('skips dev builds and Linux builds outside an AppImage', () => {
    expect(resolveUpdateMode({ platform: 'win32', isPackaged: false })).toBe('unsupported')
    expect(resolveUpdateMode({ platform: 'darwin', isPackaged: false })).toBe('unsupported')
    expect(resolveUpdateMode({ platform: 'linux', isPackaged: true })).toBe('unsupported')
  })

  it('links to the GitHub release for a version', () => {
    expect(releasePageUrl('1.2.3')).toBe('https://github.com/shurikly/shurikly/releases/tag/v1.2.3')
    expect(releasePageUrl('v1.2.3')).toBe('https://github.com/shurikly/shurikly/releases/tag/v1.2.3')
  })

  it('checks every 6 hours', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000)
  })
})

describe('autoUpdate setting', () => {
  beforeEach(() => {
    electronState.userData = mkdtempSync(join(tmpdir(), 'shurikly-settings-'))
  })

  afterEach(() => {
    rmSync(electronState.userData, { recursive: true, force: true })
  })

  it('defaults to on, including for settings files written before the option existed', async () => {
    expect(DEFAULT_AUTO_UPDATE).toBe(true)
    expect(resolveAutoUpdate(undefined)).toBe(true)
    expect(resolveAutoUpdate('false')).toBe(true)

    const repo = new SettingsRepository()
    expect((await repo.get()).autoUpdate).toBe(true)

    mkdirSync(join(electronState.userData, 'data'), { recursive: true })
    writeFileSync(join(electronState.userData, 'data', 'settings.json'), JSON.stringify({ theme: 'dark' }))
    expect((await repo.get()).autoUpdate).toBe(true)
  })

  it('persists turning updates off', async () => {
    const repo = new SettingsRepository()
    expect((await repo.update({ autoUpdate: false })).autoUpdate).toBe(false)
    expect((await repo.get()).autoUpdate).toBe(false)
    expect(resolveAutoUpdate(false)).toBe(false)
  })
})

describe('mac signing config', () => {
  const require = createRequire(import.meta.url)
  const configPath = require.resolve('../build/mac-signing.cjs')
  const keys = ['CSC_LINK', 'CSC_NAME', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'] as const
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))

  function load(env: Partial<Record<(typeof keys)[number], string>>) {
    for (const key of keys) delete process.env[key]
    Object.assign(process.env, env)
    delete require.cache[configPath]
    return require(configPath) as { mac: Record<string, unknown> }
  }

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    delete require.cache[configPath]
  })

  it('ad-hoc signs without a certificate', () => {
    expect(load({}).mac).toEqual({ identity: '-', hardenedRuntime: false, notarize: false })
  })

  it('uses the Developer ID from CSC_LINK, and notarizes once Apple credentials are set', () => {
    const signed = load({ CSC_LINK: 'base64-p12' }).mac
    expect(signed.identity).toBeUndefined()
    expect(signed.hardenedRuntime).toBe(true)
    expect(signed.notarize).toBe(false)

    const notarized = load({
      CSC_LINK: 'base64-p12',
      APPLE_ID: 'dev@example.com',
      APPLE_APP_SPECIFIC_PASSWORD: 'app-pass',
      APPLE_TEAM_ID: 'TEAM123'
    }).mac
    expect(notarized.identity).toBeUndefined()
    expect('notarize' in notarized).toBe(false)
  })
})
