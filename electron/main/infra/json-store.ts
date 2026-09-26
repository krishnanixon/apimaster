import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export function dataFilePath(fileName: string): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, fileName)
}

export function readJsonFile<T>(fileName: string, fallback: T): T {
  const path = dataFilePath(fileName)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

/** Writes via a temp file so a crash mid-write never leaves a truncated store. */
export function writeJsonFile(fileName: string, value: unknown): void {
  const path = dataFilePath(fileName)
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  renameSync(tmp, path)
}
