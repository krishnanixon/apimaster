import { extensionOf } from './paths'

const TS_LIKE = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'])

export function isTsLikePath(filePath: string): boolean {
  return TS_LIKE.has(extensionOf(filePath))
}

export function isJsPath(filePath: string): boolean {
  return ['js', 'mjs', 'cjs', 'ts', 'mts'].includes(extensionOf(filePath))
}
