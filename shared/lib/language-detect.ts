import { extname } from 'path'
import type { SourceLanguage } from '../types/code-intel'

const EXTENSION_LANGUAGE: Record<string, SourceLanguage> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  '.json': 'json',
  '.css': 'css',
  '.scss': 'css',
  '.html': 'html',
  '.htm': 'html',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust'
}

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.pdf',
  '.zip',
  '.gz',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.wasm',
  '.bin',
  '.class',
  '.o',
  '.obj',
  '.pdb',
  '.lock'
])

export function detectLanguage(filePath: string): SourceLanguage {
  const ext = extname(filePath).toLowerCase()
  return EXTENSION_LANGUAGE[ext] ?? 'unknown'
}

export function isIndexableSourceFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) return false
  return detectLanguage(filePath) !== 'unknown'
}

export function isJsFamily(language: SourceLanguage): boolean {
  return language === 'typescript' || language === 'javascript' || language === 'tsx' || language === 'jsx'
}
