import yaml from 'js-yaml'
import { isRecord, type ImportFormat } from './common'
import { isHar } from './har'
import { isInsomniaExport } from './insomnia'
import { isOpenApiDocument } from './openapi'

/** Parses pasted or dropped text as JSON, falling back to YAML. */
export function parseStructured(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }
  try {
    return yaml.load(trimmed)
  } catch {
    return undefined
  }
}

function isPostman(value: Record<string, unknown>): boolean {
  return isRecord(value.info) && Array.isArray(value.item)
}

function isNative(value: Record<string, unknown>): boolean {
  return typeof value.name === 'string' && Array.isArray(value.requests)
}

/** Works out which importer a pasted or dropped file needs; `null` when nothing matches. */
export function detectImportFormat(text: string): ImportFormat | null {
  if (/^\s*curl\s/i.test(text)) return 'curl'
  const parsed = parseStructured(text)
  if (!isRecord(parsed)) return null
  if (isInsomniaExport(parsed)) return 'insomnia'
  if (isHar(parsed)) return 'har'
  if (isOpenApiDocument(parsed)) return 'openapi'
  if (isPostman(parsed)) return 'postman'
  if (isNative(parsed)) return 'shurikly'
  return null
}
