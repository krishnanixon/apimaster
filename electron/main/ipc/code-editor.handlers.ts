import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  CodeEditorWorkspaceState,
  CreateEntryInput,
  EditorAiRequest,
  EditorContextSnapshot,
  ReadDirectoryOptions,
  RenameEntryInput
} from '@shared/types/code-editor'
import { codeEditorService } from '../code-editor/code-editor.service'
import { streamEditorAi } from '../code-editor/editor-ai.service'
import { workspaceStateService } from '../code-editor/workspace-state.service'
import { logger } from '../infra/logger.service'
import { ipcSchemas, schema, validatedHandle } from './runtime-schema'

const activeEditorAi = new Map<string, AbortController>()

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'CodeEditorIPC')
  return { success: false, error }
}

export function registerCodeEditorHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.CODE_EDITOR_OPEN_FOLDER, async () => {
    try {
      return success(await codeEditorService.openFolder(getMainWindow()))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to open folder')
    }
  })

  validatedHandle(
    IPC_CHANNELS.CODE_EDITOR_READ_DIR,
    [ipcSchemas.path, schema.optional(schema.object({ includeIgnored: schema.optional(schema.boolean()) })) as import('./runtime-schema').RuntimeSchema<ReadDirectoryOptions | undefined>] as const,
    async (_e, path, options) => {
      try {
        return success(await codeEditorService.readDirectory(path, options))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to read directory')
      }
    },
    'CodeEditorIPC'
  )

  validatedHandle(IPC_CHANNELS.CODE_EDITOR_READ_FILE, [ipcSchemas.path] as const, async (_e, path) => {
    try {
      return success(await codeEditorService.readFile(path))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read file')
    }
  }, 'CodeEditorIPC')

  validatedHandle(IPC_CHANNELS.CODE_EDITOR_WRITE_FILE, [ipcSchemas.path, ipcSchemas.text] as const, async (_e, path, content) => {
    try {
      await codeEditorService.writeFile(path, content)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to save file')
    }
  }, 'CodeEditorIPC')

  validatedHandle(IPC_CHANNELS.CODE_EDITOR_CREATE_ENTRY, [schema.object({
    parentPath: ipcSchemas.path,
    name: schema.string({ min: 1, max: 1_024 }),
    kind: schema.literal('file', 'folder')
  }) as import('./runtime-schema').RuntimeSchema<CreateEntryInput>] as const, async (_e, input) => {
    try {
      return success(await codeEditorService.createEntry(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create entry')
    }
  }, 'CodeEditorIPC')

  validatedHandle(IPC_CHANNELS.CODE_EDITOR_RENAME_ENTRY, [schema.object({
    path: ipcSchemas.path,
    newName: schema.string({ min: 1, max: 1_024 })
  }) as import('./runtime-schema').RuntimeSchema<RenameEntryInput>] as const, async (_e, input) => {
    try {
      return success(await codeEditorService.renameEntry(input))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to rename entry')
    }
  }, 'CodeEditorIPC')

  validatedHandle(IPC_CHANNELS.CODE_EDITOR_DELETE_ENTRY, [ipcSchemas.path] as const, async (_e, path) => {
    try {
      await codeEditorService.deleteEntry(path)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete entry')
    }
  }, 'CodeEditorIPC')

  validatedHandle(IPC_CHANNELS.CODE_EDITOR_OPEN_FOLDER_PATH, [ipcSchemas.path] as const, async (_e, rootPath) => {
    try {
      return success(await codeEditorService.openFolderAtPath(rootPath))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to open folder path')
    }
  }, 'CodeEditorIPC')

  ipcMain.handle(IPC_CHANNELS.CODE_EDITOR_CLOSE_WORKSPACE, async () => {
    try {
      codeEditorService.closeWorkspace()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to close workspace')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CODE_EDITOR_GET_WORKSPACE_STATE, async () => {
    try {
      return success(workspaceStateService.get())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load workspace state')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_SAVE_WORKSPACE_STATE,
    async (_e, state: CodeEditorWorkspaceState) => {
      try {
        workspaceStateService.save(state)
        return success()
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to save workspace state')
      }
    }
  )

  validatedHandle(IPC_CHANNELS.CODE_EDITOR_SEARCH_FILES, [schema.string({ max: 4_096 })] as const, async (_e, query) => {
    try {
      return success(await codeEditorService.searchFiles(query))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to search files')
    }
  }, 'CodeEditorIPC')

  validatedHandle(IPC_CHANNELS.CODE_EDITOR_INSPECT_PATH, [ipcSchemas.path] as const, async (_e, path) => {
    try {
      return success(await codeEditorService.inspectPath(path))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to inspect path')
    }
  }, 'CodeEditorIPC')

  validatedHandle(
    IPC_CHANNELS.CODE_EDITOR_IMPORT_PATHS,
    [schema.array(ipcSchemas.path, { max: 1_000 }), ipcSchemas.path] as const,
    async (_e, sourcePaths, destDir) => {
      try {
        return success(await codeEditorService.importPaths(sourcePaths, destDir))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to import files')
      }
    },
    'CodeEditorIPC'
  )

  ipcMain.handle(IPC_CHANNELS.CODE_EDITOR_GET_IGNORE_RULES, async () => {
    try {
      return success(codeEditorService.getIgnoreRules())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load ignore rules')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_SET_IGNORE_RULES,
    async (_e, patch: { customIgnoreNames?: string[]; showIgnored?: boolean }) => {
      try {
        return success(codeEditorService.setIgnoreRules(patch))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to save ignore rules')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CODE_EDITOR_GET_CONTEXT, async () => {
    try {
      return success(codeEditorService.getEditorContext())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read editor context')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_SET_CONTEXT,
    async (_e, snapshot: EditorContextSnapshot | null) => {
      try {
        codeEditorService.setEditorContext(snapshot)
        return success()
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to save editor context')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_COPY_ENTRY,
    async (_e, input: { sourcePath: string; destDir: string }) => {
      try {
        return success(await codeEditorService.copyEntry(input.sourcePath, input.destDir))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to copy')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_MOVE_ENTRY,
    async (_e, input: { sourcePath: string; destDir: string }) => {
      try {
        return success(await codeEditorService.moveEntry(input.sourcePath, input.destDir))
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Failed to move')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CODE_EDITOR_REVEAL, async (_e, path: string) => {
    try {
      await codeEditorService.revealInOs(path)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to reveal in OS')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CODE_EDITOR_AI_STREAM, async (event, request: EditorAiRequest) => {
    if (!request?.requestId) return failure('Missing request id')
    activeEditorAi.get(request.requestId)?.abort()
    const controller = new AbortController()
    activeEditorAi.set(request.requestId, controller)
    try {
      for await (const content of streamEditorAi(request, controller.signal)) {
        if (controller.signal.aborted || event.sender.isDestroyed()) break
        event.sender.send(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_CHUNK, {
          requestId: request.requestId,
          content,
          done: false
        })
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_END, {
          requestId: request.requestId,
          content: '',
          done: true
        })
      }
      return success()
    } catch (e) {
      if (controller.signal.aborted) {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_END, {
            requestId: request.requestId,
            content: '',
            done: true
          })
        }
        return success()
      }
      const errorMsg = e instanceof Error ? e.message : 'Editor AI stream failed'
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_ERROR, request.requestId, errorMsg)
      }
      return failure(errorMsg)
    } finally {
      activeEditorAi.delete(request.requestId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CODE_EDITOR_AI_STREAM_ABORT, async (_e, requestId: string) => {
    activeEditorAi.get(requestId)?.abort()
    activeEditorAi.delete(requestId)
    return success()
  })
}
