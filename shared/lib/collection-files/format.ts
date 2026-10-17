import { dump, load } from 'js-yaml'

/**
 * On-disk layout of a collection folder. See docs/COLLECTION_FILES.md.
 *
 *   shurikly.collection.yaml
 *   README.md                      (created once, never managed)
 *   <folder-slug>/shurikly.folder.yaml
 *   <folder-slug>/<slug>.request.yaml
 *   <slug>.request.yaml
 *   environments/<slug>.yaml
 */
export const COLLECTION_FILE = 'shurikly.collection.yaml'
export const FOLDER_FILE = 'shurikly.folder.yaml'
export const REQUEST_SUFFIX = '.request.yaml'
export const ENVIRONMENTS_DIR = 'environments'
export const README_FILE = 'README.md'

/** Bump when the shape of any file changes, and add a step to `MIGRATIONS`. */
export const COLLECTION_FORMAT_VERSION = 1

/** Relative path (always `/`-separated) → file contents. */
export type CollectionFiles = Record<string, string>

export type CollectionDocKind = 'collection' | 'folder' | 'request' | 'environment'

/**
 * `MIGRATIONS[n]` upgrades a document from format `n` to `n + 1`.
 * Every file carries its own version only through the collection file, so all documents of a folder
 * are migrated together.
 */
export const MIGRATIONS: Record<number, (kind: CollectionDocKind, doc: Record<string, unknown>) => Record<string, unknown>> = {}

export function migrateDocument(
  kind: CollectionDocKind,
  doc: Record<string, unknown>,
  fromVersion: number,
  migrations = MIGRATIONS
): Record<string, unknown> {
  let current = doc
  for (let version = fromVersion; version < COLLECTION_FORMAT_VERSION; version += 1) {
    const step = migrations[version]
    if (!step) throw new Error(`No migration from collection format ${version} to ${version + 1}`)
    current = step(kind, current)
  }
  return current
}

/** True when `path` is a file this format owns. Anything else in the folder is left alone. */
export function isManagedPath(path: string): boolean {
  const parts = path.split('/')
  const name = parts[parts.length - 1]
  if (path === COLLECTION_FILE) return true
  if (name === FOLDER_FILE && parts.length > 1) return true
  if (name.endsWith(REQUEST_SUFFIX)) return true
  return parts.length === 2 && parts[0] === ENVIRONMENTS_DIR && name.endsWith('.yaml')
}

/** File-system-safe, lowercase name. Same input always gives the same slug. */
export function slugify(name: string, fallback: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || fallback
}

/** Hands out `slug`, `slug-2`, `slug-3`… so siblings never share a file name. */
export function createSlugAllocator(reserved: string[] = []): (name: string, fallback: string) => string {
  const used = new Set(reserved)
  return (name, fallback) => {
    const base = slugify(name, fallback)
    let candidate = base
    for (let n = 2; used.has(candidate); n += 1) candidate = `${base}-${n}`
    used.add(candidate)
    return candidate
  }
}

/** Stable YAML: 2-space indent, no line folding, block scalars for multiline text. */
export function toYaml(doc: Record<string, unknown>): string {
  return dump(doc, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: "'",
    skipInvalid: true
  })
}

export function fromYaml(text: string): Record<string, unknown> {
  const value = load(text)
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a YAML mapping at the top level')
  return value as Record<string, unknown>
}

export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/')
}
