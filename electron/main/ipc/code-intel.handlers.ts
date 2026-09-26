import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type { CodeSearchHit, LanguageQuery } from '@shared/types/code-intel'
import { indexerService } from '../code-intel/indexer.service'
import { tsLanguageService } from '../code-intel/ts-language.service'
import { logger } from '../infra/logger.service'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'CodeIntelIPC')
  return { success: false, error }
}

function asQuery(input: LanguageQuery | undefined): LanguageQuery {
  return {
    path: String(input?.path ?? ''),
    line: Number(input?.line) || 1,
    column: Number(input?.column) || 1,
    content: typeof input?.content === 'string' ? input.content : undefined
  }
}

export function registerCodeIntelHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.INDEX_START, async () => {
    try {
      return success(await indexerService.start())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to start indexing')
    }
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_CANCEL, async () => {
    try {
      return success(indexerService.cancel())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to cancel indexing')
    }
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_GET_STATUS, async () => {
    try {
      return success(indexerService.getStatus())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read index status')
    }
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_SEARCH_TEXT, async (_e, query: string, limit?: number) => {
    try {
      return success<CodeSearchHit[]>(indexerService.search({ query: String(query ?? ''), mode: 'text', limit }))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to search text')
    }
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_SEARCH_REGEX, async (_e, query: string, limit?: number) => {
    try {
      return success<CodeSearchHit[]>(indexerService.search({ query: String(query ?? ''), mode: 'regex', limit }))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to search regex')
    }
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_SEARCH_SYMBOL, async (_e, query: string, limit?: number) => {
    try {
      return success<CodeSearchHit[]>(indexerService.search({ query: String(query ?? ''), mode: 'symbol', limit }))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to search symbols')
    }
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_FILE_SYMBOLS, async (_e, path: string) => {
    try {
      return success(indexerService.fileSymbols(String(path ?? '')))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read file symbols')
    }
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_SEARCH_REFERENCE, async (_e, query: string, limit?: number) => {
    try {
      return success<CodeSearchHit[]>(
        indexerService.search({ query: String(query ?? ''), mode: 'reference', limit })
      )
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to search references')
    }
  })

  ipcMain.handle(IPC_CHANNELS.LANG_HOVER, async (_e, query: LanguageQuery) => {
    try {
      return success(tsLanguageService.hover(asQuery(query)))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Hover failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.LANG_DEFINITION, async (_e, query: LanguageQuery) => {
    try {
      return success(tsLanguageService.definition(asQuery(query)))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Go to definition failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.LANG_REFERENCES, async (_e, query: LanguageQuery) => {
    try {
      return success(tsLanguageService.references(asQuery(query)))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Find references failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.LANG_COMPLETIONS, async (_e, query: LanguageQuery) => {
    try {
      return success(tsLanguageService.completions(asQuery(query)))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Completions failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.LANG_GET_DIAGNOSTICS, async (_e, path: string, content?: string) => {
    try {
      return success(tsLanguageService.diagnosticsFor(String(path ?? ''), content))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Diagnostics failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.LANG_UPDATE_BUFFER, async (_e, path: string, content: string) => {
    try {
      tsLanguageService.updateBuffer(String(path ?? ''), String(content ?? ''))
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update language buffer')
    }
  })
}
