import { describe, expect, it } from 'vitest'
import {
  getSettingsTabForIntegration,
  getSettingsTabForModule,
  isSettingsTabId,
  normalizeSettingsTab,
  resolveAppSettingsTab,
  SETTINGS_DOMAINS
} from '@shared/settings'

describe('settings registry', () => {
  it('lists centralized and in-place domains', () => {
    const centralized = SETTINGS_DOMAINS.filter((d) => d.centralized)
    const inPlace = SETTINGS_DOMAINS.filter((d) => !d.centralized)
    expect(centralized.length).toBeGreaterThanOrEqual(10)
    expect(inPlace.some((d) => d.id === 'code-editor')).toBe(true)
    expect(inPlace.some((d) => d.id === 'api-studio')).toBe(true)
  })

  it('normalizes legacy modules tab', () => {
    expect(normalizeSettingsTab('modules')).toBe('apps')
    expect(normalizeSettingsTab(null)).toBe('general')
    expect(normalizeSettingsTab('ai')).toBe('ai')
    expect(normalizeSettingsTab('invalid')).toBe('general')
  })

  it('validates tab ids', () => {
    expect(isSettingsTabId('database')).toBe(true)
    expect(isSettingsTabId('modules')).toBe(false)
  })

  it('maps modules and integrations to settings tabs', () => {
    expect(getSettingsTabForModule('database-studio')).toBe('database')
    expect(getSettingsTabForModule('api-studio')).toBe('apps')
    expect(getSettingsTabForModule('assistant')).toBe('ai')
    expect(getSettingsTabForIntegration('vector')).toBe('vector')
    expect(getSettingsTabForIntegration('vps')).toBe('apps')
  })

  it('resolves app settings tabs from module or integration id', () => {
    expect(resolveAppSettingsTab({ moduleId: 'assistant' })).toBe('ai')
    expect(resolveAppSettingsTab({ integrationId: 'database' })).toBe('database')
    expect(resolveAppSettingsTab({ moduleId: 'terminal' })).toBe('apps')
    expect(resolveAppSettingsTab({ settingsTab: 'modules' })).toBe('apps')
  })
})
