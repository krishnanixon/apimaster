import type { AppSettings } from '@shared/types'
import { DEFAULT_AUTO_UPDATE, resolveAutoUpdate } from '@shared/settings/updates'
import { readJsonFile, writeJsonFile } from '../infra/json-store'

const STORE_FILE = 'settings.json'

const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  theme: 'system',
  aiModel: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 4096,
  autoUpdate: DEFAULT_AUTO_UPDATE
}

function normalize(raw: Partial<AppSettings>): AppSettings {
  return {
    id: 'app',
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system',
    aiModel: typeof raw.aiModel === 'string' && raw.aiModel ? raw.aiModel : DEFAULT_SETTINGS.aiModel,
    temperature: Number.isFinite(raw.temperature) ? Number(raw.temperature) : DEFAULT_SETTINGS.temperature,
    maxTokens: Number.isFinite(raw.maxTokens) ? Number(raw.maxTokens) : DEFAULT_SETTINGS.maxTokens,
    autoUpdate: resolveAutoUpdate(raw.autoUpdate)
  }
}

export class SettingsRepository {
  async get(): Promise<AppSettings> {
    return normalize(readJsonFile<Partial<AppSettings>>(STORE_FILE, DEFAULT_SETTINGS))
  }

  async update(data: Partial<AppSettings>): Promise<AppSettings> {
    const next = normalize({ ...(await this.get()), ...data })
    writeJsonFile(STORE_FILE, next)
    return next
  }
}

export const settingsRepository = new SettingsRepository()
