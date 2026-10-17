import { describe, expect, it } from 'vitest'
import { isSettingsTabId, normalizeSettingsTab, SETTINGS_DOMAINS } from '@shared/settings'

describe('settings registry', () => {
  it('lists centralized and in-place domains', () => {
    const centralized = SETTINGS_DOMAINS.filter((d) => d.centralized)
    const inPlace = SETTINGS_DOMAINS.filter((d) => !d.centralized)
    expect(centralized.map((d) => d.settingsTab)).toEqual(['profile', 'appearance', 'ai', 'mcp', 'usage', 'about'])
    expect(inPlace.some((d) => d.id === 'api-studio')).toBe(true)
  })

  it('falls back to the profile tab for unknown tabs', () => {
    expect(normalizeSettingsTab(null)).toBe('profile')
    expect(normalizeSettingsTab('usage')).toBe('usage')
    expect(normalizeSettingsTab('database')).toBe('profile')
  })

  it('validates tab ids', () => {
    expect(isSettingsTabId('about')).toBe(true)
    expect(isSettingsTabId('general')).toBe(false)
  })
})
