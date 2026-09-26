import { app } from 'electron'
import { join } from 'path'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs'

/** Single userData folder for dev, portable, and installed builds. */
export const USER_DATA_DIR_NAME = 'ai-requirement-studio'

const LEGACY_USER_DATA_DIRS = ['AI Requirement Studio', 'AI Workbench Studio', 'Diablo Space']

function copyIfMissing(source: string, target: string): void {
  if (!existsSync(source) || existsSync(target)) return
  mkdirSync(join(target, '..'), { recursive: true })
  cpSync(source, target, { recursive: true })
}

function migrateLegacyUserData(unifiedPath: string): void {
  const appData = app.getPath('appData')

  for (const legacyName of LEGACY_USER_DATA_DIRS) {
    const legacyRoot = join(appData, legacyName)
    if (!existsSync(legacyRoot) || legacyRoot === unifiedPath) continue

    copyIfMissing(join(legacyRoot, 'data'), join(unifiedPath, 'data'))
    copyIfMissing(join(legacyRoot, 'openai-api-key.enc'), join(unifiedPath, 'openai-api-key.enc'))
    copyIfMissing(join(legacyRoot, 'logs'), join(unifiedPath, 'logs'))

    for (const entry of readdirSync(legacyRoot, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      copyIfMissing(join(legacyRoot, entry.name), join(unifiedPath, entry.name))
    }
  }
}

const unifiedUserDataPath = join(app.getPath('appData'), USER_DATA_DIR_NAME)
app.setPath('userData', unifiedUserDataPath)
migrateLegacyUserData(unifiedUserDataPath)
