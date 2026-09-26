import { extensionOf } from './paths'
import type { EditorSettings } from '../stores/editorSettings.store'

type PrettierParser = 'babel' | 'babel-ts' | 'typescript' | 'json' | 'json5' | 'css' | 'scss' | 'less' | 'html' | 'vue' | 'markdown' | 'yaml' | 'graphql'

const PARSER_BY_EXTENSION: Record<string, PrettierParser> = {
  js: 'babel',
  jsx: 'babel',
  mjs: 'babel',
  cjs: 'babel',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  jsonc: 'json',
  json5: 'json5',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  graphql: 'graphql',
  gql: 'graphql'
}

export function formatterFor(filePath: string): PrettierParser | null {
  return PARSER_BY_EXTENSION[extensionOf(filePath)] ?? null
}

/** Prettier's browser build needs its plugins loaded explicitly, so we only pull in what the parser needs. */
async function pluginsFor(parser: PrettierParser): Promise<unknown[]> {
  switch (parser) {
    case 'babel':
    case 'json':
    case 'json5':
      return [
        (await import('prettier/plugins/babel')).default,
        (await import('prettier/plugins/estree')).default
      ]
    case 'babel-ts':
    case 'typescript':
      return [
        (await import('prettier/plugins/typescript')).default,
        (await import('prettier/plugins/estree')).default
      ]
    case 'css':
    case 'scss':
    case 'less':
      return [(await import('prettier/plugins/postcss')).default]
    case 'html':
    case 'vue':
      return [
        (await import('prettier/plugins/html')).default,
        (await import('prettier/plugins/babel')).default,
        (await import('prettier/plugins/estree')).default,
        (await import('prettier/plugins/postcss')).default
      ]
    case 'markdown':
      return [(await import('prettier/plugins/markdown')).default]
    case 'yaml':
      return [(await import('prettier/plugins/yaml')).default]
    case 'graphql':
      return [(await import('prettier/plugins/graphql')).default]
    default:
      return []
  }
}

const PRETTIER_CONFIG_FILES = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js']

let cachedConfig: { rootPath: string; options: Record<string, unknown> } | null = null

/** Picks up a workspace `.prettierrc` so formatting matches the project's own style. */
async function workspacePrettierOptions(rootPath: string | null): Promise<Record<string, unknown>> {
  if (!rootPath) return {}
  if (cachedConfig?.rootPath === rootPath) return cachedConfig.options
  let options: Record<string, unknown> = {}
  for (const fileName of PRETTIER_CONFIG_FILES) {
    const result = await window.electronAPI.codeEditor.readFile(`${rootPath}/${fileName}`)
    if (!result.success || !result.data) continue
    try {
      const parsed = JSON.parse(result.data) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') options = parsed
      break
    } catch {
      // Non-JSON config (JS module) can't be evaluated safely in the renderer.
      break
    }
  }
  cachedConfig = { rootPath, options }
  return options
}

export function clearPrettierConfigCache(): void {
  cachedConfig = null
}

export interface FormatOutcome {
  formatted?: string
  error?: string
  unsupported?: boolean
}

/**
 * Formats source text with Prettier's standalone build. Runs in the renderer so
 * formatting works without spawning a Node process per keystroke.
 */
export async function formatSource(
  filePath: string,
  source: string,
  settings: Pick<EditorSettings, 'tabSize' | 'insertSpaces' | 'wordWrapColumn'>,
  rootPath: string | null = null
): Promise<FormatOutcome> {
  const parser = formatterFor(filePath)
  if (!parser) return { unsupported: true }
  try {
    const prettier = await import('prettier/standalone')
    const projectOptions = await workspacePrettierOptions(rootPath)
    const formatted = await prettier.format(source, {
      tabWidth: settings.tabSize,
      useTabs: !settings.insertSpaces,
      printWidth: settings.wordWrapColumn,
      semi: false,
      singleQuote: true,
      trailingComma: 'none',
      ...projectOptions,
      parser,
      plugins: (await pluginsFor(parser)) as never[]
    })
    return { formatted }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Formatting failed' }
  }
}
