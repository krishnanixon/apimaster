import {
  Braces,
  Database,
  FileArchive,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  FileType,
  GitBranch,
  Hash,
  Image,
  Lock,
  Palette,
  Settings,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import { extensionOf, fileNameOf } from './paths'

export interface FileIconSpec {
  icon: LucideIcon
  className: string
}

const BY_EXTENSION: Record<string, FileIconSpec> = {
  ts: { icon: FileCode, className: 'text-[#3178c6]' },
  tsx: { icon: FileCode, className: 'text-[#3178c6]' },
  mts: { icon: FileCode, className: 'text-[#3178c6]' },
  cts: { icon: FileCode, className: 'text-[#3178c6]' },
  js: { icon: FileCode, className: 'text-[#f1e05a]' },
  jsx: { icon: FileCode, className: 'text-[#f1e05a]' },
  mjs: { icon: FileCode, className: 'text-[#f1e05a]' },
  cjs: { icon: FileCode, className: 'text-[#f1e05a]' },
  json: { icon: FileJson, className: 'text-[#cbcb41]' },
  jsonc: { icon: FileJson, className: 'text-[#cbcb41]' },
  json5: { icon: FileJson, className: 'text-[#cbcb41]' },
  css: { icon: Palette, className: 'text-[#42a5f5]' },
  scss: { icon: Palette, className: 'text-[#c6538c]' },
  less: { icon: Palette, className: 'text-[#1d365d]' },
  html: { icon: FileType, className: 'text-[#e34c26]' },
  htm: { icon: FileType, className: 'text-[#e34c26]' },
  vue: { icon: FileCode, className: 'text-[#41b883]' },
  svelte: { icon: FileCode, className: 'text-[#ff3e00]' },
  py: { icon: FileCode, className: 'text-[#3572A5]' },
  rs: { icon: FileCode, className: 'text-[#dea584]' },
  go: { icon: FileCode, className: 'text-[#00ADD8]' },
  java: { icon: FileCode, className: 'text-[#b07219]' },
  cs: { icon: FileCode, className: 'text-[#178600]' },
  rb: { icon: FileCode, className: 'text-[#701516]' },
  php: { icon: FileCode, className: 'text-[#4F5D95]' },
  swift: { icon: FileCode, className: 'text-[#F05138]' },
  kt: { icon: FileCode, className: 'text-[#A97BFF]' },
  c: { icon: FileCode, className: 'text-[#555555]' },
  h: { icon: FileCode, className: 'text-[#555555]' },
  cpp: { icon: FileCode, className: 'text-[#f34b7d]' },
  hpp: { icon: FileCode, className: 'text-[#f34b7d]' },
  sql: { icon: Database, className: 'text-[#e38c00]' },
  prisma: { icon: Database, className: 'text-[#5a67d8]' },
  md: { icon: FileText, className: 'text-[#9aa7b0]' },
  markdown: { icon: FileText, className: 'text-[#9aa7b0]' },
  mdx: { icon: FileText, className: 'text-[#9aa7b0]' },
  txt: { icon: FileText, className: 'text-muted-foreground' },
  yaml: { icon: Settings, className: 'text-[#cb171e]' },
  yml: { icon: Settings, className: 'text-[#cb171e]' },
  toml: { icon: Settings, className: 'text-[#9c4221]' },
  ini: { icon: Settings, className: 'text-muted-foreground' },
  env: { icon: Lock, className: 'text-[#ecd53f]' },
  sh: { icon: Terminal, className: 'text-[#89e051]' },
  bash: { icon: Terminal, className: 'text-[#89e051]' },
  zsh: { icon: Terminal, className: 'text-[#89e051]' },
  ps1: { icon: Terminal, className: 'text-[#012456]' },
  bat: { icon: Terminal, className: 'text-[#c1f12e]' },
  cmd: { icon: Terminal, className: 'text-[#c1f12e]' },
  png: { icon: FileImage, className: 'text-[#a074c4]' },
  jpg: { icon: FileImage, className: 'text-[#a074c4]' },
  jpeg: { icon: FileImage, className: 'text-[#a074c4]' },
  gif: { icon: FileImage, className: 'text-[#a074c4]' },
  webp: { icon: FileImage, className: 'text-[#a074c4]' },
  svg: { icon: Image, className: 'text-[#ffb13b]' },
  ico: { icon: Image, className: 'text-[#a074c4]' },
  zip: { icon: FileArchive, className: 'text-[#c9a26d]' },
  tar: { icon: FileArchive, className: 'text-[#c9a26d]' },
  gz: { icon: FileArchive, className: 'text-[#c9a26d]' },
  graphql: { icon: Hash, className: 'text-[#e10098]' },
  gql: { icon: Hash, className: 'text-[#e10098]' }
}

const BY_NAME: Record<string, FileIconSpec> = {
  'package.json': { icon: Braces, className: 'text-[#8bc34a]' },
  'package-lock.json': { icon: Lock, className: 'text-[#8bc34a]' },
  'tsconfig.json': { icon: Settings, className: 'text-[#3178c6]' },
  '.gitignore': { icon: GitBranch, className: 'text-[#f14e32]' },
  '.gitattributes': { icon: GitBranch, className: 'text-[#f14e32]' },
  dockerfile: { icon: Settings, className: 'text-[#2496ed]' },
  '.env': { icon: Lock, className: 'text-[#ecd53f]' },
  '.prettierrc': { icon: Settings, className: 'text-[#c596c7]' },
  'vite.config.ts': { icon: Settings, className: 'text-[#a066ff]' }
}

const FALLBACK: FileIconSpec = { icon: FileText, className: 'text-muted-foreground' }

export function fileIconFor(path: string): FileIconSpec {
  const name = fileNameOf(path).toLowerCase()
  return BY_NAME[name] ?? BY_EXTENSION[extensionOf(path)] ?? FALLBACK
}

const LANGUAGE_LABELS: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript React',
  mts: 'TypeScript',
  cts: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript React',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  json: 'JSON',
  jsonc: 'JSON with Comments',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  html: 'HTML',
  htm: 'HTML',
  vue: 'Vue',
  svelte: 'Svelte',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  java: 'Java',
  cs: 'C#',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  c: 'C',
  h: 'C Header',
  cpp: 'C++',
  hpp: 'C++ Header',
  sql: 'SQL',
  prisma: 'Prisma',
  md: 'Markdown',
  markdown: 'Markdown',
  mdx: 'MDX',
  txt: 'Plain Text',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  ps1: 'PowerShell',
  graphql: 'GraphQL',
  gql: 'GraphQL'
}

export function languageLabelFor(path: string): string {
  const ext = extensionOf(path)
  return LANGUAGE_LABELS[ext] ?? (ext ? ext.toUpperCase() : 'Plain Text')
}
