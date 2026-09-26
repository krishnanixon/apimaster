import { toast } from 'sonner'
import type { CodeSearchHit } from '@shared/types/code-intel'
import type { LanguageQuery } from '@shared/types/code-intel'
import { getDesktopApi } from '@/shared/lib/desktop-api'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useCodeIndexStore } from '../stores/codeIndex.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { isTsLikePath } from './language-files'

const IDENTIFIER = /[A-Za-z_$][\w$]*/g

export function identifierRangeAt(
  text: string,
  offset: number
): { from: number; to: number; word: string } | null {
  let start = offset
  let end = offset
  while (start > 0 && /[\w$]/.test(text[start - 1]!)) start -= 1
  while (end < text.length && /[\w$]/.test(text[end]!)) end += 1
  const word = text.slice(start, end)
  if (!word || !/^[A-Za-z_$]/.test(word)) return null
  return { from: start, to: end, word }
}

/** Extracts the identifier under a 0-based document offset. */
export function identifierAt(text: string, offset: number): string | null {
  return identifierRangeAt(text, offset)?.word ?? null
}

export function identifiersIn(text: string): string[] {
  return [...new Set(text.match(IDENTIFIER) ?? [])]
}

function rankDefinitions(hits: CodeSearchHit[], symbol: string, currentPath: string | null): CodeSearchHit[] {
  const exact = hits.filter((hit) => hit.name === symbol)
  const pool = exact.length > 0 ? exact : hits
  return [...pool].sort((a, b) => {
    const aSelf = a.path === currentPath ? 1 : 0
    const bSelf = b.path === currentPath ? 1 : 0
    if (aSelf !== bSelf) return aSelf - bSelf
    return b.score - a.score
  })
}

function queryFromStore(symbolOffset?: number): { query: LanguageQuery; symbol: string } | null {
  const editor = useCodeEditorStore.getState()
  const tab = editor.tabs.find((item) => item.path === editor.activeTabPath)
  if (!tab || !editor.cursor) return null
  const offset = symbolOffset ?? editor.cursor.offset
  const symbol = identifierAt(tab.content, offset) ?? ''
  return {
    symbol,
    query: {
      path: tab.path,
      line: editor.cursor.line,
      column: editor.cursor.column,
      content: tab.content
    }
  }
}

/**
 * Jumps to the definition using the TypeScript language service when available,
 * then the workspace code index. Returns candidates so callers can offer a picker.
 */
export async function goToDefinition(symbol: string, query?: LanguageQuery): Promise<CodeSearchHit[]> {
  const api = getDesktopApi()
  const path = query?.path ?? useCodeEditorStore.getState().activeTabPath
  if (query && path && isTsLikePath(path) && api?.language?.definition) {
    const result = await api.language.definition(query)
    const loc = result.success ? result.data?.[0] : undefined
    if (loc) {
      await useCodeEditorStore.getState().openFileAtLine(loc.path, loc.line, loc.column, loc.endLine)
      return [
        {
          path: loc.path,
          relativePath: loc.path,
          language: 'typescript',
          startLine: loc.line,
          endLine: loc.endLine,
          name: symbol,
          snippet: symbol,
          score: 2
        }
      ]
    }
  }

  const index = api?.codeIndex
  if (!index) return []
  const result = await index.searchSymbol(symbol, 50)
  const hits = result.success ? (result.data ?? []) : []
  if (hits.length === 0) {
    toast.error(`No definition found for "${symbol}"`)
    return []
  }
  const ranked = rankDefinitions(hits, symbol, useCodeEditorStore.getState().activeTabPath)
  const target = ranked[0]
  await useCodeEditorStore.getState().openFileAtLine(target.path, target.startLine, 1, target.endLine)
  return ranked
}

export async function goToDefinitionAtCursor(): Promise<CodeSearchHit[]> {
  const fromStore = queryFromStore()
  if (!fromStore) {
    toast.error('Place the cursor on a symbol first')
    return []
  }
  return goToDefinition(fromStore.symbol, fromStore.query)
}

/** Loads references for a symbol into the search sidebar, preferring language-service hits. */
export async function findReferences(symbol: string, query?: LanguageQuery): Promise<void> {
  const api = getDesktopApi()
  const path = query?.path ?? useCodeEditorStore.getState().activeTabPath
  if (query && path && isTsLikePath(path) && api?.language?.references) {
    const result = await api.language.references(query)
    const locations = result.success ? (result.data ?? []) : []
    if (locations.length > 0) {
      const hits: CodeSearchHit[] = locations.map((loc) => ({
        path: loc.path,
        relativePath: loc.path,
        language: 'typescript',
        startLine: loc.line,
        endLine: loc.endLine,
        name: symbol,
        snippet: symbol,
        score: 2
      }))
      useCodeIndexStore.setState({ query: symbol, mode: 'reference', hits, searching: false, error: null })
      useWorkbenchLayoutStore.getState().setLeftTab('search')
      if (hits[0]) {
        await useCodeEditorStore.getState().openFileAtLine(hits[0].path, hits[0].startLine, 1, hits[0].endLine)
      }
      return
    }
  }
  const index = useCodeIndexStore.getState()
  index.setMode('reference')
  index.setQuery(symbol)
  useWorkbenchLayoutStore.getState().setLeftTab('search')
  await useCodeIndexStore.getState().search()
}

export async function findReferencesAtCursor(): Promise<void> {
  const fromStore = queryFromStore()
  if (!fromStore) {
    toast.error('Place the cursor on a symbol first')
    return
  }
  await findReferences(fromStore.symbol, fromStore.query)
}
